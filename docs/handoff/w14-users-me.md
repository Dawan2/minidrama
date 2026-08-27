# W14 — fail-closed `GET /v1/users/me` (session identity, no VIP)

> **Slot:** W14, work slot (`bc-e35c1229`). One item, no pull request.
> **Branch:** `cursor/w14-work-users-me-72c4`, cut from `origin/main` at `652cc69` (C4-05 OAuth
> stub on main).
> **Item:** SCR-06's missing identity read. The VIP card is fail-closed because there was no
> `GET /users/me` and no subscription contract. This slot adds **fail-closed**
> `GET /v1/users/me` that returns identity the server already has from the session. **No**
> invented VIP, expiry, or Beans. OpenAPI lockstep. The profile card consumes only fields that
> exist (`id`, and `nickname` when the platform named one).
> **Not in scope:** C4-05 OAuth stub (`652cc69`, already on main), PLY-002 (`bc-7119e197`),
> `bc-0b570e4b` (`cursor/w14-work-c4-next-72c4`, G2.2 retake). Subscription contract (`C4-07`),
> Beans (`C3-09`), `PATCH /users/me`, bind-phone, `#/vip`. No pull request.

---

## 1. What was picked, and why

`GET /v1/users/me` was **not** on `main` (`docs/12-api-parity.md` had it `design-only`;
`contracts/openapi.yaml` had `/v1/users/me/watch-history` and `/v1/users/me/favorites` only).
It was **not** owned by `bc-0b570e4b`. SCR-06's VIP card therefore had nothing honest to
read for identity either, and correctly quoted no status.

Sibling `bc-0b570e4b` is a G2.2-shaped L2 retake. Sibling `bc-7119e197` is PLY-002. C4-05
already landed as `652cc69`. This slot takes the named identity endpoint.

---

## 2. What changed

### 2.1 The contract

`GET /v1/users/me` in `contracts/openapi.yaml`, operationId `getMe`, tag `identity`.
`MeView` requires `id`. `nickname` and `avatarUrl` are optional: a missing nickname is not
`"Guest"` and not the `id` echoed as a display name. VIP, expiry, Beans, fiat, phone and a
coin→Beans rate are **not** in the schema.

`server/src/contract.test.ts` asserts the path both ways. An unauthenticated inject answers
`401`, not `404`. `docs/12-api-parity.md` flips `GET /users/me` from `design-only` to `live`.
Doc 12's design paragraph still names a VIP object; that is the design surface, not the live
one (same rule C4-01 used for WeChat recharge).

### 2.2 The handler

`server/src/modules/identity/me-routes.ts`. Same `requireViewer` seam as wallet and
favourites, so a missing and a rejected credential are both `401 AUTH_REQUIRED`, and an
unresolvable session is `503`. `Cache-Control: private, no-store` on every answer (CA-3).

The body is `toMeView({ id: viewerId })`. The viewer id is the session binding — today's
platform `open_id`, the same value login returns. Nickname and avatar are omitted: they are
not on the session. An empty resolved id is `503`, not `{ id: "" }` and not a guest.

| Situation | HTTP |
| --- | --- |
| No credential / rejected session | `401 AUTH_REQUIRED` |
| Session store down | `503` |
| Signed in | `200` `{ id }` |
| Stuffed `vip` / `beansAmount` on the mapper input | dropped; only `MeView` keys leave |

`PATCH /v1/users/me` and `POST /v1/users/me/bind-phone` stay absent. An empty VIP object
would claim the viewer is not subscribed, and we do not know that (`C4-07`).

### 2.3 Shared type

`packages/shared/src/me.ts` is `MeView`. A compile-time assertion rejects VIP, expiry,
Beans, fiat and phone keys on the type.

### 2.4 Profile card

`GET /v1/users/me` is fetched only when signed in. The identity block:

- stamps `data-user-id` from `id` when the read succeeds
- shows `nickname` only when the server sent one
- otherwise keeps the session placeholder ("You") — it does **not** echo the id as a name
- on failure, keeps the placeholder and does not blank the entries or the VIP card

The VIP card still does not read `MeApi`. `MeView` has no `vip` field. Subscribe stays
disabled. Beans never appear.

---

## 3. Mutations that bite

Run against this branch, then reverted. None of these is a typecheck-only catch.

### 3.1 `200 { id, vip: { active: false } }`

```
FAIL  GET /v1/users/me — the body is identity, not VIP or Beans
expected body keys to equal [ 'id' ]
```

That is M16 on identity: inventing "not subscribed" is the same lie as inventing `0 coins`.

### 3.2 Echo the id as `nickname`

```
FAIL  toMeView > drops an empty nickname rather than echoing the id as a display name
FAIL  the signed-in identity > stamps the session id … and does not echo it as a nickname
expected 'Youopen_1…' not to contain 'open_1'
```

### 3.3 Anonymous `200 {}`

```
FAIL  GET /v1/users/me — without a resolvable viewer
expected 401, received 200
```

A client would then have to guess whether to sign in.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-0b570e4b` (`cursor/w14-work-c4-next-72c4`) | Landed on `main` as G2.6 (`a8e1023` / `fe5405a`) while this slot ran. L2 artifact files. This slot does not touch `l2.yml` or `check:artifact` |
| `bc-7119e197` (PLY-002) | Landed on `main` as `eec7c71`. Player probe. Merged in; no overlap with me routes |
| C4-05 (`652cc69`) | Already on main at the cut. Identity port untouched |

---

## 5. Verification

`pnpm verify` green on this branch after merging `origin/main` (`a8e1023`: G2.6 + PLY-002).
L1 sequence unchanged: format → lint → typecheck → test:coverage → check:coverage → build →
guardrails.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 58 |
| `packages/config` | 45 |
| `packages/quality` | 67 |
| `server` | 1,673 |
| `app` | 1,050 |
| **Total** | **2,893** |

Zero skipped. Coverage gate:

```
coverage global lines 94.07% (12701/13501), branches 92.15%, core lines 98.13%, diff lines 91.12% (154/169)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-DdfT1FNc.js` 342.98 kB / 104.21 kB gzip). Native
`<video>` remains absent. G2.6 `check:artifact` is L2, not folded into `pnpm verify`.

---

## 6. Left open

- **VIP / SCR-11 / D8.** Still no subscription contract (`C4-07`). The profile card stays a
  statement. Do not add `vip` to `MeView` to make the card look finished.
- **Nickname / avatar from TikTok.** Needs `authorize` / a user-info call. The session does
  not hold them. Optional fields exist on the schema so a later slot can fill them without
  inventing a second path.
- **`PATCH /users/me`, bind-phone.** Users table, not this read.
- **C4-04 splash `GET /config`, C4-06 Beans, C4-08 ads.** Other items.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
