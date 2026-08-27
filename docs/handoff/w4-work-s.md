# Handoff — Wave 4, Work Slot S: the catalogue refuses to serve an untrusted cover URL

> **Branch:** `cursor/w4-work-s-cover-url-check-6186`, cut from `cursor/w4-work-p-53de` (`169e07c`).
> **Scope:** `checkCoverUrl` — delivered by slot P and called by nothing — now runs at catalogue
> read time. A cover on a host the registry does not list is **omitted**, never passed through.
> `DramaSummary.coverUrl` becomes nullable to say so.
> **Also in scope, unavoidably:** the catalogue read path did not exist on this branch and had to be
> brought over from `cursor/w2-work-d-0d0f`. That is commit 1, copied verbatim; §2.1 is the reason
> and §6 is the merge obligation it creates.
> **Not in scope:** the `playNext` player (owned by another branch, untouched), the watch-history
> list (in flight, untouched), the W5 verification report, and the discovery/recommendation module —
> which inherits the check for free (§4.2). `app/src` is byte-identical; the built bundle still
> hashes `index-B_KnFxaH.js`. No pull request was opened.

---

## 1. The problem this slot had to solve

Slot P built a fail-closed allowlist for cover URLs and wired nothing to it. Its own handoff says so
plainly (`docs/handoff/w4-work-p.md` §6: "No caller… there is no catalogue module on this branch to
invoke it from"), and it left the open question in §7:

> The interesting design question this slot deliberately left open is **when** to check — refusing a
> bad cover at ingest keeps the database clean but makes a licensor's typo an import failure, while
> checking at read time keeps the import forgiving and means every response pays for it. Both are
> defensible; doing neither is not.

Until this slot, the repository was doing neither. `TRUSTED_COVER_HOSTS` was a list with an opinion
and no authority: `toDramaSummary` copied `drama.coverUrl` onto the wire unexamined, and the only
thing standing between a CMS field and an `<img src>` was that neither existed yet.

That gap matters more than "a broken image" because of what a cover field actually is. It is the one
value in the catalogue that is **both attacker-influenced and rendered as a URL**. Titles, prices,
categories and episode numbers are text, numbers and enums — a hostile value in any of them is
ugly, not dangerous. A cover arrives from a licensor delivery, a CMS row or a fixture table, and it
ends up somewhere a URL is dereferenced. Today that is an `<img src>`, which will not execute
`javascript:`. Tomorrow the same field is the thumbnail somebody wraps in a link, drops into a CSS
`url()`, or hands to a share sheet — and the reasoning "an `<img>` can't execute it" was never a
property of the data, only of one of its current renderings.

Answering "when" was the whole design decision, and the answer is **read time**. The reasoning is in
S86, but the short version is that ingest-time checking is not merely inconvenient here, it is
*insufficient*: there is no write path in this repository yet, records already in storage predate
any rule added later, and — decisively — the registry changes without the records changing. When the
real platform image host replaces the `.invalid` placeholder (U-IMG-1), or a host is *removed* from
the registry, an ingest-time check gives the right answer only for content imported after the edit.
A read-time check gives the right answer for everything, immediately.

---

## 2. What was delivered

Two commits, deliberately separable: the first moves code between branches and changes no
behaviour, the second is this slot's work.

### 2.1 Commit 1 — `c084b90` "Bring the catalogue read path onto the entitlement lineage"

The repository has two Wave-2 lineages that never merged. One built the catalogue
(`w2-work-d` → `w2-work-h` → `w3-work-m` → `w3-work-o` → `w4-work-r`); the other built entitlement,
unlock and playback (`w2-work-f`/`i`/`k` → `w3-work-l`/`n` → `w4-work-p`/`q`), and this slot's base
is on the second. So the layer where a catalogue record becomes a wire object — the only correct
place for this check — was not on the branch.

Everything was copied **verbatim** from `cursor/w2-work-d-0d0f` so the eventual merge is a
fast-forward rather than a reconciliation:

| File | Origin |
|---|---|
| `packages/shared/src/catalog.ts`, `catalog.test.ts` | verbatim — the wire view objects |
| `server/src/core/pagination.ts`, `pagination.test.ts` | verbatim — keyset cursors, needed by the store and routes |
| `server/src/modules/catalog/{types,fixtures,numbering,access,views,viewer,store,routes}.ts` | verbatim |
| `server/src/modules/catalog/{access,numbering,store,routes}.test.ts` | verbatim (one edit, below) |

Three integration edits were unavoidable, and they are the only places commit 1 is not a copy:

- **`AppDependencies.viewerResolver` was already taken.** The entitlement module publishes a
  `ViewerResolver` that answers a *different question* — it maps an `Authorization` header to a
  viewer id and can refuse — where the catalogue's maps a request to the viewer's unlocks and VIP
  state. The catalogue's is registered as `catalogViewerResolver`, its type aliased at the import in
  `app.ts`, and the two assertions in `routes.test.ts` that inject one were renamed to match. See §6
  for why this is flagged rather than fixed.
- **`@minidrama/server` now depends on `@minidrama/config`**, which is exactly the step
  `docs/handoff/w4-work-p.md` §5 predicted would be needed ("Whoever wires the catalogue module has
  to add `"@minidrama/config": "workspace:*"`").
- **`packages/shared/src/index.ts`** exports `./catalog.js`.

`catalogRoutes` is registered in `app.ts`, so the four catalogue endpoints are live on this branch
and the check below is provable over HTTP rather than only in a unit test. **Commit 1 changes no
behaviour and adds no assertion**; all 132 copied tests pass unmodified.

### 2.2 Commit 2 — `fe37f94` "Refuse to serve a cover URL the registry does not trust"

| File | Contents |
|---|---|
| `server/src/modules/catalog/covers.ts` | New. `safeCoverUrl`, `coverRejections`, `CoverRejection` — the gate's *placement*, and the reasoning for it |
| `server/src/modules/catalog/covers.test.ts` | New. 34 cases: the gate, the reporter, and the seed catalogue held to the same rule |
| `server/src/modules/catalog/views.ts` | Both cover fields now leave through `safeCoverUrl`. Two lines |
| `server/src/modules/catalog/routes.test.ts` | +9 cases: the refusal observed over HTTP, on the raw response body |
| `packages/shared/src/catalog.ts` | `DramaSummary.coverUrl` becomes `string \| null`, with the reason |

**Tests: 43 new in this slot** (34 + 9), 0 skipped, 0 deleted, 0 existing assertions weakened.

### 2.3 The gate, and where it sits

```
  DramaRecord (fixture table today, a CMS row tomorrow)
        │
        │   coverUrl, horizontalCoverUrl — untrusted strings
        ▼
  views.ts ── toDramaSummary / toDramaDetail ──▶ safeCoverUrl ──▶ checkCoverUrl
        │                                              │           (slot P, @minidrama/config)
        │                                              │
        │                              accepted ◀──────┴──────▶ refused
        │                          value = URL as parsed        value = null
        ▼
  DramaSummary / DramaDetail ──▶ /v1/dramas, /v1/dramas/:id, and the feed (§4.2)
```

`views.ts` is the single boundary a `DramaRecord` crosses to become a wire object, and it is the
choke point for every route that serves one. A check in a route handler instead would have been
correct for that route and absent from the next one somebody wrote.

### 2.4 Omitted, not substituted, not passed through

Three candidate behaviours for a refused cover, and why only one survives:

| Behaviour | Why not |
|---|---|
| **pass it through** — "the client will just fail to load it" | True of today's `<img src>` and of nothing else. This is the reasoning that leaves a `javascript:` URL in a field that later gets wrapped in a link |
| **substitute a placeholder URL** | A placeholder is itself a cover URL and would need a trusted host — which does not exist yet (`TRUSTED_COVER_HOSTS` is still the `.invalid` placeholder, U-IMG-1). Inventing one means shipping a second image pipeline whose only purpose is to be exempt from this check |
| **omit it (`null`)** ✔ | The state the client already has to render: `horizontalCoverUrl` has been nullable since the contract was written, so "no cover, draw your own placeholder" is not a new UI case |

`coverUrl` is therefore nullable rather than **optional**. "No cover" should be a value the client
has to handle, not a key it can forget to look for — one test asserts the field is still present and
still `null` rather than absent.

An absent cover and a refused cover produce the identical value, on purpose. They differ only in
whether anyone should be *told*, which is `coverRejections`' job and not the response's.

---

## 3. Decisions taken in this slot

Numbering continues from `docs/handoff/w4-work-p.md` §3 (which ended at S84).

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S85 | **The catalogue read path is copied onto this branch rather than reimplemented** | The check has to live where a record becomes a view object, and that layer exists — on the other Wave-2 lineage. Writing a second one would put two catalogues in the repository and guarantee they disagree; copying verbatim keeps the merge a fast-forward. Commit 1 is separable from commit 2 for exactly this reason | Discard one commit |
| S86 | **The check runs at read time, not at ingest** | Answers the question `w4-work-p` §7 left open. Ingest-time checking is not just less forgiving, it is insufficient: records already stored predate any rule added later, and the registry changes without the records changing — so when the real image host replaces the placeholder (U-IMG-1), or a host is removed, an ingest check is right only about content imported since. Read time is the only placement whose answer reflects the registry as it stands now | Move two calls |
| S87 | **The gate sits in `views.ts`, the single record→view boundary** | The drama list, the drama detail, the episode list and the recommendation feed all reach the wire through this one function pair. Placing the check per route would be correct until the next route, and the next route is written by somebody who has not read this document | Two lines |
| S88 | **A refused cover is omitted, not replaced with a placeholder URL** | A placeholder is a cover URL and would need a trusted host we do not have. Substituting one would mean a second image pipeline exempt from this check — and the exemption, not the placeholder, is what would eventually be exploited | One `null` |
| S89 | **`DramaSummary.coverUrl` becomes nullable, and the contract says so** | The alternatives were serving an empty string (a falsy value the client must special-case anyway, with no name) or keeping the type a lie. `horizontalCoverUrl` was already nullable, so the client's placeholder state is not new work. No client consumes the field yet, which makes now the cheapest possible moment | One type; the openapi amendment in §6 |
| S90 | **Serving and reporting are separate functions** | `safeCoverUrl` decides; `coverRejections` explains. Keeping them apart means the response cannot be made permissive by failing to log — there is no code path where "nobody is listening" changes what a viewer receives. It also means the reporter can be noisy about detail the response must not carry | Two functions become one |
| S91 | **`MISSING` is refused by the gate and ignored by the reporter** | A nullable field being null is a normal record, not a finding. A report that fired on every drama without a horizontal cover would be noise, and noise is what makes the real finding unreadable. Slot P's S82 kept `MISSING` a *named* refusal precisely so this caller could tell the two apart | One condition; one test |
| S92 | **The seed catalogue is held to the rule, not exempted from it** | The fixtures *are* the content database for now, and content data is what this gate distrusts. So the same registry judges them — and a fixture that stopped being trusted is a **CI failure** rather than a storefront full of missing artwork that gets triaged as a CSS bug. This is the deliberate asymmetry of the slot: data we control fails loudly, data we do not control fails safely | One describe block; 13 tests (§4.1 D7) |
| S93 | **The decisive test asserts on the raw response body, not on the field** | "Untrusted covers are never passed through" is a claim about every field of every response, and a test that reads `body.coverUrl` only proves it about the field we thought of. Scanning the serialised payload for the hostile host and scheme is the assertion that still holds when somebody adds an episode cover | Four cases |
| S94 | **A refused cover degrades nothing around it** | The drama is still listed, the detail still serves, the response is still 200. Dropping the drama or answering 500 would turn a content-data problem into an outage — and an outage is what gets a security check disabled at 2am | One test |
| S95 | **Test files may name `javascript:`, under a scoped lint exemption** | `no-script-url` fires on the hostile literals these tests exist to prove the catalogue refuses. The scheme is written **once per test file** behind an `eslint-disable-next-line` with a reason, and every case is built from that constant. The rejected alternative was concatenating `'java' + 'script:'`, which hides the literal from the linter *and* from the reader, and invites a future cleanup back into a literal | Two comments |

### 3.1 What was deliberately not changed

Per the slot brief: the `playNext` player, the watch-history list and the W5 verification report were
not touched. Neither was `app/src` — the built bundle still hashes `index-B_KnFxaH.js`, identical to
slot P's base. Nothing under `server/src/modules/{entitlement,unlock,playback,identity,platform-tiktok}`
was modified; `app.ts` gained a route registration and two dependency fields and is otherwise
unchanged.

The **discovery/recommendation module was not copied**, although it exists on the catalogue lineage.
It was not needed: its `FeedCard` carries a `DramaSummary` built by `toDramaSummary`, so it inherits
this check the moment it is merged, with no edit (§4.2). Copying it would have been scope this slot
does not own.

---

## 4. Reverse verification

Each rule was reintroduced as a defect and the catalogue suite re-run, per `SR-1`. A rule nothing
fails for is a rule that is not being enforced.

| # | Defect reintroduced | Failing tests | Representative names |
|---|---|---|---|
| D1 | `coverUrl` passed through (horizontal still checked) | **4** | `omits an untrusted cover from the drama list`, `leaks no untrusted cover anywhere in the drama list`, + 2 |
| D2 | `horizontalCoverUrl` passed through (`coverUrl` still checked) | **2** | `omits both cover fields from the drama detail`, `leaks no untrusted cover anywhere in a drama detail` |
| D3 | Both passed through — the gate absent entirely | **4** | as D1 |
| D4 | The input spelling returned instead of the parsed URL | **2** | `returns the parsed URL, not the input spelling`, `keeps the trailing-slash form the parser produces` |
| D5 | `safeCoverUrl` falls open — a refused cover returned unchanged | **20** | `omits a cover on a host nobody registered`, `omits a control-character script-scheme cover`, `omits a cover with embedded credentials`, `leaks no untrusted cover anywhere in a drama detail`, + 16 |
| D6 | An absent cover reported as a finding | **1** | `stays quiet about an absent horizontal cover` |
| D7 | A seed cover moved to a host the registry does not trust | **13** | `drm_revenge_0001 carries only covers the registry trusts`, `has a cover on every drama, so an omitted cover always means a refusal`, + 11 |

Four rows deserve a note.

**D3 fails the same four tests as D1**, not eight. The two leak tests scan a whole response body, and
a body already containing `cdn.evil.example` fails once whether one cover field leaked or both. That
is the correct behaviour for a "nothing leaked" assertion and worth stating so the number is not read
as thin coverage — D5 is the row that shows the breadth.

**D5 is the honest measure of the gate**, at twenty. It is the fail-open defect: the check runs, the
decision is computed, and the refusal is discarded. Every scheme case, every lookalike-host case and
both raw-body scans fail. This is the defect a well-meaning "don't break covers in staging" patch
would introduce, and it is the one the suite is loudest about.

**D6 fails exactly one test, and that is the point of the row.** Reporting `MISSING` breaks nothing a
viewer sees — the response is byte-identical — it only makes the diagnostic fire on every drama
without a horizontal cover. A signal that fires constantly is one nobody reads, so the assertion
exists to keep the reporter worth having.

**D7 fails thirteen, which is S92 working.** Moving the fixture host to `cdn.migrated.example` — the
shape of a real CDN migration — takes down the whole seed-catalogue block plus
`serves a trusted cover as the parsed URL`. Without those assertions the same migration would have
been a silent storefront-wide loss of artwork, served with a 200 and looking exactly like a styling
bug.

### 4.1 What the fail-safe / fail-loud split buys

D7 and D5 are the two halves of the design and are worth reading together. The *same* untrusted host
produces a **CI failure** when it appears in data this repository controls (D7: 13 tests), and a
**silently safe response** when it appears in data it does not (D5's absence: covers omitted, drama
still listed, 200). Neither behaviour alone is sufficient: failing loudly on production data would
mean a licensor's typo takes down the storefront, and failing safely on our own fixtures would mean
a CDN migration ships as missing artwork.

### 4.2 The feed inherits the check unproven

`FeedCard.drama` is a `DramaSummary`, and the discovery module builds one by calling
`toDramaSummary`. So `/v1/recommendations/feed` is covered by construction the moment that module is
merged — but **there is no test on this branch that says so**, because the module is not here. That is
recorded as a gap in §7 rather than claimed as coverage.

### 4.3 Gates

Every gate was run on this branch.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **891 passing, 0 skipped, 0 failing** — 686 server (was 511), 109 app (unchanged), 45 config (unchanged), 51 shared (was 48) |
| Build | `pnpm build` | pass — `assets/index-B_KnFxaH.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The server count moves by 175: **132 from commit 1** (copied, unmodified — `pagination` 33,
`routes` 46, `store` 21, `access` 20, `numbering` 12) and **43 from commit 2** (`covers` 34,
`routes` +9). Shared moves by 3, all from the copied `catalog.test.ts`.

---

## 5. Registered rather than resolved

**The real image host is still unknown (U-IMG-1).** This slot changes nothing about that and
inherits it whole. Everything here is proven against `cdn.example.invalid`, a host in a TLD that
can never resolve. The consequence specific to *this* slot is worth stating: on this branch, a
correctly-configured deployment omits **every** cover the moment a real CDN is introduced, until
`TRUSTED_COVER_HOSTS` and the `image` entry in `TRUSTED_DOMAINS` are updated together and
`pnpm gen:minis-config` is re-run. That is the fail-closed direction working as designed, and it
will look like a bug to whoever hits it first. D7 is the test that turns it into a CI failure
instead — provided the fixture host is updated alongside the registry.

**`coverRejections` has no runtime caller.** It is called by tests only. The reporting path — a log
line when a live catalogue read drops a cover — is not built, because `views.ts` is a pure function
with no logger and threading one through it would change the signature of every view mapper for a
diagnostic. §7 has the shape of the fix.

**The two `ViewerResolver` interfaces are still two interfaces.** `modules/catalog/viewer.ts` and
`modules/entitlement/viewer-resolver.ts` publish the same name for different questions. This slot
aliased the import and moved on; reconciling them is an integration decision that touches both
lineages, and taking it here would have meant rewriting entitlement code this slot has no mandate
over.

---

## 6. The merge obligation this slot creates

Commit 1 copies code from `cursor/w2-work-d-0d0f`, so a later merge with the catalogue lineage will
meet it. Three specifics, in the order they will bite:

**1. `contracts/openapi.yaml` must be amended, and the amendment is not on this branch.** This
branch's contract has no catalogue paths — those live on the catalogue lineage — so there was
nothing here to edit, and duplicating ~250 lines of another slot's contract into a diverged file
would have manufactured a conflict rather than resolved one. The required change, once the two
openapi files meet, is exactly one line in `DramaSummary`:

```yaml
        coverUrl:
          type: [string, 'null']    # was: type: string
          description: |
            A poster image, or null when there is none the client may load — either none was set,
            or the stored URL named a host the trusted-cover registry does not list. The catalogue
            never carries a video handle of any kind.
```

`coverUrl` **stays in `required`** (S89: nullable, not optional). `horizontalCoverUrl` is already
`type: [string, 'null']` on that branch and needs no change. Until this is done, the contract
overstates the guarantee — and `contract.test.ts` will not catch it, because it verifies
documented → implemented, never the schema's nullability.

**2. `AppDependencies.viewerResolver` is the collision.** If the catalogue lineage is merged as-is,
its `app.ts` will try to register a catalogue resolver under a key this lineage gives to the
entitlement resolver. The rename to `catalogViewerResolver` is on this branch; take that side, and
keep the aliased type import.

**3. The catalogue module's other files are byte-identical to `w2-work-d-0d0f`** — except
`views.ts` (two lines), `routes.test.ts` (the two renamed injections plus the appended block) and
the new `covers.ts` / `covers.test.ts`. Anything the catalogue lineage changed in `numbering.ts`,
`access.ts`, `store.ts`, `types.ts` or `fixtures.ts` after `w2-work-d` should be taken from that
lineage wholesale; this branch has no opinion about those files and should lose every conflict in
them. Note that `w3-work-m`, `w3-work-o` and `w4-work-r` all carry a catalogue module, so newer
versions of these files probably exist.

---

## 7. For the next slots

**For whoever owns the feed and detail UI.** `coverUrl` can be `null`, and it means "render your
placeholder" — not "retry", not "assemble a URL from the drama id", not "fall back to
`horizontalCoverUrl`", which can be null for the same reason. Slot P's rule survives into the
client unchanged: render the string that came out of the check, never one you built. Two states, and
the null one is not an error state — a drama with no artwork is still a drama worth listing.

**For whoever wires observability.** `coverRejections(drama)` returns the field, the value and the
named reason, and is currently called only by tests. The clean placement is in the **route handler**,
which has `request.log`, rather than in `views.ts`, which is pure and should stay that way: map the
records, then report on the ones that lost a cover. Rate-limit it per drama id — a CDN migration
makes this fire for the entire catalogue at once, which is the moment the log stops being readable.
The threshold worth alerting on is a *ratio*: a rise in the share of catalogue reads dropping a
cover is a content-data incident, and it currently has no signal at all.

**For whoever adds an episode cover or a poster.** `docs/12-domain-model.md` §2 has both, and
`EpisodeItem` carries neither today. When one is added, route it through `safeCoverUrl` in
`toEpisodeItem` and add the field to `coverRejections`. The four raw-body assertions in
`routes.test.ts` already cover the episode endpoints and will start failing the moment an unchecked
episode cover reaches the wire — which is why they are written against the payload rather than
against the fields that exist today.

**For whoever gets a real cover URL from the platform.** §5, plus one thing slot P's list does not
mention: update `fixtures.ts` in the same change. The fixture host and the registered host are
deliberately the same host (slot P's S84), so editing the registry alone turns D7's thirteen
assertions red — which is the system telling you the other half of the change is missing, not a
broken test.

**For whoever merges the two lineages.** §6, in that order.

---

## 8. Known gaps in this slot's own work

- **The feed is covered by construction and by no test (§4.2).** The claim "every catalogue response
  is checked" is proven for the four endpoints on this branch. The recommendation feed is not here,
  and the assertion that it inherits the check has to be written by whoever merges it.
- **A dropped cover produces no signal at runtime.** `coverRejections` exists and nothing calls it
  outside tests. A content migration that moved CDN hosts would show placeholders across the
  storefront, answer 200, and look like a deliberate design choice until somebody opened a response
  body. This is slot P's §8 gap, narrowed rather than closed: the *mechanism* for the log line now
  exists, and the log line does not.
- **Nothing is proven in a browser or on a device.** Every assertion here is about which strings the
  server emits. That an omitted cover renders as a sensible placeholder rather than a broken-image
  icon is a client property, and `app/src` has no catalogue UI yet.
- **The check is only as good as the registry, and the registry is a placeholder.** A gate whose
  allowlist holds one unresolvable host is easy to prove correct and proves nothing about
  production. The first real cover URL is the test that matters.
- **The seed guard asserts the fixtures pass; it cannot assert they are *realistic*.** Every seed
  cover is a well-formed `https://` URL on the trusted host, so the fail-safe path is exercised only
  by synthetic hostile records in the tests. A real licensor feed with a mixture of `http://` URLs,
  protocol-relative URLs and empty strings would exercise proportions this suite does not model.
- **`DramaDetail.viewer` is still `null` on this branch** and `catalogViewerResolver` still defaults
  to anonymous, both inherited from `w2-work-d`. Unrelated to covers, but it means the catalogue
  responses this slot's tests assert against are the anonymous ones except where a resolver is
  injected.
