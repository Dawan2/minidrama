# W20 — QA-010 remainder: require SCR-05 play next to drama

> **Slot:** W20, work slot (`bc-f6e4b6a7`). One leftover item, no pull request.
> **Branch:** `cursor/w20-work-a11y-play-72c4`, cut from `origin/main` at **`25a96b4`**
> (CN-10 start/switch timeout already on main). Fast-forwarded the drama remainder
> (`cursor/w20-work-a11y-drama-72c4`, SCR-04 already present) then absorbed
> `origin/main` as cycle-7 plan docs and the SCR-04 merge landed.
> **Item:** **QA-010 remainder** — S-A1 on the next listing-critical implemented
> screen. After SCR-13, SCR-02, SCR-03, and SCR-04, the inventory ranks **SCR-05**
> (`#/play/:episodeId`, player / 核心屏) next. Deleting any of the five required
> stems is red. Host stays jsdom, not TikTok WebView.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, cycle-7 plan docs
> (`bc-285529d4`), remaining SCR/PNL fixtures (profile, …), S-C4, protocol-C4
> exit 3. No pull request.

---

## 1. What was picked, and why

CN-10 is on `main` at `25a96b4`. `docs/plan/cycle-7-backlog.md` ranks D-17 first
(not a branch). Protocol-C4 交互验收单 is a named remainder, not an implement
epic. QA-010's smallest job and the SCR-02 / SCR-03 remainders were on `main`.
The drama sibling (`bc-afae2991`) already had SCR-04 on
`cursor/w20-work-a11y-drama-72c4`, so this slot adds **SCR-05 play**. C4-03 /
C4-07 stay skipped. Cycle-7 plan docs were in flight at pick and landed while
this slot ran; the plan file is not rewritten. TikTok WebView is not claimed.

The named remainder after drama is S-A1 on further implemented screens. SCR-01
is an overlay. SCR-10 / SCR-11 are not product routes. The test-plan / inventory
order after SCR-04 is SCR-05 play (核心屏), then profile. **Play is next and was
not already scanned.**

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| Cycle-7 plan docs `bc-285529d4` | **RUNNING at pick.** Left. Landed as `docs/plan/cycle-7-backlog.md` at `c965b15` while this slot ran |
| C4-remain playback / CN-10 | **On `main`** at `25a96b4` |
| QA-010 SCR-13 + SCR-02 + SCR-03 | **On `main`** at pick |
| QA-010 remainder SCR-04 drama `bc-afae2991` | **Already had SCR-04.** Landed on `main` at `ac8ff4d` while this slot ran |
| **QA-010 remainder SCR-05 play** | **This slot.** Required stems after drama are home + browse + drama + fallback |

This slice does **not** claim protocol-C4 exit 3 closed. It does **not** claim
TikTok WebView.

---

## 2. What changed

`pnpm run check:a11y` still walks `packages/quality/a11y/screens/*.html`. The
required stems are now `scr-02-home`, `scr-03-browse`, `scr-04-drama`,
`scr-05-play`, and `scr-13-fallback`. A source that has home, browse, drama, and
fallback but not play is red. The play fixture uses product English copy and the
playing-state chrome (`play-page`, back link, heading, VePlayer mount as an
empty container — no `<video>`, next-episode, episode picker). Body colors stay
the passing pair; live `--accent` is not remediated.

| File | Change |
| --- | --- |
| `packages/quality/a11y/screens/scr-05-play.html` | SCR-05 fixture (`lang="en"`, product body colors) |
| `packages/quality/src/a11y.ts` | Required stems include `scr-05-play` |
| `docs/14-quality-gates.md` §2.1 / `docs/14-test-plan.md` §6.4 | Dated remainder notes |
| `docs/engineering/repo-layout.md` | Command comment names all five stems |

`docs/plan/cycle-6-backlog.md` and `docs/plan/cycle-7-backlog.md` are not
rewritten. `.github/` and player product files are untouched. Wallet top-up
stays disabled. `adUnlock` stays false. No BytePlus `vid`.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 Required play stem deleted

```
required implemented-screen fixture missing: scr-05-play (host=jsdom, not TikTok WebView)
```

Exit 1.

### 3.2 White-on-white on the fallback fixture (stems still present)

```
a11y failed (1): axe-core critical/serious or contrast < 4.5:1 are QA-010 red (host=jsdom, not TikTok WebView)
  contrast … color-contrast html,
      body 1.00:1 < 4.5:1
```

Exit 1. A comment that names WCAG is not this gate. Stdout on green says
`5 screens` and `host=jsdom, not TikTok WebView`.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-afae2991` drama a11y | **Idle. Landed** `ac8ff4d` / `docs/handoff/w20-a11y-drama.md` (SCR-04). Drama fixture not edited here beyond requiring it |
| `bc-285529d4` cycle-7 plan docs | **Idle. Landed** `c965b15` / `docs/plan/cycle-7-backlog.md`. Plan files not rewritten |

`git diff origin/main -- app/ server/ .github/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch after absorbing `origin/main` (`ac8ff4d`,
SCR-04 then cycle-7). L1 sequence is format → lint → typecheck → check:commits →
check:skips → check:audit → check:a11y → test:coverage → check:coverage →
build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `2 new commits vs origin/main, 0 prose, 0 missing-id` (merge commits skipped; unique commits carry `QA-010` / `SCR-05`) |
| G1.10 skips | `237 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (5 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,580 passing** — shared 63, quality 437, config 45, server 1,785, app 1,250. Coverage: global lines 94.36% (17872/18940), branches 90.87%, core 95.70%, **diff lines 100.00% (1/1)** |
| Build | pass — `index-B2g09p35.js` 366.74 kB / 112.08 kB gzip (CN-10's client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,577 on `main` after
SCR-04 → 3,580 here; the extra tests are this remainder). jsdom still prints
`HTMLCanvasElement's getContext()` while axe attempts `color-contrast`; that
is incomplete, not a skip.

---

## 6. What is still open

- **S-A1 on every remaining SCR/PNL.** This slice adds SCR-05 only. SCR-06
  profile, SCR-07…SCR-09, SCR-12, and panels are later remainders. Of the
  listing-critical surfaces after play, profile is next.
- **S-A2 on live `app.css`.** `--accent` (#fe2c55) under white label text is
  below 4.5:1. Not remediated here; fixtures use passing body colors.
- **TikTok WebView.** Not claimed. PLY-002 still `unmeasured`.
- **Protocol-C4 exit 3.** Not closed. This is the named QA-010 remainder after
  drama.
- **S-C4.** Required-checks vs GitHub branch protection. S-C3 echo-only already
  on `main`. D-17 still falsifies GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **Cycle-7 plan docs** (`bc-285529d4`). Left; landed while this slot ran.
  Plan file not rewritten.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-6-backlog.md`.** Plan-slot file.

This slice does **not** claim protocol-C4 exit 3 closed. It is the named
QA-010 remainder that requires SCR-05 play next to SCR-02, SCR-03, SCR-04,
and SCR-13.
