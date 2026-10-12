"""Lumen Cinema demo site - a small HTTP server using only the standard library.

Run:   python server.py            (then open http://localhost:8000)
       python server.py --port 9000 --host 127.0.0.1

The pages in static/ are built from the React app in lumen-source/ (run build.bat
after changing it). Formats, ticket types, snacks and prices live in catalog.json,
which the admin page edits (prices, discounts, offers, blocked seats, meals, combos, stock, extra showtimes);
meal photos uploaded there are kept in data/uploads.

Movie data comes from The Movie Database (TMDB). Put your key in config.json
("tmdb_api_key") or in the TMDB_API_KEY environment variable. Both the v3
"API Key" and the v4 "API Read Access Token" work.

Payments are simulated: no card data is sent to this server or anywhere else.
"""
import argparse
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import random
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
# In Docker (and Umbrel) LUMEN_DATA_DIR points at a mounted volume, so everything the site
# changes - orders, config, the edited catalog, uploaded photos - survives an image update.
# The Windows .exe (built with PyInstaller) unpacks itself to a temporary folder on every start,
# so it keeps the same things in a "lumen-data" folder next to the .exe.
FROZEN = getattr(sys, "frozen", False)
if os.environ.get("LUMEN_DATA_DIR"):
    DATA_DIR = Path(os.environ["LUMEN_DATA_DIR"])
elif FROZEN:
    DATA_DIR = Path(sys.executable).resolve().parent / "lumen-data"
else:
    DATA_DIR = None
ORDERS_FILE = (DATA_DIR or ROOT / "data") / "orders.json"
SECRET_FILE = (DATA_DIR or ROOT / "data") / "admin_secret.txt"
CONFIG_FILE = (DATA_DIR or ROOT) / "config.json"
SESSION_COOKIE = "lumen_admin"
SESSION_SECONDS = 7 * 24 * 3600
BOOT_ID = secrets.token_hex(8)  # changes on every start, so the admin page can tell a restart finished
restart_requested = threading.Event()
TMDB_BASE = "https://api.themoviedb.org/3"

CATALOG_FILE = (DATA_DIR or ROOT) / "catalog.json"
UPLOADS = (DATA_DIR or ROOT / "data") / "uploads"  # meal photos uploaded from the admin page
SHOW_DAYS = 7  # how many days ahead can be booked
if DATA_DIR and not CATALOG_FILE.exists():
    # First start on an empty volume: copy in the catalog and meal photos shipped with the image.
    UPLOADS.mkdir(parents=True, exist_ok=True)
    for photo in (ROOT / "data" / "uploads").glob("*.*"):
        shutil.copy(photo, UPLOADS / photo.name)
    shutil.copy(ROOT / "catalog.json", CATALOG_FILE)
CATALOG = json.loads(CATALOG_FILE.read_text("utf-8"))
catalog_lock = threading.RLock()
FORMATS, TICKET_TYPES, SNACKS = {}, {}, {}


def index_catalog():
    """Rebuild the id lookups after CATALOG is loaded or edited from the admin page."""
    global FORMATS, TICKET_TYPES, SNACKS
    FORMATS = {f["id"]: f for f in CATALOG["formats"]}
    TICKET_TYPES = {t["id"]: t for t in CATALOG["ticketTypes"]}
    SNACKS = {s["id"]: s for s in CATALOG["snacks"]}


index_catalog()
PAYMENT_METHODS = {"card", "paypal", "applepay", "googlepay"}
CARD_BRANDS = {"visa", "mastercard", "amex", ""}
MOVIE_LISTS = {"popular": "/movie/popular", "now_playing": "/movie/now_playing", "top_rated": "/movie/top_rated"}

orders_lock = threading.Lock()
request_log = deque(maxlen=500)
tmdb_cache = {}
TMDB_CACHE_SECONDS = 600


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------------------------------------------------------------- TMDB

def tmdb_key():
    key = os.environ.get("TMDB_API_KEY", "").strip()
    if not key and CONFIG_FILE.exists():
        try:
            key = str(json.loads(CONFIG_FILE.read_text("utf-8")).get("tmdb_api_key", "")).strip()
        except (ValueError, OSError):
            key = ""
    return key


def tmdb(path, params=None):
    key = tmdb_key()
    if not key:
        raise ApiError(503, "No TMDB API key configured. Add it to config.json and restart.")
    params = dict(params or {})
    headers = {"Accept": "application/json", "User-Agent": "LumenCinemaDemo/1.0"}
    if key.startswith("eyJ"):  # v4 read access token
        headers["Authorization"] = "Bearer " + key
    else:
        params["api_key"] = key
    cache_key = path + "?" + urllib.parse.urlencode(sorted(params.items()))
    hit = tmdb_cache.get(cache_key)
    if hit and time.time() - hit[0] < TMDB_CACHE_SECONDS:
        return hit[1]
    req = urllib.request.Request(TMDB_BASE + path + "?" + urllib.parse.urlencode(params), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise ApiError(503, "TMDB rejected the API key. Check config.json.")
        if exc.code == 404:
            raise ApiError(404, "Movie not found.")
        raise ApiError(502, f"TMDB returned an error ({exc.code}).")
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ApiError(502, f"Could not reach TMDB: {getattr(exc, 'reason', exc)}")
    tmdb_cache[cache_key] = (time.time(), data)
    return data


def movie_summary(m):
    """The fields the site shows for a movie, from a TMDB list entry or a details response."""
    us = next((r for r in (m.get("release_dates") or {}).get("results", []) if r.get("iso_3166_1") == "US"), {})
    certification = next((d["certification"] for d in us.get("release_dates", []) if d.get("certification")), "")
    return {
        "id": m["id"],
        "title": m.get("title") or "Untitled",
        "overview": m.get("overview") or "",
        "posterPath": m.get("poster_path") or "",
        "backdropPath": m.get("backdrop_path") or "",
        "voteAverage": m.get("vote_average") or 0,
        "releaseDate": m.get("release_date") or "",
        "runtime": m.get("runtime") or 0,
        "genres": [g["name"] for g in m.get("genres", [])],
        "certification": certification,
    }


def movie_details(entry):
    """List results lack runtime, genres and rating, so each movie gets one (cached) details call."""
    try:
        return movie_summary(tmdb(f"/movie/{entry['id']}", {"language": "en-US", "append_to_response": "release_dates"}))
    except ApiError:
        return movie_summary(entry)


def movie_list(path, params, min_votes=0, limit=20):
    entries = []
    for page in (1, 2):
        entries += tmdb(path, dict(params, language="en-US", page=page)).get("results", [])
        if len(entries) < 20:
            break
    # min_votes drops the obscure titles that pad out TMDB's lists
    picks = [m for m in entries if m.get("poster_path") and not m.get("adult") and m.get("vote_count", 0) >= min_votes][:limit]
    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(movie_details, picks))


# ---------------------------------------------------------------- catalog (showtimes, prices, seats, meals)

def clean(value, limit):
    return str(value or "").strip()[:limit]


def money(value):
    return round(value + 1e-9, 2)


def seat_ids(fmt):
    return {f"{chr(65 + r)}{c}" for r in range(fmt["rows"]) for c in range(1, fmt["cols"] + 1)}


def seat_order(seat):
    return seat[0], int(seat[1:])


def show_dates():
    today = datetime.now().date()
    return [(today + timedelta(days=i)).isoformat() for i in range(SHOW_DAYS)]


def showtimes_for(format_id, date):
    """Showtimes of one theater type on one day: a random-looking but fixed schedule (the same every time
    it is asked for), plus any showtimes added by hand in the admin page."""
    rng = random.Random(f"{format_id}|{date}")
    minute = rng.randrange(10 * 60 + 30, 13 * 60, 5)  # first show between 10:30 and 12:55
    times = set()
    while minute <= 22 * 60 + 45 and len(times) < 5:
        times.add(f"{minute // 60:02d}:{minute % 60:02d}")
        minute += rng.randrange(165, 215, 5)  # next show 2h45 to 3h30 later
    times |= {e["time"] for e in CATALOG.get("extraShowtimes", []) if e["formatId"] == format_id and e["date"] == date}
    return sorted(times)


def public_catalog():
    """The catalog as the pages need it: everything in catalog.json plus the schedule for the bookable days."""
    with catalog_lock:
        schedule = {date: {f["id"]: showtimes_for(f["id"], date) for f in CATALOG["formats"]} for date in show_dates()}
        return dict(CATALOG, schedule=schedule)


def save_catalog():
    tmp = CATALOG_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(CATALOG, indent=2, ensure_ascii=False) + "\n", "utf-8")
    tmp.replace(CATALOG_FILE)
    index_catalog()


def as_price(value, top):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= top:
        raise ApiError(400, f"Prices must be numbers between 0 and {top}.")
    return money(float(value))


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "item"


def clean_was(raw, price, top):
    """The price before a discount. Kept only when it is higher than the price charged now."""
    if isinstance(raw, bool) or not isinstance(raw, (int, float)) or raw <= price:
        return None
    return as_price(raw, top)


def clean_deal(raw):
    """A "take N, pay for M" offer such as 2x1 or 3x2, or None when there is none."""
    if not isinstance(raw, dict):
        return None
    take, pay = raw.get("take"), raw.get("pay")
    if any(isinstance(n, bool) or not isinstance(n, int) for n in (take, pay)) or not 1 <= pay < take <= 10:
        raise ApiError(400, "An offer works like 2x1 or 3x2: guests take more than they pay for (10 at most).")
    return {"take": take, "pay": pay}


def clean_stock(raw, name):
    """A stock number, or None for unlimited."""
    if raw is not None and (isinstance(raw, bool) or not isinstance(raw, int) or not 0 <= raw <= 9999):
        raise ApiError(400, f"{name}: stock must be a whole number between 0 and 9999.")
    return raw


def deal_saving(deal, units):
    """Money a "take N, pay for M" offer takes off. units holds the price of every single item it covers;
    the cheapest ones are the free ones."""
    if not deal:
        return 0
    free = len(units) // deal["take"] * (deal["take"] - deal["pay"])
    return money(sum(sorted(units)[:free]))


def deal_name(deal):
    return f"{deal['take']}x{deal['pay']}"


def clean_snack(raw, used_ids):
    """Validate one meal as edited in the admin page and return it in catalog.json form."""
    if not isinstance(raw, dict):
        raise ApiError(400, "Invalid meal.")
    name = clean(raw.get("name"), 60)
    if not name:
        raise ApiError(400, "Every meal needs a name.")
    snack_id = clean(raw.get("id"), 40)
    if not re.fullmatch(r"[a-z0-9\-]+", snack_id):
        snack_id = slug(name)
    base, n = snack_id, 2
    while snack_id in used_ids:
        snack_id, n = f"{base}-{n}", n + 1
    used_ids.add(snack_id)

    sizes = []
    for size in raw.get("sizes") if isinstance(raw.get("sizes"), list) else []:
        size_name = clean(size.get("name"), 30) if isinstance(size, dict) else ""
        if not size_name:
            raise ApiError(400, f"{name}: every size needs a name.")
        size_id = clean(size.get("id"), 30)
        if not re.fullmatch(r"[a-z0-9\-]+", size_id) or size_id in {s["id"] for s in sizes}:
            size_id = "size-" + secrets.token_hex(3)
        entry = {"id": size_id, "name": size_name, "price": as_price(size.get("price"), 200)}
        if clean_was(size.get("was"), entry["price"], 200):
            entry["was"] = clean_was(size.get("was"), entry["price"], 200)
        if clean_stock(size.get("stock"), f"{name} {size_name}") is not None:
            entry["stock"] = size["stock"]
        sizes.append(entry)

    # A combo is a set of other menu items sold together for a percentage less; it has no sizes of its own.
    combo = None
    if isinstance(raw.get("combo"), dict):
        items, off = raw["combo"].get("items"), raw["combo"].get("discount")
        if not isinstance(items, list) or not 2 <= len(items) <= 6 or not all(isinstance(i, str) for i in items):
            raise ApiError(400, f"{name}: a combo contains between 2 and 6 things from the menu.")
        if isinstance(off, bool) or not isinstance(off, (int, float)) or not 0 <= off <= 90:
            raise ApiError(400, f"{name}: the combo discount must be between 0 and 90 percent.")
        combo, sizes = {"items": items, "discount": round(float(off), 2)}, []
    elif not 1 <= len(sizes) <= 8:
        raise ApiError(400, f"{name}: add between 1 and 8 sizes.")

    image = clean(raw.get("image"), 120)
    snack = {"id": snack_id, "name": name, "category": clean(raw.get("category"), 40) or "Popcorn & Classics",
             "description": clean(raw.get("description"), 300),
             "image": image if re.fullmatch(r"(/uploads/)?[\w.\-]+", image) else ""}
    for key, limit in (("badge", 24), ("calories", 24), ("dietary", 40)):
        if clean(raw.get(key), limit):
            snack[key] = clean(raw.get(key), limit)
    if raw.get("special"):
        snack["special"] = True
    snack["sizes"] = sizes

    flavors = raw.get("flavors") if isinstance(raw.get("flavors"), dict) else {}
    options = []
    for option in flavors.get("options") if isinstance(flavors.get("options"), list) else []:
        if clean(option, 30) and clean(option, 30) not in options:
            options.append(clean(option, 30))
    if options and not combo:
        options = options[:12]
        most = flavors.get("max") if isinstance(flavors.get("max"), int) else 1
        snack["flavors"] = {"options": options, "min": 1, "max": max(1, min(most, len(options)))}
        left = flavors.get("stock") if isinstance(flavors.get("stock"), dict) else {}
        left = {o: clean_stock(left[o], f"{name} {o}") for o in options if left.get(o) is not None}
        if left:
            snack["flavors"]["stock"] = left  # flavors not listed here are unlimited
    if combo:
        snack["combo"] = combo
    if clean_deal(raw.get("deal")):
        snack["deal"] = clean_deal(raw.get("deal"))

    snack["stock"] = clean_stock(raw.get("stock"), name)  # None means unlimited
    snack["soldOut"] = bool(raw.get("soldOut"))
    return snack


def update_catalog(payload):
    """Apply edits from the admin page. Each key is optional: formats (price, discount, offer, blocked seats), ticketTypes
    (multiplier), snacks (the whole menu) and extraShowtimes (the whole list of hand-added showtimes)."""
    with catalog_lock:
        draft = json.loads(json.dumps(CATALOG))  # edit a copy, so a bad value changes nothing

        formats = {f["id"]: f for f in draft["formats"]}
        for item in payload.get("formats") or []:
            fmt = formats.get(item.get("id")) if isinstance(item, dict) else None
            if not fmt:
                raise ApiError(400, "Unknown theater type.")
            if "price" in item:
                fmt["price"] = as_price(item["price"], 500)
                fmt.pop("was", None)
                if clean_was(item.get("was"), fmt["price"], 500):
                    fmt["was"] = clean_was(item.get("was"), fmt["price"], 500)
            if "deal" in item:
                fmt.pop("deal", None)
                if clean_deal(item["deal"]):
                    fmt["deal"] = clean_deal(item["deal"])
            if "blocked" in item:
                blocked = item["blocked"]
                if not isinstance(blocked, list) or not all(isinstance(s, str) for s in blocked) or not set(blocked) <= seat_ids(fmt):
                    raise ApiError(400, "Invalid seat list.")
                fmt["blocked"] = sorted(set(blocked), key=seat_order)

        types = {t["id"]: t for t in draft["ticketTypes"]}
        for item in payload.get("ticketTypes") or []:
            ttype = types.get(item.get("id")) if isinstance(item, dict) else None
            if not ttype:
                raise ApiError(400, "Unknown ticket type.")
            ttype["multiplier"] = round(as_price(item.get("multiplier"), 2), 4)

        if "snacks" in payload:
            snacks = payload["snacks"]
            if not isinstance(snacks, list) or len(snacks) > 60:
                raise ApiError(400, "Invalid menu.")
            used = set()
            draft["snacks"] = [clean_snack(s, used) for s in snacks]
            singles = {s["id"]: s for s in draft["snacks"] if not s.get("combo")}
            for snack in draft["snacks"]:
                missing = [i for i in (snack.get("combo") or {}).get("items", []) if i not in singles]
                if missing:
                    raise ApiError(400, f"The combo {snack['name']} contains something that is not on the menu ({missing[0]}). "
                                        "Take it out of the combo first.")

        if "extraShowtimes" in payload:
            extras, today = set(), datetime.now().date().isoformat()
            entries = payload["extraShowtimes"]
            for entry in entries if isinstance(entries, list) else []:
                fmt_id, date, show_time = (clean(entry.get(k), 10) for k in ("formatId", "date", "time")) if isinstance(entry, dict) else ("", "", "")
                try:
                    datetime.strptime(f"{date} {show_time}", "%Y-%m-%d %H:%M")
                except ValueError:
                    raise ApiError(400, "Pick a valid date and time.")
                if fmt_id not in formats:
                    raise ApiError(400, "Unknown theater type.")
                if date >= today:  # past ones are dropped
                    extras.add((date, show_time, fmt_id))
            draft["extraShowtimes"] = [{"formatId": f, "date": d, "time": t} for d, t, f in sorted(extras)][:300]

        CATALOG.clear()
        CATALOG.update(draft)
        save_catalog()
    return public_catalog()


def stock_use(lines):
    """How many of each meal, size and flavor a list of order lines takes. Keys are (meal,), (meal, "size", id)
    and (meal, "flavor", name); a combo counts as itself plus everything inside it."""
    use = {}
    for line in lines:
        for pick in [line, *line.get("parts", [])]:
            keys = [(pick["id"],)] + [(pick["id"], "flavor", f) for f in pick.get("flavors", [])]
            if pick.get("size"):
                keys.append((pick["id"], "size", pick["size"]))
            for key in keys:
                use[key] = use.get(key, 0) + line["qty"]
    return use


def stock_entry(key):
    """Where the stock number for a stock_use key lives: (dict holding it, key in that dict, name for messages)."""
    snack = SNACKS.get(key[0])
    if not snack:
        return {}, "stock", key[0]
    if len(key) == 1:
        return snack, "stock", snack["name"]
    if key[1] == "size":
        size = next((s for s in snack["sizes"] if s["id"] == key[2]), {})
        return size, "stock", f"{snack['name']} ({size.get('name', key[2])})"
    return (snack.get("flavors") or {}).get("stock") or {}, key[2], f"{snack['name']} ({key[2]})"


def check_stock(lines):
    for key, wanted in stock_use(lines).items():
        holder, field, name = stock_entry(key)
        left = 0 if len(key) == 1 and SNACKS.get(key[0], {}).get("soldOut") else holder.get(field)
        if left == 0:
            raise ApiError(400, f"{name} is out of stock. Please remove it from your order.")
        if left is not None and wanted > left:
            raise ApiError(400, f"Only {left} {name} left. Please lower the amount.")


def take_stock(order):
    """Lower the stock of what a new order contains (anything without a stock number is unlimited)."""
    with catalog_lock:
        changed = False
        for key, used in stock_use(order["snacks"]).items():
            holder, field, _ = stock_entry(key)
            if holder.get(field) is not None:
                holder[field] = max(0, holder[field] - used)
                changed = True
        if changed:
            save_catalog()


def save_upload(data_url):
    """Store an image sent from the admin page (as a data: URL) and return the address it is served at."""
    match = re.fullmatch(r"data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)", str(data_url))
    if not match:
        raise ApiError(400, "Upload a JPEG, PNG or WebP image.")
    try:
        raw = base64.b64decode(match.group(2))
    except ValueError:
        raise ApiError(400, "That file is not a valid image.")
    magic, ext = {"jpeg": (b"\xff\xd8\xff", ".jpg"), "png": (b"\x89PNG\r\n\x1a\n", ".png"), "webp": (b"RIFF", ".webp")}[match.group(1)]
    if not raw.startswith(magic) or len(raw) > 5_000_000:
        raise ApiError(400, "That file is not a valid image.")
    UPLOADS.mkdir(parents=True, exist_ok=True)
    name = secrets.token_hex(8) + ext
    (UPLOADS / name).write_bytes(raw)
    return "/uploads/" + name


# ---------------------------------------------------------------- admin login

def admin_credentials():
    """Username and password from the ADMIN_USERNAME / ADMIN_PASSWORD environment variables, else from
    config.json ("admin_username", "admin_password"); both default to "admin"."""
    try:
        cfg = json.loads(CONFIG_FILE.read_text("utf-8"))
    except (ValueError, OSError):
        cfg = {}
    return (str(os.environ.get("ADMIN_USERNAME") or cfg.get("admin_username") or "admin"),
            str(os.environ.get("ADMIN_PASSWORD") or cfg.get("admin_password") or "admin"))


def session_secret():
    if not SECRET_FILE.exists():
        SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
        SECRET_FILE.write_text(secrets.token_hex(32), "utf-8")
    return SECRET_FILE.read_text("utf-8").strip()


def sign_session(expires):
    # Signed with the credentials too, so changing the password logs everyone out.
    user, password = admin_credentials()
    return hmac.new(session_secret().encode(), f"{expires}|{user}|{password}".encode(), hashlib.sha256).hexdigest()


def new_session():
    """A signed, expiring token. Nothing is kept in memory, so logins survive a server restart."""
    expires = int(time.time()) + SESSION_SECONDS
    return f"{expires}.{sign_session(expires)}"


def valid_session(token):
    expires, _, signature = token.partition(".")
    if not expires.isdigit() or int(expires) < time.time():
        return False
    return hmac.compare_digest(signature.encode(), sign_session(int(expires)).encode())


def check_login(username, password):
    user, real_password = admin_credentials()
    user_ok = hmac.compare_digest(str(username).strip().lower().encode(), user.lower().encode())
    return hmac.compare_digest(str(password).encode(), real_password.encode()) and user_ok


# ---------------------------------------------------------------- orders

def load_orders():
    if not ORDERS_FILE.exists():
        return []
    try:
        return json.loads(ORDERS_FILE.read_text("utf-8"))
    except ValueError:
        return []


def save_orders(orders):
    ORDERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = ORDERS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(orders, indent=2, ensure_ascii=False), "utf-8")
    tmp.replace(ORDERS_FILE)


def clear_orders():
    with orders_lock:
        count = len(load_orders())
        save_orders([])
    return count


def clear_orders_at_midnight():
    """Wipe all orders when the date rolls over (12:00 AM local time). Runs in a background thread."""
    today = datetime.now().date()
    while True:
        time.sleep(20)
        if datetime.now().date() != today:
            today = datetime.now().date()
            print(f"Midnight: cleared {clear_orders()} orders.")


def update_order(order_id, change):
    """Apply change(order) to one stored order and return it."""
    with orders_lock:
        orders = load_orders()
        order = next((o for o in orders if o["id"] == order_id), None)
        if not order:
            raise ApiError(404, "Ticket not found.")
        change(order)
        save_orders(orders)
    return order


def showing_key(movie_id, format_id, date, show_time):
    return f"{movie_id}|{format_id}|{date}|{show_time}"


def taken_seats(orders, key):
    """Seats sold in the auditorium and at the time of a showing ("movie|format|date|time"). The film is left
    out on purpose: a seat bought there is occupied whatever film the next guest picked."""
    room = key.split("|")[1:]
    return sorted({seat for o in orders if [o["format"]["id"], o["date"], o["time"]] == room for seat in o["seats"]})


def blocked_seats(key):
    """Seats the admin switched off in the theater type of a showing ("movie|format|date|time")."""
    parts = key.split("|")
    return FORMATS.get(parts[1], {}).get("blocked", []) if len(parts) == 4 else []


def snack_choice(snack, item):
    """Validate the size and flavors picked for one menu item. Returns the size, the flavors in catalog order
    and the text describing the choice."""
    size = next((s for s in snack["sizes"] if s["id"] == item.get("size")), None)
    flavors = item.get("flavors") or []
    if not size or not isinstance(flavors, list) or not all(isinstance(f, str) for f in flavors):
        raise ApiError(400, "Invalid snack selection.")
    rule = snack.get("flavors") or {"options": [], "min": 0, "max": 0}
    if len(set(flavors)) != len(flavors) or not set(flavors) <= set(rule["options"]) or not rule["min"] <= len(flavors) <= rule["max"]:
        raise ApiError(400, f"Choose the flavor for {snack['name']}.")
    flavors = [f for f in rule["options"] if f in flavors]
    return size, flavors, size["name"] + (" · " + " + ".join(flavors) if flavors else "")


def snack_line(item):
    """Validate one snack selection ({id, size, flavors, qty}, or {id, parts, qty} for a combo) and price it
    from the catalog."""
    if not isinstance(item, dict):
        raise ApiError(400, "Invalid snack selection.")
    snack, qty = SNACKS.get(item.get("id")), item.get("qty")
    if not snack or isinstance(qty, bool) or not isinstance(qty, int) or not 1 <= qty <= 20:
        raise ApiError(400, "Invalid snack selection.")
    line = {"id": snack["id"], "size": "", "flavors": [], "qty": qty}
    if snack.get("combo"):
        picks, ids = item.get("parts"), snack["combo"]["items"]
        if not isinstance(picks, list) or len(picks) != len(ids) or not all(isinstance(p, dict) for p in picks):
            raise ApiError(400, f"Choose what goes in your {snack['name']}.")
        full, details, line["parts"] = 0, [], []
        for part_id, pick in zip(ids, picks):
            size, flavors, detail = snack_choice(SNACKS[part_id], pick)
            full += size["price"]
            details.append(f"{SNACKS[part_id]['name']} {detail}")
            line["parts"].append({"id": part_id, "size": size["id"], "flavors": flavors})
        unit, detail = money(full * (1 - snack["combo"]["discount"] / 100)), ", ".join(details)
    else:
        size, line["flavors"], detail = snack_choice(snack, item)
        unit, line["size"] = size["price"], size["id"]
    return dict(line, name=f"{snack['name']} ({detail})", unit=unit, total=money(unit * qty))


def build_order(payload, orders):
    """Validate a checkout payload and price it from the catalog (never trust client totals)."""
    fmt = FORMATS.get(payload.get("formatId"))
    if not fmt:
        raise ApiError(400, "Unknown theater type.")
    date, show_time = clean(payload.get("date"), 10), clean(payload.get("time"), 5)
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise ApiError(400, "Invalid date.")
    if date not in show_dates() or show_time not in showtimes_for(fmt["id"], date):
        raise ApiError(400, "That showtime is no longer available. Please pick another one.")

    movie_in = payload.get("movie") or {}
    try:
        movie_id = int(movie_in.get("id"))
    except (TypeError, ValueError):
        raise ApiError(400, "Missing movie.")
    genres = movie_in.get("genres") if isinstance(movie_in.get("genres"), list) else []
    movie = {
        "id": movie_id,
        "title": clean(movie_in.get("title"), 200) or "Untitled",
        "posterPath": clean(movie_in.get("posterPath"), 100),
        "backdropPath": clean(movie_in.get("backdropPath"), 100),
        "year": clean(movie_in.get("releaseDate"), 4),
        "runtime": int(movie_in.get("runtime") or 0),
        "certification": clean(movie_in.get("certification"), 10),
        "genres": [clean(g, 40) for g in genres[:4]],
    }
    for field in ("posterPath", "backdropPath"):
        if movie[field] and not re.fullmatch(r"/[\w.\-]+", movie[field]):
            movie[field] = ""

    tickets, ticket_lines, count = {}, [], 0
    for type_id, qty in (payload.get("tickets") or {}).items():
        ttype = TICKET_TYPES.get(type_id)
        if not ttype or not isinstance(qty, int) or qty < 0:
            raise ApiError(400, "Invalid ticket selection.")
        if qty:
            unit = money(fmt["price"] * ttype["multiplier"])
            tickets[type_id] = qty
            ticket_lines.append({"id": type_id, "name": ttype["name"], "qty": qty, "unit": unit, "total": money(unit * qty)})
            count += qty
    if not 1 <= count <= CATALOG["maxTickets"]:
        raise ApiError(400, f"Choose between 1 and {CATALOG['maxTickets']} tickets.")

    seats = payload.get("seats") or []
    if len(seats) != count or len(set(seats)) != count or not set(seats) <= seat_ids(fmt):
        raise ApiError(400, "Seat selection does not match the number of tickets.")
    key = showing_key(movie_id, fmt["id"], date, show_time)
    clash = sorted(set(seats) & (set(taken_seats(orders, key)) | set(blocked_seats(key))), key=seat_order)
    if clash:
        raise ApiError(409, "These seats are no longer available: " + ", ".join(clash))

    snacks_in = payload.get("snacks") or []
    if not isinstance(snacks_in, list) or len(snacks_in) > 40:
        raise ApiError(400, "Invalid snack selection.")
    snack_lines = [snack_line(item) for item in snacks_in]
    check_stock(snack_lines)

    # Offers such as 2x1: per theater type for tickets, per meal for snacks
    deals = []
    if fmt.get("deal"):
        saving = deal_saving(fmt["deal"], [l["unit"] for l in ticket_lines for _ in range(l["qty"])])
        deals.append({"name": f"{deal_name(fmt['deal'])} on {fmt['name']} tickets", "amount": saving})
    for snack_id in dict.fromkeys(l["id"] for l in snack_lines):
        deal = SNACKS[snack_id].get("deal")
        if deal:
            saving = deal_saving(deal, [l["unit"] for l in snack_lines if l["id"] == snack_id for _ in range(l["qty"])])
            deals.append({"name": f"{deal_name(deal)} on {SNACKS[snack_id]['name']}", "amount": saving})
    deals = [d for d in deals if d["amount"] > 0]

    name = clean((payload.get("customer") or {}).get("name"), 80)
    if not name:
        raise ApiError(400, "Enter your name.")

    pay = payload.get("payment") or {}
    method, brand, last4 = pay.get("method"), clean(pay.get("brand"), 12), clean(pay.get("last4"), 4)
    if method not in PAYMENT_METHODS or brand not in CARD_BRANDS:
        raise ApiError(400, "Choose a payment method.")
    if method == "card" and not re.fullmatch(r"\d{4}", last4):
        raise ApiError(400, "Invalid card details.")

    cinema = CATALOG["cinema"]
    tickets_total = money(sum(l["total"] for l in ticket_lines))
    snacks_total = money(sum(l["total"] for l in snack_lines))
    discount = money(sum(d["amount"] for d in deals))
    fees = money(cinema["bookingFeePerTicket"] * count)
    tax = money((tickets_total + snacks_total - discount) * cinema["taxRate"])
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    existing = {o["id"] for o in orders}
    while True:
        order_id = "LC-" + "".join(secrets.choice(alphabet) for _ in range(8))
        if order_id not in existing:
            break
    return {
        "id": order_id,
        "createdAt": datetime.now().isoformat(timespec="seconds"),
        "status": "valid",
        "checkedInAt": None,
        "snacksDispensed": False,
        "showingKey": key,
        "movie": movie,
        "format": {"id": fmt["id"], "name": fmt["name"], "auditorium": fmt["auditorium"]},
        "date": date,
        "time": show_time,
        "seats": sorted(seats, key=seat_order),
        "tickets": ticket_lines,
        "snacks": snack_lines,
        "deals": deals,
        "customer": {"name": name},
        "payment": {"method": method, "brand": brand if method == "card" else "", "last4": last4 if method == "card" else "",
                    "reference": "PAY-" + secrets.token_hex(6).upper(), "simulated": True},
        "totals": {"tickets": tickets_total, "snacks": snacks_total, "discount": discount, "fees": fees, "tax": tax,
                   "total": money(tickets_total + snacks_total - discount + fees + tax)},
    }


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = "LumenCinema/1.0"
    protocol_version = "HTTP/1.1"

    def log_request(self, code="-", size="-"):
        path = self.path
        quiet = "poll=1" in path  # the admin page polls; keep that out of the log
        if not quiet:
            request_log.appendleft({
                "time": datetime.now().isoformat(timespec="seconds"),
                "ip": self.client_address[0],
                "method": self.command,
                "path": path,
                "status": int(code) if str(code).isdigit() else 0,
            })
            super().log_request(code, size)

    def send_json(self, data, status=200, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie is not None:
            value, max_age = cookie
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}={value}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax")
        self.end_headers()
        self.wfile.write(body)

    def is_admin(self):
        try:
            cookie = SimpleCookie(self.headers.get("Cookie", ""))
        except CookieError:
            return False
        return SESSION_COOKIE in cookie and valid_session(cookie[SESSION_COOKIE].value)

    def require_admin(self):
        if not self.is_admin():
            raise ApiError(401, "Please log in.")

    def send_file(self, rel, base=STATIC):
        target = (base / rel).resolve()
        if base.resolve() not in target.parents or not target.is_file():
            return self.send_json({"error": "Not found"}, 404)
        body = target.read_bytes()
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        # built files in assets/ carry a hash in their name, so they can be cached for good
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if rel.startswith("assets/")
                         else "public, max-age=86400" if rel.startswith("img/") or base == UPLOADS else "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self, limit=100_000):
        length = int(self.headers.get("Content-Length") or 0)
        if length > limit:
            raise ApiError(413, "Request too large.")
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            raise ApiError(400, "Invalid JSON.")
        if not isinstance(data, dict):
            raise ApiError(400, "Invalid JSON.")
        return data

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        path, query = url.path, urllib.parse.parse_qs(url.query)
        try:
            if path.startswith("/api/"):
                return self.api_get(path, query)
            # The site is one page; it shows the booking flow or the admin screen depending on the address.
            if path == "/" or path.rstrip("/") == "/admin":
                return self.send_file("index.html")
            if path.startswith("/uploads/"):
                return self.send_file(urllib.parse.unquote(path)[len("/uploads/"):], UPLOADS)
            return self.send_file(urllib.parse.unquote(path).lstrip("/"))
        except ApiError as exc:
            self.send_json({"error": exc.message}, exc.status)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        try:
            payload = self.read_json(8_000_000 if path == "/api/admin/upload" else 100_000)
            if path == "/api/orders":
                with orders_lock, catalog_lock:
                    orders = load_orders()
                    order = build_order(payload, orders)
                    orders.append(order)
                    save_orders(orders)
                    take_stock(order)
                return self.send_json(order, 201)
            if path == "/api/admin/catalog":
                self.require_admin()
                return self.send_json(update_catalog(payload))
            if path == "/api/admin/upload":
                self.require_admin()
                return self.send_json({"image": save_upload(payload.get("dataUrl"))})
            if path == "/api/login":
                if not check_login(payload.get("username", ""), payload.get("password", "")):
                    time.sleep(1)  # slows down password guessing
                    raise ApiError(401, "Wrong username or password.")
                return self.send_json({"ok": True}, cookie=(new_session(), SESSION_SECONDS))
            if path == "/api/logout":
                return self.send_json({"ok": True}, cookie=("", 0))
            if path == "/api/orders/clear":
                self.require_admin()
                return self.send_json({"cleared": clear_orders()})
            if path == "/api/restart":
                self.require_admin()
                restart_requested.set()
                # Stop from another thread, after this response has gone out; main() then starts the new process.
                threading.Timer(0.5, self.server.shutdown).start()
                return self.send_json({"bootId": BOOT_ID})
            match = re.fullmatch(r"/api/orders/([A-Z0-9\-]+)/(checkin|snacks)", path)
            if match:
                self.require_admin()
                if match.group(2) == "snacks":
                    def change(order):
                        order["snacksDispensed"] = bool(payload.get("dispensed", not order.get("snacksDispensed")))
                else:
                    def change(order):
                        if order["status"] == "used":
                            raise ApiError(409, "Ticket was already checked in.")
                        order["status"] = "used"
                        order["checkedInAt"] = datetime.now().isoformat(timespec="seconds")
                return self.send_json(update_order(match.group(1), change))
            raise ApiError(404, "Not found")
        except ApiError as exc:
            self.send_json({"error": exc.message}, exc.status)

    def api_get(self, path, query):
        first = lambda name: (query.get(name) or [""])[0]
        if path == "/api/config":
            ip = lan_ip()  # lets tickets made on this PC carry a link phones can open
            return self.send_json({"tmdbConfigured": bool(tmdb_key()), "bootId": BOOT_ID,
                                   "lanUrl": f"http://{ip}:{self.server.server_address[1]}" if ip else ""})
        if path == "/api/catalog":
            return self.send_json(public_catalog())
        if path == "/api/session":
            return self.send_json({"admin": self.is_admin()})
        if path == "/api/movies":
            name = first("list") or "popular"
            if name not in MOVIE_LISTS:
                raise ApiError(400, "Unknown movie list.")
            return self.send_json({"movies": movie_list(MOVIE_LISTS[name], {"region": "US"}, min_votes=50)})
        if path == "/api/movies/search":
            q = first("q").strip()[:100]
            if not q:
                raise ApiError(400, "Type something to search.")
            return self.send_json({"movies": movie_list("/search/movie", {"query": q, "include_adult": "false"})})
        if path == "/api/seats":
            with orders_lock:
                key = first("showing")
                return self.send_json({"taken": sorted(set(taken_seats(load_orders(), key)) | set(blocked_seats(key)))})
        if path == "/api/orders":
            self.require_admin()
            with orders_lock:
                return self.send_json({"orders": list(reversed(load_orders()))})
        match = re.fullmatch(r"/api/orders/([A-Za-z0-9\-]+)", path)
        if match:
            with orders_lock:
                order = next((o for o in load_orders() if o["id"] == match.group(1).upper()), None)
            if not order:
                raise ApiError(404, "Ticket not found.")
            return self.send_json(order)
        if path == "/api/requests":
            self.require_admin()
            return self.send_json({"requests": list(request_log)})
        raise ApiError(404, "Not found")


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


def main():
    parser = argparse.ArgumentParser(description="Lumen Cinema demo server")
    parser.add_argument("--host", default="0.0.0.0", help="address to listen on (use 127.0.0.1 for this PC only)")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    if not CONFIG_FILE.exists():
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps({"tmdb_api_key": ""}, indent=2), "utf-8")
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("image/svg+xml", ".svg")
    session_secret()

    try:
        httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as exc:
        if not FROZEN:
            raise
        # double-clicked .exe: keep the window open long enough to read why it did not start
        print(f"Could not start on port {args.port}: {exc}\nIs Lumen Cinema already running?")
        input("Press Enter to close.")
        return
    if FROZEN and not os.environ.get("LUMEN_RESTARTED"):
        webbrowser.open(f"http://localhost:{args.port}")
    print("Lumen Cinema is running")
    print(f"  Site:   http://localhost:{args.port}")
    print(f"  Admin:  http://localhost:{args.port}/admin")
    if args.host == "0.0.0.0" and lan_ip():
        print(f"  On your network: http://{lan_ip()}:{args.port}")
    if not tmdb_key():
        print(f"  ! No TMDB API key yet - put it in {CONFIG_FILE} (tmdb_api_key) to load movies.")
    if not (STATIC / "index.html").exists():
        print("  ! static/index.html is missing - run build.bat to build the pages.")
    print("Press Ctrl+C to stop.\n")
    threading.Thread(target=clear_orders_at_midnight, daemon=True).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    httpd.server_close()
    if restart_requested.is_set():  # asked for from the admin page: start a fresh copy, then let this one end
        print("Restarting...\n", flush=True)
        if os.name == "posix":  # in a container this process must stay alive, so replace it in place
            os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]])
        if FROZEN:  # the .exe is its own interpreter; the reset flag makes the copy unpack itself afresh
            env = dict(os.environ, PYINSTALLER_RESET_ENVIRONMENT="1", LUMEN_RESTARTED="1")
            subprocess.Popen([sys.executable, *sys.argv[1:]], env=env)
            return
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]])


if __name__ == "__main__":
    main()
