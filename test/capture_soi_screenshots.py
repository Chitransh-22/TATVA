import time
from playwright.sync_api import sync_playwright

def capture():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, channel="msedge")
        page = b.new_page(viewport={"width": 1440, "height": 1100})
        page.goto("http://localhost:5173", wait_until="domcontentloaded")
        time.sleep(3)
        page.evaluate("() => { const el = document.getElementById('analysis-section'); if (el) el.scrollIntoView(); }")
        time.sleep(2)
        
        # 1. Capture Full India View with HEM Precipitation and official Survey of India boundary
        page.screenshot(path="test/main_frontend_soi_hem.png")
        print("Captured SOI Full India HEM")

        # 2. Capture with CTP Cloud
        page.click("button[data-product-id='3SIMG_L2B_CTP']")
        time.sleep(2)
        page.screenshot(path="test/main_frontend_soi_ctp.png")
        print("Captured SOI Full India CTP")

        # 3. Zoom into Northern India (J&K, Ladakh, Aksai Chin, Gilgit-Baltistan) for detailed verification
        # Click zoom in 2 times
        zoom_in_btn = page.query_selector("button[title='Zoom In']")
        if zoom_in_btn:
            zoom_in_btn.click()
            time.sleep(1)
            zoom_in_btn.click()
            time.sleep(1)
            # Pan up towards J&K and Ladakh
            map_el = page.query_selector(".leaflet-map-canvas")
            if map_el:
                box = map_el.bounding_box()
                # Drag from top-middle downwards to pan view north
                page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 3)
                page.mouse.down()
                page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] * 0.75, steps=10)
                page.mouse.up()
                time.sleep(2)
                page.screenshot(path="test/main_frontend_soi_north_zoom.png")
                print("Captured SOI Northern Extent (J&K, Ladakh, Aksai Chin)")

        b.close()
        print("All SOI verification screenshots captured successfully!")

if __name__ == "__main__":
    capture()
