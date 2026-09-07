import os
import zipfile
import logging
from pathlib import Path
from typing import Dict, Optional
from app.config import settings

logger = logging.getLogger(__name__)

EXPECTED_LAYERS = [
    "precipitation",
    "ice",
    "liquid",
    "liquidPercent",
    "numPrecipHalfHour",
    "numValidHalfHour",
]


class GranuleExtractor:
    """Unpacks NASA IMERG ZIP archives and resolves raster layer paths."""

    def __init__(self):
        self.extract_base = settings.DATA_EXTRACTED_DIR
        self.extract_base.mkdir(parents=True, exist_ok=True)

    def extract_zip(self, zip_path: str, granule_id: str) -> Optional[Dict[str, Path]]:
        """Extract ZIP archive safely into a granule directory and identify layer GeoTIFFs."""
        zip_file = Path(zip_path)
        if not zip_file.exists():
            logger.error(f"ZIP file not found at {zip_path}")
            return None

        target_dir = self.extract_base / granule_id
        target_dir.mkdir(parents=True, exist_ok=True)

        try:
            with zipfile.ZipFile(zip_file, "r") as z:
                # Sanitize paths to prevent zip slip
                for member in z.namelist():
                    filename = os.path.basename(member)
                    if not filename:
                        continue
                    source = z.open(member)
                    target = open(target_dir / filename, "wb")
                    with source, target:
                        target.write(source.read())

            logger.info(f"Extracted archive {zip_file.name} to {target_dir}")
            return self.resolve_layer_files(target_dir)

        except Exception as e:
            logger.error(f"Error extracting archive {zip_path}: {e}")
            return None

    def resolve_layer_files(self, directory: Path) -> Optional[Dict[str, Path]]:
        """Identify each of the 6 IMERG GeoTIFF layers in the directory."""
        tif_files = list(directory.glob("*.tif"))
        if not tif_files:
            logger.warning(f"No .tif files found in {directory}")
            return None

        layer_map: Dict[str, Path] = {}

        for f in tif_files:
            name = f.name
            if name.endswith(".ice.tif"):
                layer_map["ice"] = f
            elif name.endswith(".liquid.tif"):
                layer_map["liquid"] = f
            elif name.endswith(".liquidPercent.tif"):
                layer_map["liquidPercent"] = f
            elif name.endswith(".numPrecipHalfHour.tif"):
                layer_map["numPrecipHalfHour"] = f
            elif name.endswith(".numValidHalfHour.tif"):
                layer_map["numValidHalfHour"] = f
            elif name.endswith(".tif") and not any(k in name for k in ["ice", "liquid", "num"]):
                layer_map["precipitation"] = f

        # Ensure precipitation layer at minimum is found
        if "precipitation" not in layer_map:
            # Fallback to the shortest or primary .tif
            for f in tif_files:
                if "ice" not in f.name and "liquid" not in f.name and "num" not in f.name:
                    layer_map["precipitation"] = f
                    break

        logger.info(f"Resolved layers in {directory.name}: {list(layer_map.keys())}")
        return layer_map


granule_extractor = GranuleExtractor()
