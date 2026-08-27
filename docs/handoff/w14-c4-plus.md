# W14 — C4 plus: fail-closed `GET /v1/config` and SCR-01 splash (C4-04)

> **Slot:** W14, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w14-work-c4-plus-72c4`, cut from `origin/main` at `33d149f`
> (`GET /v1/users/me`). Merged forward onto `38ac2c4` (G2.4 Semgrep + C4-06
> `trade_order/create`).
> **Item:** `C4-04` / C2 **T2-4** remainder — anonymous `GET /v1/config` and the SCR-01 splash
> over boot. Comments stay off. No legal URLs, ad-unit ids, `coinName`, or Beans.
> **Not in scope:** `GET /v1/users/me` (already on `main` at `33d149f`), L2 remaining
> `bc-33b61d7a` (G2.4, landed as `38ac2c4` while this slot ran), C4-again `bc-86df0c88`
> (C4-06 stub, landed as `74fd7cd`). C4-03 Postgres, C4-07 VIP, C4-08 ads. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` remaining unblocked engineering after C4-01, C4-02 L2 slices
(G2.8 / G2.7 / G2.2 / G2.6), C4-05 OAuth stub, PLY-002, D-16, playNext, and `GET /v1/users/me`:
G2.4 and C4-06 were in flight (`bc-33b61d7a`, `bc-86df0c88`). C4-03 is T14 Postgres ("do not
fake"). C4-07 / C4-08 wait on AM. The next named Tier A item was **C4-04**.

Doc 12 still promised `GET /config`. OpenAPI did not have it. `main.tsx` listed it as a
continuation. The backlog says: do not add a client fetch to a path the server does not serve,
and do not invent `features.comments: true` or legal URLs in the splash. The unblocked work is
the live `/v1/config` body — the conservative product state — then the screen.

A splash that hard-codes comments-on is not done.

---

## 2. What changed

Anonymous `GET /v1/config` returns:

```json
{
  "features": { "comments": false, "adUnlock": false },
  "playback": { "progressHeartbeatSec": 10 }
}
```

`Cache-Control: public, max-age=60, stale-while-revalidate=300`. Extra keys fail OpenAPI
`additionalProperties: false`. `LIVE_CLIENT_CONFIG` is `CONSERVATIVE_CLIENT_CONFIG` on
purpose: AC-BOOT-4's fallback *is* what we ship until a later slot turns a flag on for a
reason that exists in this repository.

Web boot paints a full-viewport splash (`boot.loading`) before `init()`. Init failure is a
terminal retry screen (AC-BOOT-3). Config fetch failure uses the same conservative snapshot
(AC-BOOT-4). Comments stay off (AC-BOOT-5). Splash copy does not mention comments, VIP, or
Beans.

| File | Change |
| --- | --- |
| `packages/shared/src/config.ts` | `ConfigView`, `CONSERVATIVE_CLIENT_CONFIG`. Forbidden-key type refuse |
| `server/src/modules/config/` | Live body, view, route, tests |
| `contracts/openapi.yaml` | `/v1/config` + `ConfigView` |
| `app/src/data/config-api.ts` | Fetch + `narrowConfigView` + `resolveClientConfig` |
| `app/src/boot/` | Splash, BootError, `load-config`, sequence (extracted so coverage sees it) |
| `app/src/config/client-config-context.tsx` | Snapshot provider |
| `app/src/main.tsx` | Paint splash → init (terminal retry) → silent login → config → wrap tree |
| `docs/12-api-parity.md` | Row is `live` |
| `docs/12-api-contracts.md` | §4.10 notes the design example is not the live body |
| `docs/engineering/repo-layout.md` | Config module + splash order |

`docs/plan/cycle-4-backlog.md` is not rewritten. The document belongs to the plan slot.

---

## 3. Reverse verification

The live handler and the conservative constant both pin `comments: false`. The source scan
fails if product files name `comments: true`, a legal URL, or an ad-unit id:

```
FAIL  GET /v1/config — live body > names no comments: true, legal URL, ad-unit id or Beans rate
```

The splash scan:

```
FAIL  the splash does not invent comments-on, legal URLs or ad-unit ids > names no comments: true
```

`toConfigView` *can* pass `{ comments: true }` so a later slot that turns the flag on is a
deliberate live-object change, not a mapper that silently drops it. The live object does not
do that today.

`rg -n "comments: true" server/src/modules/config` is empty of executable lines (comments
that *forbid* the value are the point). Splash copy is `boot.loading` / `boot.initFailed`
only.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-33b61d7a` (G2.4) | Landed as `38ac2c4`. `l2.yml`, Semgrep rules. Merged in; no overlap with config/splash |
| `bc-86df0c88` (C4-06) | Landed as `74fd7cd`. `trade-order-create`. Merged in; no overlap with `/v1/config` |
| `GET /v1/users/me` | Already on `main` at pick (`33d149f`). Identity `me-routes`. Not retaken |

`.github/workflows/ci.yml` is unchanged vs the merge base. `check:sast` is not folded into
`verify`.

---

## 5. Verification

`pnpm verify` green on this branch after merging `origin/main` (`38ac2c4` G2.4 + C4-06). L1
sequence unchanged: format → lint → typecheck → test:coverage → check:coverage → build →
guardrails.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 61 |
| `packages/quality` | 102 |
| `packages/config` | 45 |
| `server` | 1,717 |
| `app` | 1,074 |
| **Total** | **2,999** |

Zero skipped. Coverage gate:

```
coverage global lines 94.06% (13245/14081), branches 92.12%, core lines 98.13%, diff lines 81.82% (171/209)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-DN-vXqml.js` 344.91 kB / 105.62 kB gzip). Native
`<video>` remains absent.

---

## 6. Left open

- **C4-03** Postgres. Do not fake.
- **C4-07** VIP. No subscription path. Do not invent one.
- **C4-08** ads. No unit ids. `adUnlock` stays `false`.
- **Comments (PNL-04).** The flag exists. It is off. Turning it on without endpoints is the
  regression this slot exists to prevent.
- **Deep-link target** after splash. Still a later insertion.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten.
