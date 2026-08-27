# W14 — C4 no-ads: L1 G1.8 Gitleaks secrets scan

> **Slot:** W14, work slot. One backlog leftover, no pull request.
> **Branch:** `cursor/w14-work-c4-noads-72c4`, cut from `origin/main` at `7fb19ba`
> (G2.4 CodeQL on main). Merged forward onto `1f6ca13` (leftover heartbeats + after-CodeQL
> resume).
> **Item:** G1.8 / D13 remainder — `gitleaks dir` as an L1 job. A finding is red. A missing
> binary is red. A thinning `.gitleaks.toml` is red.
> **Not in scope:** C4-08 ads (on `main` at `727592f`; this slot does not retake it). C4-07
> VIP. C4-03 Postgres. Leftover `bc-b0719814` (heartbeats, landed). After-CodeQL
> `bc-e2805d2b` (resume, landed). G2.3 Playwright (in flight). Beans, enabling wallet
> top-up, inventing ad-unit ids. No pull request. No AM fiction.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` remaining unblocked engineering after C4-08, skipping items
this assignment named:

| Item | State |
| --- | --- |
| C4-01 / C4-02 G2.7 G2.2 G2.6 G2.4 Semgrep / CodeQL / G2.5 | on `main` |
| C4-04 splash / `GET /v1/config` | on `main` |
| C4-05 OAuth stub | on `main` |
| C4-06 trade_order stub | on `main` |
| C4-08 ads | on `main` at `727592f`. **Not retaken** |
| Leftover `bc-b0719814` | in flight at pick; landed heartbeats as `69fb33c` |
| After-CodeQL `bc-e2805d2b` | in flight at pick; landed resume as `1f6ca13` |
| G2.3 Playwright | in flight (`bc-eed03394` / `bc-9578758f` per sibling handoffs) |
| C4-03 T14 Postgres | do not fake |
| C4-07 VIP | no contract; do not invent |
| **G1.8 gitleaks** | **this slot** |

Cycle-1/2/3 verify reports still scored G1.8 `no`. D13 named Semgrep+CodeQL / gitleaks /
osv-scanner / trivy / ZAP. Semgrep, CodeQL, and Trivy already have jobs. G2.3 needs
Playwright and was owned. The next local unblocked slice that is not ads, not VIP, and not
Postgres was **G1.8**.

`docs/14-quality-gates.md` §2 fails on a suspected key, token, or certificate in the
checkout. `docs/03-stack-decision.md` maps that row to gitleaks. The backlog says not to
fake SAST/SCA with a grep; the same rule applies here. What was missing is the **job that
runs Gitleaks**.

G1.8 is L1, so it lives in `ci.yml`, not `l2.yml`. Folding it into `pnpm verify` would put
the binary on the local verify path. `.github/workflows/l2.yml` is byte-identical to
`origin/main` from this slot. There is no `continue-on-error`, no path filter, no test skip.

---

## 2. What changed

`pnpm run check:secrets` requires a directory with files and a Gitleaks binary. It invokes
`gitleaks dir --report-format json --report-path - --ignore-gitleaks-allow` (never a
TypeScript grep of `AKIA` / `ghp_`) and fails on any finding. A missing binary, an empty
tree, empty engine output, or non-JSON output fails — the same fail-open G2.8 closed for an
absent pnpm store. `--report-path -` is stdout; `/dev/stdout` is "not writable" on this
runner.

A `.gitleaks.toml` or `.gitleaksignore` in the scan root fails before the engine runs.
Thinning the default ruleset is how this gate goes green without scanning.

The L1 job installs Gitleaks 8.30.1, then runs that CLI. Unit tests inject a runner so
local `pnpm verify` does not need the binary.

One committed fixture tripped `generic-api-key`:
`app/src/session/session-store.test.ts` used base64(`abcdefghijklmnopqrstuvwxyz`) as
`accessToken`. That is a test token, not a credential. It is now `tok_fixture`, matching
the `tok_abc` style already used in `silent-login.test.ts`. A `.gitleaksignore` row would
have been thinning.

| File | Change |
| --- | --- |
| `.github/workflows/ci.yml` | Install Gitleaks, then `check:secrets`. No `continue-on-error` |
| `.github/workflows/l2.yml` | **Unchanged** vs `origin/main` |
| `packages/quality/src/secrets.ts` | Args, thinning preflight, JSON policy, Gitleaks argv |
| `packages/quality/src/cli/check-secrets.ts` | Process boundary. `process.exit` of the library result |
| `app/src/session/session-store.test.ts` | Fixture no longer looks like a generic API key |
| `package.json` | `check:secrets`. **Not** added to `verify` |
| `README.md`, `docs/engineering/repo-layout.md` | The G1.8 L1 job exists |

The live check on this tree (Gitleaks 8.30.1):

```
secrets passed (653 files, 0 findings)
```

---

## 3. Reverse verification

The CLI tests are the injection for missing binary / empty tree / unknown args / thinning
config. Against a fixture whose only file is `const k = "AKIAJSIE6R3X5Y7Q2B4C"`, the real
engine (Gitleaks 8.30.1) exits 1:

```
secrets failed (1):
  aws-access-token /tmp/…/aws.ts:1
```

A missing `gitleaks` binary:

```
gitleaks is required: the binary is absent or not executable
```

Exit 1. An unknown argument exits 2. A `.gitleaks.toml` in the scan root fails before the
engine (`thinning allowlists is G1.8 red`). The formatted finding does not echo the secret
value (`--redact`; tests assert the stderr has no `AKIA` / `Secret` / `ghp_`).

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-b0719814` (leftover C4) | **Landed.** Heartbeats as `69fb33c`. PlayPage / progress PUT. Merged in; this slot does not touch those files except the session-store test fixture |
| `bc-e2805d2b` (after CodeQL) | **Landed.** Resume as `1f6ca13`. Playback sessions. Their handoff already named this branch as G1.8. Merged in; no overlap with `secrets.ts` |
| G2.3 Playwright | In flight. This slot does not touch `.github/workflows/l2.yml` |
| C4-08 on main | Ads. Untouched |

`git diff origin/main -- .github/workflows/l2.yml` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on this branch after merging `origin/main` (`1f6ca13` leftover
heartbeats + after-CodeQL resume). L1 sequence unchanged in verify: format → lint →
typecheck → test:coverage → check:coverage → build → guardrails. `check:secrets` is not
in that sequence; CI runs it first, after installing Gitleaks.

| Package | Tests |
| --- | ---: |
| shared | 61 |
| quality | 220 |
| config | 45 |
| server | 1,740 |
| app | 1,113 |
| **Total** | **3,179** |

Zero skipped. Thirty-two tests for G1.8 (26 library + 6 CLI). Coverage gate:

```
coverage global lines 94.00% (15037/15997), branches 91.59%, core lines 95.50%, diff lines 97.60% (203/208)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-m61o31n9.js` 353.37 kB / 108.03 kB gzip — the
resume merge's artifact, not this slot's). Native `<video>` remains absent.

---

## 6. Left open

- **G2.3.** Playwright smoke. In flight. Not faked with a grep.
- **G1.6 / G1.7 / G1.10.** oasdiff, osv-scanner, skip/empty-test detection. Further L1
  slices. G1.7 overlaps G2.5 Trivy; this slot does not add a second SCA.
- **Full git-history scan.** G1.8 is the checkout (`gitleaks dir`). Periodic history scan
  is the operations half of `docs/14-security.md` §9, not this job.
- **C4-03, C4-07.** Postgres/Drizzle/Redis, VIP contract. Beans/VIP/recharge stay
  AM-blocked; this slot does not invent rates, `#/vip`, or `/v1/subscriptions`.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
