# Handoff — Wave 2, Work Slot E: closing the guardrail fail-open on a missing build artifact

> **Branch:** `cursor/w2-work-e-1aaa`, cut from `cursor/w2-work-c-5101` (`a3a3615`).
> **Scope:** item 1 of `docs/plan/media-plane-decision.md` §5.3 — `app/tools/cli/check-guardrails.ts`
> treated an absent `app/dist` as "nothing to scan" and exited 0. A missing artifact is now a
> violation, and the artifact directory is named on the command line rather than derived from the
> file's own location.
> **Not in scope:** items 2–7 of §5.3 (the dependency allow-list, computed tag names, markup in
> string literals, media APIs that are not `createElement`, `<source>` and multi-document HTML),
> the server catalogue/feed work, and the VePlayer playback contract. No lint rule, no CI file and no
> playback code was touched. No pull request was opened.

---

## 1. The fail-open, reproduced before and after

The check that P2 found is the worst shape a check can have: it did not report a violation, it
reported success. Reproduced on the base commit, with `app/dist` removed:

```
$ tsx app/tools/cli/check-guardrails.ts        # at a3a3615, no app/dist
note: app/dist is absent, skipping the bundle scan — run build first
platform guardrails passed
exit 0
```

The bundle scan is the only layer that sees what a *dependency* contributed to the shipped artifact —
lint sees our source, and the platform's upload-time code scan sees the artifact after it is too late
to be cheap. Any CI reordering, any cache miss, and specifically the `INF-009` layout freeze moving
the tree out from under the hard-coded `../../dist` would have turned that layer off while the job
stayed green.

On this branch, the same state:

```
$ pnpm check:guardrails                        # no app/dist
platform guardrails failed (1):
  artifact dist  the build artifact is required  — directory not found, so the bundle scan could not run — build before checking
exit 1
```

And after `pnpm build`, against the real bundle:

```
$ pnpm check:guardrails
platform guardrails passed (artifact: /workspace/app/dist)
exit 0
```

---

## 2. What was delivered

| File | Contents |
|---|---|
| `app/tools/guardrail-suite.ts` | New. The whole file-based guardrail run as a function of `{ appRoot, distDir }`: source rules, document integrity, artifact presence, bundle scan, built-document integrity. Returns structured violations; performs no I/O beyond reading the two trees it is given, and never exits |
| `app/tools/cli/check-guardrails.ts` | Rewritten as a thin entry point: argument parsing, then the suite, then the exit code. `--dist` is required; `--app-root` is available and is what the tests use |
| `app/tools/guardrail-suite.test.ts` | New, 11 tests over temporary fixture trees |
| `app/tools/cli/check-guardrails.test.ts` | New, 6 tests that run the real CLI as a subprocess and assert its exit status |
| `app/package.json` | `check:guardrails` now passes `--dist dist` |
| `README.md`, `docs/engineering/repo-layout.md` | The two places that described the check as "run after build to include the bundle scan" now say a missing artifact fails, so the documentation does not re-teach the fail-open |

### 2.1 The rules the suite now enforces

Everything that was enforced before is enforced unchanged. The new rules are all of the fail-closed
kind — absence is a failure:

| # | New rule | Message |
|---|---|---|
| 1 | The artifact directory must exist | `the build artifact is required — directory not found` |
| 2 | It must contain at least one scannable `.js`/`.css`/`.html` file | `the build artifact is required — no scannable .js/.css/.html file` |
| 3 | It must contain `index.html` | `the built document is required — file not found, so the shipped document was never checked` |
| 4 | The source tree must exist | `the source tree is required — directory not found, so the source rules could not run` |
| 5 | The source document must exist | `the source document is required — file not found` |
| 6 | `--dist` must be given | usage error, exit 2 |

Rule 2 exists because an empty directory would otherwise satisfy rule 1 and scan nothing, and because
`isScannableBundleFile` deliberately excludes source maps — a `dist/` holding only `.map` files proves
nothing about what ships. Rule 3 replaces an `existsSync` that previously skipped the built-document
check when `dist/index.html` was absent, which was the same fail-open one level down. Rules 4 and 5
replace a bare `readFileSync` that would have thrown a stack trace; the exit code was already
non-zero, but the message was not a guardrail message.

### 2.2 The VePlayer bans are unchanged, and are now covered end to end

No rule was removed, renamed, relaxed or made conditional. `bundle-scan.ts`, `html-integrity.ts`,
`source-rules.ts` and `eslint.config.js` are untouched by this slot — `git diff --stat` against the
base lists no change to any of them. Six of the new tests exist specifically to prove the bans still
fire through the new code path rather than only through their own unit tests:

| Test | Asserts |
|---|---|
| `guardrail-suite` "a media element in the artifact fails" | `createElement('video')` in a chunk → `no native video element` |
| `guardrail-suite` "a third-party player in the artifact fails" | `hls.js` in a chunk → `no third-party media player` |
| `guardrail-suite` "a media element in the built document fails" | `<video>` in `dist/index.html` → `no <video> element` |
| `guardrail-suite` "keeps the source containment rule" | `window.TTMinis` outside `src/platform/` → source violation with file and line |
| `check-guardrails CLI` "banned media element" | The same violation through the CLI → **exit 1** |
| `check-guardrails CLI` "compliant tree" | Clean fixture → exit 0, empty stderr |

### 2.3 Verification

Every gate was run on this branch.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **295 passing, 0 skipped, 0 failing** — 109 app (was 92), 162 server, 16 config, 8 shared |
| Build | `pnpm build` | pass — `assets/index-*.js` 242.80 kB (78.07 kB gzipped), unchanged |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle; **exit 1** with `app/dist` removed |
| Whole pipeline | `pnpm verify` | pass |

The 17 new tests are the two new files; no existing test was modified, skipped or deleted. The client
bundle is unchanged — nothing in this slot is reachable from `app/src`.

---

## 3. Decisions taken in this slot

Numbering continues from `docs/handoff/w2-work-c.md` §4.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S21 | **`--dist` is required, with no default** | P2's proposed check says the artifact directory is taken as an argument. A default is what made the old check silently correct-looking after a layout move: it always had *a* path, so it always had an opinion about whether the artifact was there. Naming it means the caller states what it is scanning, and `INF-009` changes one string in `app/package.json` instead of changing the meaning of the check | One line in `parseArgs` |
| S22 | **There is no `--allow-missing-dist`, and no environment variable that skips the artifact layer** | An escape hatch is the fail-open with a nicer name, and `docs/14-quality-gates.md` §0 R1 forbids soft-fail. A developer who wants the source-only rules runs `pnpm lint`; a developer who wants this check runs the build first, and the failure message says so. There is a test asserting an unknown flag exits 2, which is what such a hatch would look like on arrival | Adding one is a protocol violation under `SR-4`, so the cost is a review, not a line |
| S23 | **The orchestration moved out of the CLI into `guardrail-suite.ts`, and the CLI owns only argv and the exit code** | A module that executes on import cannot be unit-tested; the old file's rules were only reachable by running the process. The suite is now callable, and the process behaviour is tested separately where it belongs | None; the split is additive |
| S24 | **An empty artifact directory fails, and source maps do not count as content** | "Exists" is not "was built". A `dist/` containing only `.map` files, or nothing, is exactly the state a partial or failed build leaves behind, and `isScannableBundleFile` already excludes maps because scanning them is all false positives — so counting them as evidence would contradict the reason they are excluded | One condition |
| S25 | **A missing `dist/index.html` is a violation, not a skipped check** | The built document is the file the platform reads most closely and the easiest place for a forbidden element or an external script to enter. It is the one rule in the pre-existing set that was already fail-closed in the strong sense (the SDK script tag is *required*), and skipping the whole document check when the file is absent defeated it | One condition |
| S26 | **Violations are structured (`layer`, `subject`, `rule`, `evidence`) and formatted at the edge** | The old code built strings inside each loop, so a test could only assert on formatting. Tests now assert on the rule that fired, which is what should be stable, and the printed line is unchanged in shape apart from the new `artifact` layer label | None |
| S27 | **Exit 2 for a usage error, exit 1 for a violation** | A CI step that cannot tell "you called me wrong" from "the artifact is dirty" invites the first to be read as the second and retried until it passes. Both are non-zero, so nothing is soft about it | None |

---

## 4. Deliberately not built

Listed so it is not re-scoped as an omission:

- **Items 2–7 of `docs/plan/media-plane-decision.md` §5.3 are untouched.** The runtime dependency
  allow-list (item 2, the highest-value structural change in that table), computed `createElement`
  arguments (3), media tag tokens inside string literals (4), `new Audio()` / `MediaSource` /
  `HTMLMediaElement` (5), shadow-DOM wrappers (6), and `<source>` plus applying the document check to
  every emitted `.html` (7) remain open under `QA-004`. This slot closed item 1 only, because it was
  the one whose failure mode is invisible and because the others change what counts as a violation
  rather than whether the check runs at all.
- **No new ban.** Not one pattern was added to `bundle-scan.ts` or `html-integrity.ts`. This slot
  makes the existing bans impossible to skip; it does not widen them.
- **No CI change.** `.github/workflows/ci.yml` already ran `check:guardrails` after `build`, and that
  ordering is now enforced by the check itself rather than by the workflow's comment.
- **No lint rule, no `eslint.config.js` change**, so `app/tools/eslint-guardrails.test.ts` — the
  meta-test §5.1 of the decision record calls the most valuable and most losable item in the set —
  is byte-identical and still passing.
- **No `<video>`, `<audio>`, `<source>`, `<iframe>`, `<object>` or `<embed>` was added anywhere,**
  including in fixtures that are shipped. The banned forms appear only as string literals inside two
  test files, constructed in temporary directories under `os.tmpdir()` and deleted in `afterEach`, so
  no fixture containing a media element exists in the tree or in the bundle.
- **No server, catalogue, feed, playback or OpenAPI file was touched**, to stay clear of the in-flight
  slots.

---

## 5. For the next slots

**For whoever owns `QA-004` (items 2–7).** `runGuardrailSuite` is the place to add them:
`checkArtifactLayer` for anything read out of the artifact, `checkSourceLayer` for anything read out
of the tree. Two properties are load-bearing and worth preserving rather than rediscovering. First,
every check must return a violation for "could not run", not an early `return []` — that is the bug
this slot fixed, and it is easy to reintroduce with one `existsSync` guard. Second, a new rule needs a
failing fixture, per `SR-1`'s reverse-verification column; the fixture helpers in
`app/tools/guardrail-suite.test.ts` build a compliant tree so a test only has to state the one file
that makes it non-compliant.

**For whoever performs the `INF-009` layout freeze.** The artifact path is no longer hard-coded. Move
the tree and change `--dist dist` in `app/package.json`; if you get it wrong the check now fails
loudly instead of scanning nothing. `--app-root` exists for the same reason and defaults to the
package root derived from the module URL, which is the only path assumption left in the CLI. Please
also carry `app/tools/eslint-guardrails.test.ts` and the two new test files across deliberately.

**For whoever runs the checks locally.** `pnpm check:guardrails` on a clean checkout now fails until
you have run `pnpm build`. That is the intended behaviour, the failure message says which command to
run, and `pnpm verify` already orders them correctly.

---

## 6. Known gaps in this slot's own work

- **The check proves the artifact was scanned, not that it is the artifact that gets uploaded.**
  Nothing ties `dist/` to the ZIP a human uploads to the Developer Portal, and nothing checks that the
  build which produced `dist/` came from the commit under test. A stale `dist/` from an earlier build
  passes every rule here. Closing that means hashing the artifact into a manifest at packaging time,
  which belongs with the release task, not with this check.
- **"At least one scannable file" is a low bar.** A build that emitted the document and dropped every
  chunk would satisfy rule 2. The honest version compares the emitted entry list against what the
  build config declares, which reaches into Vite's manifest and was out of scope here.
- **The deny-list is still a deny-list.** This slot guarantees the scan *runs*; item 2 of §5.3 is what
  makes an unanticipated player fail by default. Until then, a media player under an unrecognised
  package name passes a scan that now definitely happened.
- **The CLI tests spawn `tsx` from `app/node_modules/.bin`.** They are the only tests in the
  repository that depend on a binary's location, and they would need updating if the app package's
  dependencies moved. The alternative — importing a module that calls `process.exit` — cannot assert
  an exit code, and the exit code is the entire subject of these tests.
- **Only `index.html` is document-checked inside the artifact**, exactly as before. Item 7 covers
  every emitted `.html`; this slot added the presence requirement without widening the set.
