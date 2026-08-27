# Handoff — Wave 6, Work Slot CI: arming the gate

> **Branch:** `cursor/w6-work-ci-074b`, cut from `cursor/w4-work-r-d943` (the player slot).
> **Scope:** `.github/workflows/ci.yml`'s triggers, and the one README sentence that described them.
> **Not in scope:** the job's steps, `pnpm verify` and every script behind it, the player and the app
> source (Wave 4 closed it), and any merging of the in-flight wave branches. Two files changed, 8
> lines net. No test was skipped, weakened, filtered out or made conditional. No pull request was
> opened.

---

## 1. What this slot closes

W5 reported that CI had never run. That is not a figure of speech: before this branch was pushed,
`gh run list` over the whole repository returned **nothing**. The Actions tab was empty. Eight wave
branches of app, server, contract and guardrail work had been written, and the gate that all of it
was supposedly written against had never been executed once.

The cause is two lines:

```yaml
on:
  push:
    branches: [main]
  pull_request:
```

Both triggers are correct and both are unreachable under the way this repository is actually worked.
Waves land on `cursor/**` branches, which are pushed for as long as the work takes; the slots are
told not to open pull requests, so `pull_request` never fires; and `main` only ever receives an
integrator's merge, which is the last possible moment to discover that the suite is red. The
workflow described a standard the repository was not being held to.

So the change is the smallest one that makes the existing job reachable:

| | Before | After |
| --- | --- | --- |
| Push to `main` | verify | verify |
| Push to `cursor/**` | **nothing** | **verify** |
| Pull request | verify | verify |

Same job, same steps, same order, same `pnpm verify` sequence. The only thing that moved is when it
is allowed to start.

---

## 2. What was delivered

| File | Change |
| --- | --- |
| `.github/workflows/ci.yml` | `cursor/**` added to the push trigger; the concurrency key gains `github.workflow` (C4) |
| `README.md` | The "runs on every pull request" line, which was now describing the old behaviour |

Nothing under `app/`, `server/`, `packages/`, `contracts/` or `docs/` other than this file. No
`package.json` script changed, so `pnpm verify` locally and the CI job remain the same sequence in
the same order — the property `docs/engineering/repo-layout.md` claims, and which was until now
unverifiable because one side of the comparison had never run.

### 2.1 Proof, which for this slot is the only thing that counts

A workflow-trigger change cannot be verified by reading it. This branch's first push produced
[run 33094751818](https://github.com/Dawan2/minidrama/actions/runs/33094751818) — the first workflow
run in the repository's history — triggered by **`push`** on **`cursor/w6-work-ci-074b`**.

| | |
| --- | --- |
| Event / branch | `push` on `cursor/w6-work-ci-074b` — the case that previously did nothing |
| Result | **success**, `verify` in **1m28s** of a 15-minute budget |
| Steps run | All 12: checkout, pnpm, Node, Install, Format, Lint, Typecheck, Test, Build, Platform guardrails, Generated files are current |
| Tests | **698 passed, 0 failed, 0 skipped** — 333 app, 338 server, 16 config, 11 shared |

The suite was also run locally in full before the push (`pnpm verify`, 333 app tests, build, and the
guardrail and generated-file steps), so the push was not the first time anyone looked.

### 2.2 What the run proved that the diff could not

The trigger was the point, but a workflow that has never executed is untested in every other respect
too, and this run is the first evidence for all of it:

- **The pipeline itself works on a clean machine.** `pnpm install --frozen-lockfile` resolved with
  the committed lockfile, `node-version-file: .nvmrc` resolved, and the pnpm cache key was accepted.
  Any of those could have been broken since Wave 1 and nobody would have known.
- **The guardrail and generated-file steps pass in CI**, not only on a developer's machine. The
  last step regenerates `app/minis.config.json` and diffs it; it is the only step that can fail from
  a file nobody edited, and it was green.
- **Wave 4's headline number reproduces off-machine.** `docs/handoff/w4-work-r.md` §2.1 claims 698
  passing tests across four packages. CI independently produced exactly that, which is the first
  time any handoff's verification table has been confirmed by something other than its own author.

### 2.3 The one annotation

The run is green with a warning: `actions/checkout@v4`, `actions/setup-node@v4` and
`pnpm/action-setup@v4` target Node 20, which GitHub has deprecated and is currently force-running on
Node 24. It is not a failure and it was left alone deliberately — see §4.

---

## 3. Decisions taken in this slot

Numbered `C*` to avoid colliding with the server slots' `S*`, slot H's `H*`, slot O's `O*` and slot
R's `R*`.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| C1 | **`cursor/**` rather than `'**'`** | `'**'` would arm every branch anyone ever pushes, including the throwaway ones, and it says nothing about how this repository is worked. `cursor/**` is the convention every wave already follows, so the trigger reads as a description of the process rather than a blanket. The branches it misses are named in §5 | One line |
| C2 | **One job, unchanged — no path filters, no split, no conditional steps** | The instruction was that pushes run *the same* verify job, and this is also the correct engineering answer: `format:check` runs `prettier --check .`, which covers Markdown, so even a docs-only change can legitimately fail this pipeline. A `paths-ignore: docs/**` would be the exact filter that lets it fail on `main` instead | Add a filter, and re-learn why |
| C3 | **Push and `pull_request` are left in separate concurrency groups, accepting a duplicate run** | Keying both on the source branch would dedupe them, and `cancel-in-progress` would then let a branch push cancel that branch's *pull request* check. A cancelled check is not a passing check, so the saving would be paid for with a pull request that cannot merge until someone re-runs it by hand. A duplicate 1m28s run is cheaper than that failure mode | One expression, once nothing depends on the check |
| C4 | **`github.workflow` added to the concurrency key** | The group was `ci-${{ github.ref }}`, which is a name a second workflow on the same ref would collide with. Hygiene, not a fix | One expression |
| C5 | **`cancel-in-progress: true` kept, including for branch pushes** | On a wave branch the head commit is the one being asked about; a superseded commit's run is 1m28s of a runner spent on an answer nobody will read. The cost is stated in §5 | One flag |
| C6 | **The Node 20 deprecation annotation is not fixed here** | Bumping three action majors is a different change with a different failure mode, and an integrator is in flight. A slot that was asked to arm the trigger should not also be the slot that broke checkout | It is not built; §4 |

---

## 4. Deliberately not built

Listed so nobody re-scopes it as an omission.

- **No action version bumps** (C6). The three `@v4` actions are on a deprecated Node runtime and the
  runner is currently shimming them onto Node 24. This will become a real failure when GitHub drops
  the shim, and it is a clean, self-contained follow-up: `actions/checkout@v5`,
  `actions/setup-node@v5`, and whatever `pnpm/action-setup` is current when someone looks.
- **No `workflow_dispatch`.** It would be useful, and on this branch it would also be inert:
  manual dispatch reads the workflow list from the **default branch**, so a `workflow_dispatch`
  added here does nothing at all until it is merged to `main`. Adding a control that silently does
  not work is worse than not adding it. Worth one line from whoever lands the next CI change on
  `main`.
- **No branch protection and no required status checks.** Those are repository settings, not files;
  no branch can change them. §6 covers what is now possible.
- **No matrix.** One Node version, from `.nvmrc`, matching what the app is built with.
- **No caching beyond `setup-node`'s pnpm cache.** Install is a few seconds of a 1m28s run; there is
  nothing here to optimise yet.
- **No `merge_group` trigger and no scheduled run.** There is no merge queue, and a nightly build of
  a repository whose branches now build on push adds a notification rather than a signal.
- **No change to `timeout-minutes: 15`.** The observed run is 1m28s; the headroom is fine and
  tightening it would only convert a slow runner into a red build.

---

## 5. Known gaps in this slot's own work

Stated plainly rather than left for someone to discover.

- **This does not retroactively arm the branches that already exist, and that is the gap that
  matters most.** For a `push` event GitHub reads the workflow file **from the commit being pushed**.
  Every wave branch cut before this commit still contains the old `branches: [main]`, so pushing to
  it still runs nothing. `cursor/w1-*` through `cursor/w4-work-r-d943` stay dark until this commit
  is in their history — via the integrator's merge to `main`, or by rebasing onto it. See §6.
- **A branch outside the `cursor/**` convention still gets nothing** until someone opens a pull
  request for it (C1).
- **A push to a branch with an open pull request now runs verify twice**, once per event, on the
  same commit (C3). It is a deliberate trade, not an oversight.
- **An intermediate commit can go unverified.** With `cancel-in-progress`, two pushes in quick
  succession leave the first without a verdict (C5). If you care about a specific commit — a
  bisect, or a hand-off point — let its run finish before pushing again.
- **The Node 20 annotation will eventually be a failure**, not a warning (C6, §4).
- **Nothing here proves the job is *sufficient*.** It proves the job runs and is currently green.
  What CI checks is still exactly what Wave 1 chose: no Playwright, no Testcontainers, no server
  integration tests against a real database. `repo-layout.md` §"Deliberately not built" is still the
  accurate list.
- **Fork pull requests are unchanged and unexamined.** The job uses no secrets, so the read-only
  token a fork gets is enough — but no fork pull request has ever been run against it.

---

## 6. For the next slots

**For the integrator.** Merging this to `main` is what makes the trigger real for everyone else;
until then it applies only to branches that contain this commit. Two consequences worth planning
around. First, the merge to `main` is itself the first `main` run, so treat it as a real gate rather
than a formality. Second, if you want a wave branch checked *before* you merge it — which is the
entire point of the slot — that branch needs this commit in its history, so rebase it onto this
branch or merge this branch into it and push. One `git merge` and one push per branch buys a verdict
on work that has never had one.

**For whoever owns branch protection.** Runs now exist, so `verify` can finally be made a required
status check on `main`. Read C3 and C5 first: with the push and pull-request groups separate, a
protected pull request will show two runs of the same commit and only the `pull_request` one is the
check that gates the merge. If that redundancy is worth removing later, remove it by narrowing the
*push* trigger — never by sharing a concurrency group with `pull_request`, which is how the required
check gets cancelled out from under the merge.

**For whoever bumps the actions** (§4). Do it as its own commit on a `cursor/**` branch and push it:
that is now a complete test of the change, which is a thing that was not true this morning.

**For whoever adds a step to the pipeline.** The step order in `ci.yml` encodes two real
constraints, both already commented in the file: the guardrail check runs *after* `build` because
the bundle scan needs `app/dist`, and the generated-file diff runs last because it mutates the
working tree. A new step that reads the tree belongs before it.
