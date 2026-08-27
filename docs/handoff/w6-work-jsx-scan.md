# Handoff — Wave 6: the bundle scan reads the JSX runtime

> **Branch:** `cursor/w6-work-jsx-scan-b942`, cut from `cursor/w4-work-r-d943` (the player slot).
> **Scope:** `app/tools/bundle-scan.ts` and its tests. Nothing else in the repository changed.
> **Not in scope:** `eslint.config.js` (untouched — no rule was relaxed, disabled or narrowed),
> `html-integrity.ts`, `source-rules.ts`, the Wave 6 plan documents and the catalogue cover work
> (both in flight elsewhere), and anything under `app/src/`, `server/`, `packages/` or `contracts/`.
> No pull request was opened.

---

## 1. The defect

Raised in the Wave 5 review as D-09. The bundle scan's media rules were written as:

```js
{ rule: 'no iframe element', pattern: /createElement\s*\(\s*(['"`])iframe\1/ },
{ rule: 'no native video element', pattern: /createElement\s*\(\s*(['"`])video\1/ },
```

`createElement` is the shape React emitted before the automatic JSX runtime, and no component in
this app renders through it. `@vitejs/plugin-react` compiles with the React 19 automatic runtime,
so a `<video>` in a component reaches the artifact as `jsx("video", …)`. The scan looked straight
past it.

That is not a hypothetical: the chunk `pnpm build` produces today contains **117 `.jsx(` calls and
22 `.jsxs(` calls**, and every element this app renders is one of them. The chunk does contain
`createElement` calls — several dozen — but they all belong to react-dom's host-element path and to
react-router, which still compiles with the classic runtime. Not one of them is ours. The scan was
matching a shape our code does not emit and ignoring the shape it does.

The consequence is narrow but it is the exact one the scan exists to prevent. ESLint still rejects
`<video>` in our source, so the hole only opens when the AST rule is not the thing standing in the
way — a one-line `eslint-disable`, a `<video>` inside a dependency that gets bundled, or a rule
lost in a config refactor. The bundle scan is the layer that is supposed to hold in all three
cases, because it reads the artifact rather than our intentions. It was holding in none of them.

A second, quieter gap sat next to it: the scan banned two elements where every other layer bans
five. `eslint.config.js` and `html-integrity.ts` both list `video`, `audio`, `iframe`, `object`,
`embed`. The bundle scan listed `video` and `iframe`, so `<audio>`, `<object>` and `<embed>` were
banned in our source and in the document, and permitted in the thing that ships.

---

## 2. What changed

One file of logic. Each banned element is now matched in three shapes rather than one:

| Shape | Pattern matches | Why it is needed |
| --- | --- | --- |
| `createElement('video')` | `createElement\s*\(\s*"video"` | The original rule, kept verbatim. Still the shape an imperative DOM call takes |
| `jsx("video", …)` | `_?jsxs?(?:DEV)?\s*\(\s*"video"` | The automatic runtime: `jsx`, `jsxs`, `jsxDEV`, Babel's `_`-prefixed aliases, and the `runtime.jsx(…)` property form the production build actually emits |
| `o("video",{…})` | `\(\s*"video"\s*,\s*(?:\{\|null\|void 0)` | What is left after minification |

The third row is the one that matters most and it is worth being explicit about why. esbuild
rewrites the runtime import to `import { jsx as o } from "react/jsx-runtime"`, so in a minified
chunk there is no `jsx` token left to grep for — matching on the callee name is matching on
something the minifier is free to destroy. The argument list is not: the element name is a string
literal and survives verbatim, and an element factory is recognisable from its arguments alone —
a quoted element name followed by a props argument. That also catches factory spellings nobody has
thought of yet, including a bundled `h()` from a dependency.

The element list widens to the five that every other layer already bans, and the rule names become
`no <video> element`, matching `html-integrity.ts` so the two layers read the same in a failure
report. A rule spelled as several patterns is reported once; three copies of the same finding only
make the output harder to read.

### 2.1 Verification

| Gate | Command | Result |
| --- | --- | --- |
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings — the config is byte-for-byte unchanged |
| Types | `pnpm typecheck` | pass, 4 packages |
| Tests | `pnpm test` | **730 passing, 0 skipped, 0 failing** — 365 app (was 333), 338 server, 16 config, 11 shared |
| Build | `pnpm build` | pass — `index-tc0zP-4t.js` 270.81 kB (86.34 kB gzipped), byte-identical to the base branch |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The bundle did not move, because `app/tools/` is build tooling and never enters it. The 32 new
tests are all in `app/tools/bundle-scan.test.ts` (10 → 42). No existing test was deleted, skipped
or weakened; two of them name the renamed rule strings (J5) and assert exactly what they did
before.

### 2.2 Proved by mutation, on a real artifact

A `<video>` element was added to `PlayerSurface.tsx`, the app was built, and the *same* `dist/` was
scanned by both versions of the tool.

| Gate | Before this change | After |
| --- | --- | --- |
| `pnpm lint` | **fails** — the JSX selector catches it | fails (unchanged) |
| `pnpm check:guardrails` | **passes** | **fails**: `bundle dist/assets/index-rLllxOan.js no <video> element — …N.jsx("video",{className:"player-surface__fallback",` |

Then the realistic version of the same mutation, with the lint rule suppressed the way anyone in a
hurry would suppress it — a single `{/* eslint-disable-next-line no-restricted-syntax */}` above
the element:

| Gate | Before this change | After |
| --- | --- | --- |
| `pnpm lint` | **passes** | passes (unchanged — this is a source-level decision, and this slot did not touch it) |
| `pnpm test` | 1 failure | 1 failure |
| `pnpm check:guardrails` | **passes** | **fails** |
| Net result | A native `<video>` in the uploaded ZIP | Caught before upload |

The single test failure in both columns is `PlayPage`'s "carries no native media element" — the
runtime DOM assertion added by W4 R15. It caught this because the mutation happened to be on the
one screen that assertion covers; a `<video>` on any other screen, or one contributed by a
dependency, had nothing looking at it at all. That is what makes this an artifact-level rule rather
than another source-level one.

### 2.3 The compiler gets the last word

The rule that failed did so because it was a hand-written guess about compiler output that was
never checked against a compiler. Writing a better guess is not a fix for that, so four of the new
tests run the real toolchain — `transformWithEsbuild`, the same esbuild that minifies the shipped
chunk — over real JSX and scan what comes out, both minified and not:

```
jsx("video", { src: "x" })                             // unminified
import{jsx as o}from"react/jsx-runtime";…o("video",{src:"x"})   // minified
```

If a toolchain upgrade changes the emitted shape, those four tests fail and say so, rather than
the scan quietly going blind again. A `<div>` component compiled the same way must scan clean,
which is what keeps the third pattern from being a rule that matches everything.

---

## 3. Decisions

Numbered `J*` to avoid colliding with the earlier slots' `R*`, `O*`, `H*` and `S*`.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| J1 | **The minified shape is matched on the argument list, not on the callee** | Matching a callee name in minified output is matching the one part of the call a minifier is licensed to rename. The element name is a string literal and cannot be renamed, so that is where the rule belongs | Drop one pattern and accept that the rule only works on unminified builds |
| J2 | **Three patterns per element, one reported violation** | The three shapes are genuinely different things to look for and read better named separately than fused into one unreadable alternation. What the operator needs is "there is a `<video>` in this chunk", once, with the surrounding text | Merge them; the evidence excerpt already shows which shape matched |
| J3 | **The props argument must look like props (`{`, `null`, `void 0`), not be anything at all** | `\("video",` alone would flag `track("video", payload)` and `t("video", opts)`. Verified against the whole real bundle it makes no difference today — neither form matches anything — so the narrower rule is free, and a guardrail that fires on innocent code is a guardrail somebody switches off | Widen the alternation; §5 has the case it would buy |
| J4 | **The element list is now the same five everywhere** | `<audio>` is blocked by the platform for the same reason `<video>` is. Three layers listing three different subsets is how an element ends up banned in two places and shipped from the third | None |
| J5 | **Rule strings renamed to `no <video> element`** | They are now one rule with three spellings, so "no native video element" (a shape) became wrong, and matching `html-integrity.ts`'s wording means the same element reads the same in a failure report whichever layer found it | Rename; the strings are only consumed by tests |
| J6 | **Everything landed in `app/tools/bundle-scan.ts`; the ESLint config was not opened** | The defect is that the artifact was not being read, not that the AST was being read wrongly — the AST rule was already correct. It is also the one file in this area that no in-flight slot is touching, which is the same reasoning as W4 R16 | — |
| J7 | **`BANNED_ELEMENTS` is exported** | So the tests can assert that every element is covered in every shape, rather than spot-checking `video` and trusting the loop | Inline the list into the tests and lose the coupling |
| J8 | **The toolchain tests use `transformWithEsbuild` rather than a full `vite build`** | It is vite's own export, so it needs no fixture directory and no temp files, and it exercises the step that produces the shape at issue. A full build in a unit test would need a `<video>` fixture on disk inside `app/`, which is a `<video>` in the repository | Run `vite.build({ write: false })` against a generated fixture |

---

## 4. Deliberately not done

- **No change to any lint rule.** `eslint.config.js` is untouched. Nothing was disabled, downgraded
  or narrowed, and `pnpm lint` reports 0 errors and 0 warnings.
- **No new guardrail beyond the element shapes.** `eval`, the `Function` constructor, string-form
  timers, third-party players and remote script injection are matched exactly as before — and each
  of them has the same class of blind spot this defect exposed (§5).
- **No `innerHTML` rule.** W4 §6 flagged it as the obvious next hole and it is still open; it is a
  different rule with a different false-positive profile and does not belong in a defect fix.
- **No parse-based scanner.** §5 says why.
- **No PR, and no Wave 6 planning documents touched.**

---

## 5. Known gaps in this slot's own work

- **A mangled factory whose props are a bare identifier is still invisible.** `o("video",p)` does
  not match: J3 requires the second argument to look like props. Every compiler checked emits an
  object literal — even `<video {...p} />` compiles to `jsx("video", { ...p })` — but that is an
  observation about today's toolchain, not a guarantee. The four toolchain tests are what would
  notice if it stopped being true.
- **A computed element name in the *artifact* is still invisible.** `o("vid"+"eo",{})` passes.
  W4 R16 closed this for `createElement` in our source, where a literal can be demanded; nothing
  demands it of a dependency, and no regex over minified text can.
- **This is still a regex over text, not a parse.** A string constant that happens to contain
  `jsx("video",{` would be reported, and there is no way to say "this one is fine". The
  false-positive cost is a failed build with the offending text printed, which is the right way
  round, but somebody will hit it eventually.
- **The Babel path is covered by string fixtures, not by running Babel.** The production pipeline
  is `@vitejs/plugin-react` (Babel) and then esbuild; the tests run esbuild for real and assert
  Babel's `_jsx`/`_jsxs`/`_jsxDEV` output as literal strings. If Babel changes its alias
  convention, the fixture keeps passing while the artifact changes shape.
- **Only the elements are hardened.** The five other bundle rules are single patterns written the
  same way the broken one was. `no third-party media player` matches package names in text, which
  minification erases; `no remote script injection` matches `.src = "https://…"`, which
  minification rewrites to `.src="https://…"` (still matched) but which a computed URL evades
  entirely. Nobody has run the same mutation exercise against them.
- **Nothing verifies the three layers agree.** J4 lined up the element lists by hand and the
  doc comment says to keep them in step, which is exactly the kind of instruction that decays.
  A test that reads `eslint.config.js`'s selector and `html-integrity.ts`'s list and compares them
  to `BANNED_ELEMENTS` would make it real, and it would have to touch the lint config to export
  the list — deliberately out of scope while that file is contended.

---

## 6. For the next slots

**For whoever owns the guardrails next.** The exercise that found this is repeatable and cheap, and
it is the only thing that distinguishes a rule that works from a rule that reads well: apply the
violation to real source, build, and scan the real `dist/`. Every rule in `bundle-scan.ts` deserves
it. Two are already known to be shaky (§5), and `no third-party media player` is the one worth
doing first, because a bundled player is the violation with the largest blast radius and package
names do not survive bundling.

**For whoever revisits the lint config** once it is no longer contended. The element list wants to
live in one module that all three layers import, and the cross-layer test in §5 wants to exist. The
list is exported from `app/tools/bundle-scan.ts` today, which is the wrong home for it — a lint
config importing from the bundle scanner is backwards. `packages/config` is the natural place.

**For whoever upgrades React, Vite or the React plugin.** If the four tests in "against the real
toolchain" fail, the emitted JSX shape moved and the scan needs a new pattern. That is the failure
signalling working, not a flaky test — read the compiled output in the assertion message before
changing anything.
