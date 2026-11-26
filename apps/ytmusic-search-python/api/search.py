import hmac
import json
import logging
import os
import re
import threading
from http.server import BaseHTTPRequestHandler
from time import monotonic

import requests
from ytmusicapi import YTMusic


FILTERS = {"song": "songs", "video": "videos"}
VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
slots = threading.BoundedSemaphore(4)


class SearchSession(requests.Session):
    def __init__(self):
        super().__init__()
        self.deadline = monotonic() + 5

    def request(self, method, url, **kwargs):
        remaining = self.deadline - monotonic()
        if remaining <= 0:
            raise requests.Timeout()
        kwargs["timeout"] = (min(2, remaining), remaining)
        return super().request(method, url, **kwargs)


def clean(value):
    return value.strip() if isinstance(value, str) else ""


def label(value):
    # The backend measures JavaScript UTF-16 code units.
    return clean(value).encode("utf-16-le")[:600].decode("utf-16-le", errors="ignore")


def normalize(rows, kind):
    if not isinstance(rows, list):
        raise ValueError("Unexpected upstream result")
    seen = set()
    results = []
    for row in rows:
        if not isinstance(row, dict) or row.get("resultType") != kind:
            continue
        video_id, title = clean(row.get("videoId")), label(row.get("title"))
        if not VIDEO_ID.fullmatch(video_id) or not title or video_id in seen:
            continue
        credits = [clean(artist.get("name")) for artist in row.get("artists") or [] if isinstance(artist, dict)]
        credit = label(", ".join(filter(None, credits)))
        thumbnails = [clean(item.get("url")) for item in row.get("thumbnails") or [] if isinstance(item, dict)]
        duration = row.get("duration_seconds")
        seen.add(video_id)
        results.append({
            "videoId": video_id,
            "title": title,
            "artistName": (credit or None) if kind == "song" else None,
            "channelName": (credit or "Unknown channel") if kind == "video" else None,
            "durationSeconds": duration if type(duration) is int and duration > 0 else None,
            "thumbnailUrl": next((url for url in reversed(thumbnails) if url.startswith("https://") and len(url.encode("utf-16-le")) <= 8192), None),
        })
        if len(results) == 20:
            break
    return results


def search(query, kind):
    location = os.getenv("YT_MUSIC_LOCATION", "ID")
    language = os.getenv("YT_MUSIC_LANG", "en")
    with SearchSession() as session:
        client = YTMusic(location=location, language=language, requests_session=session)
        return normalize(client.search(query, filter=FILTERS[kind], limit=20), kind)


class handler(BaseHTTPRequestHandler):
    def respond(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass

    def do_POST(self):
        token = os.getenv("SEARCH_API_TOKEN", "")
        supplied = self.headers.get("Authorization", "")
        if not token or not hmac.compare_digest(supplied.encode(), f"Bearer {token}".encode()):
            return self.respond(401, {"error": "unauthorized"})
        if self.headers.get_content_type() != "application/json":
            return self.respond(415, {"error": "unsupported_media_type"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 4096:
                return self.respond(413, {"error": "body_too_large"})
            if length <= 0:
                raise ValueError()
            data = json.loads(self.rfile.read(length))
            query = " ".join(clean(data.get("query")).split()) if isinstance(data, dict) else ""
            kind = data.get("type", "song") if isinstance(data, dict) else None
            if not 3 <= len(query) <= 200 or not isinstance(kind, str) or kind not in FILTERS:
                raise ValueError()
        except ValueError:
            return self.respond(400, {"error": "invalid_request"})

        if not slots.acquire(blocking=False):
            return self.respond(503, {"error": "provider_busy"})
        start = monotonic()
        try:
            status, response = 200, {"results": search(query, kind)}
        except requests.Timeout:
            status, response = 504, {"error": "provider_timeout"}
        except requests.HTTPError as error:
            limited = error.response is not None and error.response.status_code == 429
            status, response = (503, {"error": "provider_rate_limited"}) if limited else (502, {"error": "provider_unavailable"})
        except Exception:
            status, response = 502, {"error": "provider_unavailable"}
        finally:
            slots.release()
        logging.warning("media_search type=%s status=%d elapsed_ms=%d", kind, status, (monotonic() - start) * 1000)
        return self.respond(status, response)
