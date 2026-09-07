import os

try:
    import rasterio
    from rasterio._env import set_proj_data_search_path
    _proj = os.path.join(os.path.dirname(rasterio.__file__), "proj_data")
    if os.path.exists(_proj):
        os.environ["PROJ_LIB"] = _proj
        os.environ["PROJ_DATA"] = _proj
        set_proj_data_search_path(_proj)
except Exception:
    pass

__version__ = "1.0.0"
