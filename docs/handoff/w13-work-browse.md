# W13 — T2-4 remainder: SCR-03 browse against `GET /v1/dramas`

> **Slot:** W13, work slot (`bc-7cccf28c`). One backlog item, no pull request.
> **Branch:** `cursor/w13-work-c3-more-72c4`, cut from `origin/main` at `dd37df6`.
> **Item:** C2 **T2-4** / listing-bar remainder — SCR-03 theatre · category (`#/browse`), against
> the published `GET /v1/dramas` that was already on `main`.
> **Not in scope:** another sqlite store (orders `bc-d7eb8bf5`, watch-progress `bc-2fda0be7` in
> flight), SCR-10/PNL-03 recharge, SCR-11 VIP, SCR-01 splash (`GET /config` is not in
> `contracts/openapi.yaml`), C3-11 coverage, Beans, a tab bar. No pull request.

---

## 1. What was picked, and why

C3-05 chrome landed on `main` as `dd37df6`. The remaining C3 numbered items that are still open
are sqlite stores (siblings) or AM-blocked (Beans, real login, SCR-10/11). The listing bar in
`docs/plan/cycle-3-backlog.md` §5 still named three unblocked screens: SCR-01, SCR-03, SCR-12.

SCR-03 is the one with a contract on this tree. `GET /v1/dramas?category=&tag=&sort=` has been
served since Wave 2. The client had no caller. Home is a recommendation feed, not a catalogue;
`#/search` is a typed query. The theatre tab was reachable only by inventing a deep link.

SCR-01 still needs `GET /config`, which is not an OpenAPI path. SCR-12 is smaller and has no
data dependency; it is next, not this slot. C3-11 (G1.5, `workflow_dispatch`, D-07) is gate
machinery and was left.

---

## 2. What changed

### 2.1 The list client

`CatalogApi.fetchDramas` calls `GET /v1/dramas` and narrows each row as `DramaSummary`. A page
whose summary is missing `id` or `title` is malformed, not a card with a blank heading.

### 2.2 The route is the filter

`category`, `tag`, and `sort` live in the query string (`docs/02-information-architecture.md` §5).
The names match the endpoint. An unknown category, an overlong tag, or `sort=POPULAR` is dropped
rather than forwarded: the server answers `400` for those, and a mistyped deep link must not
become an error screen.

`sort=HOT` is omitted from the URL so `#/browse` and `#/browse?sort=HOT` cannot drift.

There is no tag taxonomy endpoint, so a `tag=` in the URL is honoured and dismissable. Multi-select
would be a second query shape; the contract publishes one `tag` string.

Search stays off this screen. G5 still hides that entry on the theatre tab; `#/search` already
exists from the feed.

### 2.3 The five states

| State | What the viewer gets |
| --- | --- |
| Loading | Skeleton |
| Content | Cards that open `#/drama/:id`, never the player. Resume is a feed concern. |
| Empty, no filters | Retry. An empty catalogue has nowhere else to send anyone. |
| Empty, filtered | "Nothing in this category yet" + **Clear filters**. Retrying the same nothing is a lie. |
| Retryable / terminal | Same shapes as the feed. A further-page failure leaves the loaded cards. |

Home grows a Theatre link. There is still no tab bar.

A one-line wait was added to `Chrome.test.tsx` so the D9 CSS-variable assertion cannot pass on
the attribute and fail on the variable under a full parallel `pnpm verify`. The chrome code was
not changed.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 An invented category is forwarded

```
FAIL  src/routes/BrowsePage.test.tsx > the browse grid > does not forward a category the contract does not list
AssertionError: expected 'BOGUS' to be undefined
```

That is a mistyped `#/browse?category=BOGUS` becoming a `400`. The parser has to drop it.

---

## 4. Verify

`pnpm verify` after the chrome-test wait. Format, lint, typecheck, test, build, guardrails.

| Package | Tests |
| ---: | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,504 |
| `app` | (see the green run) |

No fiat, no Beans, no invented endpoint.

---

## 5. What is still open

- **SCR-01 splash.** Boot already runs `init` and silent login. `GET /config` is not in the
  OpenAPI document; do not invent it in the client.
- **SCR-12 settings.** Unblocked. ToS / privacy / C11 mail / version. No data dependency.
- **SCR-10 / PNL-03.** Blocked on a Beans rate (`C3-09`) and `pay()`.
- **SCR-11 VIP.** No subscription contract.
- **C3-11.** G1.5 coverage, L1 `workflow_dispatch`, D-07 parity. Gate machinery.
- **Remaining durable stores.** Orders and watch progress landed on `main` while this slot
  verified (`fcc6fd6`). Favourites, catalogue, and search directory still in memory.
- **A tab bar.** SCR-02 / SCR-03 / SCR-06 are still linked, not tabbed.
- **D9 on a device.** Unchanged.

In flight at start: watch-progress sqlite (`bc-2fda0be7`), orders sqlite (`bc-d7eb8bf5`). Both
landed on `main` as `fcc6fd6` (`server/migrations/0004_*`, `0005_*`). This branch does not touch
`server/`. The merge of `origin/main` was ort, no conflicts.
