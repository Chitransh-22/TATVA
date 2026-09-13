import sys
from playwright.sync_api import sync_playwright

def verify_product(page, product_path, product_id):
    url = f"http://127.0.0.1:8000{product_path}"
    print(f"\n=======================================================", flush=True)
    print(f"Testing {product_id} at {url}", flush=True)
    
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_function("() => window.testMap && window.testMap.allPoints && window.testMap.allPoints.length > 0", timeout=12000)
    page.wait_for_function("() => window.testMap.boundaryGeoJson !== null", timeout=8000)
    page.wait_for_timeout(800)
    
    res = page.evaluate("() => window.testMap.verifyClipping()")
    
    print(f"Product: {product_id} | Total Data Points: {res['totalPoints']:,}", flush=True)
    print(f"Boundary Loaded: {res['boundaryLoaded']} | Clip To Boundary: {res['clipToBoundary']}", flush=True)
    print(f"Outside Pixels Rendered: {res['outsidePixelsRendered']}", flush=True)
    print(f"Inside Pixels Rendered: {res['insidePixelsRendered']}", flush=True)
    print(f"Is Strictly Clipped: {res['isStrictlyClipped']}", flush=True)
    
    for out in res['outsideResults']:
        print(f"  [OUTSIDE] {out['name']}: rgba={out['rgba']} rendered={out['rendered']}", flush=True)
    for ins in res['insideResults']:
        print(f"  [INSIDE]  {ins['name']}: rgba={ins['rgba']} rendered={ins['rendered']}", flush=True)
        
    return res

def main():
    products = [
        ('/test/rainfall/index.html', '3SIMG_L2B_HEM'),
        ('/test/rainfall-imr/index.html', '3SIMG_L2G_IMR'),
        ('/test/cloud/index.html', '3SIMG_L2B_CTP'),
        ('/test/humidity/index.html', '3SIMG_L2B_UTH'),
        ('/test/olr/index.html', '3SIMG_L2B_OLR'),
        ('/test/fog/index.html', '3SIMG_L2C_FOG'),
        ('/test/snow/index.html', '3SIMG_L2C_SNW'),
        ('/test/aerosol/index.html', '3SIMG_L2G_AOD'),
        ('/test/sst/index.html', '3SIMG_L2B_SST'),
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel='msedge')
        page = browser.new_page()
        
        results = []
        for path, pid in products:
            try:
                r = verify_product(page, path, pid)
                results.append((pid, True, r))
            except Exception as e:
                print(f"ERROR testing {pid}: {e}", flush=True)
                results.append((pid, False, str(e)))
                
        browser.close()
        
        print("\n" + "=" * 96, flush=True)
        print("FINAL MOSDAC TEST MAP CLIPPING & BOUNDARY VERIFICATION AUDIT", flush=True)
        print("=" * 96, flush=True)
        print(f"{'Product ID':<18} | {'Status':<8} | {'Total Points':<13} | {'Clipping Mask':<14} | {'Outside Bleed':<14} | {'Inside Render':<14} | {'Verification'}")
        print("-" * 96, flush=True)
        for pid, success, r in results:
            if success:
                mask_str = "ACTIVE (SOI)" if r['clipToBoundary'] else "OFF (Ocean)"
                outside_str = f"{r['outsidePixelsRendered']} pixels"
                inside_str = f"{r['insidePixelsRendered']} points"
                status_str = "PASS (0 bleed)" if r['isStrictlyClipped'] else "FAIL (bleed)"
                print(f"{pid:<18} | {'ONLINE':<8} | {r['totalPoints']:<13,d} | {mask_str:<14} | {outside_str:<14} | {inside_str:<14} | {status_str}")
            else:
                print(f"{pid:<18} | ERROR: {r}", flush=True)
        print("=" * 96, flush=True)

if __name__ == '__main__':
    main()
