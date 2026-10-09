#!/usr/bin/env python3
"""Network-free contract tests for the bundled Android API adapter."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import local_api


class LocalAnimeApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(local_api.app)
        self.auth = {"X-7xAnime-Token": local_api.get_token()}

    def tearDown(self) -> None:
        self.client.close()

    def test_health_and_request_guard(self) -> None:
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["status"], "ok")
        self.assertEqual(self.client.get("/spotlight").status_code, 403)

    def test_webview_cors_preflight(self) -> None:
        response = self.client.options(
            "/spotlight",
            headers={
                "Origin": "https://localhost",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-7xanime-token",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("access-control-allow-origin"),
            "https://localhost",
        )

    def test_watch_route_translates_episode_slug_and_normalizes_subtitles(self) -> None:
        async def fake_extract(query, episode=1, audio="sub", provider=None):
            self.assertEqual(query, "12345")
            self.assertEqual(episode, 12)
            self.assertEqual(audio, "sub")
            self.assertEqual(provider, "anineko")
            return {
                "provider": "anineko",
                "streams": [{"url": "https://cdn.example/master.m3u8", "type": "hls"}],
                "subtitles": [{"url": "https://cdn.example/sub.vtt", "lang": "en"}],
                "intro": {"start": 0, "end": 10},
                "outro": {"start": 100, "end": 110},
            }

        with patch.object(local_api, "extract_simple", new=AsyncMock(side_effect=fake_extract)):
            response = self.client.get(
                "/watch/anineko/12345/sub/anineko-12",
                headers=self.auth,
            )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["streams"][0]["url"], "https://cdn.example/master.m3u8")
        self.assertEqual(payload["subtitles"][0]["file"], "https://cdn.example/sub.vtt")
        self.assertEqual(payload["subtitles"][0]["label"], "en")
        self.assertEqual(payload["intro"]["end"], 10)

    def test_auto_watch_route_does_not_force_an_unknown_provider(self) -> None:
        async def fake_extract(query, episode=1, audio="sub", provider=None):
            self.assertEqual(query, "12345")
            self.assertEqual(episode, 1)
            self.assertIsNone(provider)
            return {"streams": [], "subtitles": []}

        with patch.object(local_api, "extract_simple", new=AsyncMock(side_effect=fake_extract)):
            response = self.client.get(
                "/watch/auto/12345/sub/episode-1",
                headers=self.auth,
            )
        self.assertEqual(response.status_code, 200, response.text)

    def test_proxy_rejects_loopback_targets(self) -> None:
        response = self.client.get(
            "/api/proxy",
            params={"url": "http://127.0.0.1/private"},
            headers=self.auth,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Local or private", response.json()["detail"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
