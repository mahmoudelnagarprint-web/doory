import pytest
from rest_framework.test import APIClient

URL = "/api/v1/local-assets/"


@pytest.fixture
def folder(tmp_path, settings):
    root = tmp_path / "premium_stickers"
    (root / "badges").mkdir(parents=True)
    (root / "badges" / "star-badge.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg"/>', encoding="utf-8"
    )
    (root / "photo.PNG").write_bytes(b"\x89PNG\r\n\x1a\n")
    (root / "my sticker #1.svg").write_text("<svg/>", encoding="utf-8")
    (root / "notes.txt").write_text("not an asset", encoding="utf-8")
    (root / ".hidden").mkdir()
    (root / ".hidden" / "secret.svg").write_text("<svg/>", encoding="utf-8")
    settings.LOCAL_ASSETS_DIR = str(root)
    settings.LOCAL_ASSETS_URL = "/assets/premium_stickers/"
    settings.LOCAL_ASSETS_MAX_FILES = 500
    return root


def get(path=URL, **params):
    return APIClient().get(path, params)


def by_path(payload):
    return {asset["path"]: asset for asset in payload["assets"]}


@pytest.mark.django_db
def test_lists_supported_files_recursively(folder):
    response = get()

    assert response.status_code == 200
    payload = response.json()
    assert payload["enabled"] is True
    assert payload["count"] == 3
    assert payload["truncated"] is False
    assets = by_path(payload)
    # Text files and hidden folders are left out.
    assert set(assets) == {"badges/star-badge.svg", "photo.PNG", "my sticker #1.svg"}

    star = assets["badges/star-badge.svg"]
    assert star["name"] == "Star Badge"
    assert star["type"] == "svg"
    assert star["url"] == "/assets/premium_stickers/badges/star-badge.svg"
    assert star["size"] > 0

    assert assets["photo.PNG"]["type"] == "image"
    # The URL is escaped so a name with spaces or a hash still loads.
    assert assets["my sticker #1.svg"]["url"] == "/assets/premium_stickers/my%20sticker%20%231.svg"


@pytest.mark.django_db
def test_filters_by_name_path_and_kind(folder):
    assert [a["path"] for a in get(q="star").json()["assets"]] == ["badges/star-badge.svg"]
    assert [a["path"] for a in get(q="badges/").json()["assets"]] == ["badges/star-badge.svg"]
    images = get(type="image").json()
    assert [a["path"] for a in images["assets"]] == ["photo.PNG"]


@pytest.mark.django_db
def test_unknown_kind_is_rejected(folder):
    response = get(type="video")

    assert response.status_code == 400
    assert "type" in response.json()["error"]["fields"]


@pytest.mark.django_db
def test_missing_folder_is_disabled(tmp_path, settings):
    settings.LOCAL_ASSETS_DIR = str(tmp_path / "does-not-exist")

    payload = get().json()

    assert payload["enabled"] is False
    assert payload["assets"] == []
    assert "does not exist" in payload["detail"]


@pytest.mark.django_db
def test_scan_is_capped_and_reports_truncation(folder, settings):
    settings.LOCAL_ASSETS_MAX_FILES = 2

    payload = get().json()

    assert payload["count"] == 2
    assert payload["truncated"] is True


@pytest.mark.django_db
def test_unversioned_alias_answers_the_same_json(folder):
    response = get("/api/local-assets")

    assert response.status_code == 200
    assert response.json()["count"] == 3


@pytest.mark.django_db
def test_prefix_without_leading_slash_is_normalised(folder, settings):
    settings.LOCAL_ASSETS_URL = "assets/stickers"

    urls = [a["url"] for a in get().json()["assets"]]

    assert urls and all(url.startswith("/assets/stickers/") for url in urls)


def test_symlinked_files_are_skipped(tmp_path, settings):
    root = tmp_path / "premium_stickers"
    root.mkdir()
    target = tmp_path / "outside.svg"
    target.write_text("<svg/>", encoding="utf-8")
    link = root / "link.svg"
    try:
        link.symlink_to(target)
    except (OSError, NotImplementedError):
        pytest.skip("this platform cannot create symlinks")
    settings.LOCAL_ASSETS_DIR = str(root)
    settings.LOCAL_ASSETS_URL = "/assets/premium_stickers/"

    payload = get().json()

    assert payload["assets"] == []


@pytest.mark.django_db
def test_empty_query_returns_everything(folder):
    assert get(q="").json()["count"] == 3
