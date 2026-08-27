# W14 — C4 first work: G1.5 coverage, L1 workflow_dispatch, D-07 parity

> **Slot:** W14, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w14-work-c4-first-72c4`, cut from `origin/main` at `1a6c5d6`.
> **Item:** `C4-01` / `C3-11` — G1.5 coverage, L1 `workflow_dispatch:`, D-07 / D-11. Ranked first
> among unblocked engineering in `docs/plan/cycle-4-backlog.md`. Sibling `bc-2aa04a65` took
> `C4-02` (G2.7 migrate) and landed while this slot ran.
> **Not in scope:** Beans, GATE-8, EIS, TikTok login, SCR-10 recharge, enabling the wallet top-up
> control, `docs/verify/` (W15 `bc-649d7d50`). No pull request.

---

## 1. What was picked, and why

The cycle-4 backlog's first C4 implement picks are C4-01 and C4-02. C4-01 is the L1 leftover C3-11
named and did not ship: coverage tooling was still absent, `ci.yml` still had no
`workflow_dispatch:`, and doc 12 still contradicted itself on unlock path parameter names.

C4-02 was left for the second W14 work slot. It landed as `b453294` during this slot and was
merged in; `ci.yml` is ours, `l2.yml` is theirs. Coverage is L1 and lives in `pnpm verify`.
Migrate stays L2 and is not folded into verify.

Client remainder `bc-05cba7a1` was idle at pick. This slot does not add a client screen or a
wallet path.

---

## 2. What changed

### 2.1 G1.5 coverage

Each package's `test:coverage` runs the same Vitest suite with V8 coverage and writes
`coverage/coverage-final.json`. `pnpm check:coverage` then evaluates the five reports against
`packages/quality/coverage-thresholds.json`:

| Floor | Source | Value at introduction |
|---|---|---|
| Diff line | §3.1 | 80% |
| Global line | §3.1, starting | 60% |
| Global branch | §3.1, starting | 50% |
| Core line | §3.1 | 90% |

Core globs are the modules that exist: wallet, unlock, identity, entitlement. There is no
moderation state machine in the tree; none was invented. A missing report, an empty report, or a
core glob that matches nothing fails. Thresholds cannot fall below the documented floors, and
cannot fall below the copy on the comparison base (`origin/main` on a branch, `HEAD~1` on main).
Adding an exclusion or removing a core prefix is the same class of failure.

`pnpm test` is unchanged (the suite, no instrumentation). L1 Test runs `test:coverage` so the
tests still run; Coverage then enforces the floors. There is no `continue-on-error`, no path
filter, no skip.

### 2.2 L1 `workflow_dispatch:`

`.github/workflows/ci.yml` now has it, matching L2. A red run can be re-run without an empty
commit. Checkout is `fetch-depth: 0` plus `git fetch origin main` so diff coverage has a base
rather than reporting 100% of nothing.

### 2.3 D-07 / D-11

`docs/12-api-contracts.md` §2.4 uses `{episodeId}` / `{dramaId}`, the same names as §4.5. It no
longer also uses `{id}`. `docs/12-api-parity.md` is the measurement: 22 live OpenAPI operations,
each listed, plus the design-only rows. The live unlock write is still
`POST /v1/unlock/coin-orders`. That gap is a row. It is not closed by adding WeChat, Beans, or a
second unlock route.

| File | Change |
| --- | --- |
| `.github/workflows/ci.yml` | `workflow_dispatch:`. Test collects coverage. Coverage step. Fetch main |
| `.github/workflows/l2.yml` | **Unchanged by this slot** (G2.7 arrived from the sibling merge) |
| `packages/quality/` | Coverage gate, ratchet, reverse fixtures, parity table parser |
| `packages/quality/coverage-thresholds.json` | The live floors. Only allowed to rise |
| `docs/12-api-parity.md` | Endpoint-by-endpoint measurement |
| `docs/12-api-contracts.md` | D-07: one unlock path shape |
| `package.json` | `test:coverage`, `check:coverage`. Verify uses them. `check:migrate` stays out |

---

## 3. Reverse verification

The CLI tests are the injection. Against a fixture report that covers 1 of 2 lines:

```
FAIL  runCoverageCheck > fails when the report is under the global floor
expect(output.exitCode).toBe(1)
stderr contains "global line coverage"
```

A thresholds file with `globalLinePct: 40` fails even when the report is 100% ("below the
documented floor"). A drop from a previous copy of 70% to 60% fails the ratchet. A missing
`coverage-final.json` exits 1 ("coverage reports are required and missing") rather than reporting
100% of zero files. An unknown argument exits 2.

The live run at merge is green:

```
coverage global lines 94.61% (11641/12304), branches 92.35%, core lines 98.07%, diff lines 91.93% (490/533)
coverage gate passed
```

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| W14 second / C4-02 (`bc-2aa04a65`) | Docs and root `package.json` only. They added `check:migrate` (L2, not in verify). This slot added `check:coverage` (L1, in verify). `ci.yml` was not theirs. Merged at `f1105c3`; both scripts kept |
| W15 verify (`bc-649d7d50`) | `docs/verify/cycle-3-report.md` landed on main. This slot did not edit it |
| Client remainder (`bc-05cba7a1`) | None. Idle. This slot does not add a screen |

---

## 5. Verification

`pnpm verify` green on `49415cb` before the main merge, first green after the typecheck fix for
`exactOptionalPropertyTypes`. Re-run after merging `origin/main`. L1 sequence: format → lint →
typecheck → test:coverage → check:coverage → build → guardrails. Tests are not skipped.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 67 |
| `server` | 1,594 (before G2.7 merge; G2.7 adds migrate-check tests) |
| `app` | 964 |
| **Total at 49415cb** | **2,725** |

Zero skipped. Guardrails passed against `app/dist`.

---

## 6. Left open

- **C4-02 G2.7.** Closed by the sibling while this slot ran. Remaining L2: G2.2, G2.3, G2.4, G2.5,
  G2.6.
- **The 7-day ratchet bot.** The floors file and the one-direction check exist. A robot that PRs
  an increase after seven days above the floor is not this slot.
- **Design-only OpenAPI gap.** Measured, not closed. `GET /config`, recharge, comments, SMS auth
  stay design-only. Do not invent them to flip a row.
- **C4-05 / C4-06 / C4-07.** Real TikTok login, Beans rate, VIP contract. Still AM-blocked.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
