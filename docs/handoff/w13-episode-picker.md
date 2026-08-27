# W13 — C3-04 remainder: PNL-01 episode picker

> **Slot:** W13, work slot (`bc-1a2c6242`). One backlog item, no pull request.
> **Branch:** `cursor/w13-work-episode-picker-72c4`, cut from `origin/main` at `18fa6d4`.
> **Item:** `PNL-01` — the episode picker overlay, against `GET /v1/dramas/{dramaId}/episodes`.
> **Not in scope:** SCR-10/PNL-03 recharge (still blocked on a Beans rate), SCR-11 VIP (no
> subscription contract), `GET /progress/dramas/{dramaId}` (not in `contracts/openapi.yaml`),
> replacing the player's demo album, in-flight GET `/v1/wallet` server (`bc-5678f211`, now on
> `main`) or observability (`bc-dd5c69d1`, now on `main`). No pull request.

---

## 1. What was picked, and why

The wallet handoff (`docs/handoff/w13-wallet.md`) left PNL-01, SCR-10 and SCR-11 open, and named
PNL-01 as the unblocked remainder of `C3-04`. On `origin/main` at `18fa6d4` that was still true:
DramaPage listed episodes inline, PlayPage had a demo album of six, and nothing named PNL-01.

SCR-10 is still blocked on `C3-09` (no Beans rate) and `pay()`. SCR-11 is still blocked on a
subscription contract. PNL-01 is not: `GET /v1/dramas/{dramaId}/episodes` is on `main` and is
already paged by DramaPage. The player route carries an episode id; `GET /v1/episodes/{episodeId}`
is the lookup `docs/02-information-architecture.md` §5 already describes, and it is also on `main`.

In flight at start: GET `/v1/wallet` server, observability. This slot did not touch OpenAPI, server
wallet files, or logging files. Both had landed on `main` by the time this branch merged; there
was no overlap.

---

## 2. What changed

### 2.1 The lookup

`CatalogApi.fetchEpisode` calls `GET /v1/episodes/{episodeId}` and reuses the same `viewerAccess`
narrower as the list. A missing `viewerAccess` is still a malformed item, not a default. The
picker opens from the player and only then looks the route episode up, so the demo album does not
become a catalogue request on every player render.

The list is `GET /v1/dramas/{dramaId}/episodes` with `limit: 100` (the server's maximum). Remaining
pages are walked so an 80-episode drama is one grid. There is no fixture album in the panel.

### 2.2 The panel

| Surface | What it does |
| --- | --- |
| `#/play/:episodeId` → Episodes | Opens PNL-01. Not a route. |
| Loading | Skeleton, in-panel, while the lookup or the first page is in flight. |
| Content | Numbered grid. Groups of 30 when the loaded list is longer than one group. Current cell highlighted. |
| Retryable error | In-panel retry. A failed further page leaves the loaded cells where they are. |
| 404 / 410 of the lookup | In-panel statement. Not a terminal screen, and not a "back home" that would abandon playback. |
| Dismiss | Scrim, Close, Escape. |

Lock marks come from `viewerAccess` via `presentEpisodeAccess`. A locked or unavailable cell is a
`<span>`, not a `<Link>`: switching into a wall is the J16 exception, and this panel does not take
a purchase. A playable cell is a `replace` link to `#/play/:episodeId` and closes the panel.

Watched marks do not appear. `docs/02-screen-inventory.md` PNL-01 names `GET /progress/dramas/
{dramaId}` for them; that path is not in `contracts/openapi.yaml`. Inventing it would be a
client-side contract. Per-episode `GET /v1/progress/episodes/{episodeId}` exists, and N of those
for an 80-episode grid is not a substitute.

No fiat or Beans amount appears on a cell. Prices stay on DramaPage's rows and on PNL-02.

The player's demo album is unchanged. Playback sessions still mint the real `vid`. The picker
navigates by episode id; the demo playlist still cannot play a catalogue id, and this slot did not
pretend otherwise.

---

## 3. Mutations that bite

Run against this branch, then reverted. None of these is a typecheck-only catch.

### 3.1 The grid is the demo album

```
FAIL  src/picker/EpisodePicker.test.tsx > PNL-01 loads the real episode list > looks the route episode up, then asks for that drama's episodes
AssertionError: expected [] to deeply equal [ 'ep_route_0007' ]
```

A panel that rendered `ep_demo_0001`…`0006` would also fail "renders a numbered cell for each
episode the server sent".

### 3.2 A locked cell is a link

```
FAIL  src/picker/EpisodePicker.test.tsx > lock marks and navigation > does not turn a locked cell into a destination
AssertionError: expected 'A' not to be 'A'
```

An `UNAVAILABLE` episode carrying a stale `priceCoins: 60` going the same way fails the next test.

### 3.3 Groups of 50, or no groups

```
FAIL  src/picker/EpisodePicker.test.tsx > groups of thirty > splits an 80-episode list into three tabs and opens on the current group
AssertionError: expected 2 to be 3
```

---

## 4. Verify

`pnpm verify` exited 0 on this branch at `85443e2`.

```
$ pnpm test
```

| Package | Tests |
| --- | ---: |
| `packages/shared` | 51 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,362 |
| `app` | 882 |
| **Total** | **2,377** |

Format, lint, typecheck, test, build, guardrails all green. Artifact
`dist/assets/index-ByxZPC2_.js` 323.28 kB / 99.35 kB gzip. Guardrails passed.

---

## 5. What is still open

- **SCR-10 / PNL-03 recharge.** Still blocked on a Beans rate (`C3-09`) and on `pay()`. The wallet
  entry still says prices have not been set.
- **SCR-11 VIP.** No subscription contract.
- **Watched marks on PNL-01.** Need `GET /progress/dramas/{dramaId}` in the OpenAPI document first.
  Do not invent the endpoint in the client.
- **The player's demo album.** PNL-01 navigates by real episode ids; the retained VePlayer instance
  still plays `ep_demo_*` until `POST /v1/playback/sessions` replaces the placeholder playlist.
- **PNL-02 on the player.** Unlock is reachable from DramaPage's rows, not from a locked picker
  cell. A locked cell is a mark, not a purchase.

Mid-slot landings, no overlap: GET `/v1/wallet` (`48a30a0`, `server/src/modules/wallet/` and
`contracts/openapi.yaml`), request-id logging (`0ca8406`, `server/src/core/logging.ts`). CI L2
was already on `main` at the cut and was not touched.
