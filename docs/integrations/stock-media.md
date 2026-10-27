# Stock media

## What it does

Lets people search free stock photos from the editor's Photos panel and the page background, and free stock
videos from the Videos tool ([below](#videos)). Each provider with a
key appears as its own tab, and an "All" tab searches several providers at once. Searches go through the API, so
your keys never reach the browser, and results are cached.

## Requirements

A free API key from each provider you want to offer. The providers currently supported, by name in
`STOCK_PROVIDERS`, are `unsplash` and `pixabay`. Each has its own key setting, listed in
[configuration.md](../self-hosting/configuration.md#stock-media).

## Turn it on

Set the key of each provider you want and restart the services. A provider without a key doesn't appear.

```ini
UNSPLASH_ACCESS_KEY=...
```

Optionally choose the order of the tabs, what the "All" tab searches, and which tab opens first:

```ini
STOCK_PROVIDERS=unsplash,pixabay
STOCK_ALL_PROVIDERS=unsplash,pixabay
STOCK_DEFAULT_TAB=all
```

## Rate limits and caching

Every provider limits calls per key. Doory can count calls against a limit you set, shared by all users:

```ini
STOCK_UNSPLASH_RATE=5000/h
```

Without a limit, Doory pauses a provider only when it answers `429` or reports that its quota is used up. Use the
limit published in your provider account. Search results are cached for `STOCK_<PROVIDER>_CACHE_SECONDS`.

Limits and caching only work across workers when they share a cache. Docker and the manual guide use the database
cache (`CACHE_URL=dbcache://doory_cache`); the default `locmem` cache is for development only.

## Settings

See [Stock media in configuration.md](../self-hosting/configuration.md#stock-media).

## Check it works

Open a design, go to **Photos** and search. One tab appears for each provider with a key.

## Troubleshooting

- **A tab is missing:** its key is empty, or the provider isn't in `STOCK_PROVIDERS`.
- **A tab stops returning results:** the provider was paused after `429`. Check the API log, and lower its
  `STOCK_<PROVIDER>_RATE` or raise its cache time.
- **The "All" tab is slow:** lower `STOCK_ALL_TIMEOUT_SECONDS` or search fewer providers (`STOCK_ALL_PROVIDERS`).

## Videos

The **Videos** tool in the editor can search free stock videos from Pixabay. It needs the server to
[take video](../self-hosting/video.md) (ffmpeg). A clip someone picks is downloaded by the server, made
web-ready like an upload, and stored in their uploads with its credit. Clips are never hotlinked.

Video searches use a key of its own, so clip searches don't use up the photo quota. Without it, the video
provider uses its photo key:

```ini
PIXABAY_VIDEO_API_KEY=...
```

The video provider is `pixabay_video`. Choose it and its order with `STOCK_VIDEO_PROVIDERS`, and set its
limits like any other provider's: `STOCK_PIXABAY_VIDEO_CACHE_SECONDS=86400` (Pixabay asks for 24 hours; the
default).

The editor plays a short preview of a clip when the pointer rests on it, straight from the provider's video CDN.
The site's Content-Security-Policy (`frontend/nginx/security-headers.conf`) allows `cdn.pixabay.com` in
`media-src` for that.

Pixabay's licence allows commercial use and editing without credit, but not selling or redistributing
the clips as they are. Pixabay asks apps to credit it, so the Videos tool shows its name.

## Sounds (Freesound)

The Audio tool can have a Freesound tab next to the built-in library: music, sound effects and ambience,
searched through the API and copied into the user's uploads when added. It appears once a key is set.

```ini
FREESOUND_API_KEY=...
```

- Only CC0 sounds are offered by default. `FREESOUND_LICENSES=cc0,by` also allows CC BY: the editor then shows
  the credit lines to publish with a design, and `get_design_credits` gives them over MCP. Licences that
  restrict use (NC, Sampling+, SA, ND) are never offered.
- Previews are relayed by the server, so the browser never talks to Freesound.
- Freesound allows 60 calls a minute and 2,000 a day per key; Doory's default `STOCK_FREESOUND_RATE` is `60/m`.
- Freesound's API terms cover non-commercial use. A commercial service needs an agreement with Freesound first.

The settings are in [configuration.md](../self-hosting/configuration.md#stock-media).

## Adding a provider

New providers get a section on this page and a row in configuration.md. They don't get a page of their own.
