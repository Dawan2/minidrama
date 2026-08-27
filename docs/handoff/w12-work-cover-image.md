# Handoff — Wave 12: the cover allowlist is applied where the cover is rendered

> **Branch:** `cursor/w12-work-cover-image-3d19`, cut from `main` at `f8465df`.
> **Scope:** the client half of **D-02** / backlog **T2-1**. `app/src/components/CoverImage.tsx`
> now takes its `src` through `checkCoverUrl` instead of handing it to `<img>`. Six files besides
> this one, +301 −57: the component, its new test file, the three cover tests moved out of
> `states.test.tsx`, a source scan in `import-hygiene.test.ts`, and `@minidrama/config` moving from
> the app's devDependencies to its dependencies (with the lockfile line that follows).
> **Not in scope:** the W10 report and the homepage-flake merge (both in flight, neither touched),
> `packages/shared/src/image-url.ts` and `packages/config/src/cover-hosts.ts` (the decision itself
> is unchanged), `server/src/modules/catalog/covers.ts` (the server half of D-02, closed in W6 by
> `w4-work-s-cover-url-check-6186`), `TRUSTED_COVER_HOSTS` (still the `.invalid` placeholder,
> U-IMG-1), and every other module under `app/src/`. No pull request was opened.

---

## 1. The defect

`docs/verify/cycle-1-report.md` D-02, second half:

> **The cover-URL allowlist has no caller, and the component that renders covers does not use it.**

The first half closed in W6: `server/src/modules/catalog/covers.ts` applies `checkCoverUrl` at the
single boundary where a `DramaRecord` becomes a wire object, so a refused cover is served as `null`.
The second half was still open, and `docs/plan/cycle-2-backlog.md` T2-1 says why merging would never
close it — the allowlist and the component arrived on branches that conflict, so the two halves
landing on one tree does not connect them.

What `CoverImage` did with its prop was one line:

```tsx
if (src === null || failed) { …placeholder… }

return <img className={classes} data-testid="cover-image" src={src} alt={alt} … />;
```

The component's own doc comment already described the guarantee it was relying on — "the server
refuses to pass on a cover whose host the trusted-cover registry does not list" — which is the
shape of the problem rather than an argument against it. That sentence is true of one endpoint on
one day. It is not true of a `CoverImage` rendered from a stubbed transport, from a future endpoint
whose author does not know `views.ts` is where the gate lives, or from any caller that passes a URL
in directly; and none of those would look wrong in review, because the component's signature asks
for a string and promises nothing about it. A `src` prop typed `string | null` is a claim about the
type, and the thing being defended against here is a value of exactly that type.

The concrete exposure today is small and the mechanism is not. An `<img src>` will not execute a
`javascript:` URL, so what a hostile cover field buys right now is a request to a host nobody
registered — which the platform blocks on device and nowhere else
(`docs/architecture/system-overview.md` §3.2), so it is found by a viewer rather than by CI. The
reason to close it anyway is the one `packages/shared/src/image-url.ts` gives at length: the cover
is also the thumbnail that eventually gets wrapped in an `<a href>`, dropped into a CSS `url()` or
handed to a share sheet, and it is the same field in all four places.

---

## 2. What changed

**The component takes the decision.** `checkCoverUrl` runs on the prop, and what reaches the
element is the checked value:

```tsx
const checked = checkCoverUrl(src);
const trusted = checked.ok ? checked.value : null;
…
if (trusted === null || failed) { …placeholder… }

return <img … src={trusted} … />;
```

Three things about that, in the order they matter:

- **The rendered string is `checkCoverUrl`'s value, not the prop.** That value is the URL as
  parsed. Checking one spelling and fetching another is the shape of every sanitiser bypass ever
  written, and it passes any test that only asserts an image appeared (§2.3 proves this one does
  not).
- **A refusal reaches the placeholder that a missing cover already reaches.** "Nothing renderable"
  is one state as far as layout is concerned, and `horizontalCoverUrl` has been nullable since the
  contract was written, so no caller learns a new state. Nothing was substituted: a placeholder
  *URL* would itself be a cover URL needing a trusted host we do not have.
- **The placeholder says why**, as `data-cover-rejection` — the rejection's name, never the URL. A
  silent refusal is indistinguishable from a drama nobody uploaded artwork for, which is how a
  blocked host gets triaged as a content-entry oversight. This is the client's small version of
  what `coverRejections` does on the server, and like that function it is separate from the
  decision: the attribute cannot make a URL render or fail to.

`data-cover-rejection` is absent when a trusted URL simply failed to load, because that is not a
refusal and there is nothing to tell a content editor about a host that was allowed and did not
answer.

The `useEffect` that resets `failed` now keys on the checked URL rather than the prop. It is the
string the browser was actually asked to fetch: two spellings of one URL are not a fresh chance to
load, and two different refused URLs are not either.

**`@minidrama/config` moves to the app's `dependencies`.** It was a devDependency, which was
accurate while nothing under `app/src/` imported it and is not accurate now that a shipped
component does. Tree-shaking keeps the cost to the cover-host registry and the checker: the domain
registry and `minis-config.ts` do not appear in the artifact (§2.2).

### 2.1 Tests

`app/src/components/CoverImage.test.tsx` is new, 27 tests. It does not re-test the decision —
`packages/config/src/cover-hosts.test.ts` and `packages/shared/src/image-url.test.ts` already do
that in 69 tests — it tests that the component *takes* it:

| Group | What it holds |
| --- | --- |
| Accepts | a trusted URL renders with the title as `alt`; a CDN resize query survives; **the URL is rendered as parsed, not as written**; the catalogue fixtures still render, so the suite notices if the seed host drifts from the registry |
| Refuses | 16 cases, each asserting no `<img>` and the expected `data-cover-rejection`: unregistered host, prefix / suffix / subdomain lookalikes, script scheme (plain and behind leading whitespace), `data:`, `blob:`, plain `http:` on a listed host, credentials, a non-default port, protocol-relative, relative, whitespace-only, `null`, and a non-string from a JSON boundary |
| Refuses, harder | the refused string never appears **anywhere in the document** — not as an attribute, a title or a comment. No `<img>` is the assertion people write; no trace is the one that means it |
| Agrees | for every case in the file, whether the component rendered an image equals `isTrustedCoverUrl(src)`. A component that decided this for itself would be a second allowlist, and the second one is the one that goes stale |
| Degrades | `onError` still falls back; a load failure carries no rejection reason; a new source is a fresh chance; and a recycled row retakes the decision in both directions (refused → trusted → refused) |

Every case is written against `TRUSTED_COVER_HOSTS[0].host` rather than a literal, for the reason
`server/src/modules/catalog/covers.test.ts` gives: the registry is still the `.invalid` placeholder,
and a suite that hard-codes it has to be edited the day the real host arrives — which is how a
rename turns an allowlist test into a test of nothing.

The three cover tests that lived in `components/states.test.tsx` moved into the new file, so
`states.test.tsx` is about `states.tsx` alone. One of them had to change regardless: it used
`https://a.invalid/1.jpg`, which the gate now refuses.

`app/src/testing/import-hygiene.test.ts` gains the other half, as a source scan in the house style
of the file: **`<img>` appears in exactly one non-test source file**, and that file imports
`@minidrama/config`, calls `checkCoverUrl(src)`, and does not contain `src={src}`. The behavioural
tests prove the gate refuses what it should; this proves nothing walks around it. A second `<img>`
somewhere else would be a second decision, and it would be the one rendering whatever the response
happened to contain.

### 2.2 Verification

| Gate | Command | Result |
| --- | --- | --- |
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages |
| Tests | `pnpm test` | **2163 passing, 0 skipped, 0 failing** — 753 app (55 files), 1314 server, 45 config, 51 shared |
| Build | `pnpm build` | pass |
| Guardrails | `pnpm check:guardrails` | pass |

App test count goes 727 → 753: the new file's 27, three of which are the ones that left
`states.test.tsx` (16 → 13), plus the two source scans. Nothing was skipped, and no assertion was
dropped or weakened in the move.

Bundle delta, measured by building `main` at `f8465df` and this branch in the same tree:

| | `main` | This branch |
| --- | --- | --- |
| `dist/assets/index-*.js` | 306.19 kB (gzip 95.21 kB) | **307.42 kB (gzip 95.75 kB)** |

+1.23 kB raw, +0.54 kB gzip, and a grep of the artifact confirms what arrived: the rejection names,
the checker, and the one `TRUSTED_COVER_HOSTS` entry including its `reason` string. `TRUSTED_DOMAINS`,
`portalDomainList` and `validateDomainRegistry` are not in it — the export surface of
`@minidrama/config` is wide, and tree-shaking took the narrow part.

### 2.3 Proved by mutation

Three mutations, each reverted; `git status` clean afterwards.

| Mutation | Tests that fail |
| --- | --- |
| The old code exactly: `src={src}` with the check removed | **21 of 39** — 15 of the 16 refusals, the parsed-URL test, the no-trace test, the `isTrustedCoverUrl` agreement, the placeholder-labelling test, the recycled-row test, and the source scan |
| Check, but render the prop: `checked.ok ? src : null` | **1** — `renders the URL as parsed, not as it was written`. That is the test's whole reason for existing, and without it this mutation is invisible: every refusal still refuses, and every acceptance still shows an image |
| A second `<img>` added to `FeedCardView.tsx` | **1** — the source scan, naming the file and line |

The one refusal that survives the first mutation is `null`, which the old code already handled and
which is the only case a bypassed gate gets right by accident. That is the argument for writing the
other fifteen out one by one instead of as a single "rejects bad URLs" case: a suite built around
the null path would have called the old component correct.

---

## 3. Decisions

Numbered `G*` to avoid colliding with the earlier slots' `R*`, `O*`, `H*`, `S*`, `J*`, `A*`, `C*`,
`F*`, `M*`, `U*` and `K*`.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| G1 | **The check goes in `CoverImage`, not in the API client or a screen** | It is the last point before a string becomes a request, and it is the only place all four callers (feed card, drama header, history row, favourite row) pass through. A check in the transport would be correct for today's endpoints and absent from the next one; a check in a screen would be four checks, and the fourth would be forgotten | Move the call, keep the tests |
| G2 | **Both ends check, and that is not duplication** | The server decides what a *response* carries and reports what it dropped; the client decides what a *render* fetches. Same rule, different artifacts. Deleting either one leaves a real path — a stubbed transport, a future endpoint, a direct caller — with no gate on it | Delete the client call and rely on `views.ts` |
| G3 | **The parsed value is rendered, never the prop** | A validator that approves one spelling while the page uses another is not a validator. This is the one property that a passing behavioural suite would otherwise not notice (§2.3) | — |
| G4 | **A refusal renders the existing placeholder, not a new state** | Callers already handle "no cover"; `horizontalCoverUrl` has been nullable since the contract was written. A distinct "blocked" visual would be a product decision this slot has no standing to make, and it would have to be designed for a case a viewer should never see | Add a variant class |
| G5 | **A placeholder URL was not invented** | It would itself be a cover URL, needing a trusted host we do not have (U-IMG-1), and shipping one means a second image path whose only job is to be exempt from this check. The same argument `covers.ts` makes on the server | Add a bundled asset and an exemption |
| G6 | **The reason goes in the DOM as `data-cover-rejection`, not into a `console.warn`** | It is inspectable, it is assertable, and it costs nothing per render. A warn on a feed of refused covers is twenty lines of noise per scroll, and the DOM is what a viewer's device actually holds. `RetryableError`'s `data-failure-kind` is the same idiom in the same directory | Drop the attribute |
| G7 | **The attribute carries the rejection name, never the URL** | Writing a refused `javascript:` payload into the DOM from the code that refused it is a small joke with a long tail. `HOST_NOT_TRUSTED` is what a triager needs; the URL is in the response and in the database | Add the value |
| G8 | **`MISSING` is reported too, unlike on the server** | `coverRejections` excludes it because a nullable field being null is not a finding and a report that fires on every drama is a report nobody reads. An attribute has no such cost, and "absent" versus "refused" is precisely the distinction someone reading the DOM is trying to make | Omit it for `MISSING` |
| G9 | **`@minidrama/config` becomes a real dependency of the app** | It is imported by shipped code now. Leaving it in devDependencies would work — the bundler does not read the field — until something did read it | Move it back |
| G10 | **The source scan lives in `import-hygiene.test.ts`** | That file is already the home for "rules about the source tree that must hold everywhere", with four such rules in it. A second file doing the same thing in a different place is how one of the two stops being maintained. Appended at the end, so its conflict surface against in-flight work is one hunk | Move to its own file |
| G11 | **The cover tests moved out of `states.test.tsx`** | One of them had to be edited anyway (it used an untrusted host), the file is named after `states.tsx`, and 27 allowlist cases in it would bury the state tests. The move is a delete and a paste, not a rewrite | Move them back |
| G12 | **The registry and the checker are unchanged** | `checkCoverUrl` needed a caller, not an edit. Touching `packages/` here would put this branch in conflict with anything else that reads the registry, for no behaviour | — |

---

## 4. Deliberately not done

- **No touch to the W10 report or the homepage-flake merge.** Both in flight. This branch is cut
  from `main` at `f8465df` and does not contain a line of either.
- **No change to `packages/shared/src/image-url.ts`, `packages/config/src/cover-hosts.ts` or their
  suites.** The decision was already right and already tested; it had no caller.
- **No change to `server/`.** The server half of D-02 closed in W6.
- **`TRUSTED_COVER_HOSTS` still holds the `.invalid` placeholder.** U-IMG-1 is a research
  unknown — the real host is read off a real cover URL, not guessed — and inventing an entry here
  would be the one edit that makes this gate meaningless.
- **No `console.warn` on refusal, and no telemetry.** There is no client logging seam in this
  repository, and inventing one for this is a bigger decision than this slot (§6).
- **No PR opened**, per the protocol.
- **The `FavoritesPage` flake was not fixed** (§6). It is on `main`, it is not mine, and the file
  is one an in-flight slot may hold.

---

## 5. Known gaps in this slot's own work

- **The gate holds for `<img>` and for nothing else.** The source scan bans a second `<img>`; it
  does not ban `style={{ backgroundImage: url(…) }}`, an `<a href>` around a thumbnail, or a share
  sheet handed a cover URL. None of those exists today. Each is a plausible next feature and each
  would need to go through `checkCoverUrl` — the scan will not tell anyone that.
- **The scan is a regex over lines.** `<img` split across a line break, or built through
  `createElement`, walks past it. `app/tools/source-rules.ts` already refuses a computed element
  name, which covers the second; the first is a formatting accident away and prettier makes it
  unlikely rather than impossible.
- **A refusal is invisible in production.** `data-cover-rejection` is in the DOM of a WebView
  nobody is inspecting. On the server, `coverRejections` at least *can* be logged by a caller who
  wants it; on the client there is no equivalent, and a licensor delivery that quietly switches CDN
  will look like a catalogue with no artwork.
- **`checkCoverUrl` runs on every render**, building a host set and parsing a URL each time. It is
  microseconds against a set of one host, and a feed of twenty cards makes it twenty of those. If
  the registry grows or the feed gets long, `useMemo` on `src` is the fix; measuring first is the
  better instinct, and this slot did not measure.
- **Nothing tests the four call sites**, only the component. `FeedCardView`, `DramaPage`,
  `HistoryRow` and `FavoriteRow` all pass `drama.coverUrl` through, and their own suites assert
  covers appear — they pass because the fixtures use the registry's host, which the new
  "renders the catalogue fixtures" test makes explicit at one place rather than four.
- **The `.invalid` registry means the accept path has never been exercised against a real host.**
  Every accepted URL in every suite, and every cover in the seed catalogue, points at a host that
  cannot resolve. The parse-and-compare logic is host-agnostic and well covered, but the first real
  cover URL is still the first real test of U-IMG-1.

---

## 6. For the next slots

**For the integrator.** Cut from `main` at `f8465df`, two commits, six files. The conflict surface
is `CoverImage.tsx` (rewritten body, same props and same `data-testid`s), `states.test.tsx` (a
deleted `describe` and one import), the end of `import-hygiene.test.ts`, and `app/package.json`'s
dependency blocks with the lockfile line that follows. Any branch that renders a cover keeps
working unchanged; a branch that adds a *new* `<img>` will fail the source scan, and that is the
scan doing its job rather than a merge problem. **This closes the client half of D-02 / T2-1.**

**For whoever picks up U-IMG-1.** The registry entry and the `TRUSTED_DOMAINS` image entry change
together, `validateCoverHostRegistry` checks both directions, and nothing in this slot's tests
hard-codes `cdn.example.invalid` — they read `TRUSTED_COVER_HOSTS[0].host`. Replacing the
placeholder should therefore be a one-line change in `cover-hosts.ts`, a matching one in
`domains.ts`, and the seed fixtures. If a suite anywhere fails on a literal `.invalid` after that,
the literal is the bug.

**For whoever wants refusals to be visible.** The missing piece is a client reporting seam, not
more checking. `data-cover-rejection` is where the reason already is; a single "the client refused
a cover" event, sampled, would turn a CDN switch from a support ticket into a graph. That decision
is bigger than one component and should not be smuggled in as a `console.warn` here.

**A flake found on `main`, not fixed, and not this slot's.** While measuring the baseline test
count at `f8465df`, `app/src/routes/FavoritesPage.test.tsx` → `favorites paging` → **`appends the
next page with the cursor the server handed back`** failed once in a full-suite run, then **once in
five** runs of that file alone on an otherwise idle box. It is the exact shape
`docs/handoff/w9-work-homepage-flake.md` §5 predicted would flake next: a `findBy*` for the first
page, a `fireEvent.click`, and a `waitFor` for the appended row — two independent wall-clock
deadlines over a stub that resolves synchronously outside any `act` scope. The W9 remedy applies
verbatim (wrap both in `await act(async …)`, assert with `getBy*`). It was left alone because it is
another slot's file and this branch is about the cover gate, but it is more readily reproducible
than the flake W9 was asked to fix, and it should be someone's next twenty minutes.
