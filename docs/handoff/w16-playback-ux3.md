# W16 — playback-ux3: drama-detail continue CTA (PRG-002 remainder)

> **Slot:** W16, work slot. One playback-experience slice, no pull request.
> **Branch:** `cursor/w16-work-playback-ux3-72c4`, cut from `origin/main` at **`33f347b`**,
> merged forward onto **`0cb0504`** (playback-ux swipe+autoplay and playback-ux2 cross-end both
> landed while this slot ran; merge was clean — no overlap with `DramaPage`).
> **Item:** the **third** unblocked protocol-C4 remainder after two W16 siblings:
> 1. `bc-2fd6c885` / `cursor/w16-work-playback-ux-72c4` — PLY-010 swipe + autoplay-on-ended (**landed**)
> 2. `bc-3c74c2c9` / `cursor/w16-work-playback-ux2-72c4` — PRG-001 cross-end conflict (**landed**)
> 3. **this slot** — PRG-002 remainder: SCR-04 Continue watching from `lastWatched`
> **Not in scope:** D-17 billing, G2.3, HOME `continue-rail` (`HomePage.tsx` / `home-feed.ts`),
> PlayerSurface / PlayPage / player-facade / episode-swipe / progress-heartbeat / advance-gate /
> app.css (sibling-owned), PNL-05 / `playbackRate` / 0.75 (X-26), axe-core, PLY-012 token
> re-issue, `#/vip`, `postgres:`, BytePlus ingest. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-5-backlog.md` ranks D-17 first (not code) and protocol-C4 播放体验 0/3 second.
The three protocol exits are interaction sheet, cross-end conflict, a11y. The first two W16
work siblings already started the first two exits. Their files are left alone.

PRG-002's HOME continue **UI** landed at `7ecca77`. The C5 plan is explicit that drama-detail
`lastWatched` stays unused and is **not** that rank: "Drama-detail continue CTA stays open."
SCR-04 (`docs/02-screen-inventory.md`) names the primary button 「立即观看/继续观看」. The
button on `main` was Watch now only, with a comment that inventing Continue would guess a
resume point.

Progress already exists: `GET /v1/progress/dramas/{dramaId}` returns `lastWatched`. PNL-01
already reads it for watched marks and deliberately ignores it as a range. Catalogue
`GET /v1/dramas/{id}` still ships `viewer.lastWatched: null`. Using that field would mean
Continue never appears. Using HOME's rail or watch-history would retake a landed slice.

This slice is file-isolated from the running player siblings.

---

## 2. What changed

Continue is a pointer. The href is `playPath(lastWatched.episodeId)`. Resume position is
still `descriptor.resumePositionSec` → VePlayer `startTime` on PlayPage, which this slot
does not edit. `positionSec` does not go on the URL.

Fail-closed:

| Progress view | Button |
|---|---|
| `lastWatched` object | Continue episode {n} → that id, even if the loaded page has no navigable row |
| `lastWatched: null` (signed in, never watched) | Watch now → first openable, or omit |
| in flight / 401 / offline / malformed | Watch now. Not a guessed continue. No extra retry chrome |

Catalogue `viewer.lastWatched` is not read. A test that populates it still shows Watch now
when the progress stub is empty.

| File | Change |
|---|---|
| `app/src/catalog/drama-continue-cta.ts` | Pure Watch now / Continue decision |
| `app/src/catalog/drama-continue-cta.test.ts` | Decision + source constraints (no HOME retake, no player files, no BytePlus / `#/vip` / `postgres:`) |
| `app/src/routes/DramaPage.tsx` | Third additive read: `fetchDramaProgress`. CTA testids `continue-watching` / `watch-now` |
| `app/src/routes/DramaPage.test.tsx` | Pointer vs range vs catalogue field vs 401/offline |
| `app/src/core/i18n/locales/en.json` | `drama.continueWatching` |
| `app/src/core/i18n/locales/ar.json` | same key, parity |

`app.css` is unchanged (sibling-owned). The existing `.drama-header__cta` class is reused.

---

## 3. Reverse verification

Mutations that bite, then restored:

### 3.1 Catalogue `viewer.lastWatched` as the CTA source

A stub that fills the catalogue field and leaves progress empty must still show Watch now.
If DramaPage read `drama.viewer.lastWatched`, `continue-watching` would appear at
`/play/ep_from_catalogue`.

### 3.2 `lastWatched.episodeNumber` as a range

Progress `{ lastWatched: episode 3 }` with episodes 1–3 loaded must href `/play/ep_test_0003`,
not episode 1. Inferring "everything before 3" is the skip-marks bug PNL-01 already forbids.

### 3.3 `positionSec` on the URL

Continue href is `/play/ep_test_0007`. Matching `position`, `42`, or `startTime` is red.

---

## 4. Conflict register

| # | Conflict | Owner | Recommendation |
|---|---|---|---|
| Sibling files | `PlayerSurface`, `PlayPage`, `player-facade`, `episode-swipe`, `progress-heartbeat`, `advance-gate`, `app.css` | `bc-2fd6c885`, `bc-3c74c2c9` | Left untouched. Both siblings **landed** on `main` at `0cb0504` while this slot ran. Merge of that tree into this branch was clean |
| X-26 | 倍速 0.75 vs PNL-05 1.0 ladder | P1 / P2 | Not picked. No playbackRate constant |
| Catalogue `viewer.lastWatched` still always null | Slot B, if progress is ever folded into `GET /v1/dramas/{id}` | Do not treat that fold as this CTA; the progress batch is the live source |

---

## 5. Verify

`pnpm verify` on this branch before the sibling merge-forward: format, lint, typecheck, coverage, build, guardrails green. App 1,146 tests (includes the 9 continue-cta tests and 7 new DramaPage cases). Coverage gate: global lines 94.08%, diff lines 100.00% (35/35). Re-run after merging `0cb0504`.

---

## 6. Blockers / not done

- Protocol-C4 exits still 0/3. This is not the interaction sheet, not the two-device case, not a11y.
- PLY-010 tap pause/resume, double-tap favourite, scrub, 倍速: not this slice. Player files were sibling-owned at pick; they are now on `main`.
- PLY-012 token re-issue: still open.
- Catalogue still returns `lastWatched: null` on the detail payload. Not folded here.
- D-17: GitHub still cannot start jobs. Local `pnpm verify` is not R6.
- No BytePlus vid, no `postgres:` rewrite, no `#/vip`.

---

## 7. For the next slot

Tap pause/resume is the first remaining PLY-010 row. Player files are on `main` as of `0cb0504`.
Do not retake swipe, autoplay-on-ended, cross-end heartbeats, HOME `continue-rail`, or this
drama-detail CTA.
