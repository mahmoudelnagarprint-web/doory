# Premium stickers

Drop `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp` or `.gif` files in this folder (subfolders are fine).
The editor's **Assets → My assets** tab lists them, and clicking or dragging one places it on the
canvas.

The API scans this folder (`LOCAL_ASSETS_DIR`) and returns `/assets/premium_stickers/<path>` URLs.
Vite serves the folder in development and nginx serves the built copy in production, so nothing is
copied into Django's media storage. The scan is cached for 15 seconds; reopen the tab to refresh.
