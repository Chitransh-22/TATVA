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
        page.screenshot(path="test/main_frontend_hem.png")
        print("Captured HEM")

        page.click("button[data-product-id='3SIMG_L2B_CTP']")
        time.sleep(2)
        page.screenshot(path="test/main_frontend_ctp.png")
        print("Captured CTP")

        page.click("button[data-product-id='3SIMG_L2B_SST']")
        time.sleep(2)
        page.screenshot(path="test/main_frontend_sst.png")
        print("Captured SST")

        b.close()
        print("All screenshots captured successfully!")

if __name__ == "__main__":
    capture()
