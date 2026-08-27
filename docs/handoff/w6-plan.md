# Handoff — Wave 6, Plan Slot: the cycle-2 scheme

> **Branch:** `cursor/w6-plan-cycle-2-963c`, cut from `cursor/w5-verify-cycle-1-7ed1` (`27eec92`).
> **Slot:** W6 is the plan wave of cycle C2 (`docs/plan/wave-protocol.md` §2, wave formula `5k−4`
> with k = 2). Architecture / scheme.
> **Scope:** decide how C1's work gets assembled and what C2 builds. Three documents:
> `docs/plan/cycle-2-integration.md`, `docs/plan/cycle-2-backlog.md`, and this handoff.
> **Also on this branch:** one merge — `cursor/w2-plan-p3-477e`, documentation only, 27 files under
> `docs/`, zero code, zero conflicts. §2.2 explains why a plan slot took a merge.
> **Not in scope:** the code merge itself (five branches, four adjudications — that is W7 slot A's
> whole assignment), any source change, any test change, any change to `main`. No pull request was
> opened and none is required by anything in these documents.

---

## 1. The problem this slot had to solve

The C1 verification came back **not passed**, and not because the work was bad. The report is
explicit that the per-slot craftsmanship is high: fail-closed ports throughout, zero test
suppressions across 31 branches, more test lines than source lines. It failed one level up. `main`
holds a README and nothing else; 31 branches of work have never been compiled together; CI has never
executed once in the history of the project; and the one guardrail the verifier probed independently
turned out not to fire.

So this slot's question was not "what should we build next". It was **"what is the cheapest true
path from 31 branches to a `main` that CI can go green on, and what does C2 build once that
exists"** — with two constraints that shape every answer:

- **No pull requests.** `docs/plan/wave-protocol.md` §8 rule 3. This is usually read as "there is no
  way to land anything", which is where the cycle got stuck.
- **No rewriting other slots' branches.** §8 rule 4, and the C1 branches are also the evidence base
  for the report and for re-verification. Rebasing them to make the merge easier is not available.

The trap this slot had to avoid was accepting the report's framing wholesale. The report is
accurate, and it was written before two more branches landed, and one of its central numbers is now
wrong in a way that matters (§2.1).

---

## 2. What was delivered

### 2.1 The finding that changed the plan: sixteen branches are five

The W5 report scheduled "merge the sixteen off-trunk branches" as the whole of C2's first implement
wave, listing them cheapest-first. Re-derived against the remote as it stands, there are now
**eighteen** branches off the trunk — the report's sixteen plus `w4-work-q-8f92` and
`w4-work-r-d943`, pushed after it was written.

But only **six of the eighteen are maximal**. The other twelve are already ancestors of one of the
six, so merging six merges eighteen:

```
$ for a in $OFF; do for b in $OFF; do
    git merge-base --is-ancestor origin/cursor/$a origin/cursor/$b && echo "$a ⊂ $b"; done; done
```

Two consequences, both large:

- **`w2-plan-p3-477e` contains all eight documentation and planning branches** and is documentation
  only. One conflict-free merge retires eight of the eighteen.
- **`w4-work-r-d943` contains `w2-work-d`, `w2-work-h` and `w3-work-o`.** The report's suggested
  order merges those three separately and in sequence, each with the same three-file conflict. They
  are one merge.

After the docs merge taken on this branch, **the remaining job is five branches and thirty-seven
unique commits**, of which one (`w4-work-q-8f92`) merges clean. That is a materially different task
from the one C2 was about to be planned around.

### 2.2 Why a plan slot took a merge

`docs/plan/cycle-2-integration.md` cites `wave-protocol.md`, `backlog.md`, `w1-conflict-register.md`
and `media-plane-decision.md` throughout. Until this merge, **every one of those lived on a branch
that held no code**, and every branch that held code lacked all of them. The W5 report has the same
problem: its header says it was cut from the trunk "so that the document cross-references resolve",
and its references to `docs/plan/*` do not resolve, because `docs/plan/` is not on the trunk.

So the merge was taken, and it is the narrowest one available: 27 files, all under `docs/`, verified
docs-only after the fact.

```
$ git diff --name-only HEAD~1 HEAD | grep -v '^docs/'
$                                                        # no output
```

It is also step 1 of this slot's own merge order, which means the order has been executed as far as
a plan slot may execute it, and the first step is known-good rather than predicted-good.

### 2.3 `main` can be fast-forwarded, and the protocol permits it

The central question the task poses — how to land on `main` when PRs are forbidden — has a cleaner
answer than expected, in two parts.

**The protocol already prescribes it.** Rule 3 reads *"不开 PR：各槽只 push 分支,合并由集成者执行"* —
do not open PRs; slots only push branches; **the merge is performed by the integrator**. The second
clause is usually dropped when the rule is quoted. The rule bans the GitHub review artifact and in
the same sentence assigns the merge to a role. A protocol that forbade merging could not have an
integrator. Merging with git and pushing is the behaviour rule 3 describes, not a loophole in it.

**And the landing is a pointer move.** `origin/main` (`fc1333f`) is an ancestor of every branch in
the repository, so advancing it is a genuine fast-forward — no merge commit, no possible content
conflict, and the tree that lands is bit-for-bit the tree that was verified green. There is no
"the merge to main went wrong" failure mode.

That property is **perishable**, and preserving it is now a live constraint: one direct commit to
`main` — a README fix, a CI tweak, a plan document — makes `main` diverge from every branch and
turns the pointer move into a merge with conflicts that nobody planned. It is why these three
documents are on a slot branch and not on `main`, and it is written into the integration plan as
§2.4 so the next slot does not undo it by being helpful.

### 2.4 Four adjudications, identified and evidenced

The merge conflicts are not all the same kind of thing. In four places two slots built the *same
module twice*, and `git merge-tree` reports `add/add` — there is nothing to reconcile because there
are two complete implementations. Those need a decision, not a resolution:

| | What was built twice | Evidence | Recommendation |
|---|---|---|---|
| **A1** | The `progress` module — `q` and `j` | add/add on six files | Take `q` whole: it is a strict superset and adds watch-history |
| **A2** | `discovery/routes.ts` — `j` (search, favourites) vs `r`/`m` (feed) | add/add, contents disjoint | **Not a duplicate.** Same name, different modules. Keep both, rename one |
| **A3** | The identity session store — `q` and `l` | `diff` of both files: **byte-identical** | Merge `q`; `l` reduces to two `test-login` files |
| **A4** | The client shell — `m` and `r` | Conflicts in exactly 4 files, all additive | Take the union |

A3 is the most useful of the four. `q` and `l` contain `session-store.ts` and
`session-viewer-resolver.ts` **identically**, so what the report scheduled as two conflicting
session implementations is one implementation plus `l`'s gated mock-login port — which is the piece
that makes every authenticated endpoint testable end-to-end without credentials.

### 2.5 A defect the merge would have hidden

`w4-work-r-d943` ships a complete client search surface — `SearchPage`, `search-api.ts`,
`SearchHitRow` — that calls `GET /v1/search`. **`r` has no server-side search.** Its
`contracts/openapi.yaml` has no `/v1/search` path and its `app.ts` registers no search route. The
endpoint exists only on `w2-work-j-acf5`, which conflicts with `r`.

The two were built against the same contract and their shapes agree — `q`, `limit`, and a
`{ query, items, truncated }` response — so this is not a design problem. It is an ordering
problem: merge `r` and stop, and the product ships a search screen that 404s. It is why `j` is step
6 of the merge rather than being dropped as the branch that loses two adjudications, and it is
recorded as **T2-5** so that the round trip is checked after assembly rather than assumed.

The same class of trap, going the other way, is in `app.ts`: the trunk registers `entitlementRoutes`
and `unlockRoutes`, and `r`'s and `m`'s versions of that file do not, because they forked before
those modules existed. A three-way merge that takes "their" side drops the entire unlock economy
from the server, and **every remaining test still passes** — the tests that covered it came from a
branch whose `app.ts` lost. That is A6, and it is the reason the recommendation is to rewrite
`app.ts` once as a deliberate union rather than resolve it five times.

### 2.6 The backlog

`docs/plan/cycle-2-backlog.md`, four tiers, with the four Tier 0 items the task named:

- **T0-1 CI on feature branches.** With the subtlety that decides whether it works: for a `push`
  event GitHub uses the workflow file *from the branch being pushed*, so this gates branches cut
  after it lands and gates none of the five C1 tips. Those are gated by the integration branch's own
  runs as they merge. The alternative — rebasing the C1 branches — is forbidden and would destroy
  the report's evidence base.
- **T0-2 the `jsx("video")` bundle scan.** With a fix direction that does not just add a `jsx(` rule
  beside the `createElement(` rule: that repairs the observed symptom and leaves the class open,
  because a bundler that renames the imported binding emits `n("video",{…})`. Key the rule on the
  shape of the call — quoted tag, then props object — which every JSX runtime emits whatever the
  callee minified to. Plus the three other holes in the same file: only two of the five forbidden
  elements are covered, and `SR-5`'s banned identifier is absent (D-06).
- **T0-3 `TikTokBridge` product wiring.** Split by what is *actually* blocked. Most of it is not:
  **D9 (navigation bar colour and capsule avoidance) has no external dependency at all**, every
  screen owes it, and its cost rises with every screen added. It goes first.
- **T0-4 wallet and unlock UI.** With the constraint that decides the whole surface: no fiat or
  Beans amount may appear in any client string, because the coin→Beans rate does not exist. A
  placeholder rate is a commercial decision taken by a front-end developer, and it will be believed.

---

## 3. Decisions taken in this slot

| ID | Decision | Reversal cost |
|---|---|---|
| **D-C2-1** | **`main` is the trunk.** No long-lived integration branch. Closes **D-09** | Low, one direction only. A `develop` branch can be added later from `main`; nothing here would be undone |
| **D-C2-2** | The integration branch is **`cursor/integration-c2-963c`**, cut from this branch, **disposable** — deleted after `main` fast-forwards onto it | Near zero. It is a branch name |
| **D-C2-3** | The integrator is **W7 work slot A**, and integration is that slot's sole assignment. Closes the "who merges" half of **D-09** | Low |
| **D-C2-4** | Where two slots built the same module, **one implementation is chosen whole**; the loser's behaviour is re-added later as a task, if wanted | Medium, paid once. Git keeps the discarded implementation; re-choosing after downstream code exists is expensive |

D-C2-2 deserves its reasoning stated once more, because the obvious alternative is tempting. A
long-lived integration branch looks safer — `main` stays clean while assembly is messy. But every
consequence in the C1 report follows from `main` being empty: CI is wired to it and therefore
unreachable, and R6 ("`main` is releasable at all times") is decorative because a README is
trivially green. A permanent integration branch preserves both problems and adds a second place to
be wrong about which branch is the truth. Staging is where the assembly is allowed to be red;
`main` is where it is not.

---

## 4. Evidence

Every topology claim in the two plan documents was derived from a command, and the commands are
quoted next to the claims. The ones the rest of the plan rests on:

| Claim | Command | Result |
|---|---|---|
| 18 branches off the trunk; only 6 maximal | `git merge-base --is-ancestor` over all pairs | 12 subsumption relations found |
| `w2-plan-p3-477e` is docs-only | `git diff --name-only <base> <tip> \| grep -v '^docs/'` | empty; 27 files |
| `w2-plan-p3-477e` and `w4-work-q-8f92` merge clean | `git merge-tree --write-tree` against this branch | exit 0 for both |
| `main` is an ancestor of every tip | `git merge-base --is-ancestor origin/main <tip>` | YES, all six, and the trunk |
| `q` and `l` session stores are identical | `diff <(git show q:…session-store.ts) <(git show l:…)` | no output |
| `q`'s progress module is a superset of `j`'s | file list, plus `diff` of `store.ts` | `q` adds 8 files; its `store.ts` extends `j`'s |
| `m` and `r` conflict in 4 client files only | `git merge-tree --write-tree --name-only` | `App.tsx`, `App.test.tsx`, `main.tsx`, `testing/render.tsx` |
| `r` has a search client and no search server | `git grep search -- server/src`, `app.ts` registrations, contract paths | no `/v1/search` on `r` |
| 37 unique commits remain | `git rev-list --count HEAD..<each of 5 tips>` | 37 |

The merge taken on this branch is docs-only, so `verify` is unaffected by it — the tree's code is
byte-identical to `cursor/w5-verify-cycle-1-7ed1`, which is `cursor/w4-work-p-53de` plus one
markdown file, and the report records that tree passing `verify` with 713 tests. This slot re-ran
nothing, because it changed nothing that `verify` reads.

---

## 5. Registered rather than resolved

- **Branch protection on `main` is unverified.** `GET /branches/main/protection` returns 403
  *"Resource not accessible by integration"* with the available token, and `GET /rulesets` returns
  403 *"Upgrade to GitHub Pro"*, which says the plan does not offer rulesets but says nothing about
  legacy protection. So protection is **unlikely but unproven**, and the first push is the probe.
  Integration §2.5 gives the contingency, and its first line is: if the push is refused, do not open
  a pull request to get around it.
- **Parity with `docs/12-api-contracts.md`'s 40 endpoints is not scheduled to close.** The best
  branch covers 9 and the union 15. T1-2 measures and records the gap; closing it is C3.
- **D-07** (doc 12 contradicts itself on unlock paths) is a two-line document fix, assigned to T1-2
  rather than done here, because it is a contract-owner edit and this slot owns no contract.

---

## 6. Deliberately not built

- **The merge.** Steps 2–8 are W7 slot A's. The task said not to perform the mega-merge unless it is
  a small docs-only commit, and step 1 is exactly that; steps 2 onward are code and were not taken.
- **The integration branch.** `cursor/integration-c2-963c` is named and specified, not created. W7
  slot A cuts it from this branch. Creating it here would have put a second branch at an identical
  commit with no work in it, and made it ambiguous who owns the next commit on it.
- **The adjudication decisions.** §5 of the integration plan recommends with evidence and says the
  integrator decides. A plan slot reading `merge-tree` output has worse information than an
  integrator standing in the conflicted tree.
- **Any change to `main`.** Deliberately — see §2.3.
- **Re-verification of C1.** It belongs to the W5 slot (`wave-protocol.md` §4.3) and it cannot start
  until T0-0 through T0-2 close.

---

## 7. For the next slots

**W7 slot A — the integrator.** Read `docs/plan/cycle-2-integration.md` end to end before starting;
it is written to be executed in order. Cut `cursor/integration-c2-963c` from this branch — step 1 is
already done on it. Then: `q` (clean), `l` (two files), `r` (the big one), `m` (four client files),
`j` (two adjudications), rewrite `app.ts` once, fast-forward `main`, and **watch the first CI run**.
Amend §5 of the integration plan in place with what you actually decided, so the record is what
happened rather than what was recommended.

**W7 slots B and C.** You may not write to `server/src/app.ts`, `contracts/openapi.yaml`,
`packages/shared/src/index.ts`, `packages/shared/src/errors.ts`, `server/src/contract.test.ts`,
`server/src/config.ts`, or the client shell (`App.tsx`, `main.tsx`, `routes.ts`,
`testing/render.tsx`). Integration touches all of them at once, so nothing else can. If you need a
route registered, write the module and hand the one-line composition-root change to the integrator
through the conflict register (`wave-protocol.md` §3.4). This is the first application of T1-5, and
it is applied to the integration wave first on purpose: that is where getting it wrong costs most.

**Whoever holds T0-2.** Reverse-verify at the build, not at the unit. A unit test on
`scanBundleText` proves the regex; only `pnpm build && pnpm check:guardrails` against a reachable
`<video>` proves the gate. That distinction is the entire content of defect D-01 — the old rule had
passing tests too.

**Late arrivals.** Watch-history has landed as `w4-work-q-8f92` and is step 2 of the merge; it is
the best-behaved branch in the set. The catalogue-cover slot has not appeared on the remote — if it
lands before step 4, merge it right after `r`; if after step 6, merge it against the assembled tree,
where it is easier. If it never lands, **D-02 does not close by itself**: the allowlist and the
component that should call it arrive on branches that conflict, so merging them does not connect
them. That is T2-1.

**Anyone pushing a new branch during W7.** A branch that appears after the integrator has started
step 4 is merged in C3, not squeezed in. The cost of C1 was 31 branches assembled at the end; the
fix is not to assemble 33 at the end.

---

## 8. Known gaps in this slot's own work

- **The conflict analysis is `merge-tree`, not merging.** `git merge-tree --write-tree` reports the
  conflicts a real merge would produce, but it does not compile, run tests, or reveal *semantic*
  conflicts — two branches that merge textually clean and are nonetheless incoherent. The clearest
  candidate is already known (§2.5, `r`'s search client against no server), and there are almost
  certainly others that only `verify` will find. **The per-step gate in the merge order is not
  ceremony; it is the only instrument that can see this class of problem.**
- **The step-by-step conflict predictions are pairwise, not cumulative.** Each row of §4.1 was
  computed against the current tree, not against the tree that will exist after the preceding steps.
  Merging `q` and `l` changes what `r` conflicts with. The named files are the floor, not the
  ceiling, and step 6 in particular will be worse than its row suggests.
- **The four adjudications were judged by reading, not by running.** A1 recommends `q` over `j`
  because `q` is a superset by file count and its `store.ts` strictly extends `j`'s. That is strong
  evidence and it is not the same as having run both suites against one tree. If the integrator
  finds `j` handles a case `q` does not, the recommendation loses.
- **No estimate of how long the merge takes is given**, deliberately. Thirty-seven commits across
  five branches with four adjudications and a per-step verify gate is the technical shape of it;
  the number of round trips that requires is not something this slot can know, and a number invented
  here would be quoted back later as a commitment.
- **This slot did not verify that a push to `main` is possible** (§5). It is the single assumption
  the entire landing plan rests on, it could not be checked without either mutating `main` — which
  would destroy the fast-forward property the plan depends on — or having permissions this slot does
  not have. The contingency is written, but the risk is real and it is first discovered by W7.
