# W13 — CoverImage, merged onto main

> **Slot:** W13, merge slot. One branch, three commits, no conflicts.
> **Branch:** `cursor/w12-work-cover-image-3d19`, merged onto `main` as `8e3c2aa`.
> **Parents:** `d830d1d` (`main`, "Record the W12 merge: the unlock-grant tail is on main…") and
> `c94819d` (the branch tip, "Write up the cover-gate slot: what it closes, and a flake it did not").
> **Base:** `main` at `d830d1d`. The branch itself was cut from `f8465df`.
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Predecessor:** `docs/handoff/w12-work-cover-image.md`, which is the work this merge lands, and
> `docs/handoff/w12-merge-unlock-grant-tail.md`, which is what `main` held when this slot started.
> **Not touched:** the W11 plan branch, the W10 report, the W13 flake branch, and the W12 silent
> re-login slot (no branch on origin). This slot adds this document and nothing else of its own.

---

## 1. Where it got to

**`cursor/w12-work-cover-image-3d19` is an ancestor of `main`.** The client half of D-02 / T2-1 is
closed: `CoverImage` runs `checkCoverUrl` on its prop, renders the parsed value rather than the
string it was handed, and `import-hygiene.test.ts` asserts that no other non-test source file
contains an `<img>`. `@minidrama/config` is a real dependency of the app, not a devDependency.

`pnpm verify` exits 0 on `main` after one retry, **2,163 tests across 115 files, none skipped**.
That is 26 more tests than `d830d1d` carried (2,137): the new file's 27, three of which left
`states.test.tsx`, plus the two source scans. The first verify failed on one FavoritesPage paging
test that is not this branch's — §5.

The whole effect of the merge on `main`:

| File | Change |
| --- | --- |
| `app/src/components/CoverImage.tsx` | `checkCoverUrl` before the `<img>`; `src={trusted}`; `data-cover-rejection` on the placeholder |
| `app/src/components/CoverImage.test.tsx` | New, 27 tests |
| `app/src/components/states.test.tsx` | The three cover tests that lived here, deleted |
| `app/src/testing/import-hygiene.test.ts` | Appended: one `<img>` in non-test source, and that file calls `checkCoverUrl(src)` and does not contain `src={src}` |
| `app/package.json` | `@minidrama/config` moves from `devDependencies` to `dependencies` |
| `pnpm-lock.yaml` | The lockfile line that follows |
| `docs/handoff/w12-work-cover-image.md` | New, the work slot's own record |

Nothing under `packages/`, `server/`, or any other module under `app/src/` changed. The registry is
still the `.invalid` placeholder (U-IMG-1).

---

## 2. Fast-forward was asked for and was not available

The branch was three commits ahead of its fork at `f8465df`. `main` had since taken the unlock-grant
tail and reached `d830d1d`, so the two had diverged and `git merge --ff-only` would have refused.

A merge commit was taken rather than a rebase. Rebasing would have rewritten a branch that is
already on origin and already described by its own handoff document, to save one commit. That is the
same reason W11 §2 and W12 §4 gave, and it is still the reason that makes the branch an ancestor of
`main` rather than a set of cherry-picks.

**Git resolved it with no conflicts at all.** That was predicted before running it, by asking what
`main` had done to the branch's seven paths since the merge base:

```
git diff --stat f8465df origin/main -- \
  app/package.json \
  app/src/components/CoverImage.tsx \
  app/src/components/CoverImage.test.tsx \
  app/src/components/states.test.tsx \
  app/src/testing/import-hygiene.test.ts \
  docs/handoff/w12-work-cover-image.md \
  pnpm-lock.yaml
```

which is empty. `main`'s work since `f8465df` is three server files and two documents
(`w9-work-unlock-grant.md`, `w12-merge-unlock-grant-tail.md`). Neither side had anything to disagree
about, and `git diff HEAD^1 HEAD` is exactly the union of the three commits — 572 insertions, 57
deletions, seven files.

`import-hygiene.test.ts` was the path most likely to collide: CoverImage appends at the end, and
that is the file's house style for a reason (the work slot's G10). Nothing else had appended there
since `f8465df`.

---

## 3. In-flight work, left alone

Three other slots were named as things this merge must not overwrite. None of them had changed a
CoverImage path by the time the merge ran.

| Slot | Origin branch at merge time | Overlap with CoverImage's seven files |
| --- | --- | --- |
| W12 silent re-login (`bc-3365072b`) | none published | — |
| W13 remaining test flakes (`bc-d07aba7e`) | `cursor/w13-work-test-flakes-a44c` appeared on origin *during* this slot, one commit `0b078fc`, cut from `d830d1d` | empty. It edits `FavoritesPage.test.tsx`, `DramaPage.test.tsx`, `HistoryPage.test.tsx`, `HomePage.test.tsx`, and `app/src/testing/render.tsx` |
| W11 plan cycle 3 | `cursor/w11-plan-cycle-3-93ab` | empty. Documents only: `docs/plan/cycle-3-backlog.md` and `docs/handoff/w11-plan.md` |

The flake branch is now one of the three `cursor/*` tips that are not ancestors of `main` — §6. It
was not merged, rebased, or edited. When that slot (or a later merge slot) lands it, the compose is
theirs: CoverImage did not touch a line of those five files, so a merge of `0b078fc` onto this
`main` should be as clean as this one was.

The W10 report (`cursor/w10-verify-cycle-2-7b17`) is also not an ancestor of `main`. Documents only.
Left alone for the same reason.

---

## 4. Verification

Run on the merge commit `8e3c2aa`, on `main`.

### 4.1 First `pnpm verify` — one failure, not this branch's

Format, lint, and typecheck passed. Tests failed in `app` only:

```
FAIL  src/routes/FavoritesPage.test.tsx
  > paging the list
  > asks for a session under the rows when a further page answers 401
Unable to find an element by: [data-testid="favorites-sign-in-more"]
```

at `FavoritesPage.test.tsx:358`, after `fireEvent.click(await screen.findByTestId('load-more-favorites'))`.
The DOM it left behind was the first page still showing `load-more-favorites` — the second round of
the stub had not been observed when `findBy*` gave up. 1,025 ms on that one case. Every other test
in the file passed, including the sibling `appends the next page with the cursor the server handed
back` that `docs/handoff/w12-work-cover-image.md` §6 named.

CoverImage's own suite was green in that same run: `CoverImage.test.tsx` (27) and
`import-hygiene.test.ts` (12, including the two new scans). App count: **1 failed, 752 passed**
across 55 files.

This is the two-round paging shape W9's flake handoff §5 predicted, in the file W12's cover-gate
handoff §6 pointed at. It is not a CoverImage failure. CoverImage was already on `origin/main` as
`8e3c2aa` before the retry; the instruction was to retry once and still land CoverImage if its
tests passed. They had.

### 4.2 Retry — `pnpm verify` exits 0

| Gate | Result |
| --- | --- |
| `pnpm format:check` | pass |
| `pnpm lint` | pass, 0 errors, 0 warnings |
| `pnpm typecheck` | pass, 4 packages |
| `pnpm test` | pass — 2,163 tests, 115 files, 0 skipped, 0 failing |
| `pnpm build` | pass — `dist/assets/index-DmVWrZ3O.js` 307.42 kB (gzip 95.75 kB) |
| `pnpm check:guardrails` | pass, against `app/dist` |

| Package | Test files | Tests |
| ---: | ---: | ---: |
| `server` | 53 | 1,314 |
| `app` | 55 | 753 |
| `packages/shared` | 4 | 51 |
| `packages/config` | 3 | 45 |

The bundle hash and size match the work slot's own measurement at `f8465df` plus CoverImage
(`index-*.js` 307.42 kB / 95.75 kB gzip). The unlock-grant tail that landed between `f8465df` and
`d830d1d` did not touch `app/`, so the client artifact moving is this merge's.

CoverImage tests were also run in isolation before the retry and passed: 27 in
`CoverImage.test.tsx`, and the two scans in `import-hygiene.test.ts`.

### 4.3 What the merged tree still contains

Checked on `8e3c2aa` after the green retry, so a later edit cannot have dropped them:

- `CoverImage.tsx` imports `checkCoverUrl` from `@minidrama/config`, assigns
  `const trusted = checked.ok ? checked.value : null`, and renders `src={trusted}` — not
  `src={src}`.
- `app/package.json` lists `@minidrama/config` under `dependencies` and not under
  `devDependencies`. The lockfile's `app:` importer matches.
- `CoverImage.test.tsx` is 209 lines, 27 tests.
- `import-hygiene.test.ts` ends with the describe `a cover URL is checked before the browser is
  asked to fetch it`.

---

## 5. The flake that failed the first verify

W12's cover-gate handoff named `paging the list > appends the next page with the cursor the server
handed back`. What failed here is the sibling four tests down: `asks for a session under the rows
when a further page answers 401`. Same file, same `describe`, same two `findBy*` deadlines around a
synchronous stub, same `fireEvent.click` in between. The named case passed in the failing run; this
one did not. That is what a two-round flake looks like when it is not the particular case someone
happened to catch.

The W13 flake branch (`0b078fc`) is already rewriting this file — `FavoritesPage.test.tsx` is 34
lines of its diff. This merge did not touch that file, and must not: a merge slot writing tests into
another slot's files is §8 rule 4, and the instruction was to leave the flake branch alone except
for the merge itself. The retry going green is not a fix. The next person to read a red
`FavoritesPage.test.tsx` on `main` should read `0b078fc` rather than this document.

---

## 6. What is not merged

Three `cursor/*` tips on origin are not ancestors of `main`, and were left that way:

| Branch | Why it stayed off `main` |
| --- | --- |
| `cursor/w11-plan-cycle-3-93ab` | Live planning slot. Documents only. Merging a plan that may still be being written is not a merge slot's call — W12 §6 said the same and it still holds |
| `cursor/w10-verify-cycle-2-7b17` | The independent C2 report. Documents only. Out of this slot's scope |
| `cursor/w13-work-test-flakes-a44c` | In-flight work this slot was told not to overwrite. One commit, five test/helper files, no CoverImage overlap |

Every other `cursor/*` branch on origin is an ancestor of `main`. CoverImage is now one of those.

---

## 7. Reading the document this merge brought in

`docs/handoff/w12-work-cover-image.md` is a slot record and is on `main` as its author wrote it. Two
of its statements are about the branch at its fork point and are not claims about `main` after this
merge:

- **"Nothing was merged and no pull request was opened."** True of the work slot. The branch was
  merged later, by this document;
- **"2163 passing"** on a tree cut from `f8465df`. That count is the same on `main` today, because
  the unlock-grant tail added no test and this merge added the 26 the work slot added. The
  FavoritesPage flake in its §6 is still open — §5.

Neither was edited. Rewriting another slot's record to match the tree it landed in is how a handoff
stops being evidence of anything.

---

## 8. For the next slot

**D-02's client half is closed.** The server half closed in W6 (`w4-work-s-cover-url-check-6186`).
`rg checkCoverUrl` now finds a production caller in `CoverImage.tsx` as well as
`server/src/modules/catalog/covers.ts`. T2-1 as written in `docs/plan/cycle-2-backlog.md` is done
on `main`. U-IMG-1 (the `.invalid` placeholder) is not; the work slot's §6 still holds for whoever
picks that up.

**The FavoritesPage two-round flake is not this merge's, and a branch already exists for it.**
`cursor/w13-work-test-flakes-a44c` at `0b078fc`, cut from `d830d1d`. Merge that, do not rewrite
`FavoritesPage.test.tsx` from here. A first-run red on `asks for a session under the rows when a
further page answers 401` is the known flake, not a CoverImage regression: CoverImage's 27 tests
and the two source scans passed in the same run that failed it.

**An ancestry check still earns its keep.** After this merge it prints three lines, and §6 says why
each of those is deliberate:

```
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/cursor); do
  git merge-base --is-ancestor "$b" main || echo "NOT MERGED: $b"
done
```
