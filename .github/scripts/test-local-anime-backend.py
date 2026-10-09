#!/usr/bin/env python3
"""Network-free contract tests for the bundled Android API adapter."""
from __future__ import annotations

import asyncio
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
        async def fake_race(anilist_id, episode, audio="sub", preferred=None):
            self.assertEqual(anilist_id, 12345)
            self.assertEqual(episode, 12)
            self.assertEqual(audio, "sub")
            self.assertEqual(preferred, "anineko")
            return {
                "provider": "anineko",
                "streams": [{
                    "url": "https://cdn.example/master.m3u8",
                    "type": "hls",
                    "subtitles": [{"url": "https://cdn.example/sub.vtt", "lang": "en"}],
                }],
                "defaultProvider": "anineko",
                "requestedProvider": "anineko",
            }

        with patch.object(local_api.provider_race, "race_watch", new=AsyncMock(side_effect=fake_race)):
            response = self.client.get(
                "/watch/anineko/12345/sub/anineko-12",
                headers=self.auth,
            )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["streams"][0]["url"], "https://cdn.example/master.m3u8")
        self.assertEqual(payload["subtitles"][0]["file"], "https://cdn.example/sub.vtt")
        self.assertEqual(payload["subtitles"][0]["label"], "en")
        self.assertEqual(payload["provider"], "anineko")

    def test_auto_watch_route_returns_an_empty_result_quickly_when_no_provider_wins(self) -> None:
        async def fake_race(anilist_id, episode, audio="sub", preferred=None):
            self.assertEqual(anilist_id, 12345)
            self.assertEqual(episode, 1)
            self.assertEqual(audio, "sub")
            self.assertIsNone(preferred)
            return None

        with patch.object(local_api.provider_race, "race_watch", new=AsyncMock(side_effect=fake_race)):
            response = self.client.get(
                "/watch/auto/12345/sub/episode-1",
                headers=self.auth,
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["streams"], [])

    def test_auto_watch_route_converts_provider_exception_to_empty_stream_result(self) -> None:
        with patch.object(
            local_api.provider_race,
            "race_watch",
            new=AsyncMock(side_effect=RuntimeError("providers unavailable")),
        ):
            response = self.client.get(
                "/watch/auto/12345/dub/episode-1",
                headers=self.auth,
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["streams"], [])

    def test_hindi_search_route_proxies_only_the_fixed_catalogue_endpoint(self) -> None:
        fake_response = type(
            "FakeResponse",
            (),
            {
                "is_success": True,
                "status_code": 200,
                "json": staticmethod(lambda: {"success": True, "results": {"results": []}}),
            },
        )()
        fake_client = AsyncMock()
        fake_client.__aenter__.return_value = fake_client
        fake_client.__aexit__.return_value = None
        fake_client.get = AsyncMock(return_value=fake_response)

        with patch.object(local_api.httpx, "AsyncClient", return_value=fake_client):
            response = self.client.get(
                "/hindi/search",
                params={"s": "Solo Leveling", "page": 2},
                headers=self.auth,
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["success"])
        fake_client.get.assert_awaited_once_with(
            "https://anime-api-ashen-chi.vercel.app/api/search",
            params={"s": "Solo Leveling", "page": 2},
        )

    def test_hindi_stream_route_bounds_query_parameters(self) -> None:
        fake_response = type(
            "FakeResponse",
            (),
            {
                "is_success": True,
                "status_code": 200,
                "json": staticmethod(lambda: {"success": True, "results": []}),
            },
        )()
        fake_client = AsyncMock()
        fake_client.__aenter__.return_value = fake_client
        fake_client.__aexit__.return_value = None
        fake_client.get = AsyncMock(return_value=fake_response)

        with patch.object(local_api.httpx, "AsyncClient", return_value=fake_client):
            response = self.client.get(
                "/hindi/stream",
                params={"id": "solo-leveling", "season": 0, "ep": 0},
                headers=self.auth,
            )

        self.assertEqual(response.status_code, 200, response.text)
        fake_client.get.assert_awaited_once_with(
            "https://anime-api-ashen-chi.vercel.app/api/stream",
            params={"id": "solo-leveling", "season": 1, "ep": 1},
        )

    def test_episode_discovery_returns_fast_providers_before_slow_ones(self) -> None:
        async def exercise() -> None:
            anime_id = 87654321
            local_api._episode_discovery_cache.pop(anime_id, None)

            async def fake_provider_episodes(mod, name, requested_id, ctx):
                if name == "slow":
                    await asyncio.sleep(1.2)
                return name, {"episodes": {"sub": [{"number": 1, "id": f"{name}-1"}], "dub": []}}

            fake_modules = [("fast", object()), ("slow", object())]
            with (
                patch.object(local_api.provider_race, "providers", return_value=fake_modules),
                patch.object(local_api.provider_race, "build_ctx", new=AsyncMock(return_value={})),
                patch.object(local_api.provider_race, "_episodes_one", new=AsyncMock(side_effect=fake_provider_episodes)),
            ):
                first = await local_api._progressive_merged_episodes(anime_id)
                self.assertIsNotNone(first)
                self.assertIn("fast", first["providers"])
                self.assertNotIn("slow", first["providers"])
                self.assertFalse(first["complete"])

                await asyncio.sleep(0.6)
                second = await local_api._progressive_merged_episodes(anime_id)
                self.assertIn("fast", second["providers"])
                self.assertNotIn("slow", second["providers"])
                self.assertFalse(second["complete"])

                await asyncio.sleep(0.7)
                third = await local_api._progressive_merged_episodes(anime_id)
                self.assertIn("fast", third["providers"])
                self.assertIn("slow", third["providers"])
                self.assertTrue(third["complete"])

            local_api._episode_discovery_cache.pop(anime_id, None)

        asyncio.run(exercise())

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
