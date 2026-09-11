import asyncio
import re
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import requests
from requests.auth import HTTPBasicAuth
from app.config import settings
from app.ingestion.topics import TOPIC_GRANULES_DISCOVERED, GranuleDiscoveredMessage
from app.ingestion.kafka_bus import kafka_bus

logger = logging.getLogger(__name__)

# Regex pattern to match IMERG GIS zip granules
# Example: 3B-HHR-L.MS.MRG.3IMERG.20260903-S053000-E055959.0330.V07C.7day.zip
IMERG_FILENAME_PATTERN = re.compile(
    r"^(3B-HHR.*\.(\d{8})-S(\d{6})-E(\d{6})\..*\.zip)$",
    re.IGNORECASE
)


def parse_imerg_filename(filename: str) -> Optional[Dict[str, Any]]:
    """Extract granule_id, observation_time, and metadata from an IMERG filename."""
    match = IMERG_FILENAME_PATTERN.match(filename)
    if not match:
        # Also try non-zip or general IMERG pattern
        general_match = re.search(r"(\d{8})-S(\d{6})", filename)
        if general_match:
            date_str, time_str = general_match.groups()
            try:
                obs_dt = datetime.strptime(f"{date_str}{time_str}", "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
                granule_id = filename[:-4] if filename.endswith(".zip") else filename
                return {
                    "granule_id": granule_id,
                    "observation_time": obs_dt,
                    "filename": filename,
                }
            except Exception:
                return None
        return None

    full_filename, date_str, start_time_str, _ = match.groups()
    granule_id = full_filename[:-4] if full_filename.endswith(".zip") else full_filename

    try:
        obs_dt = datetime.strptime(
            f"{date_str}{start_time_str}",
            "%Y%m%d%H%M%S"
        ).replace(tzinfo=timezone.utc)
    except Exception as e:
        logger.warning(f"Could not parse timestamp from {filename}: {e}")
        obs_dt = datetime.now(timezone.utc)

    return {
        "granule_id": granule_id,
        "observation_time": obs_dt,
        "filename": full_filename,
    }


class GranuleDiscoveryService:
    """Discovers available IMERG granules from NASA PPS and OpenSearch endpoints."""

    def __init__(self):
        self.auth = HTTPBasicAuth(settings.NASA_USERNAME, settings.NASA_PASSWORD)

    def discover_from_pps_directory(
        self,
        year: Optional[int] = None,
        month: Optional[int] = None,
        limit: int = 50,
    ) -> List[GranuleDiscoveredMessage]:
        """Scrape directory listing from NASA PPS text directory."""
        now = datetime.now(timezone.utc)
        year = year or now.year
        month = month or now.month

        base_url = (settings.NASA_PPS_BASE_URL or "https://jsimpsonhttps.pps.eosdis.nasa.gov").rstrip("/")
        url = f"{base_url}/text/imerg/gis/{year}/{month:02d}/"
        download_base = f"{base_url}/imerg/gis/{year}/{month:02d}/"

        verify_param = settings.get_nasa_ssl_verify()
        logger.info(f"Querying NASA PPS directory: {url} (SSL verify: {verify_param})")
        discovered: List[GranuleDiscoveredMessage] = []

        try:
            response = requests.get(url, auth=self.auth, timeout=30, verify=verify_param)
            if response.status_code != 200:
                logger.warning(f"Failed to fetch PPS directory {url} - Status: {response.status_code}")
                return discovered

            # Text format has lines with permissions, size, date, filename
            lines = [l for l in response.text.splitlines() if l.strip().endswith(".zip")]
            # Most recent granules are at the end of the chronological PPS listing
            if limit and len(lines) > limit:
                lines = lines[-limit:]
            for line in lines:
                parts = line.strip().split()
                if not parts:
                    continue
                raw_item = parts[-1]

                filename = raw_item.split("/")[-1]
                parsed = parse_imerg_filename(filename)
                if not parsed:
                    continue

                # Estimate or extract file size if present
                file_size = None
                for part in parts:
                    if part.isdigit() and int(part) > 10000:
                        file_size = int(part)
                        break

                msg = GranuleDiscoveredMessage(
                    granule_id=parsed["granule_id"],
                    file_name=filename,
                    source_url=f"{download_base}{filename}",
                    observation_time=parsed["observation_time"],
                    file_size_bytes=file_size,
                    product_type="IMERG",
                )
                discovered.append(msg)

            logger.info(f"Discovered {len(discovered)} granules from PPS directory.")
        except requests.exceptions.SSLError as ssl_err:
            logger.error(
                f"SSL certificate verification failed for PPS directory {url}: {ssl_err}. "
                "Ensure CA certificate is provided via NASA_SSL_CA_BUNDLE or REQUESTS_CA_BUNDLE."
            )
        except Exception as e:
            logger.error(f"Error discovering granules from PPS directory: {e}")

        return discovered

    def discover_from_opensearch(
        self,
        query: str = "precip_7d",
        limit: int = 50
    ) -> List[GranuleDiscoveredMessage]:
        """Query NASA PMM Publisher OpenSearch API."""
        url = settings.NASA_OPENSEARCH_URL
        params = {
            "q": query,
            "limit": limit,
        }
        discovered: List[GranuleDiscoveredMessage] = []
        verify_param = settings.get_nasa_ssl_verify()

        try:
            response = requests.get(url, params=params, auth=self.auth, timeout=20, verify=verify_param)
            if response.status_code == 200 and "application/json" in response.headers.get("Content-Type", ""):
                data = response.json()
                items = data.get("items", []) or data.get("feed", {}).get("entry", [])
                for item in items:
                    title = item.get("title") or item.get("identifier") or ""
                    link = item.get("link") or item.get("id") or ""
                    if title.endswith(".zip") or ".zip" in link:
                        filename = link.split("/")[-1] if link else f"{title}.zip"
                        parsed = parse_imerg_filename(filename)
                        if parsed:
                            discovered.append(
                                GranuleDiscoveredMessage(
                                    granule_id=parsed["granule_id"],
                                    file_name=filename,
                                    source_url=link,
                                    observation_time=parsed["observation_time"],
                                    product_type="IMERG",
                                )
                            )
            else:
                logger.info("OpenSearch response non-JSON or unavailable. Falling back to PPS directory.")
        except requests.exceptions.SSLError as ssl_err:
            logger.warning(
                f"OpenSearch SSL certificate verification failed ({ssl_err}). "
                "Verify NASA_SSL_CA_BUNDLE or REQUESTS_CA_BUNDLE. Falling back to PPS directory."
            )
        except Exception as e:
            logger.warning(f"OpenSearch query failed ({e}). Falling back to PPS text directory.")

        return discovered

    async def run_discovery(self, emit_to_kafka: bool = True, limit: int = 20) -> List[GranuleDiscoveredMessage]:
        """Execute discovery and publish events to Kafka."""
        granules = await asyncio.to_thread(self.discover_from_opensearch, limit=limit)
        if not granules:
            granules = await asyncio.to_thread(self.discover_from_pps_directory, limit=limit)

        if emit_to_kafka and granules:
            emitted_count = 0
            from app.ingestion.deduplication import dedup_ledger
            for g in granules:
                entry = await dedup_ledger.register_discovered(g)
                if entry and entry.status in ("COMPLETED", "PERSISTED"):
                    logger.debug(f"[Discovery] Granule {g.granule_id} already {entry.status} in ledger. Skipping Kafka event.")
                    continue
                await kafka_bus.publish(
                    topic=TOPIC_GRANULES_DISCOVERED,
                    key=g.granule_id,
                    payload=g.model_dump(),
                )
                emitted_count += 1
            logger.info(f"Emitted {emitted_count} discovery events to topic '{TOPIC_GRANULES_DISCOVERED}' (out of {len(granules)} discovered).")

        return granules


discovery_service = GranuleDiscoveryService()
