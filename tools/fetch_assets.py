"""Downloads the snack photos, payment logos and JS libraries the site needs.

Snack photos and payment logos come from Wikimedia Commons; the libraries
come from public CDNs. Run again any time to refresh:  python tools/fetch_assets.py
Pass snack ids to re-fetch only those, optionally with a result index:
    python tools/fetch_assets.py soda=2 water
"""
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
UA = {"User-Agent": "LunaraCinemasDemo/1.0 (local school project; python-urllib)"}
COMMONS_API = "https://commons.wikimedia.org/w/api.php"

# snack image file -> Commons search query
SNACKS = {
    "popcorn-simple": "popcorn bowl",
    "popcorn-butter": "movie theater popcorn bucket",
    "popcorn-caramel": "caramel popcorn",
    "nachos": "nachos cheese jalapeno",
    "hotdog": "hot dog bun mustard",
    "pretzel": "soft pretzel",
    "fries": "french fries",
    "soda": "cola glass ice",
    "slush": "slushie",
    "water": "bottled water",
    "chocolate": "chocolate candies",
    "gummies": "gummy bears",
    "icecream": "ice cream sundae cup",
    "pineapple": "pineapple chunks",
    "cucumbers": "sliced cucumber",
}

# payment logo file -> candidate Commons file names (first that exists wins)
LOGOS = {
    "visa.svg": ["Visa Inc. logo.svg", "Visa 2021.svg", "Visa.svg"],
    "mastercard.svg": ["Mastercard-logo.svg", "Mastercard 2019 logo.svg"],
    "amex.svg": ["American Express logo (2018).svg", "American Express logo.svg"],
    "paypal.svg": ["PayPal.svg", "PayPal logo.svg"],
    "applepay.svg": ["Apple Pay logo.svg"],
    "googlepay.svg": ["Google Pay Logo.svg", "Google Pay Logo (2020).svg"],
}

LIBS = {
    "qrcode.min.js": "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js",
    "html5-qrcode.min.js": "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js",
}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            return resp.read()
    except urllib.error.URLError as exc:
        # Some Windows Python installs fail to verify Wikimedia's certificate chain;
        # curl uses the system TLS stack (still verified), so fall back to it.
        if "CERTIFICATE_VERIFY_FAILED" not in str(exc):
            raise
        # --retry also backs off when Wikimedia rate-limits us (HTTP 429)
        return subprocess.run(
            ["curl", "-sSLf", "--max-time", "60", "--retry", "4", "--retry-delay", "6",
             "-A", UA["User-Agent"], url],
            check=True, capture_output=True,
        ).stdout


def commons(params):
    params = dict(params, format="json")
    return json.loads(get(COMMONS_API + "?" + urllib.parse.urlencode(params)))


def search_photos(query, limit=8):
    data = commons({
        "action": "query", "generator": "search", "gsrsearch": query + " filetype:bitmap",
        "gsrnamespace": 6, "gsrlimit": limit, "prop": "imageinfo",
        "iiprop": "url|mime|size", "iiurlwidth": 640,
    })
    pages = sorted(data.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    out = []
    for p in pages:
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("mime") == "image/jpeg" and info.get("width", 0) >= 500:
            out.append((p["title"], info.get("thumburl") or info["url"]))
    return out


def file_url(title):
    data = commons({"action": "query", "titles": "File:" + title, "prop": "imageinfo", "iiprop": "url"})
    for p in data.get("query", {}).get("pages", {}).values():
        if "imageinfo" in p:
            return p["imageinfo"][0]["url"]
    return None


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f"  saved {path.relative_to(ROOT)} ({len(data) // 1024} KB)")


def fetch_snacks(only):
    credits_path = STATIC / "img" / "snacks" / "credits.json"
    credits = json.loads(credits_path.read_text("utf-8")) if credits_path.exists() else {}
    for name, query in SNACKS.items():
        if only and name not in only:
            continue
        pick = only.get(name, 0) if only else 0
        print(f"snack {name}: '{query}' (result #{pick})")
        try:
            results = search_photos(query)
            title, url = results[pick]
            save(STATIC / "img" / "snacks" / f"{name}.jpg", get(url))
            credits[name] = {"title": title, "source": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"))}
        except Exception as exc:  # keep going, report at the end
            print(f"  FAILED: {exc}")
        time.sleep(2)
    credits_path.parent.mkdir(parents=True, exist_ok=True)
    credits_path.write_text(json.dumps(credits, indent=2), "utf-8")


def fetch_logos():
    for name, candidates in LOGOS.items():
        print(f"logo {name}")
        for title in candidates:
            try:
                url = file_url(title)
                if url:
                    save(STATIC / "img" / "pay" / name, get(url))
                    break
            except Exception as exc:
                print(f"  {title}: {exc}")
        else:
            print("  FAILED: no candidate found")
        time.sleep(2)


def fetch_libs():
    for name, url in LIBS.items():
        print(f"lib {name}")
        try:
            save(STATIC / "vendor" / name, get(url))
        except Exception as exc:
            print(f"  FAILED: {exc}")


if __name__ == "__main__":
    only = {}
    for arg in sys.argv[1:]:
        key, _, idx = arg.partition("=")
        only[key] = int(idx or 0)
    fetch_snacks(only)
    if not only:
        fetch_logos()
        fetch_libs()
