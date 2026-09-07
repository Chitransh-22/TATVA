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
        month: Optional[int] = None
    ) -> List[GranuleDiscoveredMessage]:
        """Scrape directory listing from NASA PPS text directory."""
        now = datetime.now(timezone.utc)
        year = year or now.year
        month = month or now.month

        url = f"{settings.NASA_PPS_BASE_URL}/text/imerg/gis/{year}/{month:02d}/"
        download_base = f"{settings.NASA_PPS_BASE_URL}/imerg/gis/{year}/{month:02d}/"

        logger.info(f"Querying NASA PPS directory: {url}")
        discovered: List[GranuleDiscoveredMessage] = []

        try:
            response = requests.get(url, auth=self.auth, timeout=30)
            if response.status_code != 200:
                logger.warning(f"Failed to fetch PPS directory {url} - Status: {response.status_code}")
                return discovered

            # Text format has lines with permissions, size, date, filename
            lines = response.text.splitlines()
            for line in lines:
                parts = line.strip().split()
                if not parts:
                    continue
                raw_item = parts[-1]
                if not raw_item.endswith(".zip"):
                    continue

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

        try:
            response = requests.get(url, params=params, auth=self.auth, timeout=20)
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
        except Exception as e:
            logger.warning(f"OpenSearch query failed ({e}). Falling back to PPS text directory.")

        return discovered

    async def run_discovery(self, emit_to_kafka: bool = True) -> List[GranuleDiscoveredMessage]:
        """Execute discovery and publish events to Kafka."""
        granules = await asyncio.to_thread(self.discover_from_opensearch)
        if not granules:
            granules = await asyncio.to_thread(self.discover_from_pps_directory)

        if emit_to_kafka and granules:
            for g in granules:
                await kafka_bus.publish(
                    topic=TOPIC_GRANULES_DISCOVERED,
                    key=g.granule_id,
                    payload=g.model_dump(),
                )
            logger.info(f"Emitted {len(granules)} discovery events to topic '{TOPIC_GRANULES_DISCOVERED}'.")

        return granules


discovery_service = GranuleDiscoveryService()
