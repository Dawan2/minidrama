# W20 — QA-010 remainder: require SCR-08 favorites next to profile

> **Slot:** W20, work slot (`bc-4a86d4f3`). One leftover item, no pull request.
> **Branch:** `cursor/w20-work-c7-follow-72c4`, cut from `origin/main` at **`a49ebd7`**
> (QA-010 remainder already requires SCR-06 profile). `origin/main` did not
> move while this slot wrote.
> **Item:** **QA-010 remainder** — S-A1 on the next unblocked implemented
> screen. After SCR-13, SCR-02, SCR-03, SCR-04, SCR-05, and SCR-06, the
> inventory ranks **SCR-08** (`#/favorites`, favourites / 我的收藏) next
> among remaining numbered hash screens. SCR-07 history is in flight on
> C7-second (`bc-1ed8782f`) and is not required here. Deleting any of the
> seven required stems is red. Host stays jsdom, not TikTok WebView.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, profile a11y
> (`a49ebd7` / twin `bc-a6639f6d` not merged), tap pause (`bc-ecde45cf`),
> C7-second history (`bc-1ed8782f`), remaining SCR/PNL fixtures (wallet,
> settings, panels, search), S-C4, protocol-C4 exit 3. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-7-backlog.md` ranks D-17 first (not a branch). Protocol-C4
交互验收单 is a named remainder, not an implement epic: 倍速 / scrub stay
X-26, tap pause is VePlayer-owned and in flight (`bc-ecde45cf`). Rank 3 is
the QA-010 remainder after SCR-03. SCR-06 profile is already on `main` at
`a49ebd7`; the profile twin (`bc-a6639f6d`) is idle and not merged. C7-second
(`bc-1ed8782f`) already owns SCR-07 history on
`cursor/w20-work-c7-second-72c4`, so this slot skipped it and took the next
unblocked implemented numbered hash screen: **SCR-08 favorites**. C4-03 /
C4-07 stay skipped. No AM answers invented.

SCR-01 is an overlay. SCR-10 / SCR-11 are not product routes.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| Protocol-C4 tap pause `bc-ecde45cf` | **RUNNING at pick.** Left. Not a competing pause |
| QA-010 SCR-06 profile | **On `main`** at `a49ebd7`. Twin `bc-a6639f6d` idle, not merged. Not retaken |
| QA-010 SCR-07 history `bc-1ed8782f` | **RUNNING at pick.** File ownership skipped. Branch `cursor/w20-work-c7-second-72c4` |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| QA-010 SCR-13 + SCR-02 + SCR-03 + SCR-04 + SCR-05 + SCR-06 | **On `main`** at pick |
| **QA-010 remainder SCR-08 favorites** | **This slot.** Next unblocked implemented screen after profile, skipping in-flight history |

This slice does **not** claim protocol-C4 exit 3 closed. It does **not** claim
TikTok WebView.

---

## 2. What changed

`pnpm run check:a11y` still walks `packages/quality/a11y/screens/*.html`. The
required stems are `scr-02-home`, `scr-03-browse`, `scr-04-drama`,
`scr-05-play`, `scr-06-profile`, `scr-08-favorites`, and `scr-13-fallback`.
A source that has the other six but not favorites is red. The favorites
fixture uses product English copy and the honest empty chrome
(`favorites-page`, back to `#/me`, empty state, find-something-to-follow).
No `#/vip`. Body colors stay the passing pair; live `--accent` is not
remediated.

| File | Change |
| --- | --- |
| `packages/quality/a11y/screens/scr-08-favorites.html` | SCR-08 fixture (`lang="en"`, product body colors, empty chrome) |
| `packages/quality/src/a11y.ts` | Required stems include `scr-08-favorites` next to the landed six |
| `docs/14-quality-gates.md` §2.1 / `docs/14-test-plan.md` §6.4 | Dated remainder notes |
| `docs/engineering/repo-layout.md` | Command comment names all seven stems |

`docs/plan/cycle-7-backlog.md` is not rewritten. `.github/` and player product
files are untouched. Wallet top-up stays disabled. `adUnlock` stays false. No
BytePlus `vid`. History fixture was not added here.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 Required favorites stem deleted

```
required implemented-screen fixture missing: scr-08-favorites (host=jsdom, not TikTok WebView)
```

Exit 1.

### 3.2 White-on-white on the fallback fixture (stems still present)

Covered by the existing CLI / unit reverse path. Exit 1. A comment that names
WCAG is not this gate. Stdout on green says `7 screens` and
`host=jsdom, not TikTok WebView`.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-1ed8782f` C7-second / SCR-07 history | **RUNNING at pick.** `scr-07-history.html` not edited here. Required stems skip history |
| `bc-ecde45cf` tap-to-pause remainder | **RUNNING at pick.** Player files not edited here |
| `bc-a6639f6d` profile a11y twin | **Idle. Not merged.** Profile fixture not rewritten here |

`git diff origin/main -- app/ server/ .github/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch against `origin/main` (`a49ebd7`,
SCR-06 already on main). L1 sequence is format → lint → typecheck →
check:commits → check:skips → check:audit → check:a11y → test:coverage →
check:coverage → build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `1 new commits vs origin/main, 0 prose, 0 missing-id` at the product SHA (merge commits skipped; unique commit carries `QA-010`) |
| G1.10 skips | `237 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (7 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,586 passing** — shared 63, quality 443, config 45, server 1,785, app 1,250. Coverage: global lines 94.36% (17874/18942), branches 90.87%, core 95.70%, **diff lines 100.00% (1/1)** |
| Build | pass — `index-B2g09p35.js` 366.74 kB / 112.08 kB gzip (CN-10's client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,583 on `main` after
SCR-06 → 3,586 here; the extra tests are this remainder). jsdom still prints
`HTMLCanvasElement's getContext()` while axe attempts `color-contrast`; that
is incomplete, not a skip.

---

## 6. What is still open

- **S-A1 on every remaining SCR/PNL.** This slice adds SCR-08 only. SCR-07
  history is in flight. SCR-09 wallet, SCR-12 settings, search, and panels
  are later remainders.
- **S-A2 on live `app.css`.** `--accent` (#fe2c55) under white label text is
  below 4.5:1. Not remediated here; fixtures use passing body colors.
- **TikTok WebView.** Not claimed. PLY-002 still `unmeasured`.
- **Protocol-C4 exit 3.** Not closed. This is the named QA-010 remainder after
  profile, skipping in-flight history.
- **S-C4.** Required-checks vs GitHub branch protection. S-C3 echo-only already
  on `main`. D-17 still falsifies GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-7-backlog.md`.** Plan-slot file.
- **Tap pause.** VePlayer-owned. In flight on `bc-ecde45cf`.

This slice does **not** claim protocol-C4 exit 3 closed. It is the named
QA-010 remainder that requires SCR-08 favorites next to SCR-02, SCR-03,
SCR-04, SCR-05, SCR-06, and SCR-13.
