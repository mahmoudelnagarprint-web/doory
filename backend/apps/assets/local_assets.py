"""`/local-assets/` — premium stickers kept in a folder on the server.

The editor's asset library has an "My assets" tab that shows the SVG/PNG files an admin drops into
`LOCAL_ASSETS_DIR` (by default `frontend/public/assets/premium_stickers`). The folder is scanned
recursively and the files are returned with the URL the web server already serves them at, so no
Django media storage is involved and a deployment can ship the files with the frontend build.

Doory has no Express service: this view is the Django equivalent of the small scan endpoint such a
project would mount at `/api/local-assets`. `tools/local-assets-server` carries that endpoint as a
standalone Node script for projects that do not run Django.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from urllib.parse import quote

from django.conf import settings
from django.core.cache import cache
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

#: Extensions the library can place on the canvas, mapped to the kind the editor uses.
SUFFIXES = {
    ".svg": "svg",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
    ".gif": "image",
}
#: Folders that never hold design assets; skipped so a stray `node_modules` cannot stall the scan.
SKIPPED_DIRS = {"__pycache__", "node_modules", ".git"}
CACHE_SECONDS = 15
NAME_SPLIT = re.compile(r"[-_\s]+")


class LocalAssetQuerySerializer(serializers.Serializer):
    q = serializers.CharField(max_length=100, required=False, allow_blank=True)
    type = serializers.ChoiceField(choices=("svg", "image"), required=False)


class LocalAssetSerializer(serializers.Serializer):
    name = serializers.CharField()
    path = serializers.CharField()
    url = serializers.CharField()
    type = serializers.ChoiceField(choices=("svg", "image"))
    size = serializers.IntegerField()


class LocalAssetsResponseSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    url = serializers.CharField()
    count = serializers.IntegerField()
    total = serializers.IntegerField()
    truncated = serializers.BooleanField()
    assets = LocalAssetSerializer(many=True)
    detail = serializers.CharField(required=False)


def _root() -> Path | None:
    raw = str(getattr(settings, "LOCAL_ASSETS_DIR", "") or "").strip()
    return Path(raw) if raw else None


def _url_prefix() -> str:
    """The public prefix the web server serves the folder at, with one trailing slash."""
    raw = str(getattr(settings, "LOCAL_ASSETS_URL", "/assets/premium_stickers/") or "").strip()
    if not raw.startswith(("http://", "https://", "/")):
        raw = f"/{raw}"
    return f"{raw.rstrip('/')}/"


def _label(stem: str) -> str:
    words = [word for word in NAME_SPLIT.split(stem.strip()) if word]
    return " ".join(word[:1].upper() + word[1:] for word in words) or stem


def _inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except (OSError, ValueError):
        return False
    return True


def scan_folder(root: Path, url_prefix: str, max_files: int) -> tuple[list[dict], bool]:
    """Files under `root`, sorted by folder then name. Symlinks and hidden folders are left out.

    `max_files` bounds the work a request can cause; the second value says whether the folder had
    more files than that.
    """
    found: list[dict] = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and d not in SKIPPED_DIRS)
        for filename in sorted(filenames):
            if filename.startswith("."):
                continue
            path = Path(dirpath) / filename
            try:
                if not path.is_file() or path.is_symlink():
                    continue
                kind = SUFFIXES.get(path.suffix.lower())
                if kind is None or not _inside(path, root):
                    continue
                relative = path.relative_to(root).as_posix()
                size = path.stat().st_size
            except OSError:
                continue
            if len(found) >= max_files:
                return found, True
            found.append(
                {
                    "name": _label(path.stem),
                    "path": relative,
                    "url": f"{url_prefix}{quote(relative, safe='/')}",
                    "type": kind,
                    "size": size,
                }
            )
    return found, False


def _listing(root: Path, url_prefix: str, max_files: int) -> tuple[list[dict], bool]:
    """The scan, cached briefly: opening the tab twice should not walk the folder twice."""
    key = f"assets:local-assets:{root}:{url_prefix}:{max_files}"
    cached = cache.get(key)
    if cached is None:
        cached = scan_folder(root, url_prefix, max_files)
        cache.set(key, cached, CACHE_SECONDS)
    return cached


class LocalAssetsView(APIView):
    """List the premium stickers of this deployment (public: they are static, non-user files)."""

    permission_classes = [AllowAny]
    authentication_classes: list[type] = []

    @extend_schema(
        parameters=[
            OpenApiParameter("q", str, required=False, description="Filter by name or path."),
            OpenApiParameter("type", str, required=False, enum=["svg", "image"], description="File kind."),
        ],
        responses={200: LocalAssetsResponseSerializer},
        description="The premium stickers under LOCAL_ASSETS_DIR, for the editor's asset library.",
    )
    def get(self, request):
        params = LocalAssetQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        url_prefix = _url_prefix()
        payload = {
            "enabled": False,
            "url": url_prefix,
            "count": 0,
            "total": 0,
            "truncated": False,
            "assets": [],
        }
        root = _root()
        if root is None or not root.is_dir():
            payload["detail"] = "The local asset folder does not exist on this server."
            return Response(payload)

        assets, truncated = _listing(root, url_prefix, max(1, int(settings.LOCAL_ASSETS_MAX_FILES)))
        total = len(assets)
        query = (params.validated_data.get("q") or "").strip().casefold()
        kind = params.validated_data.get("type")
        if query:
            assets = [a for a in assets if query in a["name"].casefold() or query in a["path"].casefold()]
        if kind:
            assets = [a for a in assets if a["type"] == kind]
        payload.update(enabled=True, count=len(assets), total=total, truncated=truncated, assets=assets)
        return Response(payload)
