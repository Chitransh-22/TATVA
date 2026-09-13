"""ISRO MOSDAC API Client for INSAT-3DS Hydro-Estimator Precipitation Data."""

import asyncio
import hashlib
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class MosdacClient:
    """HTTP Client for ISRO MOSDAC OpenSearch discovery, JWT authentication, and granule downloads."""

    def __init__(self):
        self._token: Optional[str] = None
        self._token_acquired_at: float = 0.0
        self._token_expiry_seconds: float = 43200.0  # 12 hours conservative cache

    def is_token_valid(self) -> bool:
        """Check if cached JWT authentication token is still valid."""
        if not self._token:
            return False
        return (time.time() - self._token_acquired_at) < self._token_expiry_seconds

    async def get_token(self, force_refresh: bool = False) -> str:
        """Obtain or refresh JWT bearer token from MOSDAC authentication endpoint."""
        if self.is_token_valid() and not force_refresh:
            return self._token  # type: ignore

        url = settings.MOSDAC_TOKEN_URL
        payload = {
            "username": settings.MOSDAC_USERNAME,
            "password": settings.MOSDAC_PASSWORD,
        }
        logger.info(f"[MOSDAC Client] Authenticating with {url} as {settings.MOSDAC_USERNAME}...")

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                token = data.get("token") or data.get("access_token")
                if not token:
                    raise ValueError(f"No token found in MOSDAC auth response: {data}")
                self._token = str(token).strip()
                self._token_acquired_at = time.time()
                logger.info("[MOSDAC Client] JWT authentication token obtained successfully.")
                return self._token
            except Exception as e:
                logger.error(f"[MOSDAC Client] Authentication failed: {e}")
                raise

    async def search_granules(
        self,
        dataset: str = settings.MOSDAC_DEFAULT_DATASET,
        count: int = 10,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Query MOSDAC OpenSearch catalog for available dataset granules.
        
        Uses official query parameter 'datasetId' (per MOSDAC OpenAPI 3.0.1 specification).
        """
        url = settings.MOSDAC_SEARCH_URL
        # MOSDAC OpenSearch API strictly requires 'datasetId' query param
        params: Dict[str, Any] = {"datasetId": dataset, "count": count}
        if start_date:
            params["start"] = start_date
        if end_date:
            params["end"] = end_date

        logger.info(f"[MOSDAC Client] Searching granules for datasetId='{dataset}' (count={count})...")

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()

                # MOSDAC OpenSearch returns list under 'entries'
                entries = data.get("entries", [])
                if not entries and "features" in data:
                    entries = data.get("features", [])

                granules: List[Dict[str, Any]] = []

                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    props = entry.get("properties", entry)
                    meta_id = str(entry.get("id") or props.get("id") or "")
                    identifier = entry.get("identifier") or entry.get("title") or props.get("title") or meta_id
                    granule_id = identifier.replace(".h5", "").replace(".H5", "")

                    if not granule_id:
                        continue

                    # Parse observation timestamp
                    obs_time = None
                    obs_time_str = entry.get("updated") or props.get("start_time") or props.get("time") or props.get("date")
                    if obs_time_str:
                        try:
                            obs_time = datetime.fromisoformat(str(obs_time_str).replace("Z", "+00:00"))
                        except Exception:
                            pass

                    # Extract timestamp from granule_id if obs_time missing:
                    # e.g., 3SIMG_12SEP2026_1400_L2B_CTP_V01R00
                    if not obs_time and len(granule_id) >= 20:
                        try:
                            parts = granule_id.split("_")
                            if len(parts) >= 3:
                                date_str = parts[1]  # 12SEP2026
                                time_str = parts[2]  # 1400
                                obs_time = datetime.strptime(
                                    f"{date_str}_{time_str}", "%d%b%Y_%H%M"
                                ).replace(tzinfo=timezone.utc)
                        except Exception:
                            pass

                    download_url = f"{settings.MOSDAC_DOWNLOAD_URL}?id={meta_id or granule_id}"
                    file_size = entry.get("size") or props.get("size") or props.get("file_size")

                    granules.append({
                        "granule_id": granule_id,
                        "meta_id": meta_id,
                        "file_name": f"{granule_id}.h5",
                        "dataset": dataset,
                        "observation_time": obs_time,
                        "file_size_bytes": file_size,
                        "download_url": download_url,
                        "raw_properties": entry,
                    })

                # Sort newest observation first
                granules.sort(
                    key=lambda g: g["observation_time"] or datetime.min.replace(tzinfo=timezone.utc),
                    reverse=True
                )
                logger.info(f"[MOSDAC Client] Discovered {len(granules)} granules for datasetId='{dataset}'.")
                return granules

            except Exception as e:
                logger.error(f"[MOSDAC Client] Catalog search failed for {dataset}: {e}")
                raise

    async def get_latest_granule(
        self, dataset: str = settings.MOSDAC_DEFAULT_DATASET
    ) -> Optional[Dict[str, Any]]:
        """Retrieve the single most recent available observation granule."""
        granules = await self.search_granules(dataset=dataset, count=5)
        return granules[0] if granules else None

    async def download_granule(
        self,
        granule_id: str,
        meta_id: Optional[str] = None,
        dest_path: Optional[Path] = None,
        max_retries: int = 3,
    ) -> Path:
        """Download granule H5 file from MOSDAC using JWT bearer authorization."""
        from app.config import BACKEND_DIR
        # Check if local scratch or raw directory already has this granule
        local_candidates = [
            dest_path,
            settings.DATA_MOSDAC_RAW_DIR / f"{granule_id}.h5",
            BACKEND_DIR.parent / "scratch" / f"{granule_id}.h5",
        ]
        for cand in local_candidates:
            if cand and cand.exists() and cand.stat().st_size > 100 * 1024:
                logger.info(f"[MOSDAC Client] Granule {granule_id} already exists locally at {cand}")
                return cand.resolve()

        # If dest_path not specified, default to DATA_MOSDAC_RAW_DIR
        if dest_path is None:
            settings.ensure_directories()
            dest_path = settings.DATA_MOSDAC_RAW_DIR / f"{granule_id}.h5"
        else:
            dest_path.parent.mkdir(parents=True, exist_ok=True)

        token = await self.get_token()
        target_id = meta_id or granule_id
        download_url = f"{settings.MOSDAC_DOWNLOAD_URL}?id={target_id}"

        temp_path = dest_path.with_suffix(".tmp")
        headers = {"Authorization": f"Bearer {token}"}

        logger.info(f"[MOSDAC Client] Downloading granule {granule_id} to {dest_path}...")

        last_error = None
        for attempt in range(1, max_retries + 1):
            try:
                # Refresh token on retry if previous attempt got 401
                if attempt > 1:
                    token = await self.get_token(force_refresh=True)
                    headers["Authorization"] = f"Bearer {token}"

                sha256 = hashlib.sha256()
                async with httpx.AsyncClient(timeout=180.0) as client:
                    async with client.stream("GET", download_url, headers=headers) as response:
                        if response.status_code == 401:
                            logger.warning(f"[MOSDAC Client] Received 401 for {granule_id}, refreshing token...")
                            token = await self.get_token(force_refresh=True)
                            headers["Authorization"] = f"Bearer {token}"
                            continue
                        response.raise_for_status()

                        with open(temp_path, "wb") as f:
                            async for chunk in response.aiter_bytes(chunk_size=65536):
                                f.write(chunk)
                                sha256.update(chunk)

                # Rename temp file to final destination
                if temp_path.exists():
                    temp_path.replace(dest_path)

                size_mb = dest_path.stat().st_size / (1024 * 1024)
                logger.info(
                    f"[MOSDAC Client] Download complete for {granule_id} ({size_mb:.2f} MB, "
                    f"SHA256: {sha256.hexdigest()[:16]}...)"
                )
                return dest_path

            except Exception as e:
                last_error = e
                logger.warning(
                    f"[MOSDAC Client] Download attempt {attempt}/{max_retries} failed for {granule_id}: {e}"
                )
                if temp_path.exists():
                    try:
                        temp_path.unlink()
                    except Exception:
                        pass
                await asyncio.sleep(2.0 * attempt)

        raise RuntimeError(f"Failed to download MOSDAC granule {granule_id} after {max_retries} attempts: {last_error}")


mosdac_client = MosdacClient()
