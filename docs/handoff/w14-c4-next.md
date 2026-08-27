# W14 — C4 next: L2 G2.6 artifact budget

> **Slot:** W14, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w14-work-c4-next-72c4`.
> **Item:** `C4-02` remainder / `INF-007`, the G2.6 slice. Next unblocked C4 engineering after
> C4-01, C4-02 G2.7, D-16, playNext lock, G2.2, and in-flight C4-05 (landed as `652cc69` while
> this slot ran). D-07 was assigned to `bc-1f0c1f6d` and no-op'd — C4-01 already had it.
> **Not in scope:** C4-01, C4-02 G2.7, D-16 PlayPage, D-07, G2.2 (already on main as
> `check:integration`), C4-05 identity-port, playNext product files, G2.3 Playwright, G2.4/G2.5
> Semgrep/trivy. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` C4-02 names remaining L2 after G2.7: G2.2, then G2.6, then G2.3,
then G2.4/G2.5. G2.2 landed on `main` as `check:integration` while this slot's first draft was
still named `check-integrate`. That duplicate was dropped (`8ee834c`). C4-05 (`bc-f876a9e9`)
had the OAuth exchange. The next local unblocked slice was **G2.6**.

The ZIP cap (20 MB internal / 200 MB official) and the first-screen JS gzip cap (300 KB) are
already numbers in `docs/03-nonfunctional.md` §2. G2.6 (`docs/14-quality-gates.md` §4) also
names empty files, debug-symbol stripping, and debug/test backdoors. What was missing is the
**job**.

L2 stays a second workflow. Folding the budget into `pnpm verify` would mix the levels the way
folding G2.8, G2.7, or G2.2 would have. `.github/workflows/ci.yml` is byte-identical to
`origin/main`. There is no `continue-on-error`, no path filter, no test skip. Playwright,
Semgrep, CodeQL, and trivy are not grepped into existence.

---

## 2. What changed

`pnpm run check:artifact` walks `app/dist`, sums the uncompressed payload of files that would
enter the ZIP (fail-closed against 20 MB; this slot does not add a zip library), gzips every
first-screen JS file referenced from `index.html` (script `src` and `modulepreload`), refuses
empty files and shipped `*.map`, and scans for `DEBUG=true`, the test-login sentence, and
payment-bypass needles. Production `vite` no longer emits sourcemaps, so the hosted ZIP cannot
pass by "minify was on".

| File | Change |
| --- | --- |
| `.github/workflows/l2.yml` | Job `artifact` (G2.6). Build client, then `check:artifact`. No `continue-on-error` |
| `.github/workflows/ci.yml` | **Unchanged** vs `origin/main` |
| `app/tools/artifact-budget.ts` | Rules, CLI parse/run. Coverage can see them |
| `app/tools/cli/check-artifact.ts` | Process boundary. `process.exit` of the library result |
| `app/vite.config.ts` | `build.sourcemap: false` |
| `package.json` | `check:artifact`. **Not** added to `verify` |
| `README.md`, `docs/engineering/repo-layout.md` | The fourth L2 job exists |

The live check on this tree after `pnpm verify`'s build:

```
artifact budget passed: zip 356968/20971520 bytes, first-screen JS gzip 103936/307200 bytes, 3 files
```

---

## 3. Reverse verification

The library tests are the injection. Against a shipped `.map`:

```
debug symbols (.map) shipped: assets/app.js.map
```

Exit 1. Against an empty file:

```
empty files: empty.txt
```

Exit 1. Against `DEBUG=true` in a chunk:

```
debug/test backdoors: assets/app.js:DEBUG=true
```

Exit 1. Against a missing dist directory:

```
dist directory not found: /tmp/no-such-g26-dist
```

Exit 1. Omitting `--dist` exits 2 rather than scanning `cwd` and reporting success on nothing.
A fixture whose uncompressed payload exceeds a 20-byte budget throws `ArtifactBudgetError`
(`/zip payload/`). First-screen JS gzip over a tightened cap throws `/first-screen JS gzip/`.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-1f0c1f6d` (assigned D-07) | No-op'd D-07 (C4-01 already had it) and shipped G2.2. Already on `main`. Duplicate `check-integrate` dropped here |
| `bc-35dcf4b9` (playNext lock) | Landed as `574651c`. App playback files. Not touched |
| `bc-f876a9e9` (C4-05 / C3-08) | Landed as `652cc69`. Identity-port files. Merged in; no overlap with artifact-budget |
| C4-01 / C4-02 G2.7 / D-16 | Already on `main` at pick. Not retaken |

`git diff origin/main -- .github/workflows/ci.yml` is empty.

---

## 5. Verification

`pnpm verify` green on `0506352` after merging `origin/main` (`652cc69` C4-05). L1 sequence
unchanged: format → lint → typecheck → test:coverage → check:coverage → build → guardrails.
`check:artifact` is not in that sequence.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 67 |
| `server` | 1,654 |
| `app` | 1,024 |
| **Total** | **2,845** |

Zero skipped. Twenty-seven library tests for G2.6. Coverage gate:

```
coverage global lines 94.06% (12531/13323), branches 92.09%, core lines 98.07%, diff lines 100.00% (208/208)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-2Tmvm371.js` 341.67 kB / 103.94 kB gzip). No
`*.map` in that dist.

---

## 6. Left open

- **G2.3, G2.4, G2.5.** Playwright, Semgrep/CodeQL, trivy. Further L2 slices. Not faked with a
  grep.
- **C4-04, C4-06, C4-07, C4-08.** Splash contract, Beans, VIP, ads. Beans/VIP/recharge stay
  AM-blocked; this slot does not invent rates or ad-unit ids.
- **T14 / T16 / T15.** Postgres is still refused at boot. Unrelated to the client ZIP.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
