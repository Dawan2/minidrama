# W14 — C4 more: stubbed `POST /v2/oauth/token/` (C4-05 / C3-08)

> **Slot:** W14, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w14-work-c4-more-72c4`, cut from `origin/main` at `9159974` (G2.2 on main).
> **Item:** `C4-05` / `C3-08` unblocked half — the `POST /v2/oauth/token/` exchange behind a
> stubbed HTTP client. No synthesised `open_id`. D4 stays `[ ]`.
> **Not in scope:** C4-01, C4-02 G2.7, G2.2, D-16 PlayPage, playNext lock (`bc-35dcf4b9`, landed
> as `574651c` while this slot ran), `bc-0b570e4b` (`cursor/w14-work-c4-next-72c4`, G2.2
> retake / `check-integrate`). Beans, GATE-8, EIS, SCR-10, enabling top-up. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` remaining unblocked engineering after C4-01, C4-02 G2.7, and
G2.2: G2.6 (artifact budget), then G2.3, then C4-04 / C4-05. Sibling `bc-0b570e4b` is
`cursor/w14-work-c4-next-72c4` and is rewriting L2 sqlite integration (`check-integrate*`,
`l2.yml`). Sibling `bc-35dcf4b9` is playNext. This slot takes the next unblocked item that is
not those files: **C4-05 / C3-08**, the token exchange C3 named as deliverable before GATE-1.

The client path, the login route, and the mock port already exist. Exactly one function
refused every real code: `createTiktokIdentityPort`. That refusal must not become a
synthesised `open_id`. The unblocked work is request shaping, timeout, failure mapping, and
the rule that access and refresh tokens never leave the adapter — against a stubbed transport.

---

## 2. What changed

`createTiktokIdentityPort` POSTs `application/x-www-form-urlencoded` to
`https://open.tiktokapis.com/v2/oauth/token/` with `grant_type=authorization_code`,
`client_key`, `client_secret`, and the code. Production uses `fetch` with `AbortSignal.timeout`
and `redirect: 'error'`. Tests inject `http`.

| Situation | Result |
| --- | --- |
| No client secret | `PROVIDER_UNCONFIGURED`. Transport is not called |
| Transport throws / abort / 5xx / unparseable | `PROVIDER_UNAVAILABLE` |
| HTTP 400 `invalid_client` | `PROVIDER_UNAVAILABLE` (our secret, not the viewer's code) |
| `invalid_grant` / `access_denied` / HTTP 400–401 | `AUTH_CODE_REJECTED` |
| HTTP 200 with no `open_id` | `PROVIDER_UNAVAILABLE`. Not a synthesised user |
| HTTP 200 with `open_id` | `{ openId }` from the platform body. Tokens dropped |

| File | Change |
| --- | --- |
| `server/src/modules/platform-tiktok/identity-port.ts` | The exchange. `createUnavailableIdentityPort` remains the no-secret path |
| `server/src/modules/platform-tiktok/identity-port.test.ts` | New. Request shape, mapping, no-synthesis, secret/token leak checks |
| `server/src/app.ts` | Optional `identityHttp` so tests never call the live OpenAPI |
| `server/src/modules/identity/routes.test.ts` | Unreachable / rejected stubs. Login response has no platform token or secret |
| `server/src/modules/unlock/session-orders.test.ts` | Same throwing transport: this file signs webhooks with a secret and must not `fetch` |
| `app/src/routes/PlayPage.test.tsx` | After merging playNext: wait for VePlayer's episode id, not only the route dataset |

`docs/11-official-onboarding-checklist.md` D4 is still `[ ]`. This slot did not flip it.

---

## 3. Reverse verification

The tests are the injection. Against a 200 whose body is tokens and no user:

```
FAIL  createTiktokIdentityPort — 200 with no open_id > is PROVIDER_UNAVAILABLE, not a synthesised user
expected { ok: true, value: { openId: 'code_abc' } } to equal { ok: false, error: 'PROVIDER_UNAVAILABLE' }
```

A missing secret still does not call the transport, even when the stub would return an
`open_id`. A thrown `Error(client_secret)` becomes `PROVIDER_UNAVAILABLE` and the Result
JSON does not contain the secret.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-0b570e4b` (`cursor/w14-work-c4-next-72c4`) | None. Their files are `l2.yml`, `check-integrate*`, root `package.json`, README. This slot does not touch those |
| `bc-35dcf4b9` (playNext lock) | Landed as `574651c`. App playback files. Merged in; no overlap with identity-port. One waitFor in `PlayPage.test.tsx` so coverage load does not read the previous VePlayer instance after the route has already moved |
| G2.2 on main (`9159974`) | `check-integration` already exists. Not retaken |

`git diff origin/main -- .github/workflows/` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on this branch after merging `origin/main` (`574651c` playNext). L1
sequence unchanged: format → lint → typecheck → test:coverage → check:coverage → build →
guardrails.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 67 |
| `server` | 1,654 |
| `app` | 997 |
| **Total** | **2,818** |

Zero skipped. Coverage gate:

```
coverage global lines 93.96% (12323/13115), branches 92.09%, core lines 98.07%, diff lines 98.15% (106/108)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-2Tmvm371.js` 341.72 kB / 103.97 kB gzip — the
playNext merge's artifact, not this slot's). Native `<video>` remains absent.

---

## 6. Left open

- **D4.** Still `[ ]`. The exchange is stubbed. GATE-1 credentials and GATE-6 device are still
  required for a real code. No synthesised `open_id`.
- **Token persistence / refresh.** Access and refresh tokens are dropped after `open_id` is
  read. Calling `/v2/user/info/` later needs a store; it is not this slot.
- **G2.6, G2.3, G2.4, G2.5.** Left for other L2 slices. `bc-0b570e4b` is on a G2.2-shaped
  retake; do not duplicate it.
- **C4-04, C4-06, C4-07, C4-08.** Splash contract, Beans, VIP, ads.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
