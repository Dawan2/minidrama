# W13 — C3-05: D9 capsule avoidance and nav-bar colour, fail-closed

> **Slot:** W13, work slot (`bc-5894f9dd`). One backlog item, no pull request.
> **Branch:** `cursor/w13-work-wallet-ledger-ui-72c4`, cut from `origin/main` at `2aea931`.
> **Item:** `C3-05` / C2 **T0-3a** — every screen reserves the TikTok capsule and sets a
> navigation-bar colour. Wired and exercisable against the mock. D9 stays `[ ]` until a device
> run (`docs/plan/wave-protocol.md` §8 rule 6).
> **Not in scope:** `GET /v1/wallet/transactions` (the client already consumes it), SCR-10/PNL-03
> recharge, SCR-11 VIP, remaining durable stores, a real `TTMinis` device. No pull request.

---

## 1. What was picked, and why

The assignment named `GET /v1/wallet/transactions` on `8bf0b24` and asked this slot to wire the
wallet page ledger to it. That work was already done:

- The client has called `GET /v1/wallet/transactions` since the wallet UI slot
  (`docs/handoff/w13-wallet.md`). Empty page is the required empty state. A `401` is sign-in.
  A retryable error is fail-closed. Missing deltas are not a zero movement. Unlocks never fill
  the list (S73). No Beans.
- The server route landed on `cursor/w13-work-c3-remain-72c4` (`8bf0b24`, `bc-da8da7ff`). At
  pick time it was not on `origin/main` (`2aea931`); comments on that branch already said the
  client behaviour was unchanged.

So this slot took the next open **code** item that was not in flight. In flight at start:
webhook sqlite (`bc-a20c83ad`) and drama progress (`bc-046f6d65`). Both later landed on
`main` as `45d6f65`. `C3-05` was the next unblocked Tier A item: every screen owed the
capsule, no screen called `getMenuButtonRect` or `setNavigationBarColor`, and it needs no
credential.

On `2aea931`:

```
$ rg -n "getMenuButtonRect|setNavigationBarColor" app/src --glob '!src/platform/**' --glob '!**/*.test.*'
```

No product hits. `--capsule-safe-area: 96px` was the guess `docs/handoff/w2-work-h.md` left.

---

## 2. What changed

### 2.1 One shell, not one copy per page

`app/src/chrome/Chrome.tsx` wraps every route in `App`. It is the only product call site.

| Capability | `canIUse` true | `canIUse` false / failed call |
| --- | --- | --- |
| `getMenuButtonBoundingClientRect` | measure, write `--capsule-safe-area` | keep 96px. Never `0` |
| `setNavigationBarColor` | chrome `#0b0b0f` / player `#000000`, front `#ffffff` | skip. Pages still paint `--bg` |

`BridgeProvider` is how a screen reaches the bridge without naming `window.TTMinis`. DramaPage
and PlayPage still take the bridge as a prop for purchase probes; that is unchanged.

### 2.2 The inset

`capsuleInsetFromRect` reserves from the capsule's left edge to the viewport's right edge. An
empty, inverted, off-screen, or full-width rect is not a measurement: the conservative default
stays. MockBridge places its 88×32 capsule 8px from the top-right of *this* viewport, so a
1024-wide jsdom window does not invent a 700px margin from a 375-wide fixture.

### 2.3 Every heading

`page__heading` and `page__nav` already read `--capsule-safe-area`. FallbackPage's `<h1>` did
not. It does now. `reservation.test.ts` fails if a routed `*Page.tsx` drops the class, or if
the stylesheet default drifts from `DEFAULT_CAPSULE_INSET_PX`.

---

## 3. Mutations that bite

Run against this branch, then reverted. None of these is a typecheck-only catch.

### 3.1 An unusable rect becomes `{ source: 'measured', px: 0 }`

```
FAIL  src/chrome/capsule-inset.test.ts > capsuleInsetFromRect > does not treat a missing rectangle as zero, which would sit under the capsule
AssertionError: expected 'measured' to be 'fallback'
```

That is the capsule overlapping a heading: a missing measurement treated as "no capsule".

### 3.2 `canIUse` false still calls the SDK

```
FAIL  src/chrome/Chrome.test.tsx > Chrome > keeps the CSS default and does not call the SDK when the capability is missing
AssertionError: expected "getMenuButtonRect" to not be called at all, but actually been called 1 times
```

That is the older-client crash C3-05 named. The bridge would also refuse, but the call site
has to skip first.

---

## 4. Verify

`pnpm verify` exited 0 on this branch after merging `origin/main` at `45d6f65` (drama
progress, sessions sqlite, webhook events). Overlap was the capsule comment in `app.css`;
chrome files are new.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,504 |
| `app` | 916 |
| **Total** | **2,557** |

Format, lint, typecheck, test, build, guardrails all green. Artifact
`dist/assets/index-Da9f2iuu.js` 327.17 kB / 100.37 kB gzip. Guardrails passed.

New app tests: 5 (inset) + 2 (palette) + 6 (Chrome) + 3 (reservation) + 2 (bridge context) + 1
(fallback heading) = 19.

---

## 5. What is still open

- **D9 on a device.** Wired and exercisable. The checklist box stays empty until
  `getMenuButtonRect` has run inside TikTok.
- **`GET /v1/wallet/transactions` on `main`.** The client already consumes it. The server
  route is on `cursor/w13-work-c3-remain-72c4` (`8bf0b24`) and was not this slot.
- **SCR-10 / PNL-03 recharge.** Blocked on a Beans rate (`C3-09`) and on `pay()`.
- **SCR-11 VIP.** No subscription contract.
- **C3-09.** Still a missing business input. No rate was written.
- **Remaining durable stores.** Unlock, sessions, and webhook events are on `main`. Orders
  (`bc-d7eb8bf5`) and watch progress (`bc-2fda0be7`) were running at write-up and were not
  touched.

Webhook sqlite and drama progress landed on `main` as `45d6f65` while this slot verified
(`server/migrations/0002_*`, `0003_*`, `app/src/data/progress-api.ts`, picker marks). This
branch has taken them. Files do not overlap with chrome except the `app.css` comment, which
merged cleanly.
