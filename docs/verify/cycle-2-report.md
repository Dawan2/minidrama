# Cycle 2 — Independent Verification Report (Wave 10)

> **Slot:** W10, independent verifier for cycle C2 (waves W6–W10), per `docs/plan/wave-protocol.md`
> §4 — verification waves are `5k`, so W5 verified C1 and W10 verifies C2.
> **Date:** 2026-08-27.
> **Branch:** `cursor/w10-verify-cycle-2-7b17`, cut from `main` and kept at `main`'s tip so every
> cross-reference in this report resolves against the tree it describes.
> **Mandate:** record what is true. This slot did not implement product features, did not modify any
> source file to make a check pass, did not delete, skip or weaken a test, and did not rewrite any
> origin branch. The only file added is this one. No pull request was opened.
> **Method:** every claim is re-derived from a clean checkout with the command quoted next to it, per
> `docs/plan/wave-protocol.md` §4.1 rule 3. Where a handoff document asserts a result, the result was
> re-run rather than accepted — including the two guardrails and the one flake this cycle claims to
> have fixed.
> **Predecessor:** `docs/verify/cycle-1-report.md`, verdict **not passed**. Its nine defects `D-01`
> …`D-09` are individually re-tested in §7.1; new defects continue the numbering at `D-10`.

---

## 0. Verdict

**Not passed**, against the C2 exit standard in `docs/plan/wave-protocol.md` §5.1 — but for reasons
almost entirely different from C1's, and after the largest single increment the project has produced.

C2's stated theme is 工程地基 (engineering foundations): backend base, **data layer and migrations**,
frontend scaffolding and routing, **CI L2**, observability. Its four exit conditions:

| C2 exit condition | Status | Why |
|---|---|---|
| 迁移正向+回滚可执行 — migrations run forward and roll back | **Not met** | There is no database and no migration. Every store on `main` is `createInMemory*`; there is no `server/migrations` and no schema tooling in any manifest (§3.4) |
| 种子数据 ≥2 部剧 ≥80 集 — seed data ≥2 dramas, ≥80 episodes | **Partially met** | 8 dramas (condition met) but **27 episodes** against a floor of 80 (§3.4) |
| L2 门禁全绿且反向验证通过 — L2 gates all green and reverse-verified | **Not met** | L2 does not exist. `.github/workflows/ci.yml` is the only workflow and carries L1 gates only; no integration suite, no smoke E2E, no SAST, no SCA, no artifact budget (§6.3) |
| traceId 端到端贯通 — traceId flows end to end | **Met** | The server stamps `req_*` into every error envelope (`server/src/core/errors.ts`) and the client parses it into `ApiFailure.traceId` and surfaces it (`app/src/unlock/UnlockPanel.tsx:322`) |

One of four. And the C1 re-verification this slot also owns (`docs/plan/cycle-2-backlog.md` T1-6)
does not pass either: of C1's three exit conditions, one is now met, one is closer but still short,
and one is unchanged (§7.2).

**The single fact that decides the verdict independently of any of the above:** `main` is **red right
now**. CI run [33105322586](https://github.com/Dawan2/minidrama/actions/runs/33105322586) failed on
`main` at HEAD `67cac3b`. Iron rule R6 (`docs/14-quality-gates.md` §0) requires `main` to be
releasable at all times. In C1 that rule was inapplicable because `main` was a README. This is the
first cycle in which it is applicable, and it is being violated at the moment of verification (§1).

This verdict is not a judgement on the cycle's craftsmanship, which is high and which improved on an
already-high C1. Two of C1's three P1 engineering defects were fixed properly — not papered over —
and one of them (`D-01`) I re-probed end to end and could not defeat. The failure is that the cycle
delivered *C3's* content while C2's own exit conditions went untouched, and that it closed with the
trunk red.

Per `docs/plan/wave-protocol.md` §4.3, a "not passed" verdict means the C3 plan wave must schedule
remediation as top priority and implement waves may not open a new epic until re-verification passes.

---

## 1. The headline finding: `main` holds the product, and `main` is red

Both halves matter, and the second one is new.

C1's headline was that `main` was one commit containing a README. That is emphatically fixed:

```
$ git rev-parse --short origin/main
67cac3b
$ git ls-tree -r --name-only origin/main | wc -l
383
$ git rev-list --count origin/main
197
$ pnpm install --frozen-lockfile && pnpm run verify
… exit 0 — 2,137 tests across 114 files
```

Forty-seven of the forty-eight `cursor/*` branches on origin are now ancestors of `main`. The product
is assembled, and CI has run 30+ times where in C1 it had run zero. That is the achievement of this
cycle and it is a large one.

And then, eleven minutes before this report was written:

```
$ gh run list --branch main --limit 3
33105322586  failure  67cac3b  Merge w9-homepage-flake-c44e: the append-failure feed test no longer …
33104568101  success  2b66323  Write up the C3 integration, including the merge git got wrong
33104413025  cancelled 1c7d742 Merge w9-work-unlock-grant-5224: a verified payment now grants the ep…
```

The failing test is `src/routes/HistoryPage.test.tsx > history paging > offers a sign-in under the
loaded rows when a later page loses the session`, at line 272 — `Unable to find an element by:
[data-testid="history-sign-in-more"]`.

**The commit that went red is the merge of the flake fix.** And the test that failed is not the test
that was fixed; it is a structurally identical test in a different file. The same commit is green on
this machine at rest (`pnpm run verify` → exit 0, twice) and red on GitHub's runner. That combination
— green idle, red under load, same tree — is the whole of the defect, and it is recorded as **D-10**.

The consequence is the one the C3 integrator named in advance and correctly:
`docs/handoff/w9-integrate-c3.md` §4 says that until the flake is closed, "a red `pnpm verify` on
`main` may mean nothing at all, which is the property an integration gate cannot afford." That
sentence is now describing the present state of the trunk rather than a risk.

---

## 2. Repository topology

C1's topology finding was sixteen unmerged branches carrying 57 commits in no assembled artifact.
That is essentially closed.

```
$ for b in $(git branch -r | grep -v HEAD | grep -v origin/main); do
    git merge-base --is-ancestor $b origin/main || echo "UNMERGED $b (+$(git rev-list --count origin/main..$b))"
  done
UNMERGED origin/cursor/w9-work-unlock-grant-5224 (+2)
```

**One branch, two commits.** Down from sixteen branches and 57 commits. The branches named in this
slot's brief resolve as follows:

| Branch from the brief | State |
|---|---|
| `cursor/w7-work-auth-header-96d6` | merged (`5b08616`) |
| `cursor/w8-work-favorites-list-a666` | merged (`b85c415`) |
| `cursor/w8-work-session-viewer-bc30` | merged (`f725f3d`) |
| `cursor/w8-work-favorites-consume-e20d` | merged (`04f1067`) |
| `cursor/w9-work-unlock-grant-5224` | **code merged at `9b308ae`; two later commits are not on `main`** |
| `cursor/w9-homepage-flake-c44e` | merged (`67cac3b`) — and this is the merge CI failed on (§1) |
| `cursor/integrate-c3-ebb3` | fast-forwarded onto `main`; `main` and that branch are the same commit |

### 2.1 The one genuinely unmerged branch (D-12)

`cursor/w9-work-unlock-grant-5224` is +2 commits over `main`:

```
d53a2c0 2026-08-27 18:39:45  Keep the callback's outcome vocabulary free of what was sold
da40a4a 2026-08-27 18:37:35  Add the W9 unlock-grant handoff document
```

`main` merged that branch at `9b308ae` (18:33:27), and the two commits above landed after. They are
not trivial residue:

- **`docs/handoff/w9-work-unlock-grant.md` (335 lines) is absent from `main`.** It is the entire
  written record of the slot that made a paid unlock grant an episode — the most consequential
  behaviour change in the cycle. `git cat-file -e origin/main:docs/handoff/w9-work-unlock-grant.md`
  → does not exist.
- **A source change is absent**: `PaidTradeOrderOutcome`'s `UNLOCK_NOT_GRANTED` is renamed to
  `NOT_FULFILLED` across `paid-trade-orders.ts` and `payment-sink.ts`, so that the payment-callback
  module's outcome vocabulary does not name what was sold. It is a layering correction, not a
  behaviour change, and it is the kind of thing that silently regresses if it is left on a branch
  while the module keeps growing.

`docs/handoff/w9-integrate-c3.md` §4 states that `w9-homepage-flake-c44e` is the only unmerged
branch and that "47 of the 48" are ancestors of `main`. That was already inaccurate when written at
18:39:22, because `da40a4a` had been on origin for 107 seconds. Not a serious error — but the effect
is that the one branch still outstanding is the one no document lists as outstanding.

**Both remaining merges are clean and green.** Verified rather than assumed: in a throwaway worktree,
`origin/main` + `w9-work-unlock-grant-5224` + `w9-homepage-flake-c44e` merged with zero conflicts
(`git merge-tree` reported a tree and no conflict list for each) and `pnpm run verify` exited 0 with
2,137 tests. The worktree was removed and nothing was committed from it. There is no integration risk
left in this branch, only the fact that it has not been done.

### 2.2 Cycle labelling has drifted (D-13)

`docs/plan/wave-protocol.md` §5.1 maps **C2 to W6–W10** and **C3 to W11–W15**. The W6 integration
slot labels itself correctly (`docs/handoff/w6-integrate.md`: "integration slot (cycle C2)"). The W9
integration slot labels itself **C3** — branch `cursor/integrate-c3-ebb3`, document
`docs/handoff/w9-integrate-c3.md`, "integration slot (cycle C3)".

W9 is inside C2. This is not pedantry, because the label tracked the work: what W7–W9 actually built
is C3's declared content (认证闭环, 目录/详情/分集, playback token and `viewerAccess` enforcement),
delivered ahead of schedule and to a good standard — while C2's own declared content (data layer and
migrations, CI L2, observability) was not started. The cycle produced the next cycle's substance and
skipped its own foundations, and the mislabelling is why nobody noticed inside the cycle.

---

## 3. Maturity

### 3.1 Mandatory platform capabilities (`docs/11-official-onboarding-checklist.md` §5, D4–D9)

C1 found zero of six integrated and no product code calling any platform capability. That has moved:

```
$ rg -n "getMenuButtonRect|setNavigationBarColor|showRewardedAd|showInterstitialAd|createSubscription" \
     app/src --glob '!src/platform/**' --glob '!**/*.test.*'
$ rg -n "\.login\(|\.pay\(" app/src --glob '!src/platform/**' --glob '!**/*.test.*'
```

| # | Capability | C1 | C2 | Evidence |
|---|---|:---:|:---:|---|
| D4 | Silent login | not integrated | **mock-integrated** | `app/src/session/silent-login.ts:65` calls `deps.bridge.login()`. Server-side, `createMockIdentityPort` issues real sessions for `mock:<userId>` codes behind `config.testLoginEnabled`, which logs a loud warning; `createTiktokIdentityPort` still refuses every real code until the HTTP exchange lands. This is the right shape: the whole flow is exercisable, and only the credential exchange is blocked on M1 |
| D5 | Rewarded video ad | not started | **not started** | no product caller, no reward ledger, no server-side `isEnded` check |
| D6 | Interstitial ad | not started | **not started** | no product caller |
| D7 | Beans one-off payment | not integrated | **client wired, server refuses** | `app/src/unlock/coin-unlock.ts:162` calls `deps.bridge.pay(order.payment.tradeOrderId)`. `server/src/app.ts:291` still defaults to `createUnavailableTradeOrderPort()`. No coin→Beans rate exists (§8.4) |
| D8 | Subscription | not started | **not started** | `createSubscription` appears only in `app/src/platform/`, in `canIUse` probes (`DramaPage.tsx:66`, `access-presentation.ts:53`) and in test fixtures. No server surface |
| D9 | Navigation bar / capsule avoidance | not started | **not started** | `setNavigationBarColor` and `getMenuButtonRect` have no product caller. `docs/plan/cycle-2-backlog.md` T0-3a says "**Do this first**"; it was not done |

**Two of six now have a product-code call site, up from zero.** D4 is genuinely exercisable
end-to-end against the mock port, which is C3's first exit condition reached early. D9 remains the
cheapest unblocked item on the board and remains undone across two cycles.

### 3.2 Screens and panels

`docs/02-screen-inventory.md` §1 defines 13 screens, 5 overlay panels, 6 global components.

| | C1 (trunk / union) | C2 (`main`) |
|---|:---:|:---:|
| Screens | 3 / 7 of 13 | **8 of 13** — home, search, drama, play, me, history, favorites, fallback |
| Panels | 0 of 5 | **1 of 5** — PNL-02, `app/src/unlock/UnlockPanel.tsx` |

Missing screens: SCR-01 splash, SCR-03 browse, SCR-09 wallet, SCR-10 recharge, SCR-11 VIP,
SCR-12 settings. Missing panels: the episode picker, and the recharge and VIP panels.

The monetisation surface is the notable gap and it is a shrinking one: the coin unlock panel exists
and reaches a user, but there is still no wallet, no recharge and no VIP screen, and
`rg -l "wallet|recharge"` finds nothing under `server/src` — no wallet endpoint is served, and none
appears in the contract.

### 3.3 Server surface

Seventeen paths, twenty operations, one document, all reachable, all documented:

```
$ rg -c '^  /' contracts/openapi.yaml
17
$ rg -c '^    (get|post|put|patch|delete):' contracts/openapi.yaml
20
```

`/health`, `/v1/auth/login`, `/v1/dramas`, `/v1/dramas/{dramaId}`,
`/v1/dramas/{dramaId}/episodes`, `/v1/dramas/{dramaId}/favorite`, `/v1/episodes/{episodeId}`,
`/v1/recommendations/feed`, `/v1/search`, `/v1/users/me/favorites`,
`/v1/users/me/watch-history`, `/v1/progress/episodes/{episodeId}`, `/v1/playback/sessions`,
`/v1/entitlement/episode-access`, `/v1/unlock/coin-orders`, `/v1/unlock/coin-orders/{orderId}`,
`/v1/payments/callbacks/tiktok`.

The fail-closed port discipline C1 praised is intact and was extended rather than diluted: the four
refusing ports are still refusing, and the two new capabilities added this cycle (the favourites list
and the paid-unlock grant) both sit behind `requireViewer` and a verified payment respectively.

### 3.4 Persistence — the C2 condition nobody started

```
$ rg -l "createInMemory" server/src --glob '!**/*.test.*'
server/src/modules/{unlock/unlock-store,unlock/order-store,search/favorites,progress/store,
platform-tiktok/event-store,identity/session-store,catalog/store}.ts, server/src/app.ts
$ ls server/migrations server/src/db
ls: cannot access 'server/migrations': No such file or directory
ls: cannot access 'server/src/db': No such file or directory
$ rg -n "postgres|prisma|drizzle|sqlite" package.json server/package.json
(no matches)
```

Seven in-memory stores, no database, no migration, no schema tooling. Nothing survives a restart.
This is C2's first exit condition and it is at zero.

Seed data, C2's second exit condition, from `server/src/modules/catalog/fixtures.ts`: **8 dramas**
(floor is 2 — met) totalling **27 episodes** (floor is 80 — not met; 7+6+4+3+2+3+2+0). The
distribution is deliberate and good — an offline drama and a draft drama with zero episodes are
exactly the fixtures a catalogue needs — but the scale required before pagination, feed ranking and
history mean anything is not there.

### 3.5 Overall maturity judgement

The project has moved from **architecture-and-contract maturity, pre-integration** to **an assembled,
gated, read-path-complete mock application**. That is a real category change, not an increment inside
a category.

What it is not: it is not persistent, it is not observable beyond structured request logging, it has
no L2 gates, it has no monetisation currency, and it has never run on a device. Against the
twelve-cycle map, the delivered substance now sits inside C3 on the read path while C2's foundations
are unbuilt — so the honest position is "C3 content on C1 foundations", and the remediation is to go
back for the data layer rather than forward to C4.

---

## 4. Increment against cycle 1

Every number in the C1 column is from `docs/verify/cycle-1-report.md`; every number in the C2 column
was measured on `origin/main` at `67cac3b`.

| Measure | C1 | C2 | Change |
|---|---:|---:|---|
| `main` commits / files | 1 / 1 | 197 / 383 | the trunk exists |
| Unmerged branches | 16 | **1** | −15 |
| Commits in no assembled artifact | 57 | **2** | −55 |
| Test files | 41 | **114** | +73 |
| Tests | 713 | **2,137** | **+1,424 (3.0×)** |
| Source lines (ts/tsx, non-test) | ~6,019 | 17,910 | +198% |
| Test lines | ~6,814 | 24,166 | +255% |
| Contract documents | 5, incompatible | **1** | fork closed |
| Contract paths (best single artifact) | 9 | **17** | +8 |
| CI runs, ever | **0** | 30+ | pipeline is live |
| CI runs on `main` | 0 | 5 (3 success, 1 cancelled, **1 failure at HEAD**) | live, and red |
| L1 gates present | 4 of 10 | 4 of 10 | **unchanged** |
| L2 gates present | 0 | 0 | **unchanged** |
| Screens | 3 (union 7) of 13 | 8 of 13 | +5 |
| Overlay panels | 0 of 5 | 1 of 5 | +1 |
| D4–D9 with a product call site | 0 of 6 | 2 of 6 | +2 |
| Documents / handoffs | 70 / 29 | 87 / 43 | +17 / +14 |
| C1 P1 defects open | 5 | 2 | −3 |

Tests grew 3× and source grew 3× together, and the test-to-source line ratio *rose* from 1.13 to
1.35. A cycle that triples its output while raising its test density is not cutting corners to get
volume, and that deserves to be said plainly.

The two flat rows are the ones that matter for the verdict. **L1 gates went from 4 of 10 to 4 of 10,
and L2 from 0 to 0, in the cycle whose stated theme was CI L2.**

---

## 5. Evidence

### 5.1 `main` verifies clean at rest

```
$ git rev-parse HEAD
67cac3b…
$ pnpm install --frozen-lockfile && pnpm run verify
… exit 0
```

`verify` = `format:check` → `lint` → `typecheck` → `test` → `build` → `check:guardrails`. Run twice,
exit 0 both times.

| Package | Test files | Tests |
|---|---:|---:|
| `packages/shared` | 4 | 51 |
| `packages/config` | 3 | 45 |
| `server` | 53 | 1,314 |
| `app` | 54 | 727 |
| **Total** | **114** | **2,137** |

0 failed, 0 skipped. Build emits `dist/assets/index-Bt6xB-Yi.js`, 306.19 kB (95.21 kB gzipped). These
counts match `docs/handoff/w9-integrate-c3.md` §1 exactly, which is the first time in this project a
handoff's headline numbers have been independently reproduced without adjustment.

### 5.2 `main` does not verify clean under load

This is the same tree, and it is the finding of the cycle.

**CI, independently and without prompting from this slot.** Run 33105322586 on `67cac3b`: `app test`
reports `Test Files 1 failed | 53 passed (54)`, `Tests 1 failed | 726 passed (727)`. The failure is
`HistoryPage.test.tsx:272`.

**Reproduced locally on a different test.** Four cores, the full `app` suite run three times with the
CPUs saturated by `nproc` busy loops for the duration:

| Round | Result |
|---|---|
| 1 | pass |
| 2 | pass |
| 3 | **FAIL** — `HomePage.test.tsx > feed paging > appends the next page and stops offering more when the cursor runs out`, `AssertionError: expected [ Array(1) ] to have a length of 2 but got 1` |

The same test filtered and run 12 times serially at rest: 12 passes. So the defect is load-dependent
in exactly the way `docs/handoff/w9-work-homepage-flake.md` §1 diagnoses, and the diagnosis in that
document is correct and well-argued. What is not correct is its scope (§7.3, D-10).

### 5.3 The two repaired guardrails, reverse-verified

Performed in a throwaway worktree at `main`; nothing was committed, and the worktree was removed.

**`D-01`, the bundle scan.** C1 proved it fail-open: it matched only `createElement("video", …)`
while React 19's automatic runtime emits `jsx("video", …)`, so a reachable `<video>` shipped with
`check:guardrails` green. Re-probed by adding reachable elements to `app/src/routes/FallbackPage.tsx`
and building:

| Probe | Marker in shipped chunk | `check:guardrails` |
|---|:---:|---|
| `<video>` + `<iframe>` | yes | **fails**, exit 1, both rules named |
| `<audio>` + `<object>` + `<embed>` | yes | **fails**, exit 1, all three rules named |

All five elements `html-integrity.ts` forbids now have a bundle-layer rule, where C1 found only two
did. `BANNED_ELEMENTS` is a single exported list consumed by `it.each` in
`app/tools/bundle-scan.test.ts`, so adding a sixth element cannot silently skip its fixture — which
is the `SR-1` requirement ("a guardrail with no failing fixture is unverified") satisfied
structurally rather than by discipline.

I then attacked the scan's *stated rationale* — a dependency contributing a native element, arriving
already minified with the JSX callee renamed, which lint cannot see. Driving `scanBundleText`
directly:

| Emitted form | Caught |
|---|:---:|
| `o("video",{src:"a.m3u8"})` — esbuild import rename | yes |
| `h("video",{src:u},null)` — a bundled Preact `h()` | yes |
| `React.createElement("video",{src:"a"})` | yes |
| `e.jsxs("video",{children:[]})` | yes |
| `i("video",null)` / `i("video",void 0)` | yes |
| `a('video',{})` / `` a(`video`,{}) `` — other quote styles | yes |
| `o("video",{...p})` — spread props, renamed callee | yes |
| `const t="video";` — a string mention | no (correct) |
| **`o("video",p)` — renamed callee *and* non-literal props** | **no** |

Nine of ten hostile forms caught. The residual is narrow and is recorded as **D-14**: the third
pattern requires the props argument to be `{`, `null` or `void 0`, so a pre-minified dependency that
forwards a props *variable* to a renamed element factory is still invisible. Our own build is not
exposed — esbuild emits literal props objects from JSX, which the second and third patterns both
catch. This is a P3 where C1's finding was a P1, and it is the difference between "the guardrail does
not work" and "the guardrail has an edge".

**`D-02`, the cover allowlist.** C1 found `checkCoverUrl` called by nothing but its own tests. It is
now wired, and wired at a well-chosen place:

```
$ rg -n "checkCoverUrl" --glob '!**/*.test.*' --glob '!docs/**'
server/src/modules/catalog/covers.ts:53,82
```

`safeCoverUrl` is applied in `views.ts`, the single boundary where a `DramaRecord` becomes a wire
object — so the drama list, drama detail, episode list and recommendation feed all pass through it,
and a refused cover is **omitted as `null`** rather than substituted or passed through. The module's
own comment argues why the check belongs at read time rather than ingestion (the trusted-host
registry changes without the records changing, so a host removed from the registry must stop being
served immediately). `coverRejections` reports separately from serving, so a cover cannot be passed
through by failing to log it. `app/src/components/CoverImage.tsx:56` still assigns `src` directly,
which is now defensible because the server no longer emits an untrusted URL — the client-side check
C1 asked for would be a second implementation of a decision that has one owner.

### 5.4 The iron rules

| Rule | Check | Result |
|---|---|---|
| R2 no deleted tests | test files 41 → 104 → 114 across the three integration points (`git ls-tree`), monotonic; no handoff records a deletion | **clean** |
| R3 no skipped tests | `rg '\.skip\(|\.only\(|xit\(|xdescribe\(|it\.todo\(|test\.todo\('` over `app server packages` | **clean** — zero matches |
| R4 no weakened standards | `rg 'eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error'` | **2 matches**, both `// eslint-disable-next-line no-script-url` in test files, both with a reason attached — `catalog/routes.test.ts:490` and `catalog/covers.test.ts:23`, each naming the `javascript:` scheme the catalogue must refuse. C1 recorded zero, so this is a change; it is not a weakening — the suppression exists so a test can *state a hostile input*, and both are single-line and scoped |
| R5 no empty tests | sampled `bundle-scan.test.ts`, `covers.test.ts`, `payment-sink.test.ts`, `contract.test.ts` | assertions are behavioural and specific; `contract.test.ts` asserts the route↔document mapping in **both** directions, so neither an undocumented route nor an unregistered documented one can pass |
| R6 `main` releasable | `gh run list --branch main` | **violated at HEAD** (§1) |

TypeScript still runs `strict` with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No
test was made green by lowering a standard in this cycle either, and the one flake fix that landed
explicitly refused the three cheap outs — no skip, no `test.retry`, no raised timeout
(`docs/handoff/w9-work-homepage-flake.md` K7). That is the right instinct and it should be protected.

---

## 6. Gate enforcement

### 6.1 CI now runs, which is C1's D-03 closed

`.github/workflows/ci.yml` triggers on `push` to `main` **and** `cursor/**`, plus `pull_request`, with
a comment explaining exactly why the branch trigger matters ("Wave branches are pushed for a long
time before they ever become a pull request"). Concurrency groups keep push and PR refs separate so a
branch push cannot cancel a PR's own check.

Thirty-plus runs exist across `main`, the two integration branches and the slot branches. Slot work
is now gated *before* it is merged, which is what C1 §9 step 3 asked for. This is the cycle's second
big win after the merge.

Two observations on the record rather than the config. Four runs are `cancelled` — the
`cancel-in-progress` policy is doing its job on rapid pushes, but it means the integrator's "verify
green after every step" claim is not backed by a completed run for every step; steps 3 and 4 of the
C3 merge have cancelled runs and only the local verify. And run 33103725708 on
`cursor/integrate-c3-ebb3` is a genuine `failure` mid-merge, which is CI catching a real
mid-integration break — the pipeline demonstrably works.

### 6.2 Four of ten L1 gates, unchanged from C1

`.github/workflows/ci.yml` against `docs/14-quality-gates.md` §2:

| Gate | C1 | C2 | Note |
|---|:---:|:---:|---|
| G1.1 format | yes | yes | `prettier --check` |
| G1.2 lint | yes | yes | `eslint` plus custom platform rules |
| G1.3 typecheck | yes | yes | `tsc --noEmit`, strict |
| G1.4 unit tests | yes | yes | full suite |
| G1.5 coverage + diff coverage | no | **no** | no coverage tooling in any manifest or vitest config. `docs/plan/cycle-2-backlog.md` T1-1 called this "the only missing L1 gate that is purely local work"; it was not done |
| G1.6 contract compatibility | no | **no** | no OpenAPI breaking-change check. `contract.test.ts` checks internal consistency, not compatibility across versions |
| G1.7 dependency audit | no | **no** | |
| G1.8 secrets scan | no | **no** | |
| G1.9 commit convention | no | **no** | style remains prose subjects |
| G1.10 skip / empty-test detection | no | **no** | clean by discipline, unenforced by machinery — and R4 drifted from 0 to 2 this cycle unobserved (§5.4) |

The two extras beyond the standard (platform guardrails against the built artifact, and
regenerate-and-diff on `app/minis.config.json`) are still present and are still worth keeping. The
guardrail extra is now the best-tested gate in the repository (§5.3).

### 6.3 L2 does not exist, in the cycle that was supposed to build it

`ls .github/workflows/` → `ci.yml`, and nothing else. No integration suite, no smoke E2E (no
Playwright, Cypress or Puppeteer in any manifest), no SAST, no SCA, no artifact budget, no migration
check, no licence audit. C2's third exit condition is "L2 gates all green **and reverse-verified**";
there is nothing to reverse-verify.

### 6.4 Reverse verification (checklist V-b)

C1 could not satisfy V-b because the pipeline had never gone green. It now has, so V-b is answerable
for the first time — and the answer is partial:

| Gate | Reverse-verified? | By whom |
|---|---|---|
| Platform guardrails (bundle scan) | **yes, twice** | `app/tools/bundle-scan.test.ts` fixtures per banned form per call shape; and independently end-to-end by this slot (§5.3) |
| G1.4 unit tests | **yes, incidentally** | run 33103725708 failed on a real mid-merge break; and the flake slot mutated `use-paged-resource.ts` to prove its test still catches the regression it guards (`w9-work-homepage-flake.md` §2.2) |
| G1.1, G1.2, G1.3 | **no** | no recorded injection |
| Generated-files check | **no** | |

`docs/plan/cycle-2-backlog.md` T1-3 asked for a sweep covering every L1 gate. Two of four were
covered, both as a by-product rather than as the sweep.

---

## 7. Defects

Recorded, not fixed, per `docs/plan/wave-protocol.md` §4.1 rule 4.

### 7.1 Cycle 1's nine defects, re-tested individually

| ID | C1 sev | Status | Evidence |
|---|:---:|---|---|
| **D-01** bundle scan fail-open | P1 | **Fixed** | Reverse-verified end to end: all five banned elements now fail the build, exit 1, and nine of ten minified/renamed hostile forms are caught. One narrow residual carried forward as D-14 (§5.3) |
| **D-02** cover allowlist has no caller | P2 | **Fixed** | Wired at `views.ts`, the single record→wire boundary; refused covers omitted as `null`; rejections reported separately from serving (§5.3) |
| **D-03** CI has never executed | P1 | **Fixed** | Triggers on `main` and `cursor/**`; 30+ runs; one caught a real mid-integration break (§6.1) |
| **D-04** contract forked five ways | P1 | **Fixed** as a fork | One document, 17 paths, 20 operations, and `contract.test.ts` asserts route↔document mapping in both directions. The *parity* half of the original finding remains and is re-scoped as D-11 |
| **D-05** file-ownership rule not applied | P1 | **Partially fixed** | Slot count is now protocol-conformant — W7 and W8 each ran three work slots against §3.1's three, versus sixteen across W2–W4. But §3.1's A/B/C path boundaries were never restored *or* amended in writing (T1-5 not done), and the C3 merge still cost 13 conflicts across five branches including one wrong rename detection. The symptom is much smaller; the rule is still not the thing preventing it |
| **D-06** `SR-5` specified but unenforced | P2 | **Open, unchanged** | `rg setValidateVideoReplaceElement app server packages` → exit 1, zero matches. The identifier `docs/plan/media-plane-decision.md` §5.1 requires to be banned still appears nowhere in the rules that are supposed to ban it, including now in the repaired bundle scan that would have been the natural place to add it |
| **D-07** doc 12 self-contradicts on unlock paths | P3 | **Open, unchanged** | `docs/12-api-contracts.md:46` declares `POST /episodes/{id}/unlock` and `POST /dramas/{id}/unlock`; lines 214 and 229 declare `POST /episodes/{episodeId}/unlock` and `POST /dramas/{dramaId}/unlock` |
| **D-08** gate register in three incompatible forms | P2 | **Open, unchanged** | All three documents are now on one tree, which is what T1-4 said would turn this into "a document edit rather than a negotiation" — and the edit was not made. `rg 'GATE-7\|GATE-8' docs/plan/wave-protocol.md docs/00-wave-plan.md` → no matches. The two most consequential external dependencies in the project are still, formally, in no authoritative register |
| **D-09** `main` is not identified as anything | P3 | **Fixed in practice, open on paper** | `main` demonstrably *is* the integration branch and integrator slots ran twice. But `git log -- docs/plan/wave-protocol.md` shows **one commit, from W1**: §8 rule 3 still says merging is "the integrator's" job without naming the integrator or the branch, and §5.1's status column still reads `[~]`/`[ ]` as W1 wrote it |

**Three of five P1s fixed, and fixed properly rather than worked around.** That is the strongest
result in this report.

### 7.2 C1 exit conditions, re-verified (backlog T1-6)

| C1 exit condition | C1 | C2 |
|---|---|---|
| Contract lint zero errors **and** endpoint-by-endpoint parity with `docs/12-api-contracts.md` | Not met — five forks, best 9 of 40 | **Still not met.** The fork is closed and the single document is internally consistent in both directions. Parity is **17 paths / 20 operations against doc 12's 38 unique endpoints**, and the naming divergence is unresolved: doc 12 declares a base of `/api/v1` and `POST /episodes/{episodeId}/playback-token`; the server serves `/v1` and `POST /v1/playback/sessions`. That reconciliation is registered as **X-20** in `docs/plan/x19-playback-endpoint.md` §6 and is still "proposed" |
| CI L1's ten gates reverse-verified, all going red | Not met — CI had never run | **Still not met.** Four of ten gates exist (unchanged); two of those four are reverse-verified (§6.4) |
| Conflict ledger closed or deferred in writing | Not met — ledger on an unmerged branch | **Improved, not closed.** The ledger is on `main`. X-13…X-18 remain listed, `rg '未裁决|待裁决|未决'` finds 7 markers, and X-19's dependent X-20 is unadjudicated |

C1 re-verification does not pass. It is materially closer on one condition of three.

### 7.3 New defects

| ID | Sev | Defect | Evidence |
|---|:---:|---|---|
| **D-10** | **P1** | **`main` is red, and the flake class it is red on is not closed.** Seven tests still drive a two-round stub sequence through stacked wall-clock async utilities; the fix converted an eighth. Two of the seven have now failed — one in CI on `main`, one reproduced by this slot | §7.4 |
| **D-11** | **P2** | **Contract parity with doc 12 is neither reached nor measured.** 17 paths / 20 operations against 38 unique declared endpoints. `docs/plan/cycle-2-backlog.md` T1-2 asked for the parity measurement to be *recorded*; no document in the repository states the figure, and X-20 (the `/api/v1` base and the endpoint-renaming reconciliation that touches every path) is still "proposed" | §7.2 |
| **D-12** | **P2** | **The W9 unlock-grant slot's handoff and one source change are on an unmerged branch, and no document lists them as outstanding.** `docs/handoff/w9-work-unlock-grant.md` (335 lines, the written record of the cycle's most consequential behaviour change) is absent from `main`; `docs/handoff/w9-integrate-c3.md` §4 names only `w9-homepage-flake-c44e`, and its "47 of the 48" claim was already false when written | §2.1 |
| **D-13** | **P2** | **Cycle labelling drifted, and the drift is why C2's exit conditions were never attempted.** `wave-protocol.md` §5.1 maps C2 to W6–W10; the W9 integration slot labelled itself C3. C3's content (auth closure, catalogue, playback token, `viewerAccess`) shipped; C2's content (data layer and migrations, CI L2, observability) is at zero | §2.2, §3.4 |
| **D-14** | **P3** | **Bundle-scan residual: renamed callee *and* non-literal props.** `o("video",p)` is not matched — the callee patterns need a recognisable `jsx`/`createElement` name and the argument-shape pattern needs a literal `{`, `null` or `void 0`. A pre-minified dependency forwarding a props variable to an element factory is invisible. Our own build is not exposed | §5.3 |
| **D-15** | **P3** | **No gate status has been written back for two cycles, and the escalation trigger has fired.** `docs/plan/wave-protocol.md` has one commit, from W1; §6 requires each planning wave to write gate status back once. Every gate still reads as W1 left it. C1's report set the clock: gate discipline rule 3 escalates any gate with no movement across two consecutive cycles to a risk entry with an alternative. C2 has closed with an identical table, so all nine business-track items are now past that trigger | §8 |

### 7.4 D-10 in detail — the flake class, and the one claim that does not hold

`docs/handoff/w9-work-homepage-flake.md` is one of the most honest documents in this repository and
its diagnosis is right. It explains that `findBy*` and `waitFor` are the same mechanism — a 1,000 ms
wall-clock deadline, a 50 ms poll, a `MutationObserver` — that a descheduled vitest worker spends its
budget without being given CPU to do work with it, and that a test needing **two** rounds of the stub
consumes two independent deadlines back to back. It fixes the reported test by replacing both waits
with `act`, which returns when React has run out of work rather than when a timer expires. It proves
by mutation that the test still catches the regression it guards. It refuses a skip, a retry and a
raised timeout. Its §5 states plainly that "the same shape lives in ten other files" and names
`HistoryPage.test.tsx` among them.

Eleven minutes after that branch merged, CI on `main` failed on `HistoryPage.test.tsx`.

The claim that does not hold is decision **K4**: that the sibling `feed paging` tests "each need only
one round of the stub, so neither is the reported flake." They need two. `HomePage.test.tsx:190–206`
stubs `request.cursor === undefined ? ok(page([…], 'cur_2')) : ok(page([…]))` — first page, then
append — which is the same two-round shape as the test that was fixed. Under CPU saturation it
failed for me on round 3 of 3.

The precise remaining exposure, counted mechanically (a test whose stub branches on
`request.cursor === undefined` **and** which uses both `findBy*` and `waitFor`):

| File | Test |
|---|---|
| `routes/HistoryPage.test.tsx` | `offers a sign-in under the loaded rows when a later page loses the session` ← **failed in CI on `main`** |
| `routes/HistoryPage.test.tsx` | `appends the next page and stops offering more when the cursor runs out` |
| `routes/HistoryPage.test.tsx` | `keeps the loaded rows when the next page fails` |
| `routes/HomePage.test.tsx` | `appends the next page and stops offering more when the cursor runs out` ← **reproduced locally** |
| `routes/HomePage.test.tsx` | `drops a drama the feed has already shown` |
| `routes/DramaPage.test.tsx` | `appends a further page of episodes` |
| `routes/FavoritesPage.test.tsx` | `appends the next page with the cursor the server handed back` |

**Seven tests, four files.** Two independently failed within the hour. Twenty-one tests use both
utilities in one body, so seven is the tightly-scoped floor rather than the ceiling.

Two properties make this P1 rather than an annoyance. First, it is **anti-signal on the trunk**: the
same commit is green at rest and red in CI, so a red `main` no longer distinguishes a regression from
weather, which disarms the gate that C1's entire Tier 0 existed to build. Second, the exposure grows
with the product — the idiom is the house style for every paged screen, and `docs/plan/cycle-2-backlog.md`
T2-4 schedules four more screens.

The fix direction the flake slot itself wrote down is the right one and needs only to be applied
across the seven (`w9-work-homepage-flake.md` §6): when a test needs two or more rounds of a stub,
drive it through `act`; one round with a `findBy*` is fine. That document also names the durable
guard — `renderSettled` in `src/testing/render.tsx` — and notes that lint cannot distinguish a
one-round wait from a two-round one, so the mechanical rule has to live in a helper rather than a
rule. Nothing here requires new judgement, only application.

---

## 8. Blockers

### 8.1 Summary

| Blocker | Owner | C1 | C2 | Blocks |
|---|---|:---:|:---:|---|
| Merge of outstanding branches | Integrator | open, worsening | **essentially closed** — 1 branch, 2 commits, clean and green (§2.1) | nothing material |
| Trunk flake / red `main` | Engineering | n/a | **open, new** | any use of CI as a gate (§7.4) |
| Data layer and migrations | Engineering | n/a | **open** | C2 exit; anything that must survive a restart |
| `GATE-8` BytePlus / VePlayer pilot | Business | `[ ]` | `[ ]` **no movement** | any real ingest, moderation or listing work |
| `GATE-7` EIS compliance review | Business | `[ ]` | `[ ]` **no movement** | monetised EU/US launch; 15–30 US business days, criteria unpublished |
| M0 official requirements PDF | User | `[!]` blocking | `[!]` **no movement** | any "requirements verified" terminal claim |
| M1 account / org / credential triple | Business | `[ ]` | `[ ]` **no movement** | all real integration (C7); real login |
| M2 business verification | Business | `[ ]` | `[ ]` **no movement** | monetisation (C8), submission |
| M3 industry qualification | Business | `[ ]` | `[ ]` **no movement** | basic-information approval (C12) |
| M4 monetisation enablement | Business | `[ ]` | `[ ]` **no movement** | Beans, subscription, ads (C8) |
| M5 US launch approval + TPRM | Business | `[ ]` | `[ ]` **no movement** | US release |
| M6 partner / POC channel | Business | `[ ]` | `[ ]` **no movement** | on-device integration (C9) |
| Beans conversion rate | Business | does not exist | **does not exist** | D7; all coin pricing |

**Nine business-track blockers, two cycles, zero movement.** C1's report said: "C1 is one cycle, so
the clock starts now, and C2 closing with the same table is the escalation trigger." C2 has closed
with the same table, and with the gate register itself unedited (D-15). Under
`docs/plan/wave-protocol.md` §6 rule 3, every one of these now requires a risk entry with a named
alternative — which is a writing task, entirely inside the team's control, and it has not been done.

The engineering picture inverted this cycle in a way worth stating: in C1 the largest blocker was
engineering's own unmerged work. That is gone. What remains on the engineering side is small and
well-understood (a flake, a data layer, six missing gates); what remains on the business side is
unchanged and is now the long pole by a wide margin.

### 8.2 `GATE-8` held again

C1 verified that the `MP-C` standing default (VePlayer-only client, no own-media path) was respected.
Re-verified on the assembled trunk: `rg` finds no BytePlus ingest, no moderation submission, no
listing implementation, and `bundle-scan.ts` still bans `hls.js`, `videojs`, `shaka-player` and
`dashjs` — now alongside a media-element scan that actually works (§5.3), which makes this the first
cycle in which the gate's engineering side is enforced rather than merely observed.

The distinguishing property remains: `GATE-8` is the only gate whose *unfavourable* resolution
creates work rather than merely unblocking it, so "still open" means something different here than
for M1–M6. `docs/plan/cycle-2-backlog.md` T3-5 (price MP-B before it is needed) was not done.

### 8.3 Real login is closer than it was

`POST /v1/auth/login` now has a full session lifecycle behind it — `session-store.ts` issues and
resolves, `session-viewer-resolver.ts` is the single resolver every module shares (with the reasoning
recorded in `app.ts`: an order is attributed to whatever resolves it and a payment is later
correlated against that same account id, so a second resolver would record a purchase for the wrong
viewer). The client attaches `Authorization` in one place, strips a caller-supplied credential, and
invalidates on `401` *above* the `204` shortcut so a session expiring mid-session cannot survive in
memory.

`createMockIdentityPort` issues real sessions for `mock:<userId>` codes behind `config.testLoginEnabled`,
which logs a loud warning naming the risk. `createTiktokIdentityPort` refuses every real code. So the
whole flow is exercisable and only the credential exchange is blocked — on M1, which has not moved.

### 8.4 Beans conversion, unchanged

`server/src/modules/unlock/trade-order-port.ts` still carries `priceCoins` and performs no
conversion, deliberately and correctly. The client now calls `bridge.pay(...)` and the server port
still refuses, so the chain is complete in shape and empty of value. This remains **a missing
business input, not a deferred engineering task**: M2 + M4 → trade-order API access → observed Beans
amounts → rate → coin pricing → the unlock economy. T3-4 was not done.

---

## 9. Targets for cycle 3

Ordered. The first item is the precondition for trusting any subsequent measurement, exactly as
merging was in C1.

### Tier 0 — restore the gate's signal

1. **Convert the seven remaining two-round tests to `act`, and land `renderSettled`.** Closes D-10.
   The rule, the helper's location and the reasoning are already written in
   `docs/handoff/w9-work-homepage-flake.md` §6; this is application, not design. Do not raise a
   timeout and do not add `test.retry` — that slot's K7 is right, and a retry would make `main` green
   while removing the last reason to trust it. Validate by running the `app` suite under CPU
   oversubscription, which is how both known failures were produced (§5.2).
2. **Merge `cursor/w9-work-unlock-grant-5224`.** Closes D-12. Verified clean and green in combination
   (§2.1). The 335-line handoff is the cycle's most consequential slot record and it is not on the
   trunk.
3. **Add `push`-time protection for the trunk.** With CI live, the remaining hole is that `main`
   learns it is broken *after* the merge. Whatever form is acceptable under the no-PR rule — a
   required run on the integration branch before the fast-forward, or an integrator step that will
   not fast-forward onto a red run — write it into `wave-protocol.md` §8 alongside naming the
   integrator (D-09's paper half).

### Tier 1 — build C2's actual foundations

4. **The data layer and migrations.** C2's first exit condition, at zero. Seven in-memory stores, the
   domain model's tables, and a forward + rollback pair that CI executes. Everything else in this
   tier queues behind the schema.
5. **Seed data to ≥80 episodes** across the existing 8 dramas. C2's second exit condition, currently
   27. Keep the offline and draft fixtures — they are the useful part of what exists.
6. **CI L2.** C2's third exit condition, at zero: an integration suite against a real database, a
   smoke E2E over login → browse → play, SAST, SCA, an artifact budget. Each one reverse-verified as
   it lands, which is the part C1 and C2 both deferred.
7. **G1.5 coverage** with `docs/14-quality-gates.md` §3.1's thresholds and the ratchet. Two cycles
   unmeasured, and the only missing L1 gate that is purely local work. It is also the gate that would
   have noticed R4 drifting from 0 to 2 suppressions unremarked (§5.4).

### Tier 2 — close C1's and C2's paper debts

8. **Reconcile the contract against doc 12 and record the parity figure** (D-11). Adjudicate X-20 —
   the `/api/v1` base and the endpoint naming — because it touches every path and every later
   endpoint inherits the answer. Fix doc 12's unlock-path self-contradiction while in there (D-07).
9. **Adopt `GATE-7` and `GATE-8` into `wave-protocol.md` §6** and reconcile the M-scheme with the
   GATE-scheme (D-08). All three registers have been on one tree for a full cycle; T1-4 correctly
   predicted this is now a document edit.
10. **Write gate status back, and file the rule-3 escalations** (D-15). Nine gates are past the
    two-cycle trigger and each needs a risk entry with a named alternative. Also correct the cycle
    labels (D-13) so the next integrator is measured against the right exit conditions.
11. **Restore or amend the file-ownership rule** (D-05). C3's merge cost 13 conflicts including one
    wrong rename detection. Either write §3.1's A/B/C boundaries back into force, or amend them to
    match how waves actually run and design the conflict protocol instead of rediscovering it.
12. **Add `setValidateVideoReplaceElement` as a banned identifier** in the source rules and the
    bundle scan (D-06), and close the bundle scan's renamed-callee residual (D-14). Both are small
    edits to a file that now has good fixtures to extend.

### Tier 3 — product, and the business track

13. **D9 — navigation bar colour and capsule avoidance.** Named "do this first" in the C2 backlog and
    still not started. Every screen owes it, no screen has it, and nothing blocks it.
14. **The monetisation surface**: wallet, recharge, VIP, episode picker — 4 of 5 panels and 4 of 13
    screens are still missing, and no wallet endpoint is served.
15. **The business track, unchanged and now escalated.** Establish the account-manager relationship
    (the single release condition for `GATE-8`, the entry point for `GATE-7`, and upstream of M1, M4
    and M6); decide the launch region set (B-4), where excluding the EU and US remains the cheapest
    way to get `GATE-7` off the critical path; obtain the M0 PDF; observe a Beans amount against a
    real trade order. Two cycles of zero movement is now the project's dominant schedule risk, and
    none of it is engineering's to solve.

---

## 10. Checklist verdicts (`docs/plan/wave-protocol.md` §4.2)

| # | Question | C1 | C2 | Basis |
|---|---|:---:|:---:|---|
| **V-a** | Is every task's acceptance criterion reproducibly met? | Not passed | **Not passed** | Per-slot criteria are met and now compose — the assembled trunk reproduces its handoff's headline numbers exactly, which C1 could not check at all (§5.1). Cycle-level C2 criteria are 1 of 4 (§0), and `main` is red (§1) |
| **V-b** | Is CI actually catching things? | Not passed | **Partially passed** | CI runs, gated slot branches, and caught a real mid-integration break. Two of four existing gates are reverse-verified; the guardrail this slot probed independently now holds against nine of ten hostile forms where in C1 it held against none (§5.3, §6.4). Against the full standard: four of ten L1 gates, zero L2 |
| **V-c** | Are there skipped, deleted or weakened tests or gates? | Passed | **Passed** | Zero skips, zero type suppressions, monotonic test counts, no threshold reduced. Two scoped `eslint-disable-next-line no-script-url` in tests, each with a reason, where C1 had zero — recorded rather than excused (§5.4). The flake fix explicitly refused a skip, a retry and a raised timeout |
| **V-d** | Are documents and code consistent; do cross-references resolve? | Not passed | **Not passed** | One contract now, asserted bidirectionally against the router — a real improvement. Remaining: doc 12 parity and self-contradiction (D-11, D-07), three gate registers (D-08), a specified guardrail that still does not exist (D-06), cycle labels that disagree with the protocol (D-13), and an integration document that lists the wrong branch as outstanding (D-12) |
| **V-e** | Are gate and blocker states honestly written back? | Passed | **Split** | *In handoffs:* the cycle's best quality. `w9-work-homepage-flake.md` §1.1 tabulates what it **could not reproduce**, §5 names the ten other files carrying the same exposure, and §2.2 proves its own test still fails on a mutation — a slot arguing against the sufficiency of its own fix, and it was right within eleven minutes. `w9-integrate-c3.md` §3.2 records a merge git got wrong and why both mechanical resolutions would have compiled. *In the registers:* failed. `wave-protocol.md` has not been touched since W1, so no gate state has been written back for two cycles and the rule-3 escalations are unfiled (D-15) |

---

## 11. Closing note

C1's closing note said that sixteen branches of careful work that has never been compiled together is
not sixteen branches of progress until it is merged. It is merged. `main` holds the product, CI runs
on every slot branch, tests tripled while test density rose, the contract fork is closed, and three of
five P1 defects are fixed — two of them re-probed by this slot and holding, one of them (`D-01`) now
the best-tested gate in the repository. Measured as a delta, C2 is the strongest cycle so far by a
wide margin.

Two things stop that from being the verdict.

The first is that **C2 built C3**. Read-path closure, auth, favourites, the paid-unlock grant: all
good, all needed, none of it C2's assignment. C2's assignment was the data layer, migrations, CI L2
and observability, and three of those four are at exactly zero. A cycle that skips its foundations to
deliver the next cycle's features is borrowing, and the mislabelling in §2.2 is how the loan went
unrecorded. Everything above C2 in the twelve-cycle map — the whole monetisation and real-integration
programme — assumes a database that does not exist.

The second is that **the gate the last two cycles were spent building is currently returning noise**.
`main` is red on a test that passes at rest and fails under load, and six of its siblings share the
defect. The flake slot said so itself, in writing, before it happened. The gate is the reason to
believe any of the rest of this report, and restoring its signal is worth more than any feature that
could be built in the same span.

The pattern worth carrying into C3 is the one both W9 slots demonstrated: the flake slot published a
table of what it failed to reproduce and a list of the files its fix did not cover, and the integrator
published the merge git got wrong along with the observation that both mechanical resolutions would
have compiled. In each case a slot's own honesty about its limits is what made the next finding cheap
to reach. This report's two most useful findings — D-10's real scope and D-12's missing branch — came
directly out of reading those admissions and testing them. That is the practice to generalise, and it
is worth more to this project than any of the gates still missing from the L1 table.

---

## 12. Postscript — what moved while this report was being written

Recorded because a verification report that silently goes stale is worse than one that dates itself.
Everything above was measured against `origin/main` at **`67cac3b`**, between 18:40 and 19:01 UTC.
`main` moved twice inside that window, both times after the relevant measurement:

| Time (UTC) | `main` | Effect on this report |
|---|---|---|
| 18:48:31 | `67cac3b` — merge of `w9-homepage-flake-c44e` | The state this report measures. CI failed here (§1) |
| 18:53:42 | `f8465df` — W11 records the merge | **Independently reaches D-12.** Its message flags that `w9-work-unlock-grant-5224` "gained two commits after C3 merged it, one of them production code on the payment path", and records that it was left unmerged deliberately. This slot found the same fact separately; the credit for finding it first is W11's |
| 18:58:15 | `34ff263` — merge of `w9-work-unlock-grant-5224` | **Closes D-12.** `docs/handoff/w9-work-unlock-grant.md` is now on `main` and the `NOT_FULFILLED` rename has landed. Zero `cursor/*` branches from W9 or earlier remain unmerged |

So **D-12 should be read as closed**, by W11 and W12, minutes after it was written down. §2.1's
finding stands as a description of `67cac3b` and as the reason the branch was noticed; it is not an
open defect against the current trunk. The verified-clean-and-green merge result in §2.1 is what
landed, which is the one part of that section still worth keeping.

**Nothing else in this report changed.** Re-checked against `34ff263`:

- **D-10 stands and is now better evidenced.** `f8465df` went green on CI at the same time
  `67cac3b` was red, on a tree differing by one document. Green-then-red-then-green across three
  adjacent commits, none of which touched the failing test, is the load-dependence in §7.4 rather
  than any regression — and it is precisely the anti-signal that makes this P1. The seven two-round
  tests are untouched by either merge.
- **D-11, D-13, D-14, D-15 and C1's D-05, D-06, D-07, D-08, D-09 are unchanged.** No contract path
  was added, `wave-protocol.md` still has one commit from W1, and no gate state was written back.
- **The C2 exit conditions are unchanged.** Still no migration, still 27 seed episodes, still no L2
  workflow.

The verdict in §0 is therefore unaffected: C2 does not pass, on the C2 exit conditions and on R6.
The Tier 0 ordering in §9 changes only in that item 2 is done — which leaves closing the flake as the
whole of Tier 0, and it is the right thing for C3 to start on.
