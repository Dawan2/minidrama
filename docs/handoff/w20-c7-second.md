# W20 — C7 second work: require SCR-07 history next to drama

> **Slot:** W20, work slot (`bc-1ed8782f`). One leftover item, no pull request.
> **Branch:** `cursor/w20-work-c7-second-72c4`, cut from `origin/main` at **`ac8ff4d`**
> (QA-010 remainder already requires SCR-02 home, SCR-03 browse, SCR-04 drama,
> and SCR-13).
> Merged forward onto **`b34ef5b`** (SCR-05 play), **`a49ebd7`** (SCR-06
> profile), then **`c2f9700`** (SCR-08 favorites + PLY-010 tap-pause).
> **Item:** **QA-010 remainder** — S-A1 on the **second** unblocked C7 screen.
> After SCR-04, inventory order is SCR-05 play, SCR-06 profile (first C7,
> `bc-22d4f29b`), then **SCR-07** (`#/history`, continue watching). Combined
> required stems are eight. Host stays jsdom, not TikTok WebView.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, first C7
> `bc-22d4f29b`, play a11y `bc-f6e4b6a7`, remaining SCR/PNL fixtures
> (wallet, settings, panels), S-C4, protocol-C4 exit 3.
> No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-7-backlog.md` ranks D-17 first (not a branch). Protocol-C4
交互验收单 is a named remainder, not an implement epic. QA-010's smallest job
plus SCR-02 / SCR-03 / SCR-04 are on `main` at `ac8ff4d`. C4-03 / C4-07 stay
skipped. Play-screen a11y (`bc-f6e4b6a7`) owns `check:a11y` until SCR-05
lands; left. First C7 (`bc-22d4f29b`) takes the next unblocked screen after
that skip — SCR-06 profile; left.

The named remainder after drama, skipping play, is S-A1 on further
implemented screens. SCR-01 is an overlay. SCR-10 / SCR-11 are not product
routes. Inventory order after play is profile, then history. **History is
the second unblocked C7 screen and was not already scanned.**

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| Play a11y `bc-f6e4b6a7` | **RUNNING.** Owns `check:a11y` until SCR-05 lands. Left |
| First C7 `bc-22d4f29b` | **RUNNING.** SCR-06 profile. Left |
| QA-010 SCR-13 + SCR-02 + SCR-03 + SCR-04 | **On `main`** at `ac8ff4d` |
| **QA-010 remainder SCR-07 history** | **This slot.** Required stems were home + browse + drama + fallback |

This slice does **not** claim protocol-C4 exit 3 closed. It does **not** claim
TikTok WebView. Play and profile fixtures were absorbed from siblings, not
authored here.

---

## 2. What changed

`pnpm run check:a11y` still walks `packages/quality/a11y/screens/*.html`. The
required stems started as `scr-02-home`, `scr-03-browse`, `scr-04-drama`,
`scr-07-history`, and `scr-13-fallback` (play and profile were in flight). A
source that has home, browse, drama, and fallback but not history is red. The
history fixture uses product English copy and the empty-state chrome
(`history-page`, back link, heading, empty copy, Find something to watch).
Body colors stay the passing pair; live `--accent` is not remediated.

| File | Change |
| --- | --- |
| `packages/quality/a11y/screens/scr-07-history.html` | SCR-07 fixture (`lang="en"`, product body colors) |
| `packages/quality/src/a11y.ts` | Required stems include `scr-07-history` |
| `docs/14-quality-gates.md` §2.1 / `docs/14-test-plan.md` §6.4 | Dated remainder notes |
| `docs/engineering/repo-layout.md` | Command comment names the required stems |

`docs/plan/cycle-7-backlog.md` is not rewritten. `.github/` and player files
are untouched. Wallet top-up stays disabled. `adUnlock` stays false. No
BytePlus `vid`.

---

## 3. Mutations that bite

Run against this branch, then restored.

### 3.1 Required history stem deleted

```
required implemented-screen fixture missing: scr-07-history (host=jsdom, not TikTok WebView)
```

Exit 1.

### 3.2 White-on-white on the fallback fixture (stems still present)

Covered by the existing CLI test (injected contrast on the fallback body while
the required stems are present):

```
a11y failed (1): axe-core critical/serious or contrast < 4.5:1 are QA-010 red (host=jsdom, not TikTok WebView)
  contrast … color-contrast p 1.00:1 < 4.5:1
```

Exit 1. A comment that names WCAG is not this gate. Stdout on green after
absorbing play, profile, and favorites says `8 screens` and
`host=jsdom, not TikTok WebView`.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-f6e4b6a7` play-screen a11y | **Idle. Landed** `b34ef5b` / `docs/handoff/w20-a11y-play.md`. Play fixture not authored here |
| `bc-22d4f29b` first C7 | **Idle. Landed** `a49ebd7` / `docs/handoff/w20-c7-first.md`. Profile fixture not authored here |
| C7 follow SCR-08 | **Idle. Landed** `9d43445` / `docs/handoff/w20-c7-follow.md` while this slot absorbed. Favorites fixture not authored here |
| `bc-afae2991` drama a11y | **Idle. Landed** `ac8ff4d` / `docs/handoff/w20-a11y-drama.md` before this cut |
| tap-pause PLY-010 | **Idle. Landed** `e0765ab` / `docs/handoff/w20-tap-pause.md`. Player files not authored here |

`git diff origin/main -- app/ server/ .github/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch (`ac8ff4d` + this remainder). L1 sequence
is format → lint → typecheck → check:commits → check:skips → check:audit →
check:a11y → test:coverage → check:coverage → build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `3 new commits vs origin/main, 0 prose, 0 missing-id` (merge commits skipped; unique commits carry `QA-010` / `SCR-07`) |
| G1.10 skips | `237 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (5 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,580 passing** — shared 63, quality 437, config 45, server 1,785, app 1,250. Coverage: global lines 94.36% (17872/18940), branches 90.87%, core 95.70%, **diff lines 100.00% (1/1)** |
| Build | pass — `index-B2g09p35.js` 366.74 kB / 112.08 kB gzip (CN-10's client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,577 on `main` after
SCR-04; 3,580 here is three extra quality tests). jsdom still prints
`HTMLCanvasElement's getContext()` while axe attempts `color-contrast`; that
is incomplete, not a skip.

---

## 6. What is still open

- **S-A1 on every remaining SCR/PNL.** This slice adds SCR-07 only. SCR-05
  play, SCR-06 profile, and SCR-08 favorites landed on `main` while this
  slot absorbed. SCR-09, SCR-12, and panels are later remainders. Do not
  retake play, profile, or favorites fixtures.
- **S-A2 on live `app.css`.** `--accent` (#fe2c55) under white label text is
  below 4.5:1. Not remediated here; fixtures use passing body colors.
- **TikTok WebView.** Not claimed. PLY-002 still `unmeasured`.
- **Protocol-C4 exit 3.** Not closed. This is the named second C7 QA-010
  remainder after drama, skipping play.
- **S-C4.** Required-checks vs GitHub branch protection. S-C3 echo-only already
  on `main`. D-17 still falsifies GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-7-backlog.md`.** Plan-slot file.

This slice does **not** claim protocol-C4 exit 3 closed. Combined stems after
absorb are SCR-02, SCR-03, SCR-04, SCR-05, SCR-06, SCR-07, SCR-08, and SCR-13.

---

## 7. Post-merge

Absorbed `origin/main` **`b34ef5b`** (W20 QA-010 SCR-05 play remainder,
`bc-f6e4b6a7`) after the first verify. Required stems are now home, browse,
drama, play, history, and fallback. `pnpm verify` exited 0 again:

- commits: `3 new commits vs origin/main, 0 prose, 0 missing-id` (merge skipped)
- skips: 237 files, 0 skips
- a11y: **6 screens** (SCR-13 + SCR-02 + SCR-03 + SCR-04 + SCR-05 + SCR-07)
- tests: **3,583 passing** — shared 63, quality 440, config 45, server 1,785, app 1,250
- coverage: global lines 94.36% (17873/18941), diff lines 100.00% (1/1)
- build: `index-B2g09p35.js` 366.74 kB / 112.08 kB gzip

Play files were not retaken beyond combining `REQUIRED_SCREEN_STEMS`. First C7
(`bc-22d4f29b`, SCR-06 profile) was still not on `main` at this absorb.

Absorbed `origin/main` **`a49ebd7`** (W20 QA-010 SCR-06 profile remainder,
`bc-22d4f29b`) next. Required stems are now home, browse, drama, play,
profile, history, and fallback. `pnpm verify` exited 0:

- commits: `4 new commits vs origin/main, 0 prose, 0 missing-id` (merges skipped)
- skips: 237 files, 0 skips
- a11y: **7 screens** (SCR-13 + SCR-02 + SCR-03 + SCR-04 + SCR-05 + SCR-06 + SCR-07)
- tests: **3,586 passing** — shared 63, quality 443, config 45, server 1,785, app 1,250
- coverage: global lines 94.36% (17874/18942), diff lines 100.00% (1/1)
- build: `index-B2g09p35.js` 366.74 kB / 112.08 kB gzip

Profile files were not retaken beyond combining `REQUIRED_SCREEN_STEMS`.

Absorbed `origin/main` **`c2f9700`** (SCR-08 favorites remainder + PLY-010
tap-pause) next. Required stems are now home, browse, drama, play, profile,
history, favorites, and fallback. `pnpm verify` exited 0:

- commits: `5 new commits vs origin/main, 0 prose, 0 missing-id` (merges skipped)
- skips: 238 files, 0 skips
- a11y: **8 screens** (SCR-13 + SCR-02 + SCR-03 + SCR-04 + SCR-05 + SCR-06 + SCR-07 + SCR-08)
- tests: **3,596 passing** — shared 63, quality 446, config 45, server 1,785, app 1,257
- coverage: global lines 94.37% (17890/18958), diff lines 100.00% (1/1)
- build: `index-DGRevdWg.js` 367.05 kB / 112.17 kB gzip (PLY-010's client; this slot did not edit product UI)

Favorites and tap-pause files were not retaken beyond combining
`REQUIRED_SCREEN_STEMS`. Protocol-C4 exit 3 is still not closed.
