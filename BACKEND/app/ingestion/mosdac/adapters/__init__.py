"""MOSDAC Ingestion Adapters Factory."""

from typing import Dict, Optional
from app.ingestion.mosdac.registry import ProductCategory, get_product_definition
from app.ingestion.mosdac.adapters.base_adapter import BaseMosdacAdapter
from app.ingestion.mosdac.adapters.weather_adapter import WeatherMosdacAdapter
from app.ingestion.mosdac.adapters.ocean_adapter import OceanMosdacAdapter
from app.ingestion.mosdac.adapters.environment_adapter import EnvironmentMosdacAdapter

_ADAPTER_CACHE: Dict[str, BaseMosdacAdapter] = {}


def get_adapter_for_product(product_id: str) -> Optional[BaseMosdacAdapter]:
    """Retrieve or instantiate domain adapter for a given MOSDAC product ID."""
    if product_id in _ADAPTER_CACHE:
        return _ADAPTER_CACHE[product_id]

    meta = get_product_definition(product_id)
    if not meta:
        return None

    cat = meta.get("category")
    if cat == ProductCategory.WEATHER:
        adapter = WeatherMosdacAdapter(product_id)
    elif cat == ProductCategory.OCEAN:
        adapter = OceanMosdacAdapter(product_id)
    elif cat == ProductCategory.ENVIRONMENT:
        adapter = EnvironmentMosdacAdapter(product_id)
    else:
        return None

    _ADAPTER_CACHE[product_id] = adapter
    return adapter


__all__ = [
    "BaseMosdacAdapter",
    "WeatherMosdacAdapter",
    "OceanMosdacAdapter",
    "EnvironmentMosdacAdapter",
    "get_adapter_for_product",
]
