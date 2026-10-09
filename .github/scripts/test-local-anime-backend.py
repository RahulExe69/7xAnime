#!/usr/bin/env python3
"""Network-free contract tests for the bundled Android API adapter."""
from __future__ import annotations

import asyncio
import base64
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import local_api
from src.providers import animenosub


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

    def test_watch_route_uses_only_the_selected_provider_and_normalizes_subtitles(self) -> None:
        selected_module = object()
        other_module = object()

        async def fake_watch_one(mod, name, anilist_id, episode, audio, ctx):
            self.assertIs(mod, selected_module)
            self.assertEqual(name, "anineko")
            self.assertEqual(anilist_id, 12345)
            self.assertEqual(episode, 12)
            self.assertEqual(audio, "sub")
            self.assertEqual(ctx, {"anilistId": 12345})
            return "anineko", [{
                "url": "https://cdn.example/master.m3u8",
                "type": "hls",
                "subtitles": [{"url": "https://cdn.example/sub.vtt", "lang": "en"}],
            }], 0.25, True

        with (
            patch.object(local_api.provider_race, "providers", return_value=[
                ("anineko", selected_module), ("anizone", other_module),
            ]),
            patch.object(local_api.provider_race, "build_ctx", new=AsyncMock(return_value={"anilistId": 12345})),
            patch.object(local_api, "_watch_one_for_player", new=AsyncMock(side_effect=fake_watch_one)),
            patch.object(local_api.provider_race, "race_watch", new=AsyncMock(side_effect=AssertionError("manual pick must not race other providers"))),
        ):
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
        self.assertEqual(payload["requestedProvider"], "anineko")
        self.assertEqual(payload["providerStatus"], "ok")

    def test_selected_provider_failure_does_not_silently_return_another_provider(self) -> None:
        selected_module = object()
        other_module = object()

        with (
            patch.object(local_api.provider_race, "providers", return_value=[
                ("anineko", selected_module), ("anizone", other_module),
            ]),
            patch.object(local_api.provider_race, "build_ctx", new=AsyncMock(return_value={})),
            patch.object(local_api, "_watch_one_for_player", new=AsyncMock(return_value=("anineko", [], 8.0, False))),
            patch.object(local_api.provider_race, "record_latency"),
            patch.object(local_api.provider_race, "race_watch", new=AsyncMock(side_effect=AssertionError("must not silently switch providers"))),
        ):
            response = self.client.get(
                "/watch/anineko/12345/sub/anineko-12",
                headers=self.auth,
            )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["provider"], "anineko")
        self.assertEqual(payload["requestedProvider"], "anineko")
        self.assertEqual(payload["providerStatus"], "no_stream")
        self.assertEqual(payload["streams"], [])

    def test_unknown_provider_does_not_fall_back_to_the_auto_race(self) -> None:
        with patch.object(
            local_api.provider_race,
            "race_watch",
            new=AsyncMock(side_effect=AssertionError("unknown provider must not race all providers")),
        ):
            response = self.client.get(
                "/watch/not-a-provider/12345/sub/not-a-provider-1",
                headers=self.auth,
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["providerStatus"], "unsupported_provider")
        self.assertEqual(response.json()["streams"], [])

    def test_auto_watch_route_returns_an_empty_result_quickly_when_no_provider_wins(self) -> None:
        async def fake_race(anilist_id, episode, audio="sub", preferred=None):
            self.assertEqual(anilist_id, 12345)
            self.assertEqual(episode, 1)
            self.assertEqual(audio, "sub")
            self.assertIsNone(preferred)
            return None

        with patch.object(local_api, "_race_watch_for_player", new=AsyncMock(side_effect=fake_race)):
            response = self.client.get(
                "/watch/auto/12345/sub/episode-1",
                headers=self.auth,
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["streams"], [])

    def test_auto_watch_route_converts_provider_exception_to_empty_stream_result(self) -> None:
        with patch.object(
            local_api,
            "_race_watch_for_player",
            new=AsyncMock(side_effect=RuntimeError("providers unavailable")),
        ):
            response = self.client.get(
                "/watch/auto/12345/dub/episode-1",
                headers=self.auth,
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["streams"], [])

    def test_provider_error_diagnostics_remove_upstream_urls(self) -> None:
        message = local_api._safe_provider_error(
            RuntimeError("HTTP 403 fetching https://example.invalid/path")
        )
        self.assertIn("HTTP 403", message)
        self.assertIn("<upstream URL>", message)
        self.assertNotIn("example.invalid", message)

    def test_provider_watch_timeout_is_reported_with_actionable_diagnostics(self) -> None:
        async def slow_watch(anilist_id, audio, episode, ctx):
            await asyncio.sleep(0.1)
            return [{"url": "https://cdn.example/master.m3u8", "type": "hls"}]

        async def exercise() -> None:
            previous_timeout = local_api.LOCAL_WATCH_TIMEOUT
            try:
                local_api.LOCAL_WATCH_TIMEOUT = 0.01
                name, streams, seconds, ok = await local_api._watch_one_for_player(
                    type("Provider", (), {"watch": staticmethod(slow_watch)}),
                    "test-provider",
                    12345,
                    1,
                    "sub",
                    {},
                )
                self.assertEqual(name, "test-provider")
                self.assertFalse(ok)
                self.assertEqual(streams, [])
                self.assertGreaterEqual(seconds, 0)
                diagnostic = local_api._LOCAL_PROVIDER_DIAGNOSTICS["test-provider"]
                self.assertEqual(diagnostic["outcome"], "timeout")
                self.assertIn("timed out", diagnostic["message"].lower())
            finally:
                local_api.LOCAL_WATCH_TIMEOUT = previous_timeout
                local_api._LOCAL_WATCH_CACHE.pop(("test-provider", 12345, 1, "sub"), None)
                local_api._LOCAL_PROVIDER_DIAGNOSTICS.pop("test-provider", None)

        asyncio.run(exercise())

    def test_provider_status_reports_loaded_modules_and_recent_attempt_metrics(self) -> None:
        snapshot = {
            "defaultProvider": "anineko",
            "ranking": ["anineko", "anizone"],
            "available": ["anineko"],
            "latency": {
                "anineko": {"avg_seconds": 0.8, "episodes_seconds": 1.2, "failures": 0},
                "anizone": {"avg_seconds": None, "episodes_seconds": None, "failures": 2},
            },
        }
        with patch.object(local_api.provider_race, "providers_status", return_value=snapshot):
            response = self.client.get("/api/diagnostics/providers", headers=self.auth)

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["loadedCount"], 1)
        self.assertEqual(payload["providerCount"], 2)
        self.assertEqual(payload["providers"][0]["status"], "recent_attempt_succeeded")
        self.assertEqual(payload["providers"][1]["status"], "module_unavailable")
        self.assertIn("not a live guarantee", payload["note"])

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

    def test_media_proxy_forwards_byte_ranges_for_mp4(self) -> None:
        fake_response = type(
            "FakeResponse",
            (),
            {
                "is_success": True,
                "status_code": 206,
                "headers": {
                    "content-type": "video/mp4",
                    "content-range": "bytes 0-3/100",
                    "accept-ranges": "bytes",
                    "content-length": "4",
                },
                "content": b"test",
                "text": "test",
            },
        )()
        fake_client = AsyncMock()
        fake_client.__aenter__.return_value = fake_client
        fake_client.__aexit__.return_value = None
        fake_client.get = AsyncMock(return_value=fake_response)

        with patch.object(local_api.httpx, "AsyncClient", return_value=fake_client):
            response = self.client.get(
                "/api/proxy",
                params={"url": "https://cdn.example/video.mp4", "referer": "https://cdn.example/"},
                headers={**self.auth, "Range": "bytes=0-3"},
            )

        self.assertEqual(response.status_code, 206, response.text)
        self.assertEqual(response.content, b"test")
        self.assertEqual(response.headers.get("content-range"), "bytes 0-3/100")
        self.assertEqual(response.headers.get("accept-ranges"), "bytes")
        request_headers = fake_client.get.await_args.kwargs["headers"]
        self.assertEqual(request_headers["Range"], "bytes=0-3")

    def test_player_media_format_filter_accepts_hls_mp4_and_embed_but_not_dash(self) -> None:
        streams = [
            {"url": "https://cdn.example/video.mpd", "type": "dash"},
            {"url": "https://cdn.example/video.mp4", "type": "mp4"},
            {"url": "https://cdn.example/frame", "type": "embed"},
            {"url": "https://cdn.example/master.m3u8", "type": "hls"},
        ]
        playable = local_api._playable_streams(streams)
        self.assertEqual([item["type"] for item in playable], ["m3u8", "mp4", "embed"])
        self.assertNotIn("dash", [item["type"] for item in playable])

    def test_animenosub_adapter_parses_audio_flags_and_embedded_servers(self) -> None:
        snippet = '<iframe src="https://vidmoly.to/embed/abc123"></iframe>'
        encoded = base64.b64encode(snippet.encode("utf-8")).decode("ascii")
        series_html = (
            '<ul><li data-index="0"><a href="https://animenosub.to/attack-on-titan-dub/episode-1">'
            '<div class="epl-num">1</div><i class="anititle">Episode 1</i>'
            '<span class="btn-dubbed">Dubbed</span></a></li></ul>'
        )
        embeds_html = f'<select><option value="{encoded}" data-index="0">VidMoly</option></select>'

        async def exercise() -> None:
            with patch.object(animenosub, "fetch_text", new=AsyncMock(return_value=series_html)):
                episodes = await animenosub.episode_catalogue("attack-on-titan-dub")
            self.assertEqual(len(episodes), 1)
            self.assertTrue(episodes[0]["hasDub"])
            self.assertFalse(episodes[0]["hasSub"])
            self.assertEqual(episodes[0]["number"], 1)

            with patch.object(animenosub, "fetch_text", new=AsyncMock(return_value=embeds_html)):
                streams = await animenosub.source_options(
                    "https://animenosub.to/attack-on-titan-dub/episode-1"
                )
            self.assertEqual(len(streams), 1)
            self.assertEqual(streams[0]["type"], "embed")
            self.assertEqual(streams[0]["url"], "https://vidmoly.to/embed/abc123")
            self.assertEqual(streams[0]["referer"], "https://vidmoly.to/")

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
