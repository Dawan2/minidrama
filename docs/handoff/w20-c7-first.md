# W20 — QA-010 remainder: require SCR-06 profile next to play

> **Slot:** W20, work slot (`bc-22d4f29b`). One leftover item, no pull request.
> **Branch:** `cursor/w20-work-c7-first-72c4`, cut from `origin/main` at **`c965b15`**
> (cycle-7 backlog already on main). Absorbed `origin/main` **`b34ef5b`** after
> drama (`bc-afae2991`) and play (`bc-f6e4b6a7`) landed while this slot wrote.
> **Item:** **QA-010 remainder** — S-A1 on the next unblocked implemented
> screen. After SCR-13, SCR-02, SCR-03, and the in-flight drama / play scans,
> the inventory ranks **SCR-06** (`#/me`, profile / 我的) next among remaining
> hash screens. Deleting any of the six required stems is red. Host stays
> jsdom, not TikTok WebView.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, drama a11y file
> ownership (`bc-afae2991`), play a11y file ownership (`bc-f6e4b6a7`),
> remaining SCR/PNL fixtures (history, favorites, wallet, settings, panels),
> S-C4, protocol-C4 exit 3. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-7-backlog.md` ranks D-17 first (not a branch). Protocol-C4
交互验收单 is a named remainder, not an implement epic: 倍速 / scrub stay
X-26, tap pause is VePlayer-owned, CN-10 / stall / PLY-011 / PLY-012 are on
`main`. Rank 3 is the QA-010 remainder after SCR-03. Drama (`bc-afae2991`)
and play (`bc-f6e4b6a7`) already owned those fixtures, so this slot skipped
them and took the next unblocked implemented numbered hash screen: **SCR-06
profile**. C4-03 / C4-07 stay skipped. No AM answers invented.

SCR-01 is an overlay. SCR-10 / SCR-11 are not product routes.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| Protocol-C4 交互验收单 | Rank 2. Named remainders on `main`. 倍速 / scrub / tap pause not picked |
| QA-010 drama `bc-afae2991` | **RUNNING at pick.** File ownership skipped. **Landed** `ac8ff4d` / `b34ef5b` while this slot wrote |
| QA-010 play `bc-f6e4b6a7` | **RUNNING at pick.** File ownership skipped. **Landed** `a7b00f2` / `b34ef5b` while this slot wrote |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| QA-010 SCR-13 + SCR-02 + SCR-03 | **On `main`** at pick |
| **QA-010 remainder SCR-06 profile** | **This slot.** Next unblocked implemented screen after browse, skipping in-flight drama and play |

This slice does **not** claim protocol-C4 exit 3 closed. It does **not** claim
TikTok WebView.

---

## 2. What changed

`pnpm run check:a11y` still walks `packages/quality/a11y/screens/*.html`. After
absorbing drama and play, the required stems are `scr-02-home`,
`scr-03-browse`, `scr-04-drama`, `scr-05-play`, `scr-06-profile`, and
`scr-13-fallback`. A source that has the other five but not profile is red.
The profile fixture uses product English copy and the honest guest chrome
(`profile-page`, identity, sign-in prompt, entries). No `#/vip`. Body colors
stay the passing pair; live `--accent` is not remediated.

| File | Change |
| --- | --- |
| `packages/quality/a11y/screens/scr-06-profile.html` | SCR-06 fixture (`lang="en"`, product body colors, guest chrome) |
| `packages/quality/src/a11y.ts` | Required stems include `scr-06-profile` next to the landed five |
| `docs/14-quality-gates.md` §2.1 / `docs/14-test-plan.md` §6.4 | Dated remainder notes |
| `docs/engineering/repo-layout.md` | Command comment names all six stems |

`docs/plan/cycle-7-backlog.md` is not rewritten. `.github/` and player product
files are untouched. Wallet top-up stays disabled. `adUnlock` stays false. No
BytePlus `vid`. Drama and play fixtures were absorbed from `main`, not rewritten
here.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 Required profile stem deleted

```
required implemented-screen fixture missing: scr-06-profile (host=jsdom, not TikTok WebView)
```

Exit 1.

### 3.2 White-on-white on the fallback fixture (stems still present)

Covered by the existing CLI / unit reverse path. Exit 1. A comment that names
WCAG is not this gate. Stdout on green says `6 screens` and
`host=jsdom, not TikTok WebView`.

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-afae2991` drama a11y | **Idle. Landed** `ac8ff4d` / `docs/handoff/w20-a11y-drama.md` (SCR-04). Drama fixture not edited here |
| `bc-f6e4b6a7` play a11y | **Idle. Landed** `a7b00f2` / `docs/handoff/w20-a11y-play.md` (SCR-05). Play fixture not edited here |

`git diff origin/main -- app/ server/ .github/` is empty of this slot's work
(after absorbing their landings).

---

## 5. Verify

`pnpm verify` exited 0 on this branch after merging `origin/main` (`b34ef5b`,
SCR-04 then SCR-05). L1 sequence is format → lint → typecheck → check:commits →
check:skips → check:audit → check:a11y → test:coverage → check:coverage →
build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `1 new commits vs origin/main, 0 prose, 0 missing-id` at the product SHA (merge commits skipped; unique commit carries `QA-010`) |
| G1.10 skips | `237 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (6 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,583 passing** — shared 63, quality 440, config 45, server 1,785, app 1,250. Coverage: global lines 94.36% (17873/18941), branches 90.87%, core 95.70%, **diff lines 100.00% (1/1)** |
| Build | pass — `index-B2g09p35.js` 366.74 kB / 112.08 kB gzip (CN-10's client; this slot did not edit product UI) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,580 on `main` after
SCR-05 → 3,583 here; the extra tests are this remainder). jsdom still prints
`HTMLCanvasElement's getContext()` while axe attempts `color-contrast`; that
is incomplete, not a skip.

---

## 6. What is still open

- **S-A1 on every remaining SCR/PNL.** This slice adds SCR-06 only. SCR-07
  history, SCR-08 favorites, SCR-09 wallet, SCR-12 settings, and panels are
  later remainders.
- **S-A2 on live `app.css`.** `--accent` (#fe2c55) under white label text is
  below 4.5:1. Not remediated here; fixtures use passing body colors.
- **TikTok WebView.** Not claimed. PLY-002 still `unmeasured`.
- **Protocol-C4 exit 3.** Not closed. This is the named QA-010 remainder after
  play.
- **S-C4.** Required-checks vs GitHub branch protection. S-C3 echo-only already
  on `main`. D-17 still falsifies GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-7-backlog.md`.** Plan-slot file.

This slice does **not** claim protocol-C4 exit 3 closed. It is the named
QA-010 remainder that requires SCR-06 profile next to SCR-02, SCR-03, SCR-04,
SCR-05, and SCR-13.
