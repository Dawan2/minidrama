# W20 — QA-010 remainder: require SCR-04 drama-detail next to browse

> **Slot:** W20, work slot (`bc-afae2991`). One leftover item, no pull request.
> **Branch:** `cursor/w20-work-a11y-drama-72c4`, cut from `origin/main` at **`c46bbf5`**
> (QA-010 remainder already requires SCR-02 home, SCR-03 browse, and SCR-13).
> Merged forward onto **`25a96b4`** (CN-10 start/switch timeout landed while this
> slot ran).
> **Item:** **QA-010 remainder** — S-A1 on the next listing-critical implemented
> screen. After SCR-13, SCR-02, and SCR-03, the inventory ranks **SCR-04**
> (`#/drama/:dramaId`, drama detail) next. Deleting any of the four required
> stems is red. Host stays jsdom, not TikTok WebView.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, C4-remain playback
> (`bc-7fbe0bc1`), cycle-7 plan docs (`bc-285529d4`), remaining SCR/PNL fixtures
> (play, profile, …), S-C4, protocol-C4 exit 3. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-6-backlog.md` ranks D-17 first (not a branch). Protocol-C4
交互验收单 is a named remainder, not an implement epic. QA-010's smallest job
and the SCR-02 / SCR-03 remainders are on `main` at `c46bbf5`. C4-03 / C4-07
stay skipped. C4-remain playback (`bc-7fbe0bc1`) and cycle-7 plan docs
(`bc-285529d4`) were in flight at pick; C4-remain landed as CN-10
(`25a96b4`) while this slot ran. Cycle-7 plan docs were left.

The named remainder after browse is S-A1 on further implemented screens. SCR-01
is an overlay. SCR-10 / SCR-11 are not product routes. The test-plan / inventory
order after SCR-03 is SCR-04 drama, then play (核心屏), then profile. **Drama
is next and was not already scanned.**

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| C4-remain playback `bc-7fbe0bc1` | **Left.** Landed as CN-10 / `docs/handoff/w20-c4-remain.md` at `25a96b4` while this slot ran |
| Cycle-7 plan docs `bc-285529d4` | **RUNNING.** Left |
| QA-010 SCR-13 + SCR-02 + SCR-03 | **On `main`** at `c46bbf5` |
| **QA-010 remainder SCR-04 drama** | **This slot.** Required stems were home + browse + fallback |

This slice does **not** claim protocol-C4 exit 3 closed. It does **not** claim
TikTok WebView.

---

## 2. What changed

`pnpm run check:a11y` still walks `packages/quality/a11y/screens/*.html`. The
required stems are now `scr-02-home`, `scr-03-browse`, `scr-04-drama`, and
`scr-13-fallback`. A source that has home, browse, and fallback but not drama
is red. The drama fixture uses product English copy and the ready-state chrome
(`drama-page`, back link, header, cover placeholder, Watch now, episode list).
Body colors stay the passing pair; live `--accent` is not remediated.

| File | Change |
| --- | --- |
| `packages/quality/a11y/screens/scr-04-drama.html` | SCR-04 fixture (`lang="en"`, product body colors) |
| `packages/quality/src/a11y.ts` | Required stems include `scr-04-drama` |
| `docs/14-quality-gates.md` §2.1 / `docs/14-test-plan.md` §6.4 | Dated remainder notes |
| `docs/engineering/repo-layout.md` | Command comment names all four stems |

`docs/plan/cycle-6-backlog.md` is not rewritten. `.github/` and player files
are untouched. Wallet top-up stays disabled. `adUnlock` stays false. No
BytePlus `vid`.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 Required drama stem deleted

```
required implemented-screen fixture missing: scr-04-drama (host=jsdom, not TikTok WebView)
```

Exit 1.

### 3.2 White-on-white on the fallback fixture (stems still present)

```
a11y failed (1): axe-core critical/serious or contrast < 4.5:1 are QA-010 red (host=jsdom, not TikTok WebView)
  contrast … color-contrast p 1.00:1 < 4.5:1
```

Exit 1. A comment that names WCAG is not this gate. Stdout on green says
`4 screens` and `host=jsdom, not TikTok WebView`.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-7fbe0bc1` C4-remain playback | **Idle. Landed** `25a96b4` / `docs/handoff/w20-c4-remain.md` (CN-10). Player files not edited here |
| `bc-285529d4` cycle-7 plan docs | **RUNNING.** `docs/plan/` not rewritten |

`git diff origin/main -- app/ server/ .github/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch after absorbing `origin/main` (`25a96b4`,
CN-10 start/switch timeout). L1 sequence is format → lint → typecheck →
check:commits → check:skips → check:audit → check:a11y → test:coverage →
check:coverage → build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `2 new commits vs origin/main, 0 prose, 0 missing-id` (merge commits skipped; unique commits carry `QA-010` / `SCR-04`) |
| G1.10 skips | `237 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (4 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,577 passing** — shared 63, quality 434, config 45, server 1,785, app 1,250. Coverage: global lines 94.36% (17871/18939), branches 90.87%, core 95.70%, **diff lines 100.00% (6/6)** |
| Build | pass — `index-B2g09p35.js` 366.74 kB / 112.08 kB gzip (CN-10's client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,560 on `main` after
SCR-03; CN-10 added player-start tests; 3,577 here includes this remainder's
three extra quality tests). jsdom still prints
`HTMLCanvasElement's getContext()` while axe attempts `color-contrast`; that
is incomplete, not a skip.

---

## 6. What is still open

- **S-A1 on every remaining SCR/PNL.** This slice adds SCR-04 only. SCR-05
  play, SCR-06 profile, SCR-07…SCR-09, SCR-12, and panels are later remainders.
  Of the listing-critical trio after browse, play then profile are next.
- **S-A2 on live `app.css`.** `--accent` (#fe2c55) under white label text is
  below 4.5:1. Not remediated here; fixtures use passing body colors.
- **TikTok WebView.** Not claimed. PLY-002 still `unmeasured`.
- **Protocol-C4 exit 3.** Not closed. This is the named QA-010 remainder after
  browse.
- **S-C4.** Required-checks vs GitHub branch protection. S-C3 echo-only already
  on `main`. D-17 still falsifies GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C4-remain playback** (`bc-7fbe0bc1`). Left; landed as CN-10 while this
  slot ran. **Cycle-7 plan docs** (`bc-285529d4`). In flight. Not this slot.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-6-backlog.md`.** Plan-slot file.

This slice does **not** claim protocol-C4 exit 3 closed. It is the named
QA-010 remainder that requires SCR-04 drama-detail next to SCR-02, SCR-03,
and SCR-13.
