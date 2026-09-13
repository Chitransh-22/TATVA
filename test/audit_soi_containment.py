import json
from shapely.geometry import shape, Point

with open('BACKEND/data/boundaries/india_boundary.geojson', 'r', encoding='utf-8') as f:
    gj = json.load(f)

geom = shape(gj['features'][0]['geometry'] if gj.get('features') else gj['geometry'])

test_points = [
    ('Jammu', 32.73, 74.87),
    ('Srinagar', 34.08, 74.80),
    ('Leh, Ladakh', 34.15, 77.58),
    ('Kargil, Ladakh', 34.55, 76.13),
    ('Muzaffarabad (PoK)', 34.37, 73.47),
    ('Mirpur (PoK)', 33.15, 73.75),
    ('Gilgit (Gilgit-Baltistan)', 35.92, 74.31),
    ('Skardu (Gilgit-Baltistan)', 35.30, 75.63),
    ('Hunza (Gilgit-Baltistan)', 36.31, 74.65),
    ('Aksai Chin (Central)', 35.20, 79.50),
    ('Aksai Chin (North)', 35.80, 79.00),
    ('Siachen Glacier', 35.50, 77.00),
    ('Tawang (Arunachal Pradesh)', 27.58, 91.86),
    ('Itanagar (Arunachal Pradesh)', 27.08, 93.60),
    ('Kibithu (Arunachal Pradesh)', 28.29, 97.02),
    ('New Delhi', 28.61, 77.20),
    ('Kanyakumari', 8.08, 77.55),
]

print("========================================================================")
print("CONTAINMENT AUDIT OF OFFICIAL SURVEY OF INDIA BOUNDARY (india_boundary.geojson)")
print("========================================================================")
all_pass = True
for name, lat, lon in test_points:
    pt = Point(lon, lat)
    contains = geom.contains(pt)
    res_str = "INSIDE (PASS)" if contains else "OUTSIDE (FAIL)"
    if not contains:
        all_pass = False
    print(f"  {name:<35} [{lat:.2f}N, {lon:.2f}E] : {res_str}")
print("========================================================================")
print(f"OVERALL RESULT: {'ALL PASS' if all_pass else 'SOME FAILED'}")
print("========================================================================")
