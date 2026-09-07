"""
Simple script to plot IMERG_7day_latlon_combined.csv on OpenStreetMap (OSM)
"""
import folium
import pandas as pd
import numpy as np
from PIL import Image
import io, base64

csv_path = "data/IMERG_7day_latlon_combined.csv"
print("Reading CSV data...")
df = pd.read_csv(csv_path)

# Create OpenStreetMap centered globally
m = folium.Map(location=[20, 0], zoom_start=3, tiles="OpenStreetMap")

# Reshape precipitation
precip = df['precipitation'].values.reshape(1800, 3600) / 10.0

# Create color overlay
rgba = np.zeros((1800, 3600, 4), dtype=np.uint8)
bins = [0.1, 5.0, 20.0, 50.0, 100.0, 250.0, 1000.0]
colors = [
    [100, 180, 255, 150],
    [0, 180, 160, 180],
    [30, 200, 80, 200],
    [240, 220, 20, 210],
    [255, 100, 10, 220],
    [220, 20, 120, 240]
]
idx = np.digitize(precip, bins) - 1
for i, c in enumerate(colors):
    rgba[(idx == i) & (precip >= 0.1)] = c

img = Image.fromarray(rgba, 'RGBA')
img.save("tests/imerg_overlay.png")

# Add to OpenStreetMap
folium.raster_layers.ImageOverlay(
    image="tests/imerg_overlay.png",
    bounds=[[-90, -180], [90, 180]],
    opacity=0.7,
    name="Precipitation"
).add_to(m)

m.save("tests/osm_folium_map.html")
print("Saved tests/osm_folium_map.html")
