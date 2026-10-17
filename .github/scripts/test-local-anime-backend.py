#!/usr/bin/env python3
"""Network-free contract tests for the bundled Android API adapter."""
from __future__ import annotations

import asyncio
import base64
import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient

import local_api
from src.providers import animenosub, anixo, animeparadise, cinexstream, megaflix, megavid, nontongo, tryembed


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

    def test_disabled_providers_are_rejected_without_stream_resolution(self) -> None:
        for provider in ("animeparadise", "megaflix", "nontongo"):
            with patch.object(
                local_api,
                "_watch_one_for_player",
                new=AsyncMock(side_effect=AssertionError("disabled provider must never be called")),
            ) as watch:
                response = self.client.get(
                    f"/watch/{provider}/12345/sub/{provider}-1",
                    headers=self.auth,
                )

            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            self.assertEqual(payload["requestedProvider"], provider)
            self.assertEqual(payload["providerStatus"], "unsupported_provider")
            self.assertEqual(payload["streams"], [])
            watch.assert_not_awaited()

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

    def test_auto_watch_route_returns_failure_timings_when_no_provider_wins(self) -> None:
        async def fake_race(anilist_id, episode, audio="sub", preferred=None):
            self.assertEqual(anilist_id, 12345)
            self.assertEqual(episode, 1)
            self.assertEqual(audio, "sub")
            self.assertIsNone(preferred)
            return {
                "provider": "auto",
                "streams": [],
                "timings": {
                    "anineko": {"seconds": 0.2, "ok": False},
                    "animegg": {"seconds": 0.4, "ok": False},
                },
            }

        with patch.object(local_api, "_race_watch_for_player", new=AsyncMock(side_effect=fake_race)):
            response = self.client.get(
                "/watch/auto/12345/sub/episode-1",
                headers=self.auth,
            )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["streams"], [])
        self.assertFalse(payload["timings"]["anineko"]["ok"])
        self.assertFalse(payload["timings"]["animegg"]["ok"])

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

    def test_provider_context_is_cached_across_discovery_and_playback(self) -> None:
        anime_id = 987654
        fake_context = {"media": {"id": anime_id, "title": {"english": "Test"}}, "anizip": None}

        async def exercise() -> None:
            with patch.object(
                local_api.provider_race,
                "build_ctx",
                new=AsyncMock(return_value=fake_context),
            ) as build_context:
                first = await local_api._get_local_provider_context(anime_id)
                second = await local_api._get_local_provider_context(anime_id)
                self.assertIs(first, fake_context)
                self.assertIs(second, fake_context)
                build_context.assert_awaited_once_with(anime_id)
            local_api._LOCAL_CONTEXT_CACHE.pop(anime_id, None)
            local_api._LOCAL_CONTEXT_TASKS.pop((id(asyncio.get_running_loop()), anime_id), None)

        asyncio.run(exercise())

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
                self.assertEqual(diagnostic["anilistId"], 12345)
                self.assertEqual(diagnostic["episode"], 1)
                self.assertEqual(diagnostic["audio"], "sub")
            finally:
                local_api.LOCAL_WATCH_TIMEOUT = previous_timeout
                local_api._LOCAL_WATCH_CACHE.pop(("test-provider", 12345, 1, "sub"), None)
                local_api._LOCAL_PROVIDER_DIAGNOSTICS.pop("test-provider", None)

        asyncio.run(exercise())

    def test_provider_status_reports_loaded_modules_and_recent_attempt_metrics(self) -> None:
        snapshot = {
            "defaultProvider": "anixo",
            "ranking": ["anixo", "megavid"],
            "available": ["anixo"],
            "latency": {
                "anixo": {"avg_seconds": 0.8, "episodes_seconds": 1.2, "failures": 0},
                "megavid": {"avg_seconds": None, "episodes_seconds": None, "failures": 2},
            },
        }
        with patch.object(local_api.provider_race, "providers_status", return_value=snapshot):
            response = self.client.get("/api/diagnostics/providers", headers=self.auth)

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["loadedCount"], 1)
        self.assertEqual(payload["providerCount"], 4)
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
            loop_task_key = (id(asyncio.get_running_loop()), anime_id)
            local_api._episode_discovery_cache.pop(anime_id, None)
            local_api._LOCAL_CONTEXT_CACHE.pop(anime_id, None)
            local_api._LOCAL_CONTEXT_TASKS.pop(loop_task_key, None)

            async def fake_provider_episodes(mod, name, requested_id, ctx):
                if name == "megavid":
                    await asyncio.sleep(1.2)
                return name, {"episodes": {"sub": [{"number": 1, "id": f"{name}-1"}], "dub": []}}

            fake_modules = [("anixo", object()), ("megavid", object())]
            with (
                patch.object(local_api.provider_race, "providers", return_value=fake_modules),
                patch.object(local_api.provider_race, "build_ctx", new=AsyncMock(return_value={"media": {"id": 87654321, "title": {"english": "Test"}}, "anizip": None})),
                patch.object(local_api.provider_race, "_episodes_one", new=AsyncMock(side_effect=fake_provider_episodes)),
            ):
                first = await local_api._progressive_merged_episodes(anime_id)
                self.assertIsNotNone(first)
                self.assertIn("anixo", first["providers"])
                self.assertNotIn("megavid", first["providers"])
                self.assertFalse(first["complete"])

                await asyncio.sleep(0.6)
                second = await local_api._progressive_merged_episodes(anime_id)
                self.assertIn("anixo", second["providers"])
                self.assertNotIn("megavid", second["providers"])
                self.assertFalse(second["complete"])

                await asyncio.sleep(0.7)
                third = await local_api._progressive_merged_episodes(anime_id)
                self.assertIn("anixo", third["providers"])
                self.assertIn("megavid", third["providers"])
                self.assertTrue(third["complete"])
                self.assertEqual(third["providerNames"], ["anixo", "megavid"])
                self.assertEqual(third["failedProviders"], [])

            local_api._episode_discovery_cache.pop(anime_id, None)
            local_api._LOCAL_CONTEXT_CACHE.pop(anime_id, None)
            local_api._LOCAL_CONTEXT_TASKS.pop(loop_task_key, None)

        asyncio.run(exercise())

    def test_episode_discovery_reports_failed_providers_separately(self) -> None:
        async def exercise() -> None:
            anime_id = 87654322
            loop_task_key = (id(asyncio.get_running_loop()), anime_id)
            local_api._episode_discovery_cache.pop(anime_id, None)
            local_api._LOCAL_CONTEXT_CACHE.pop(anime_id, None)
            local_api._LOCAL_CONTEXT_TASKS.pop(loop_task_key, None)

            async def fake_provider_episodes(mod, name, requested_id, ctx):
                if name == "anixo":
                    raise TimeoutError("provider timed out")
                return name, {"episodes": {"sub": [], "dub": []}}

            fake_modules = [("anixo", object()), ("megavid", object())]
            with (
                patch.object(local_api.provider_race, "providers", return_value=fake_modules),
                patch.object(local_api.provider_race, "build_ctx", new=AsyncMock(return_value={"media": {"id": anime_id, "title": {"english": "Test"}}, "anizip": None})),
                patch.object(local_api.provider_race, "_episodes_one", new=AsyncMock(side_effect=fake_provider_episodes)),
            ):
                response = await local_api._progressive_merged_episodes(anime_id)

            self.assertIsNotNone(response)
            self.assertTrue(response["complete"])
            self.assertEqual(response["providerNames"], ["anixo", "megavid"])
            self.assertEqual(response["failedProviders"], ["anixo"])
            self.assertIn("megavid", response["providers"])
            self.assertNotIn("anixo", response["providers"])

            local_api._episode_discovery_cache.pop(anime_id, None)
            local_api._LOCAL_CONTEXT_CACHE.pop(anime_id, None)
            local_api._LOCAL_CONTEXT_TASKS.pop(loop_task_key, None)

        asyncio.run(exercise())

    def test_media_proxy_forwards_byte_ranges_for_mp4(self) -> None:
        class FakeResponse:
            is_success = True
            status_code = 206
            headers = {
                "content-type": "video/mp4",
                "content-range": "bytes 0-3/100",
                "accept-ranges": "bytes",
                "content-length": "4",
            }
            encoding = "utf-8"

            async def aiter_raw(self):
                yield b"test"

            async def aclose(self):
                return None

        fake_response = FakeResponse()
        fake_client = AsyncMock()
        fake_client.build_request = Mock(return_value=object())
        fake_client.send = AsyncMock(return_value=fake_response)
        target = "https://cdn.example/video.mp4"

        with (
            patch.object(local_api, "_get_media_http_client", return_value=fake_client),
            patch.object(local_api, "_validated_public_remote_url", new=AsyncMock(return_value=target)),
        ):
            response = self.client.get(
                "/api/proxy",
                params={"url": target, "referer": "https://cdn.example/"},
                headers={**self.auth, "Range": "bytes=0-3"},
            )

        self.assertEqual(response.status_code, 206, response.text)
        self.assertEqual(response.content, b"test")
        self.assertEqual(response.headers.get("content-range"), "bytes 0-3/100")
        self.assertEqual(response.headers.get("accept-ranges"), "bytes")
        request_headers = fake_client.build_request.call_args.kwargs["headers"]
        self.assertEqual(request_headers["Range"], "bytes=0-3")
        fake_client.send.assert_awaited_once()

    def test_public_media_validator_rejects_private_dns_answers(self) -> None:
        async def exercise() -> None:
            fake_loop = Mock()
            fake_loop.getaddrinfo = AsyncMock(
                return_value=[
                    (2, 1, 6, "", ("10.0.0.8", 443)),
                    (2, 1, 6, "", ("93.184.216.34", 443)),
                ]
            )
            with patch.object(local_api.asyncio, "get_running_loop", return_value=fake_loop):
                with self.assertRaisesRegex(ValueError, "private or reserved"):
                    await local_api._validated_public_remote_url("https://cdn.example/video.m3u8")
            fake_loop.getaddrinfo.assert_awaited_once_with(
                "cdn.example",
                443,
                type=local_api.socket.SOCK_STREAM,
            )

        asyncio.run(exercise())

    def test_media_proxy_validates_redirect_targets_before_following(self) -> None:
        class RedirectResponse:
            is_success = False
            status_code = 302
            headers = {"location": "http://127.0.0.1/private"}
            encoding = "utf-8"

            async def aclose(self):
                return None

        fake_response = RedirectResponse()
        fake_response.aclose = AsyncMock()
        fake_client = AsyncMock()
        fake_client.build_request = Mock(return_value=object())
        fake_client.send = AsyncMock(return_value=fake_response)

        async def validate_target(value: str) -> str:
            if "127.0.0.1" in value:
                raise ValueError("Local network targets are not allowed")
            return value

        async def exercise() -> None:
            with (
                patch.object(local_api, "_get_media_http_client", return_value=fake_client),
                patch.object(local_api, "_validated_public_remote_url", new=AsyncMock(side_effect=validate_target)),
            ):
                response = self.client.get(
                    "/api/proxy",
                    params={"url": "https://cdn.example/redirect.m3u8"},
                    headers=self.auth,
                )

            self.assertEqual(response.status_code, 400, response.text)
            self.assertIn("Local network targets", response.json()["detail"])
            fake_client.send.assert_awaited_once()
            fake_response.aclose.assert_awaited_once()

        asyncio.run(exercise())

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


    def test_anixo_and_megavid_build_documented_embed_routes_without_network(self) -> None:
        context = {
            "media": {"id": 21, "episodes": 12, "title": {"english": "Test Series"}},
            "anizip": None,
        }

        async def exercise() -> None:
            anixo_result = await anixo.watch(21, "sub", 3, context)
            megavid_result = await megavid.watch(21, "dub", 7, context)

            self.assertEqual(anixo_result[0]["type"], "embed")
            self.assertEqual(
                anixo_result[0]["url"],
                "https://anixo.buzz/embed/ani/21/3?track=sub",
            )
            self.assertEqual(anixo_result[0]["upstream"], "anixo")
            self.assertEqual(
                megavid_result[0]["url"],
                "https://megavid.buzz/ani/21/7/dub",
            )
            self.assertEqual(megavid_result[0]["type"], "embed")
            self.assertEqual(megavid_result[0]["upstream"], "megavid")

            anixo_episodes = await anixo.get_episodes(21, context)
            megavid_episodes = await megavid.get_episodes(21, context)
            self.assertEqual(len(anixo_episodes["episodes"]["sub"]), 12)
            self.assertEqual(len(anixo_episodes["episodes"]["dub"]), 12)
            self.assertEqual(len(megavid_episodes["episodes"]["sub"]), 12)
            self.assertEqual(anixo_episodes["episodes"]["sub"][2]["id"], "watch/anixo/21/sub/anixo-3")

        asyncio.run(exercise())

    def test_animeparadise_maps_documented_search_and_episode_payloads(self) -> None:
        payloads = [
            {"data": [{
                "_id": "ap-series-9",
                "title": "Título japonés",
                "alternativeTitle": {"english": "Test Series"},
            }]},
            {"data": [
                {"uid": "ap-uid-1", "number": 1, "title": "Episode 1"},
                {"uid": "ap-special", "number": 1.5, "title": "Special"},
                {"uid": "ap-uid-2", "number": 2, "title": "Episode 2"},
            ]},
        ]

        async def exercise() -> None:
            with patch.object(
                animeparadise, "_get_json", new=AsyncMock(side_effect=payloads)
            ) as get_json:
                results = await animeparadise.search("Test Series")
                episodes = await animeparadise.episode_catalogue("ap-series-9")

            self.assertEqual(results, [{"slug": "ap-series-9", "text": "Test Series"}])
            self.assertEqual([item["number"] for item in episodes], [1, 2])
            self.assertEqual(episodes[0]["uid"], "ap-uid-1")
            self.assertEqual(get_json.await_args_list[0].args, ("/search", {"q": "Test Series", "limit": 20}))
            self.assertEqual(get_json.await_args_list[1].args, ("/anime/ap-series-9/episode",))

        asyncio.run(exercise())

    def test_animeparadise_resolves_signed_hls_and_subtitles_without_network(self) -> None:
        context = {
            "media": {"id": 21, "episodes": 12, "title": {"english": "Test Series"}},
            "anizip": None,
        }
        series = {
            "mediaId": "ap-series-9",
            "title": "Test Series",
            "mode": "direct",
            "offset": 0,
            "score": 1.0,
        }
        catalogue = [
            {"number": 1, "title": "Episode 1", "uid": "ap-uid-1", "mediaId": "ap-series-9"},
            {"number": 2, "title": "Episode 2", "uid": "ap-uid-2", "mediaId": "ap-series-9"},
        ]

        async def exercise() -> None:
            with (
                patch.object(animeparadise, "resolve_series", new=AsyncMock(return_value=series)),
                patch.object(animeparadise, "episode_catalogue", new=AsyncMock(return_value=catalogue)),
                patch.object(animeparadise, "_get_json", new=AsyncMock(return_value={
                    "data": {"episode": {
                        "streamLink": "signed token+/",
                        "subData": [{"url": "https://subs.example/ep2.vtt", "label": "English"}],
                    }}
                })) as get_json,
            ):
                sources = await animeparadise.watch(21, "sub", 2, context)

            self.assertEqual(len(sources), 1)
            self.assertEqual(sources[0]["type"], "hls")
            self.assertEqual(sources[0]["server"], "AnimeParadise")
            self.assertIn("/m3u8?url=", sources[0]["url"])
            self.assertIn("signed+token%2B%2F", sources[0]["url"])
            self.assertEqual(sources[0]["referer"], "https://animeparadise.moe/")
            self.assertEqual(sources[0]["subtitles"][0]["url"], "https://subs.example/ep2.vtt")
            get_json.assert_awaited_once_with("/ep/ap-uid-2", {"origin": "ap-series-9"})

            with (
                patch.object(animeparadise, "resolve_series", new=AsyncMock(return_value=series)),
                patch.object(animeparadise, "episode_catalogue", new=AsyncMock(return_value=catalogue)),
            ):
                episodes = await animeparadise.get_episodes(21, context)
            self.assertEqual(len(episodes["episodes"]["sub"]), 2)
            self.assertEqual(episodes["episodes"]["sub"][1]["id"], "watch/animeparadise/21/sub/animeparadise-2")
            self.assertEqual(episodes["episodes"]["dub"], [])

        asyncio.run(exercise())

    def test_yomi_server_adapters_construct_documented_embed_routes_without_network(self) -> None:
        context = {
            "media": {"id": 21, "episodes": 12, "title": {"english": "Test Series"}},
            "anizip": None,
        }

        async def exercise() -> None:
            cases = [
                (megaflix, "dub", 2, "https://www.megaflix.buzz/stream/ani/21/2/dub?color=%23ff3b72&autoplay=true", "MegaFlix"),
                (tryembed, "sub", 3, "https://tryembed.us.cc/embed/anime/21/3/sub", "TryEmbed"),
                (cinexstream, "dub", 4, "https://cinextream.cc/api/embed/anime/dub/21/4?color=7c6ee0", "CinexStream"),
                (nontongo, "sub", 5, "https://nontongo.win/anime/21/5/play", "NontonGo"),
            ]
            for module, audio, episode, expected_url, label in cases:
                sources = await module.watch(21, audio, episode, context)
                self.assertEqual(len(sources), 1, label)
                self.assertEqual(sources[0]["url"], expected_url, label)
                self.assertEqual(sources[0]["type"], "embed", label)
                self.assertEqual(sources[0]["server"], label)
                self.assertEqual(sources[0]["upstream"], module.NAME)
                self.assertEqual(sources[0]["referer"], module.BASE + "/")
                episodes = await module.get_episodes(21, context)
                self.assertEqual(episodes["episodes"]["sub"][episode - 1]["number"], episode)
                self.assertEqual(episodes["episodes"]["sub"][episode - 1]["id"], f"watch/{module.NAME}/21/sub/{module.NAME}-{episode}")

            nontongo_episodes = await nontongo.get_episodes(21, context)
            self.assertEqual(nontongo_episodes["episodes"]["dub"], [])
            with self.assertRaisesRegex(RuntimeError, "does not support dub"):
                await nontongo.watch(21, "dub", 1, context)

        asyncio.run(exercise())

    def test_manual_tryembed_route_skips_slow_metadata_context(self) -> None:
        async def exercise() -> None:
            with (
                patch.object(local_api.provider_race, "providers", return_value=[("tryembed", tryembed)]),
                patch.object(
                    local_api, "_get_local_provider_context",
                    new=AsyncMock(side_effect=AssertionError("manual embeds must not wait on metadata")),
                ) as context_lookup,
                patch.object(local_api.provider_race, "record_latency"),
            ):
                response = self.client.get(
                    "/watch/tryembed/21/sub/tryembed-43",
                    headers=self.auth,
                )

            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            self.assertEqual(payload["providerStatus"], "ok")
            self.assertEqual(payload["streams"][0]["url"], "https://tryembed.us.cc/embed/anime/21/43/sub")
            context_lookup.assert_not_awaited()

        asyncio.run(exercise())

    def test_auto_race_does_not_call_parked_or_manual_embed_providers(self) -> None:
        attempted = []

        async def fake_watch_one(mod, name, anilist_id, episode, audio, ctx):
            attempted.append(name)
            return name, [{"url": f"https://cdn.example/{name}.m3u8", "type": "hls"}], 0.1, True

        async def exercise() -> None:
            with (
                patch.object(local_api.provider_race, "providers", return_value=[
                    ("anineko", object()), ("anixo", anixo), ("megavid", megavid),
                    ("animeparadise", animeparadise),
                    ("megaflix", megaflix), ("tryembed", tryembed),
                    ("cinexstream", cinexstream), ("nontongo", nontongo),
                ]),
                patch.object(local_api.provider_race, "build_ctx", new=AsyncMock(return_value={
                    "media": {"id": 21, "title": {"english": "Test"}}, "anizip": None,
                })),
                patch.object(local_api, "_watch_one_for_player", new=AsyncMock(side_effect=fake_watch_one)),
                patch.object(local_api.provider_race, "record_latency"),
            ):
                result = await local_api._race_watch_for_player(21, 1, "sub")

            self.assertIsNone(result)
            self.assertEqual(attempted, [])

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
