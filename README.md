# Fortnite Shop Value

A Node.js app that totals the current Fortnite item shop with item-type toggles.
It runs without dependencies, an API key, or a database.

## Run

Requires Node.js 24 or later.

```sh
npm ci
npm start
```

Open http://127.0.0.1:3000. For a desktop launch, use `npm run start:desktop`.
Run `npm test` to check bundle coverage and category selection.

## Hosting

The production entry point is `server.js`. Start with `npm start`.
Set `NODE_ENV=production`; the server listens on `0.0.0.0` in production.
`PORT` defaults to `3000`, matching the previous demo, and can be set to the port used by the hosting service
or existing reverse proxy. `HOST` can override the bind address.
There is no build step. `/api/health` is the health endpoint.

## Price history

The graph and UTC date picker use precomputed daily totals imported from
itemshop.gg's archive, starting on 26 October 2017. The graph switches between
bundle-adjusted totals (the same counting rules as today's shop) and the sum of
all listed prices. Unknown historical prices create gaps in both views;
missing bundle contents create gaps only in the adjusted view. Values are not
guessed. Historical totals always represent the full shop; today's type
toggles affect the live lineup only.

To rebuild the initial archive, set `ITEMSHOP_API_KEY` privately in the importer
environment and run `npm run import:history`. The importer also accepts the key
on stdin for a noninteractive caller. It caches source snapshots under
`~/.fortnite-shop-value/source-archive` and writes `data/history-seed.json`.
The key is not stored in either output. Commit the seed with the application;
the deployed server does not need an itemshop.gg key.
Recalculate already downloaded history with
`npm run import:history -- --cached`, which needs no key and makes no network requests.

On Hostinger the server imports that seed into
`<domain-root>/.fortnite-shop-value/history.sqlite`, outside public_html and
deployment releases. Elsewhere it uses `~/.fortnite-shop-value/history.sqlite`.
Set `HISTORY_DIR` to a persistent private directory
if the host uses another durable location. SQLite contains the historical
totals and compressed snapshots for the app's own captures.

Today's point is provisional. A server timer fetches a new day's shop after
reset and freezes its first successful capture at or after 23:00 UTC. Failed
captures retry each minute. Future daily captures use the existing live feed.
Scheduled hosting requests to `/api/shop` at 23:00 UTC and shortly after reset
can wake the application independently of visitor traffic.

`/api/history` returns the compact timeline with gzip, ETags and browser caching.
Clicks and date selection use that one loaded timeline without upstream calls.
`/api/history/YYYY-MM-DD` exports a stored day's metadata and, for our own
captures, the underlying normalized shop snapshot. Keep the visible
"Data from itemshop.gg" attribution when using its historical data.

The intended public domain is https://justasite.xyz/.
This app replaces the repository's previous fetch/write demo; it no longer
uses its database, counters, or demo API routes. Other existing source assets
are retained in the repository, but the app serves only its own public files.

## Calculation

- Item types match every cosmetic included in an offer. Bundles therefore
  appear under their contents' categories, including Cars. A matching category
  includes the full offer price once, even when several categories match.
- Offers fully contained in a selected bundle are grayed out and excluded
  from the total. Smaller bundles covered by larger bundles are also excluded.
- Identical-content bundles retain the cheaper offer with a stable tie-break.
- Partially overlapping bundles with unique contents still count in full.
- Car component listings are grayed out; their purchase bundles count instead.
- Search changes the list only. Category choices are saved in the browser.
- Ownership discounts and cash-only packs are not included.

Data comes from [Fortnite-API](https://fortnite-api.com/v2/shop?language=en).
The server caches results for up to one minute. The page refreshes automatically
and warns if the provider's rotation is out of date or a refresh fails.

This is an independent fan tool, not affiliated with Epic Games.
