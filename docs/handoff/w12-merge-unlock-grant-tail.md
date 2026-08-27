# W12 — the unlock-grant tail, merged onto main

> **Slot:** W12, merge slot. One branch, two commits, one of them on the payment path.
> **Branch:** `cursor/w9-work-unlock-grant-5224`, merged onto `main` as `34ff263`.
> **Base:** `main` at `f8465df` ("Record the W11 merge: the flake branch is on main, and one branch
> still is not").
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Predecessor:** `docs/handoff/w11-merge-flake.md` §4, which found this gap and listed the two
> commits, and §5, which said it needed an owner. This slot is that owner.
> **Not touched:** the W10 report and `CoverImage`, both in flight elsewhere. Nothing under `app/`
> changed at all — the whole merge is three server files and one document. This slot adds this
> document and nothing else of its own.

---

## 1. Where it got to

**`cursor/w9-work-unlock-grant-5224` is an ancestor of `main`.** It was recorded as merged since C3
and was not, which is the specific thing that made this gap worth closing: `main`'s history said the
branch had landed, so nothing but W11's §4 would have told anybody otherwise.

Of the 49 `cursor/*` branches on origin, **48 are now ancestors of `main`**. The one that is not is
`cursor/w11-plan-cycle-3-93ab` — §6.

`pnpm verify` exits 0 on `main`, **2,137 tests across 114 files, none skipped**. That is the same
count `main` carried before the merge, and it should be: the branch adds no test. Its second commit
renames a string inside two assertions that already existed.

The whole effect of the merge on `main`:

| File | Change |
| --- | --- |
| `docs/handoff/w9-work-unlock-grant.md` | New, 335 lines — the W9 slot's own record |
| `server/src/modules/platform-tiktok/paid-trade-orders.ts` | `UNLOCK_NOT_GRANTED` → `NOT_FULFILLED` in the outcome type and in `ERROR_OUTCOMES`, plus four lines of comment |
| `server/src/modules/unlock/payment-sink.ts` | The one `return` that produces it |
| `server/src/modules/unlock/payment-sink.test.ts` | The two assertions that read it |

---

## 2. What was being merged, and why it was still outstanding

C3 merged this branch (`docs/handoff/w9-integrate-c3.md` §3.5) at `9b308ae`, which was its tip at the
time. The branch then gained two commits and no one merged them:

| Commit | Contents |
| --- | --- |
| `da40a4a` | `docs/handoff/w9-work-unlock-grant.md`. Wanted without argument — a slot with no handoff document does not count as complete (`wave-protocol.md` §3.3) |
| `d53a2c0` | "Keep the callback's outcome vocabulary free of what was sold". Production code on the payment path |

W11 declined to take them, and gave the right reason: the second commit arrived **after** an
integrator had already reviewed and merged the branch once, so it had never been read by anyone but
its author, and merging it on the back of a document nobody disputes would have been the wrong way
for payment code to reach `main`. The two travel together on one branch, so both waited. §3 is the
review they waited for.

---

## 3. The payment-path commit, reviewed

`d53a2c0` renames one member of `PaidTradeOrderOutcome` from `UNLOCK_NOT_GRANTED` to `NOT_FULFILLED`.
It was taken. The argument for it is in the module it changes, and the argument that it is safe is a
measurement rather than an assumption.

### 3.1 The rename is right, and the file already said so

`paid-trade-orders.ts` is the webhook module's publisher interface. Its header comment has said since
it was written that the callback owns authenticity and nothing else, that it is declared there
"rather than in the unlock module" because the day a second thing is sold with Beans that thing
subscribes to the same event, and — in as many words — that "the interface carries no notion of
granting."

`UNLOCK_NOT_GRANTED` put a grant, and one particular kind of goods, into exactly the type that
comment is about. A VIP subscription sink or a coin top-up sink reporting a failed delivery would
have had to log that an *unlock* was not granted. `NOT_FULFILLED` says what the callback can actually
know: it recorded the payment and did not deliver whatever the payment was for. The commit also
de-specialises the neighbouring `DUPLICATE_PURCHASE` comment for the same reason.

This is a small commit fixing a real inconsistency rather than a stylistic preference, and it is
better landed now than after a second sink exists to inherit the name.

### 3.2 The blast radius, measured

The reason a rename on the payment path can be taken at all is that this outcome is **operator
vocabulary and nothing else**. Every reference to it in the repository, before the merge:

| Site | What it is |
| --- | --- |
| `paid-trade-orders.ts`, the union member | The declaration |
| `paid-trade-orders.ts`, `ERROR_OUTCOMES` | Whether it is logged at `error` level |
| `payment-sink.ts:84` | The only `return` of it |
| `payment-sink.test.ts`, two assertions | The only reads |

That is the complete list — five lines in three files, all merged in this commit. It reaches the
outside world at exactly one place, `platform-tiktok/routes.ts:227`, as the `outcome` field of a log
line, next to the event id and the trade order id. Checked and confirmed absent from:

- **`contracts/openapi.yaml`** — the callback answers `200` either way, deliberately, because a
  non-200 is read as failed delivery. No outcome is ever in a response body;
- **the error catalog** (`packages/shared/src/errors.ts`, `docs/12-error-catalog.md`) — these are not
  error codes and were never registered as any;
- **`app/`** — the client cannot see a webhook outcome and has no string for one;
- **every other document** under `docs/`.

So nothing outside the commit had to change, and — this is the part worth stating — nothing outside
the commit *did* change. `git log 9b308ae..main` on all four paths is empty: `main` had not touched a
line of any of them since C3 merged the branch.

### 3.3 What is not affected, and what would have made this wrong

No behaviour moves. `recordPaid` returns the same value in the same two cases, the callback still
answers `200`, the order still reaches `PAID` before any grant is attempted, and the write ordering
that makes a failed grant recoverable by replay is untouched. `ERROR_OUTCOMES` still contains the
outcome, so a grant that does not land still pages at `error` level.

Two things would have made the commit wrong, and neither is true:

- **if the outcome were a client contract.** It is not, and the type's own comment says so in its
  first line. A renamed string in a response body is a breaking change no matter how much better the
  new name is;
- **if the rename were partial.** `ERROR_OUTCOMES` is typed `readonly PaidTradeOrderOutcome[]`, so a
  member left behind there is a compile error rather than a silent demotion out of the alerting set —
  the type system covers the one half-rename that would have mattered. §5.2 checks the other
  direction by hand, because the type system does not cover it.

The one cost is that a search for `UNLOCK_NOT_GRANTED` in an old log line now finds nothing in the
source. It is recorded here and in the commit message, which is as much as a name change gets.

---

## 4. The merge

`git merge --no-ff`, no conflicts, no hand resolution, nothing composed. A merge commit rather than a
rebase or a cherry-pick, for W11 §2's reason and one more of its own: the branch is already on origin
and already described by its own handoff document, and the point of this slot was to make **that
branch** an ancestor of `main`, which a cherry-pick would not have done.

That it would be clean was predicted before running it, the way W11 §2 predicts it — by asking what
`main` had done to the four paths since the merge base:

```
git log --oneline 9b308ae..main -- \
  server/src/modules/platform-tiktok/paid-trade-orders.ts \
  server/src/modules/unlock/payment-sink.ts \
  server/src/modules/unlock/payment-sink.test.ts \
  docs/handoff/w9-work-unlock-grant.md
```

which is empty. Neither side had anything to disagree about, and `git diff HEAD^1 HEAD` is exactly
the union of the two commits — 346 insertions, 9 deletions, four files.

C3 §5's warning about rename detection was checked and does not apply here: nothing moved between
directories on either side, and both halves of every changed hunk are about the same subject.

---

## 5. Verification

Run on the merge commit, on `main`.

| Gate | Result |
| --- | --- |
| `pnpm format:check` | pass |
| `pnpm lint` | pass, 0 errors, 0 warnings |
| `pnpm typecheck` | pass, 4 packages |
| `pnpm test` | pass — 2,137 tests, 114 files, 0 skipped, 0 failing |
| `pnpm build` | pass |
| `pnpm check:guardrails` | pass, against `app/dist` |

| Package | Test files | Tests |
| --- | ---: | ---: |
| `server` | 53 | 1,314 |
| `app` | 54 | 727 |
| `packages/shared` | 4 | 51 |
| `packages/config` | 3 | 45 |

Whole run: 35 s. The same gate was run on `f8465df` first, green, so a failure here would have been
attributable to the merge rather than to the environment.

### 5.1 The gate is the weak evidence for a rename

A rename that changes the assertion and the implementation together passes a green suite by
construction — both sides moved, and the test would have kept passing if the outcome had stopped
meaning anything. So the returned value was mutated on the merged tree and the suite re-run:

```diff
-        return 'NOT_FULFILLED';
+        return 'RECORDED';
```

Both grant-failure tests fail, in 5 ms and 1 ms, with `expected 'RECORDED' to be 'NOT_FULFILLED'` —
`reports a receipt that could not be written` and `reports an order that could not be advanced,
having already granted`. The renamed assertions still bind to the behaviour they were written for.
The mutation was reverted and the tree confirmed clean before this document was written.

### 5.2 The second mutation, which nothing caught

The other half of the rename is `ERROR_OUTCOMES` membership — whether a viewer who paid and owns
nothing produces an `error` line a human sees, or an `info` line nobody reads. So it was mutated too:

```diff
 export const ERROR_OUTCOMES: readonly PaidTradeOrderOutcome[] = [
   'PAYER_MISMATCH',
   'ORDER_NOT_PAYABLE',
-  'NOT_FULFILLED',
   'DUPLICATE_PURCHASE',
 ];
```

**All 1,314 server tests still pass.** Nothing in the repository asserts what is in `ERROR_OUTCOMES`,
and nothing asserts the level of the line at `routes.ts:227`. Reverted, and the merged tree is
correct — but it is correct because it was read, not because it was checked. §6.

---

## 6. Two things left open

**`ERROR_OUTCOMES` is asserted by nothing.** §5.2. This predates the merge — it was equally true of
`UNLOCK_NOT_GRANTED`, and W9's own S70 argued that naming the set next to the type is what forces the
decision, which it does for a human adding an outcome and not at all for a mistake. The gap is that
an outcome can be dropped from the alerting set, or added without one, and the gate stays green. The
test that would close it is small and belongs to whoever owns `platform-tiktok/`: assert that the
outcomes meaning "an authentic payment arrived and the money is in the wrong place" are the members
of `ERROR_OUTCOMES`, and that the log line for one of them is `error`. Not written here — a merge
slot flagging is §3.4, a merge slot writing tests into another slot's files is §8 rule 4.

**`cursor/w11-plan-cycle-3-93ab` is not an ancestor of `main`**, and was left that way. Two commits,
documents only — `docs/plan/cycle-3-backlog.md` and `docs/handoff/w11-plan.md`. It is a live planning
slot's branch rather than a deferred one, it was not in this slot's scope, and merging a plan that
may still be being written is not a merge slot's call.

---

## 7. Reading the document this merge brought in

`docs/handoff/w9-work-unlock-grant.md` is a slot record and is on `main` as its author wrote it. Two
of its statements are about the branch at its fork point and are not claims about `main`:

- **"Nothing was merged and no pull request was opened."** True of the slot, which is what §8 rule 3
  requires of a work slot. The branch was merged later, twice — C3 §3.5 and this document;
- **"the built bundle still hashes to `index-B_KnFxaH.js`."** That was the hash of the branch's base.
  `main` builds `index-Bt6xB-Yi.js` today, because `main` has most of the client the branch's fork
  point did not. The claim the sentence is making — that this slot changed no client code — is still
  exactly true, and this merge changed none either.

Neither was edited. Rewriting another slot's record to match the tree it landed in is how a handoff
stops being evidence of anything (§8 rules 4 and 7).

---

## 8. For the next slot

**The "branch merged, tail not merged" failure mode has now happened once and was found by hand.**
C3 merged a branch at the tip it had, the branch moved, and `main`'s history recorded a merge that
was two commits short. Nothing in the gate can see this: `main` was green and complete-looking the
whole time. What found it was W11 checking every origin branch for ancestry rather than trusting the
merge commits, and that check is cheap enough to keep doing:

```
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/cursor); do
  git merge-base --is-ancestor "$b" main || echo "NOT MERGED: $b"
done
```

It currently prints one line, and §6 says why that one is deliberate.

**An integrator merging a branch should say which SHA they merged.** C3 §3.5 named the branch and not
its tip, which is why the gap took two slots to find and close. W11 §4 named both, which is why this
slot could start by reading two commits instead of by discovering they existed.
