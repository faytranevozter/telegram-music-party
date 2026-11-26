import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

import requests

from api import search


class SearchTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), search.handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.thread.join)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def post(self, data, token="test-token"):
        request = Request(f"http://127.0.0.1:{self.server.server_port}/api/search",
                          data=json.dumps(data).encode(),
                          headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            response = urlopen(request, timeout=3)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    @patch.dict(os.environ, {"SEARCH_API_TOKEN": "test-token"})
    @patch.object(search, "search", return_value=[])
    def test_contract_and_validation(self, upstream):
        self.assertEqual(self.post({"query": "good life"}, "invalid")[0], 401)
        self.assertEqual(self.post({"query": "good life", "type": []})[0], 400)
        self.assertEqual(self.post({"query": "x" * 5000})[0], 413)
        upstream.assert_not_called()
        self.assertEqual(self.post({"query": " good   life ", "type": "video"}), (200, {"results": []}))
        upstream.assert_called_once_with("good life", "video")

    @patch.dict(os.environ, {"SEARCH_API_TOKEN": "test-token"})
    @patch.object(search, "search", side_effect=requests.Timeout)
    def test_timeout_is_not_empty_results(self, _upstream):
        self.assertEqual(self.post({"query": "good life"}), (504, {"error": "provider_timeout"}))

    @patch.object(search, "YTMusic")
    def test_uses_catalog_mode_and_keeps_video_gate_fields(self, client):
        video = {"resultType": "video", "videoId": "FG9M0aEpJGE", "title": "Good Life", "duration_seconds": 232}
        client.return_value.search.return_value = [video, video, {**video, "resultType": "song"}]
        with patch.dict(os.environ, {"YT_MUSIC_LOCATION": "ID", "YT_MUSIC_LANG": "en"}):
            results = search.search("good life", "video")
        self.assertEqual(client.call_args.kwargs["location"], "ID")
        client.return_value.search.assert_called_once_with("good life", filter="videos", limit=20)
        self.assertEqual(results, [{"videoId": "FG9M0aEpJGE", "title": "Good Life", "artistName": None,
                                    "channelName": "Unknown channel", "durationSeconds": 232, "thumbnailUrl": None}])
