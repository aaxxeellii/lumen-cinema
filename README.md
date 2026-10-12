# Lumen Cinema

A fictional cinema website: search real movies (TMDB), pick a theater type and showtime, choose
seats and snacks, pay on a simulated checkout and get a ticket with a QR code. The admin page at
`/admin` lists orders, scans tickets and edits prices, offers, meals, stock and showtimes.

No real tickets are sold and no payments are processed. This product uses the TMDB API but is not
endorsed or certified by TMDB.

Built by aaxxeellii together with [Claude Code](https://claude.com/claude-code).

## Install on umbrelOS

1. In Umbrel open **App Store**, click the **...** menu, then **Community App Stores**.
2. Add `https://github.com/aaxxeellii/lumen-cinema` and open the new store.
3. Install **Lumen Cinema**. Umbrel shows the admin username and password on the app page.
4. Add your free [TMDB API key](https://www.themoviedb.org/settings/api) so movies load: edit
   `config.json` in the app's data folder (`~/umbrel/app-data/aaxxeellii-lumen-cinema/data/`) and
   set `"tmdb_api_key": "YOUR_KEY"`. No restart is needed.

## Run with Docker

```
docker run -d --name lumen-cinema -p 8000:8000 -v lumen-data:/data \
  -e TMDB_API_KEY=YOUR_KEY -e ADMIN_PASSWORD=change-me \
  ghcr.io/aaxxeellii/lumen-cinema:latest
```

Or edit `docker-compose.yml` and run `docker compose up -d`. Then open http://localhost:8000.

| Setting | Meaning |
| --- | --- |
| `TMDB_API_KEY` | TMDB v3 key or v4 read token (or `tmdb_api_key` in `/data/config.json`) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Admin login, both `admin` by default |
| `TZ` | Cinema time zone, for example `America/Mexico_City` |
| `/data` | Volume with orders, config, the edited catalog and uploaded photos |

## Run without Docker

`python server.py` (Python 3.10+, no packages needed), then open http://localhost:8000. Settings
go in `config.json`, which is created on first start.

The pages in `static/` are built from the React app in `lumen-source/`; run `build.bat` after
changing it.
