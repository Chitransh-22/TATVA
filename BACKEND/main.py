import os
import uvicorn
from app.main import app

if __name__ == "__main__":
    reload_enabled = os.getenv("UVICORN_RELOAD", "false").lower() in ("true", "1")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=reload_enabled,
        reload_dirs=["app"] if reload_enabled else None,
        reload_excludes=["data/*", "data/**", "*.log", "*__pycache__*", "*.pyc"] if reload_enabled else None,
    )

