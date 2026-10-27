"""Stock videos: search, filters, key fallback, the clip CDN allow-list, and importing through ffmpeg."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.assets import providers, video, video_jobs
from apps.assets.models import Asset

from .test_stock import FakeNetwork, FakeResponse
from .test_video_probe import info as described_clip
from .video_helpers import clip, needs_ffmpeg

SEARCH = "/api/v1/stock/videos/"
PROVIDERS = "/api/v1/stock/videos/providers/"
IMPORT = "/api/v1/stock/videos/import/"
PIXABAY = "https://pixabay.com/api/videos/"


@pytest.fixture
def net(monkeypatch):
    network = FakeNetwork()
    monkeypatch.setattr(providers, "http_get", network)
    return network


@pytest.fixture
def keys(settings):
    settings.PIXABAY_VIDEO_API_KEY = "pixabay-video-secret"
    settings.VIDEO_ENABLED = True


@pytest.fixture(autouse=True)
def _ffmpeg_present(monkeypatch):
    monkeypatch.setattr(video, "available", lambda: True)


def pixabay_video(video_id=202, duration=20, large=(3840, 2160)):
    def rendition(name, w, h):
        return {
            "url": f"https://cdn.pixabay.com/video/2026/01/01/{video_id}_{name}.mp4",
            "width": w,
            "height": h,
            "thumbnail": f"https://cdn.pixabay.com/video/2026/01/01/{video_id}-{name}.jpg",
        }

    return {
        "id": video_id,
        "duration": duration,
        "pageURL": f"https://pixabay.com/videos/x-{video_id}/",
        "user": "grace",
        "user_id": 7,
        "videos": {
            "large": rendition("large", *large),
            "medium": rendition("medium", 1920, 1080),
            "small": rendition("small", 1280, 720),
            "tiny": rendition("tiny", 960, 540),
        },
    }


@pytest.mark.django_db
class TestProviders:
    def test_lists_the_provider_with_its_credit(self, api, keys):
        body = api.get(PROVIDERS).json()
        assert body["enabled"] is True and body["default"] == "pixabay_video" and body["all"] == []
        assert [(p["label"], p["attribution"]) for p in body["providers"]] == [
            ("Pixabay", "Videos from Pixabay"),
        ]

    def test_falls_back_to_the_photo_key(self, api, settings):
        settings.PIXABAY_VIDEO_API_KEY = ""
        settings.PIXABAY_API_KEY = "photo-key"
        assert [p["name"] for p in api.get(PROVIDERS).json()["providers"]] == ["pixabay_video"]

    def test_none_without_ffmpeg(self, api, keys, monkeypatch):
        monkeypatch.setattr(video, "available", lambda: False)
        body = api.get(PROVIDERS).json()
        assert body["enabled"] is False and body["providers"] == []

    def test_listing_order_and_switches(self, api, keys, settings):
        settings.STOCK_VIDEO_PROVIDERS = ["pixabay_video"]
        assert [p["name"] for p in api.get(PROVIDERS).json()["providers"]] == ["pixabay_video"]


@pytest.mark.django_db
class TestSearch:
    def test_pixabay_search_keeps_the_key_out_of_the_answer(self, api, keys, net):
        net.add(PIXABAY, FakeResponse(payload={"totalHits": 3, "hits": [pixabay_video()]}))
        res = api.get(SEARCH, {"q": "forest", "provider": "pixabay_video", "per_page": 5})
        (result,) = res.json()["results"]
        assert result["preview_url"].endswith("_tiny.mp4") and result["thumb_url"].endswith("-small.jpg")
        assert (result["width"], result["height"]) == (3840, 2160)
        params = net.calls[0]["params"]
        assert params["key"] == "pixabay-video-secret" and params["video_type"] == "film"
        assert "pixabay-video-secret" not in res.content.decode()

    def test_pixabay_orientation_is_filtered_here(self, api, keys, net):
        payload = {"totalHits": 2, "hits": [pixabay_video(1), pixabay_video(2, large=(2160, 3840))]}
        net.add(PIXABAY, FakeResponse(payload=payload))
        res = api.get(
            SEARCH, {"q": "x", "provider": "pixabay_video", "orientation": "portrait", "per_page": 5}
        )
        assert [r["id"] for r in res.json()["results"]] == ["2"]
        assert "orientation" not in net.calls[0]["params"] and net.calls[0]["params"]["per_page"] == 20

    def test_all_with_one_provider(self, api, keys, net):
        net.add(PIXABAY, FakeResponse(payload={"totalHits": 1, "hits": [pixabay_video()]}))
        body = api.get(SEARCH, {"q": "x", "provider": "all"}).json()
        assert body["provider"] == "all"
        assert [r["provider"] for r in body["results"]] == ["pixabay_video"]

    def test_searches_are_cached(self, api, keys, net):
        net.add(PIXABAY, FakeResponse(payload={"totalHits": 1, "hits": [pixabay_video()]}))
        for _ in range(2):
            api.get(SEARCH, {"q": "sea", "provider": "pixabay_video"})
        assert len(net.calls) == 1

    def test_a_busy_provider_is_a_429(self, api, keys, net):
        net.add(PIXABAY, FakeResponse(status=429, headers={"Retry-After": "30"}))
        res = api.get(SEARCH, {"q": "sea", "provider": "pixabay_video"})
        assert res.status_code == 429


@pytest.mark.django_db
class TestImport:
    def test_unknown_id_shape_is_refused(self, api, keys, net):
        res = api.post(IMPORT, {"provider": "pixabay_video", "id": "../x"}, format="json")
        assert res.status_code == 400 and net.calls == []

    def test_without_ffmpeg(self, api, keys, net, monkeypatch):
        monkeypatch.setattr(video, "available", lambda: False)
        res = api.post(IMPORT, {"provider": "pixabay_video", "id": "202"}, format="json")
        assert res.status_code == 400 and res.json()["error"]["code"] == "video_unavailable"

    def test_a_redirect_off_the_cdn_is_refused(self, api, keys, net):
        net.add(PIXABAY, FakeResponse(payload={"totalHits": 1, "hits": [pixabay_video()]}))
        file_url = "https://cdn.pixabay.com/video/2026/01/01/202_medium.mp4"
        net.add(file_url, FakeResponse(status=302, headers={"Location": "https://evil.example/x.mp4"}))
        res = api.post(IMPORT, {"provider": "pixabay_video", "id": "202"}, format="json")
        assert res.status_code == 502 and not Asset.objects.exists()

    def test_the_size_cap(self, api, keys, net, settings):
        settings.MAX_VIDEO_UPLOAD_BYTES = 10
        net.add(PIXABAY, FakeResponse(payload={"totalHits": 1, "hits": [pixabay_video()]}))
        net.add(
            "https://cdn.pixabay.com/video/2026/01/01/202_medium.mp4",
            FakeResponse(body=b"x" * 100, headers={"Content-Length": "100"}),
        )
        res = api.post(IMPORT, {"provider": "pixabay_video", "id": "202"}, format="json")
        assert res.status_code == 413

    @pytest.fixture
    def converting(self, net, monkeypatch):
        """Pixabay clip 202, which needs converting: ffprobe and the background conversion are faked."""
        net.add(PIXABAY, FakeResponse(payload={"totalHits": 1, "hits": [pixabay_video()]}))
        net.add("https://cdn.pixabay.com/video/2026/01/01/202_medium.mp4", FakeResponse(body=b"clip"))
        monkeypatch.setattr(video, "probe", lambda path: described_clip(codec_name="hevc"))
        monkeypatch.setattr(video_jobs, "submit", lambda *args: None)

    def stock_clip(self, user, **fields):
        meta = {"provider": "pixabay_video", "video_id": "202"}
        return Asset.objects.create(owner=user, kind="video", mime="video/mp4", meta=meta, **fields)

    def test_importing_again_replaces_a_failed_import(self, api, user, keys, converting):
        failed = self.stock_clip(user, status="failed", error="The video could not be converted.")
        res = api.post(IMPORT, {"provider": "pixabay_video", "id": "202"}, format="json")
        assert res.status_code == 202, res.content
        (asset,) = Asset.objects.all()  # the failed one is gone
        assert (str(asset.pk), asset.status) == (res.json()["id"], "processing") and asset.pk != failed.pk

    def test_an_import_whose_conversion_died_is_tried_again(self, api, user, keys, converting):
        dead = self.stock_clip(user, status="processing", size=10)
        Asset.objects.filter(pk=dead.pk).update(updated_at=timezone.now() - timedelta(hours=2))
        res = api.post(IMPORT, {"provider": "pixabay_video", "id": "202"}, format="json")
        assert res.status_code == 202 and res.json()["id"] != str(dead.pk)
        assert not Asset.objects.filter(pk=dead.pk).exists()

    def test_two_imports_at_once_make_one_asset(self, api, user, keys, converting, monkeypatch):
        def first_one_wins(path):  # the other import commits while this one downloads and checks the clip
            self.stock_clip(user, status="processing", size=10)
            return described_clip(codec_name="hevc")

        monkeypatch.setattr(video, "probe", first_one_wins)
        res = api.post(IMPORT, {"provider": "pixabay_video", "id": "202"}, format="json")
        assert res.status_code == 200, res.content
        assert Asset.objects.count() == 1 and res.json()["id"] == str(Asset.objects.get().pk)

    @needs_ffmpeg
    def test_imports_picks_the_1080p_file_and_dedupes(self, api, keys, net):
        net.add(PIXABAY, FakeResponse(payload={"totalHits": 1, "hits": [pixabay_video()]}))
        net.add(
            "https://cdn.pixabay.com/video/2026/01/01/202_medium.mp4",
            FakeResponse(body=clip("h264")),
        )
        res = api.post(IMPORT, {"provider": "pixabay_video", "id": "202"}, format="json")
        assert res.status_code == 201, res.content
        body = res.json()
        assert (body["kind"], body["status"], body["name"]) == ("video", "ready", "Video by grace")
        assert body["attribution"] == {
            "provider": "pixabay_video",
            "author": "grace",
            "author_url": "https://pixabay.com/users/grace-7/",
            "source_url": "https://pixabay.com/videos/x-202/",
        }
        again = api.post(IMPORT, {"provider": "pixabay_video", "id": "202"}, format="json")
        assert again.status_code == 200 and again.json()["id"] == body["id"]

    @needs_ffmpeg
    def test_pixabay_takes_the_largest_rendition_that_fits(self, api, keys, net):
        net.add(PIXABAY, FakeResponse(payload={"totalHits": 1, "hits": [pixabay_video()]}))
        net.add(
            "https://cdn.pixabay.com/video/2026/01/01/202_medium.mp4",
            FakeResponse(body=clip("h264")),
        )
        res = api.post(IMPORT, {"provider": "pixabay_video", "id": "202"}, format="json")
        assert res.status_code == 201, res.content
