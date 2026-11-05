# Fortnite Shop Value

A Node.js app that totals the current Fortnite item shop with item-type toggles.
It runs without dependencies, an API key, or a database.

## Run

Requires Node.js 22 or later.

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
