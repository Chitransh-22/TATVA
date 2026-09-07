FROM python:3.11-slim

# Install system dependencies for GDAL/Rasterio and PostgreSQL client
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgdal-dev \
    gdal-bin \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files
COPY pyproject.toml /app/

# Install python dependencies
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
        fastapi \
        uvicorn[standard] \
        pydantic \
        pydantic-settings \
        sqlalchemy \
        asyncpg \
        psycopg2-binary \
        pandas \
        numpy \
        rasterio \
        shapely \
        geopandas \
        requests \
        aiokafka \
        python-dotenv \
        pytest \
        httpx

# Copy application source
COPY . /app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
