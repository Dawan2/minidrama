# 12 — API contract parity (D-07 / D-11)

> **Slot:** W14, C4-01. Measured against `contracts/openapi.yaml` on this branch.
> **This is a gap list.** It does not schedule closing the design-only rows, and it does not
> invent a handler so a row can flip to `live`.

`docs/12-api-contracts.md` is the Wave 1 design surface. `contracts/openapi.yaml` is the live
HTTP surface: a path in that file always has a running handler (`server/src/contract.test.ts`).
The two have never been the same document. C4-01 measures the distance and fixes the only
self-contradiction inside doc 12 (D-07: unlock path parameter names).

Status:

| Status | Meaning |
|---|---|
| `live` | Doc 12 path plus `/v1` is the live OpenAPI path |
| `live-mapped` | Doc 12 names a design path; the live operation that occupies that job is in the OpenAPI column |
| `design-only` | Declared in doc 12, absent from OpenAPI. Not scheduled here |
| `live-only` | Served today, not declared in doc 12 |

D-07: doc 12 §2.4 and §4.5 both use `{episodeId}` / `{dramaId}`. They no longer also use `{id}`.
The live unlock write is still `POST /v1/unlock/coin-orders`, not `POST /v1/episodes/{episodeId}/unlock`.
That gap stays a row. It is not closed by adding WeChat, Beans, or a second unlock route.

| Doc 12 | Live OpenAPI | Status | Notes |
|---|---|---|---|
| — | `GET /health` | live-only | Ops probe. Not a client contract |
| `POST /auth/login` | `POST /v1/auth/login` | live | Silent login / test-login. Not SMS |
| `POST /auth/sms-codes` | — | design-only | |
| `POST /auth/refresh` | — | design-only | |
| `POST /auth/logout` | — | design-only | |
| `GET /users/me` | — | design-only | |
| `PATCH /users/me` | — | design-only | |
| `POST /users/me/bind-phone` | — | design-only | |
| `GET /dramas` | `GET /v1/dramas` | live | |
| `GET /dramas/{dramaId}` | `GET /v1/dramas/{dramaId}` | live | |
| `GET /dramas/{dramaId}/episodes` | `GET /v1/dramas/{dramaId}/episodes` | live | |
| `GET /episodes/{episodeId}` | `GET /v1/episodes/{episodeId}` | live | |
| `PUT /dramas/{dramaId}/favorite` | `PUT /v1/dramas/{dramaId}/favorite` | live | |
| `DELETE /dramas/{dramaId}/favorite` | `DELETE /v1/dramas/{dramaId}/favorite` | live | |
| — | `GET /v1/dramas/{dramaId}/favorite` | live-only | Probe. Doc 12 only named put/delete |
| `GET /users/me/favorites` | `GET /v1/users/me/favorites` | live | |
| `POST /episodes/{episodeId}/playback-token` | `POST /v1/playback/sessions` | live-mapped | Live returns a playback descriptor, not a media URL |
| — | `POST /v1/entitlement/episode-access` | live-only | Doc 12 describes `viewerAccess` on reads, not this POST |
| `POST /episodes/{episodeId}/unlock` | `POST /v1/unlock/coin-orders` | live-mapped | Same job, different path. Parameter name is `{episodeId}` in doc 12 |
| `POST /dramas/{dramaId}/unlock` | — | design-only | Whole-drama unlock is not served |
| `GET /dramas/{dramaId}/unlock-quote` | — | design-only | |
| `GET /users/me/unlocks` | — | design-only | |
| — | `GET /v1/unlock/coin-orders/{orderId}` | live-only | Order poll. Not in doc 12 |
| `GET /wallet` | `GET /v1/wallet` | live | |
| `GET /wallet/transactions` | — | design-only | Unmerged remainder branch is not this measurement |
| `GET /wallet/products` | — | design-only | Recharge catalog. Q-G-7 still unknown; do not invent |
| `POST /wallet/recharge-orders` | — | design-only | Doc 12 still names `WECHAT`. Live OpenAPI does not serve it |
| `GET /wallet/recharge-orders/{orderId}` | — | design-only | |
| `POST /payments/callbacks/{channel}` | `POST /v1/payments/callbacks/tiktok` | live-mapped | Live channel is `tiktok`, not a `{channel}` template |
| `PUT /progress/episodes/{episodeId}` | `PUT /v1/progress/episodes/{episodeId}` | live | |
| — | `GET /v1/progress/episodes/{episodeId}` | live-only | |
| `GET /progress/dramas/{dramaId}` | `GET /v1/progress/dramas/{dramaId}` | live | |
| `GET /users/me/watch-history` | `GET /v1/users/me/watch-history` | live | |
| `DELETE /users/me/watch-history/{dramaId}` | — | design-only | |
| `GET /recommendations/feed` | `GET /v1/recommendations/feed` | live | |
| — | `GET /v1/search` | live-only | Search is unnumbered in the screen inventory |
| `POST /events/batch` | — | design-only | |
| `GET /episodes/{episodeId}/comments` | — | design-only | PNL-04 is not opened in C4 |
| `GET /comments/{commentId}/replies` | — | design-only | |
| `POST /episodes/{episodeId}/comments` | — | design-only | |
| `DELETE /comments/{commentId}` | — | design-only | |
| `PUT /comments/{commentId}/like` | — | design-only | |
| `DELETE /comments/{commentId}/like` | — | design-only | |
| `GET /config` | — | design-only | SCR-01 splash. Not invented as an OpenAPI path here |
