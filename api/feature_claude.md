# api — Vercel serverless proxies for third-party dynasty data

## Overview
Three Vercel serverless functions that proxy upstream APIs to keep secrets server-side, enforce endpoint allowlists (preventing open-proxy abuse), and set edge cache headers. Every handler uses the default Node runtime export signature `(req, res)`. All three take a `path` query parameter that selects the upstream route from a hard-coded whitelist; any remaining query params are forwarded to the upstream verbatim. Only GET is used in practice — methods are not checked, but upstreams reject non-GET.

The client-side wrappers live at `src/lib/cfbdApi.js`, `src/lib/fleaflickerApi.js`, and `src/lib/rosterAuditApi.js` respectively, and they call these endpoints at `/api/<name>?path=<endpoint>&...`.

## Files

### cfbd.js — CollegeFootballData.com proxy
Proxies `https://api.collegefootballdata.com/<path>` with a Bearer token read from `process.env.VITE_CFBD_API_KEY` (the `VITE_` prefix is historical — it is server-only despite the name).

- Allowlist: `player/usage`, `stats/player/season`. Anything else returns 403 `{ error: "Endpoint not allowed" }`.
- Missing key: 500 `{ error: "CFBD key not configured on server" }`.
- Query params: all keys other than `path` are URL-encoded and appended. Callers typically pass `year` and `position`.
- Adaptive caching based on `year`: if `year < currentYear` (historical), `s-maxage=2592000` (30 days) with `stale-while-revalidate=5184000` (60 days). Current/future season uses `s-maxage=86400` (1 day) with `swr=172800` (2 days). This dramatically reduces CFBD quota burn for past-season lookups.
- Response: upstream body is returned as-is via `res.send(text)` with `Content-Type: application/json` and the upstream status. Errors during fetch return 502.
- CORS: none set — relies on same-origin via Vercel.

### fleaflicker.js — Fleaflicker API proxy
Proxies `https://www.fleaflicker.com/api/<path>`. No auth required upstream; the endpoint is public but CORS-blocked from the browser, hence the proxy.

- Allowlist: `FetchUserLeagues`, `FetchLeagueRosters`, `FetchRoster`, `FetchLeagueRules`, `FetchLeagueStandings`, `FetchTeamPicks`, `FetchTrades`, `FetchLeagueTransactions`.
- Injects `sport=NFL` into the querystring automatically (can be overridden by caller but typically isn't).
- Query params: all non-`path` keys are forwarded. Common ones are `email`, `league_id`, `team_id`, `season`, `result_offset`.
- Response: parsed as JSON and re-emitted via `res.status(upstream.status).json(data)`. Fetch failure returns 502 `{ error: "Upstream request failed" }`.
- Caching: `s-maxage=60, stale-while-revalidate=300`. Short TTL because roster/transaction data changes frequently.
- Env vars: none.
- CORS: none set.

### rosteraudit.js — RosterAudit WordPress REST proxy
Proxies `https://rosteraudit.com/wp-json/ra/v1/<path>` for dynasty market rankings and pick values.

- Allowlist: `rankings`, `picks`.
- Query params: forwarded as-is. `rankings` typically takes `format` (sf/1qb) and/or `scoring`; `picks` takes `format` and `season`.
- Response: JSON passthrough. The `rankings` endpoint returns a big player array consumed by `RankingsTab`; `picks` returns a pick-value map keyed `season-round-slot` consumed by `RosterTab`/`PicksTab`.
- Caching: `s-maxage=3600, stale-while-revalidate=7200` (1h / 2h) — rankings update at most daily.
- Env vars: none.
- Errors: 400 `{ error: "Missing path parameter" }` when `path` is absent; 403 when off-allowlist; 502 on upstream fetch failure.
- CORS: none set.

## Security notes
- All three endpoints enforce a hard allowlist so attackers cannot pivot them into open proxies.
- Only `cfbd.js` handles a secret. `VITE_CFBD_API_KEY` must be set in Vercel project env; local dev reads from `.env.local`.
- None of the handlers validate HTTP method — a mutating verb would still be forwarded. Upstreams all reject non-GET.

## See also
- `../src/lib/feature_claude.md` — client wrappers (`cfbdApi.js`, `fleaflickerApi.js`, `rosterAuditApi.js`) and how responses are folded into the `analysis` object.
- `../src/components/feature_claude.md` — top-level screens that trigger the fetch chain.
