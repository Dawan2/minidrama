# W20 — QA-010 remainder: require search next to favorites and history

> **Slot:** W20, work slot (`bc-bd2fe31d`). One leftover item, no pull request.
> **Branch:** `cursor/w20-work-a11y-search-72c4`, cut from `origin/main` at **`c2f9700`**
> (QA-010 remainder already requires SCR-08 favorites). Absorbed **`968fd48`**
> (SCR-07 history) while this slot wrote.
> **Item:** **QA-010 remainder** — S-A1 on the next unblocked implemented
> screen. After SCR-13, SCR-02, SCR-03, SCR-04, SCR-05, SCR-06, and SCR-08,
> the inventory's remaining named hash screens start with history then
> **search** (`#/search`, SCR-03's search half — no SCR number of its own).
> SCR-07 history was in flight on C7-second (`bc-1ed8782f`) at pick and
> landed on `main` at `968fd48` while this slot wrote; it is required here
> because this branch absorbed that landing, not because this slot authored
> it. Deleting any of the nine required stems is red. Host stays jsdom, not
> TikTok WebView.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, tap pause
> (`bc-ecde45cf`, already on `main`), remaining SCR/PNL fixtures (wallet,
> settings, panels), S-C4, protocol-C4 exit 3. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-7-backlog.md` ranks D-17 first (not a branch). Protocol-C4
交互验收单 is a named remainder, not an implement epic: 倍速 / scrub stay
X-26, tap pause is VePlayer-owned and already on `main` (`e0765ab` /
`bc-ecde45cf`). Rank 3 is the QA-010 remainder after SCR-08. C7-second
(`bc-1ed8782f`) already owned SCR-07 history on
`cursor/w20-work-c7-second-72c4` at pick, so this slot skipped it and took
the next unblocked implemented named hash screen: **search**. C4-03 /
C4-07 stay skipped. No AM answers invented.

SCR-01 is an overlay. SCR-10 / SCR-11 are not product routes. Search is
the implemented `#/search` surface (SCR-03's search half), not a new
numbered SCR.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| Protocol-C4 tap pause `bc-ecde45cf` | **Idle / landed** `e0765ab`. Left. Not a competing pause |
| QA-010 SCR-08 favorites | **On `main`** at `4908961` / `9d43445`. Not retaken |
| QA-010 SCR-07 history `bc-1ed8782f` | **RUNNING at pick.** File ownership skipped. Landed `968fd48` while this slot wrote; absorbed, not authored |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| QA-010 SCR-13 + SCR-02 + SCR-03 + SCR-04 + SCR-05 + SCR-06 + SCR-08 | **On `main`** at pick |
| **QA-010 remainder search** | **This slot.** Next unblocked implemented screen after favorites/history |

This slice does **not** claim protocol-C4 exit 3 closed. It does **not** claim
TikTok WebView.

---

## 2. What changed

`pnpm run check:a11y` still walks `packages/quality/a11y/screens/*.html`. The
required stems are `scr-02-home`, `scr-03-browse`, `scr-04-drama`,
`scr-05-play`, `scr-06-profile`, `scr-07-history`, `scr-08-favorites`,
`scr-search`, and `scr-13-fallback`. A source that has the other eight but
not search is red. The search fixture uses product English copy and the
honest idle chrome (`search-page`, back to `#/home`, `role="search"` field
with accessible name, idle prompt). No `#/vip`. Body colors stay the
passing pair; live `--accent` is not remediated.

| File | Change |
| --- | --- |
| `packages/quality/a11y/screens/scr-search.html` | Search fixture (`lang="en"`, product body colors, idle chrome) |
| `packages/quality/src/a11y.ts` | Required stems include `scr-search` next to the landed eight |
| `docs/14-quality-gates.md` §2.1 / `docs/14-test-plan.md` §6.4 | Dated remainder notes |
| `docs/engineering/repo-layout.md` | Command comment names all nine stems |

`docs/plan/cycle-7-backlog.md` is not rewritten. `.github/` and player product
files are untouched. Wallet top-up stays disabled. `adUnlock` stays false. No
BytePlus `vid`. History fixture was not authored here; it arrived via absorb
of `968fd48`.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 Required search stem deleted

```
required implemented-screen fixture missing: scr-search (host=jsdom, not TikTok WebView)
```

Exit 1.

### 3.2 White-on-white on the fallback fixture (stems still present)

Covered by the existing CLI / unit reverse path. Exit 1. A comment that names
WCAG is not this gate. Stdout on green says `9 screens` and
`host=jsdom, not TikTok WebView`.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-1ed8782f` C7-second / SCR-07 history | **RUNNING at pick. Landed** `968fd48` / `docs/handoff/w20-c7-second.md` while this slot wrote. History fixture not authored here; required because absorb kept it |
| `bc-ecde45cf` tap-to-pause remainder | **Idle. Landed** `e0765ab` / `docs/handoff/w20-tap-pause.md`. Player files not edited here |
| `bc-4a86d4f3` C7 follow / SCR-08 favorites | **Idle. Landed** `9d43445` / `docs/handoff/w20-c7-follow.md`. Favorites fixture not rewritten here |

`git diff origin/main -- app/ server/ .github/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch against `origin/main` (`968fd48`,
SCR-07 already on main, absorbed). L1 sequence is format → lint →
typecheck → check:commits → check:skips → check:audit → check:a11y →
test:coverage → check:coverage → build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `2 new commits vs origin/main, 0 prose, 0 missing-id` at the product SHA (merge commits skipped; unique commits carry `QA-010`) |
| G1.10 skips | `238 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (9 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,599 passing** — shared 63, quality 449, config 45, server 1,785, app 1,257. Coverage: global lines 94.37% (17891/18959), branches 90.88%, core 95.70%, **diff lines 100.00% (1/1)** |
| Build | pass — `index-DGRevdWg.js` 367.05 kB / 112.17 kB gzip (CN-10's client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,586 on `main`
after SCR-08; history then search added quality tests). jsdom still prints
`HTMLCanvasElement's getContext()` while axe attempts `color-contrast`; that
is incomplete, not a skip.

---

## 6. What is still open

- **S-A1 on every remaining SCR/PNL.** This slice adds search only. SCR-09
  wallet, SCR-12 settings, and panels are later remainders.
- **S-A2 on live `app.css`.** `--accent` (#fe2c55) under white label text is
  below 4.5:1. Not remediated here; fixtures use passing body colors.
- **TikTok WebView.** Not claimed. PLY-002 still `unmeasured`.
- **Protocol-C4 exit 3.** Not closed. This is the named QA-010 remainder after
  favorites/history.
- **S-C4.** Required-checks vs GitHub branch protection. S-C3 echo-only already
  on `main`. D-17 still falsifies GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-7-backlog.md`.** Plan-slot file.

This slice does **not** claim protocol-C4 exit 3 closed. It is the named
QA-010 remainder that requires search next to SCR-02, SCR-03, SCR-04,
SCR-05, SCR-06, SCR-07, SCR-08, and SCR-13.
