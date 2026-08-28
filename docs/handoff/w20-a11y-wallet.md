# W20 — QA-010 remainder: require SCR-09 wallet next to favorites

> **Slot:** W20, work slot (`bc-0a35c9df`). One leftover item, no pull request.
> **Branch:** `cursor/w20-work-a11y-wallet-72c4`, cut from `origin/main` at **`c2f9700`**
> (tap-pause already on main; QA-010 remainder already requires SCR-08
> favorites). Absorbed `origin/main` **`968fd48`** after C7-second history
> (`bc-1ed8782f`) landed, then **`a6db73c`** after search a11y (`bc-bd2fe31d`)
> landed while this slot wrote.
> **Item:** **QA-010 remainder** — S-A1 on the next unblocked implemented
> screen. After SCR-13, SCR-02, SCR-03, SCR-04, SCR-05, SCR-06, and SCR-08,
> the inventory ranks **SCR-09** (`#/wallet`, wallet / 钱包) next among
> remaining numbered hash screens. SCR-07 history and search were in flight
> at pick and are now on `main`; this slot absorbed them and did not retake
> them. Deleting any of the ten required stems is red. Host stays jsdom, not
> TikTok WebView.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, history a11y
> (`968fd48` / `bc-1ed8782f` not retaken), search a11y (`a6db73c` /
> `bc-bd2fe31d` not retaken), remaining SCR/PNL fixtures (settings, panels),
> S-C4, protocol-C4 exit 3. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-7-backlog.md` ranks D-17 first (not a branch). Protocol-C4
交互验收单 is a named remainder, not an implement epic: 倍速 / scrub stay
X-26, tap pause is already on `main` at `c2f9700`. Rank 3 is the QA-010
remainder after SCR-03. SCR-08 favorites is already on `main` at `9d43445`.
C7-second (`bc-1ed8782f`) already owned SCR-07 history, so this slot skipped
it at pick and took the next unblocked implemented numbered hash screen:
**SCR-09 wallet**. Search (`bc-bd2fe31d`) was RUNNING at pick and is left;
it landed at `a6db73c` while this slot wrote and was absorbed, not retaken.
C4-03 / C4-07 stay skipped. No AM answers invented.

SCR-01 is an overlay. SCR-10 / SCR-11 are not product routes.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| Protocol-C4 tap pause | **On `main`** at `c2f9700`. Not retaken |
| QA-010 SCR-08 favorites | **On `main`** at `9d43445`. Not retaken |
| QA-010 SCR-07 history `bc-1ed8782f` | **RUNNING at pick.** File ownership skipped. **Landed** `968fd48` while this slot wrote. Absorbed, not retaken |
| QA-010 search `bc-bd2fe31d` | **RUNNING at pick.** File ownership skipped. **Landed** `a6db73c` while this slot wrote. Absorbed, not retaken |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| QA-010 SCR-13 + SCR-02 + SCR-03 + SCR-04 + SCR-05 + SCR-06 + SCR-08 | **On `main`** at pick |
| **QA-010 remainder SCR-09 wallet** | **This slot.** Next unblocked implemented screen after favorites, skipping in-flight history and search |

This slice does **not** claim protocol-C4 exit 3 closed. It does **not** claim
TikTok WebView.

---

## 2. What changed

`pnpm run check:a11y` still walks `packages/quality/a11y/screens/*.html`. After
absorbing history and search, the required stems are `scr-02-home`,
`scr-03-browse`, `scr-04-drama`, `scr-05-play`, `scr-06-profile`,
`scr-07-history`, `scr-08-favorites`, `scr-09-wallet`, `scr-search`, and
`scr-13-fallback`. A source that has the other nine but not wallet is red. The wallet fixture uses product English
copy and the honest empty-ledger chrome (`wallet-page` `data-state="empty"`,
back to `#/me`, known `0 coins`, empty state, disabled Top up). No `#/vip`.
No Beans. Body colors stay the passing pair; live `--accent` is not
remediated.

| File | Change |
| --- | --- |
| `packages/quality/a11y/screens/scr-09-wallet.html` | SCR-09 fixture (`lang="en"`, product body colors, empty chrome) |
| `packages/quality/src/a11y.ts` | Required stems include `scr-09-wallet` next to the landed nine |
| `docs/14-quality-gates.md` §2.1 / `docs/14-test-plan.md` §6.4 | Dated remainder notes |
| `docs/engineering/repo-layout.md` | Command comment names all ten stems |

`docs/plan/cycle-7-backlog.md` is not rewritten. `.github/` and player product
files are untouched. Wallet top-up stays disabled. `adUnlock` stays false. No
BytePlus `vid`. History and search fixtures were absorbed from `main`, not rewritten here.

---

## 3. Mutations that bite

Covered by the unit / CLI reverse path on this branch.

### 3.1 Required wallet stem deleted

```
required implemented-screen fixture missing: scr-09-wallet (host=jsdom, not TikTok WebView)
```

Exit 1.

### 3.2 White-on-white on the fallback fixture (stems still present)

Covered by the existing CLI / unit reverse path. Exit 1. A comment that names
WCAG is not this gate. Stdout on green says `10 screens` and
`host=jsdom, not TikTok WebView`.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-1ed8782f` C7-second / SCR-07 history | **Idle. Landed** `968fd48` / `docs/handoff/w20-c7-second.md`. History fixture not rewritten here |
| `bc-bd2fe31d` search a11y | **Idle. Landed** `a6db73c` / `docs/handoff/w20-a11y-search.md`. Search fixture not rewritten here |
| `bc-ecde45cf` tap-to-pause remainder | **Idle. Landed** `c2f9700`. Player files not edited here |

`git diff origin/main -- app/ server/ .github/` is empty of this slot's work
(after absorbing history).

---

## 5. Verify

`pnpm verify` exited 0 on this branch after merging `origin/main` (`a6db73c`,
SCR-07 and search already on main). L1 sequence is format → lint → typecheck →
check:commits → check:skips → check:audit → check:a11y → test:coverage →
check:coverage → build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `2 new commits vs origin/main, 0 prose, 0 missing-id` after absorbing search (merge commits skipped; unique commits carry `QA-010`) |
| G1.10 skips | `238 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (10 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,602 passing** — shared 63, quality 452, config 45, server 1,785, app 1,257. Coverage: global lines 94.37% (17892/18960), branches 90.89%, core 95.70%, **diff lines 100.00% (1/1)** |
| Build | pass — `index-DGRevdWg.js` 367.05 kB / 112.17 kB gzip (CN-10's client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall. jsdom still prints
`HTMLCanvasElement's getContext()` while axe attempts `color-contrast`; that is
incomplete, not a skip.

---

## 6. What is still open

- **S-A1 on every remaining SCR/PNL.** This slice adds SCR-09 only. SCR-07
  history and search are on `main`. SCR-12 settings and panels are later
  remainders.
- **S-A2 on live `app.css`.** `--accent` (#fe2c55) under white label text is
  below 4.5:1. Not remediated here; fixtures use passing body colors.
- **TikTok WebView.** Not claimed. PLY-002 still `unmeasured`.
- **Protocol-C4 exit 3.** Not closed. This is the named QA-010 remainder after
  favorites, absorbing landed history and search.
- **S-C4.** Required-checks vs GitHub branch protection. S-C3 echo-only already
  on `main`. D-17 still falsifies GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-7-backlog.md`.** Plan-slot file.

This slice does **not** claim protocol-C4 exit 3 closed. It is the named
QA-010 remainder that requires SCR-09 wallet next to SCR-02, SCR-03,
SCR-04, SCR-05, SCR-06, SCR-07, SCR-08, search, and SCR-13.
