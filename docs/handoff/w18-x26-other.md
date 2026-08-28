# W18 — X-26 remainder: VePlayer-owned 倍速 (playbackrate plugin kept)

> **Slot:** W18, work slot. One protocol-C4 sheet remainder, no pull request.
> **Branch:** `cursor/w18-work-x26-other-72c4`, cut from `origin/main` at **`7ce0fd0`**
> (W18 stall handoff post-merge verify numbers).
> **Item:** **倍速** — `01-product-scope` §4.3 speed control. VePlayer constructor
> `ignores` matches the official immersive sample **minus** `playbackrate`
> (`sitemap-and-ia.md` §4.1: un-ignore later without an IA change). The plugin owns
> the ladder. No competing PNL-05, no HTML media rate, no BytePlus `vid`.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, QA-010 (landed
> `3e8bdb2`), stall chrome (on `main` at `7ce0fd0`), scrub / progress inference
> (sibling `bc-c68b4e10` / `cursor/w18-work-x26-72c4`). No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-6-backlog.md` ranks D-17 first (not code) and protocol-C4 交互验收单
second. Remaining named sheet halves at pick: **倍速** and **scrub**. Sibling
`bc-c68b4e10` (`cursor/w18-work-x26-72c4`) took **scrub** (progress plugin kept by
omission, seek inference, horizontal drag is not 切集) and left `playbackrate` in
`ignores`. This slot takes **倍速**.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| QA-010 axe-core | **Landed** `3e8bdb2`. Not retaken |
| S7 stall chrome | **On `main`** at `7ce0fd0`. Not retaken |
| Scrub / progress plugin | Sibling `cursor/w18-work-x26-72c4`. **Left.** Do not retake seek inference |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| C6-next `bc-19bb7d97` | Not this slot |
| **PLY-010 倍速** | **This slot.** Plugin-owned rate control. VePlayer APIs only |

PNL-05 stays deleted. AC-PL-6: the app renders no competing speed control. X-26
(scope ladder vs inventory ladder) is **not** closed by a client constant: the
plugin owns the rates, so this slice never picks 0.75.

---

## 2. What changed

Constructor `ignores` matches the official immersive sample, **minus** `playbackrate`
— 倍速 is kept by omission. `closeVideoClick: false` / `closeVideoDblclick: true` so
tap-pause stays VePlayer's and double-tap 点赞 stays ours.

| File | Change |
| --- | --- |
| `app/src/player/veplayer-plugins.ts` | `VEPLAYER_IGNORED_PLUGINS`; `playbackrate` kept by omission |
| `app/src/player/veplayer-types.ts` | `ignores`, `closeVideoClick`, `closeVideoDblclick` |
| `app/src/player/player-facade.ts` | Forwards the plugin policy |
| `app/src/player/mock-veplayer.ts` | `data-veplayer-playbackrate="kept"` |
| `app/src/styles/app.css` | Comment: playbackrate plugin stays VePlayer's |

No HTML media rate field. No `<select>`. No `<video>`. No `vid_demo_`. No 0.75
constant. Sibling's seek-inference / horizontal-scrub files are untouched.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 `ignores` lists `playbackrate`

```
FAIL  keeps playbackrate by not listing it, so 倍速 stays plugin-owned
expected [ … 'playbackrate' … ] not to contain 'playbackrate'
```

### 3.2 A client rate field is forwarded on the constructor

```
FAIL  keeps the playbackrate plugin and does not invent a client rate ladder
expected true to be false
```

### 3.3 A competing panel is rendered

```
FAIL  keeps the playbackrate plugin and does not render a competing 倍速 panel
expected <element> not to be null
```

---

## 4. In-flight compose

| Who | Overlap |
| --- | --- |
| `bc-c68b4e10` scrub | **RUNNING.** Same `veplayer-plugins.ts` / facade / types / mock. Their list still includes `playbackrate`. Compose: keep **both** progress (never listed) and `playbackrate` (never listed). Do not restore the sample's rate ignore |
| `bc-402f89a0` stall | **Landed** `7ce0fd0`. `PlayerSurface.tsx` stall overlay kept. This slot does not retake it |
| `bc-19bb7d97` C6-next | **RUNNING.** Not this slice |

G2.3 stays the L2 `smoke` job. D-17 is still billing. No BytePlus ingest ids.

---

## 5. Verify

`pnpm verify` after the unique product commit. Numbers in the following commit /
this file's postscript.

Native `<video>` remains absent. Rate plugin is kept. Progress inference stays the
sibling's.

---

## 6. What is still open

- **Scrub inference.** Sibling `cursor/w18-work-x26-72c4`. Horizontal drag as not-切集
  is not on this tip.
- **Full 交互验收单.** Tap pause stays VePlayer-owned. Sheet is not 全过.
- **X-26 as a P1/P2 write.** This slice does not amend `01-product-scope` or
  inventory. It refuses a client constant.
- **D-17** GitHub Actions billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.

This slice does **not** claim protocol-C4 exit 1 closed. It is the named remaining
倍速 half of the sheet.
