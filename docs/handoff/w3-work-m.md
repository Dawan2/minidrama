# Handoff — Wave 3, Work Slot M: history and the profile shell

> **Branch:** `cursor/w3-work-m-9b99`, cut from `cursor/w2-work-h-5c79` (the feed and drama surfaces).
> **Scope:** the client. The history / continue-watching screen (SCR-07), the profile shell
> (SCR-06), the session state the two of them talk about, and the watch-history read they share.
> **Not in scope:** nothing under `server/` — coin unlock and identity sessions are in flight
> elsewhere. Nothing in `app/tools/`, nothing in `contracts/`. Home and drama access presentation
> untouched. No `<video>`, no real playback, no favourites screen. No pull request was opened.

---

## 1. What this slot closes, and the one rule it exists to get right

Before this slot the client had three screens and no notion of a viewer. There was no way to see
what you had been watching, no screen that mentioned a session, and `#/me` and `#/history` were
paths in the IA with nothing behind them.

The rule this slot exists to get right is the counterpart of W2-H's "a platform block is not a
`NEED_UNLOCK`":

**"You have no history" is three different answers, and only one of them is about the viewer's
data.**

| Server says | Screen shows | Why it must be its own state |
| --- | --- | --- |
| `200` with `items: []` | "Nothing to continue yet" + "Find something to watch" | The viewer is known and has watched nothing. The way out of an empty list is content |
| `401` | "Sign in to pick up where you left off" + an in-place silent-login retry | The viewer is **not known**. There may well be a history; we are not allowed to see it |
| `404` / `405` / `501` | the empty state, unchanged | The endpoint is not deployed. Our gap, not their data |
| anything else | retryable or terminal, in the vocabulary every other surface uses | Nothing about identity happened |

The second row is the one that is easy to get wrong, because all three of the first three rows are
legitimately "a screen with no dramas on it". A viewer who has watched twenty episodes and is shown
"nothing to continue yet" because a token was missing has been told their progress is gone. They do
not know what a `401` is; they know what a lost place in a drama is. And the recovery is opposite in
each case: one sends them to the feed, the other retries silent login without leaving the screen.

The fourth row is why this is not simply "treat every failure as empty". A `400` is our bug and a
`500` is retryable, and collapsing those into "you have watched nothing" would hide both.

The third row is not hypothetical either. `GET /v1/users/me/watch-history` **does not exist on the
server today** — there is no progress module — so every real request answers
`404 COMMON_RESOURCE_NOT_FOUND` from Fastify's not-found handler. That was confirmed against the
running server, not assumed (§2.2). A client that mapped `404` to the shared terminal state would
ship a history screen that reads "we could not find this drama" on a screen that is not about a
drama.

---

## 2. What was delivered

| File | Contents |
| --- | --- |
| `app/src/auth/session.ts` | `SessionState`, `Session`, `anonymousSession`, `isSignedIn` — the seam, and the rule that the session decides copy while the server decides access |
| `app/src/auth/session-context.tsx` | `SessionProvider` and `useSession`, with no default value |
| `app/src/auth/SignInPrompt.tsx` | "You need to be signed in", with silent login attached. Not a login screen, not one of the four shared states |
| `app/src/data/history-api.ts` | `WATCH_HISTORY_PATH`, `HistoryApi`, `WatchHistoryEntry` and its narrowing |
| `app/src/data/history-api-context.tsx` | The provider and `useHistoryApi`, with no default value |
| `app/src/data/narrow.ts` | `asRecord`, `narrow`, `narrowPage`, extracted from `catalog-api.ts` so there is one answer to "what counts as a page" |
| `app/src/history/history-presentation.ts` | `presentHistoryFailure`: the table above, as code. The only place the client interprets a `401` |
| `app/src/history/HistoryRow.tsx` | One history row, and the resume-versus-open-the-drama decision |
| `app/src/routes/HistoryPage.tsx` | SCR-07, with `data-state` naming which of the answers it is rendering |
| `app/src/routes/ProfilePage.tsx` | SCR-06 as a shell: session state, the entries, and nothing invented |
| `app/src/routes/routes.ts` | `#/me` and `#/history` added; `#/favorites` deliberately not declared |
| `app/src/components/states.tsx` | `TerminalError` gained an optional `messageKey`, so a surface whose missing thing is not a drama can say so |
| `app/src/routes/HomePage.tsx` | One link to `#/me`. The feed rendering below it is untouched |
| `app/src/main.tsx` | One transport, two read clients, and the boot session |
| `app/src/testing/history-fixtures.ts` | `watchHistoryEntry`, `stubHistoryApi`, `stubSession` |
| `app/src/testing/render.tsx` | Every dependency now defaults to a stub, so a test supplies only the one it is about |
| `app/src/core/i18n/locales/*.json` | 19 new keys in both locales |
| `app/src/styles/app.css` | The history rows, the profile blocks, and the sign-in prompt |

**Nothing outside `app/src/` and this document is in the diff.** No file under `server/`,
`packages/`, `contracts/` or `app/tools/` was touched. The catalogue's own modules —
`access-presentation.ts`, `EpisodeRow.tsx`, `FeedCardView.tsx`, `DramaPage.tsx` — are unmodified;
`HomePage.tsx` gained a link and nothing else.

### 2.1 Verification

| Gate | Command | Result |
| --- | --- | --- |
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **682 passing, 0 skipped, 0 failing** — 317 app (was 242), 16 config, 11 shared, 338 server |
| Build | `pnpm build` | pass — `index-j4BiM25e.js` 270.71 kB (85.93 kB gzipped) + `index-wxSN-T0Y.css` 6.11 kB (1.64 kB) |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The bundle grew 8.1 kB raw / 1.9 kB gzipped, which is this slot's own code: two screens, one row,
one prompt, one read client. No `<video>`, `<audio>`, `<iframe>` or third-party player entered the
source or the artifact, and `app/src/player/` is untouched. No lint rule was relaxed and no test was
weakened, skipped or deleted. The four pre-existing test files that changed — `App.test.tsx`,
`routes.test.ts`, `states.test.tsx` and the locale surface — all gained assertions.

### 2.2 Verified against real HTTP, not only against stubs

Fixtures agreeing with each other proves nothing about the wire. The real `http.ts`, the real
narrowing and the real `presentHistoryFailure` were run against the live server and against
responses served over a socket:

| Case | Result |
| --- | --- |
| The live server on `:8099`, with and without an `Authorization` header | `404 COMMON_RESOURCE_NOT_FOUND` → `UNAVAILABLE`. The endpoint is not deployed, and the client degrades to the empty state rather than to "not found" |
| A real `401` with the documented envelope | `AUTH_REQUIRED`, `code: AUTH_REQUIRED`, one request — no automatic retry of an auth failure |
| A `401` whose body is HTML, as a gateway would send | `AUTH_REQUIRED` with `code: null`. **This is why the decision is keyed on the status and not on the code** (§3, M4) |
| `200` with `items: []` | a value, not a failure — the empty state has to be reachable through the transport, not only through a stub |
| `200` in the *exact* contract shape, with no `lastEpisodeId` | narrows, `lastEpisodeId: null`, and the row degrades to the drama screen (§5, gap G-M1) |

Then the built bundle was rendered in Chrome at 430×932 against a same-origin harness — same origin
deliberately, because cross-origin is a real deployment gap and not this slot's to fix (W2-H §5):

- **Populated history:** two rows, "Resume episode 4" and "Resume episode 12", covers as the
  labelled placeholder because `cdn.example.invalid` is not resolvable.
- **`401`:** the sign-in prompt, and no empty state and no error component anywhere on the screen.
- **`404`:** the empty state with "Find something to watch", visually identical to a genuinely empty
  history and still distinguishable in the DOM by `data-state="unavailable"`.
- **Profile:** "Guest", the login card in place of the assets area, "Continue watching" as a link
  and "Favourites — Not available yet" as a disabled row.
- **Caught by rendering rather than by a test:** the identity block and the login card sat flush and
  read as a single card, which made the login guidance look like part of the viewer's profile rather
  than the thing standing in for the assets area. Fixed with 8px, in its own commit.

### 2.3 Where the 75 new app tests go

| Group | Tests | Protects |
| --- | --- | --- |
| `routes/HistoryPage.test.tsx` | 17 | The four answers as four screens, `401` versus empty in copy and in action, the not-deployed degradation, paging, and a session lost mid-scroll |
| `data/history-api.test.ts` | 12 | The path, opaque cursors, the strict/tolerant split per field, and that an empty history is a value |
| `history/history-presentation.test.ts` | 9 | Every branch of the table, including a `401` with an unreadable envelope and a `403` that is *not* a missing session |
| `routes/ProfilePage.test.tsx` | 9 | That nothing is invented: no balance, no VIP state, no digits at all, and that the favourites entry is neither hidden nor a dead link |
| `auth/SignInPrompt.test.tsx` | 6 | One exchange per press, no second exchange in flight, the failure hint, and that it never navigates |
| `history/HistoryRow.test.tsx` | 5 | Both destinations, and that the resume position is never displayed |
| `auth/session.test.ts` | 4 | That the boot session is anonymous, reports failure honestly, and never rejects |
| `auth/session-context.test.tsx` | 3 | That a missing provider throws instead of claiming everyone is a guest |
| `data/history-api-context.test.tsx` | 2 | The same, for the read client |
| `App.test.tsx` | 5 new | Both new routes, the feed's link to the profile, that a `401` stays on its screen, and that `#/favorites` lands on the fallback |
| `routes/routes.test.ts` | 2 new | The two new paths, and that no path is declared for a screen that does not exist |
| `components/states.test.tsx` | 1 new | That a surface can override terminal copy while the reason survives for diagnosis |

Two were probed by mutation rather than assumed:

- Mapping `401` to `UNAVAILABLE` (that is, treating a missing session as an empty list) fails four
  tests in two files, including the one that asserts the two states do not say the same thing.
- Keying `presentHistoryFailure` on `failure.code` instead of on the status passes every stub-based
  test and fails the wire probe in §2.2, where a gateway's HTML `401` arrives with `code: null`. That
  is the ordering that matters: the stubs could not have caught it.

---

## 3. Decisions taken in this slot

Numbered `M*` to avoid colliding with the server slots' `S*` and W2-H's `H*`.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| M1 | **A `401` is its own state, not an error and not an empty list** | It is the only failure that says "there may be data and you may not see it". Both alternatives lie to the viewer: an empty list says their progress is gone, an error says something broke | One branch, and the lie comes back |
| M2 | **`404` / `405` / `501` degrade to the empty state** | A collection endpoint cannot answer `404` about the caller's data — either the route exists and the list is empty, or the route does not exist. Today it is the second, on every request (§2.2). An error screen asks the viewer to do something about our missing feature | One entry in a list of statuses |
| M3 | **The three ways of showing nothing stay distinguishable in the DOM, via `data-state`** | The viewer seeing the same empty state for M2 and for a real empty list is the intended degradation. A bug report, a test or a future analytics event still needing to tell them apart is not a contradiction — it is the reason the attribute exists | Delete one attribute |
| M4 | **`AUTH_REQUIRED` is decided from the HTTP status, never from the error code** | A gateway can answer `401` with a body we cannot parse, and it does (§2.2): `code` is then `null`. Showing the viewer the wrong screen because we could not read an error envelope is a failure caused by our own diagnostics. Every `401` in the catalogue asks the client for the same thing anyway | One predicate |
| M5 | **A `403` is not a missing session** | It is a banned account or a frozen wallet (J14). A sign-in button in front of a viewer who is already signed in and refused is an instruction they cannot follow | One branch |
| M6 | **The screen requests even when the client believes nobody is signed in** | The session state decides copy; the server decides access. A client-side skip makes the client the authority on identity, and shows a sign-in prompt over a history the server would have returned to a session the client had not noticed | One early return, and the client becomes an entitlement authority |
| M7 | **The session is a state and a seam, and `signIn` reports failure rather than faking success** | The server refuses every auth code until the identity slot lands. A `signIn` that returned `true` would put the profile into a signed-in state with no session behind it — the fabricated assets area J10-B forbids — and the viewer would then be shown an empty history *as a signed-in user* | Replace one value in `main.tsx` |
| M8 | **No default session in the context; a missing provider throws** | "Anonymous" is a claim about the viewer, and a claim nobody supplied is a claim nobody checked. A silent default lets a wiring bug tell every viewer they are a guest, which looks exactly like a product decision | Add a default |
| M9 | **The history read is a separate interface from `CatalogApi`** | It is the first read that is session-scoped, with a different failure vocabulary. Folding it in grows every anonymous surface's test double a method about identity that no anonymous surface can produce | Merge two interfaces |
| M10 | **The sign-in prompt is not one of the four shared states** | Nothing failed and no data is missing, so it is neither an error nor an empty state. Reusing `EmptyState` would make them indistinguishable in the DOM and, in time, in the code — which is the confusion M1 exists to prevent | Delete one component |
| M11 | **`TerminalError` takes optional copy from its surface** | A terminal state's only job is to explain itself, because it offers nothing to press. The shared copy explains a drama, and this screen is about the viewer's list. The `reason` still rides in the attribute, so diagnosis is unaffected | Delete one prop |
| M12 | **A row resumes in the player when it can, and opens the drama when it cannot** | The one-tap resume is the entire product purpose of the screen (J3). The contract's entry carries `lastEpisodeNumber` and no id, and the player route is addressed by id, so a contract-exact server produces the fallback. Two taps is a worse product; a row that goes nowhere is not a product | One ternary, plus gap G-M1 |
| M13 | **A `401` while appending is a sign-in prompt under the rows, not over them** | A session expiring mid-scroll is the same fact as one missing at the first page, so it gets the same recovery — but the rows already on screen are still correct and still the viewer's place in the list (H9) | One branch |
| M14 | **The narrower is strict about `drama` and `lastEpisodeNumber`, tolerant about the rest** | Those two *are* the row. The resume point and the timestamp drive nothing on the client — the server applies the position (contract §4.4) and the server orders the list — so rejecting a whole history because one entry lacks a timestamp costs the viewer their list to protect nothing | Two conditions |
| M15 | **The resume position is never displayed** | It is the server's number: the playback token carries `resumePositionSec`. A client that printed "resumes at 0:45" would be quoting a value it has no authority over and cannot keep in step across devices | One element |
| M16 | **The profile invents no assets area** | `GET /users/me` and `GET /wallet` do not exist, and the IA is explicit that the anonymous assets area is a login card and **not fake data** (J10-B). A "0 coins" placeholder is not a placeholder, it is a wrong balance, and a viewer who has recharged and sees it will not believe the next number either | Add a section when the endpoints exist |
| M17 | **The favourites entry is present and visibly unavailable** | Hidden, and nobody can tell whether favouriting does anything. Linked, and it lands on "this page does not exist", which reads as broken rather than unfinished. `#/favorites` is deliberately absent from `ROUTES` for the same reason | Swap a button for a `Link` |
| M18 | **One link from the feed to `#/me`, not a tab bar** | A tab bar is a navigation-chrome decision that belongs with the back-stack and capsule work (IA §2, §6), and inventing one here would put chrome on every screen including the immersive player. A screen nobody can reach is not a delivered screen | Delete one element |
| M19 | **The generic narrowing moved to `narrow.ts` rather than being copied** | Two copies of "what counts as a page" is two places for the answer to drift, and the second copy is always the one that forgets `nextCursor` can be `null`. No behaviour changed, which is why the catalogue's narrowing tests are untouched | Inline it back |
| M20 | **Every dependency in `renderSurface` defaults to a stub** | A profile test that had to script a feed response would assert on a dependency it does not use, and would fail the day the feed's shape changed for reasons that have nothing to do with the profile | Make them required again |

---

## 4. Deliberately not built

- **No favourites screen (SCR-08) and no favouriting.** No endpoint, and `DramaDetail.viewer` is
  `null`. The entry exists and says so (M17).
- **No history removal.** `DELETE /users/me/watch-history/{dramaId}` and the edit mode (J8) are not
  implemented: there is no list to remove from until the read exists server-side.
- **No withdrawn-item overlay.** SCR-07's 特有态 wants a "下架" scrim on a history row whose drama is
  gone (J13). `DramaSummary` carries no status field, so the client cannot tell. Registered as gap
  G-M2.
- **No `watchedAt` display and no date formatting.** The server's order carries the recency, and a
  localised relative date needs a formatting policy this slot would have had to invent.
- **No progress writing.** `PUT /progress/episodes/{episodeId}`, the heartbeat, the local queue and
  the LWW merge (IA §8.2, J12-5) are the playback slot's.
- **No `GET /progress/dramas/{dramaId}`.** The per-drama progress read feeds the episode panel's
  "watched" marks (PNL-01) and the detail screen's resume point, neither of which exists. The
  history list is the read this screen needs.
- **No real silent login.** No `TTMinis.login()`, no `POST /v1/auth/login` call, no token store, no
  `Authorization` header, no refresh. The seam is `Session` and one value in `main.tsx` (§6).
- **No "complete your profile".** It is a `TTMinis.authorize` call plus a nickname to show, and both
  belong with identity (J10-A).
- **No wallet, VIP, settings or browse screens.** SCR-09 to SCR-12 and SCR-03 are untouched.
- **No tab bar, no back-stack synthesis, no capsule rect probe.** As W2-H left them.
- **No analytics.** History rows carry no tracking id, because the server mints impression ids per
  feed response and there is no equivalent for this list.
- **No caching.** Navigating profile → history → back refetches from page one, like every other
  screen.

---

## 5. Known gaps in this slot's own work

- **G-M1: the contract's history entry cannot address the player.** `docs/12-api-contracts.md` §4.7
  publishes `{ drama, lastEpisodeNumber, lastPositionSec, watchedAt }`, and `#/play/:episodeId` needs
  an id. So the one-tap resume — the reason the screen exists — is impossible for a server that
  follows the contract exactly. The client reads an optional `lastEpisodeId` when it is present and
  opens the drama when it is not (M12). **This wants closing in the contract**, either by adding
  `lastEpisodeId` to the entry or by giving the player route a `drama + episodeNumber` form. The
  first is smaller and matches how `FeedCard.continueEpisode` already carries `episodeId`.
- **G-M2: a withdrawn drama in the history is indistinguishable from a live one.** J13 wants a scrim
  and a route to SCR-13; `DramaSummary` has no status. Today the row looks normal and the failure
  surfaces one tap later, as a `410` on the drama or the playback token.
- **The endpoint does not exist, so the screen's content state has never run against a real
  server.** It has run against real HTTP (§2.2) with the contract's own shape, which is the closest
  available thing, and the narrowing is the part most likely to need a fix when the real payload
  lands.
- **The profile's authenticated branch is unreachable today.** `signIn` cannot succeed, so
  `data-session="AUTHENTICATED"`, the "your progress is saved" copy and the absent login card are
  exercised only by tests. They are one stateful `Session` away from being real.
- **`openId` is carried and rendered nowhere.** Deliberate — it is meaningless to the viewer — but it
  means the profile cannot yet show *which* account, which is the first thing a support ticket asks.
- **No weak-network banner, no `AUTH_TOKEN_EXPIRED` interceptor.** Unchanged from W2-H §5, and the
  interceptor now has a first customer: this is the only authenticated read in the client, so a
  silent refresh here would remove one whole branch of `presentHistoryFailure`'s work.
- **`history.empty` speaks for two different situations.** Intended (M2/M3), and it does mean the
  copy is slightly optimistic while the endpoint is missing: "start a drama and it will wait for you
  here" is a promise nothing can keep until progress writing exists.
- **A history cursor can still skip an entry if the list reorders mid-scroll.** Same shape as the
  feed's gap (W2-H §5): client-side dedup by drama id prevents duplicates and not omissions.
- **The sign-in prompt has no throttle.** It refuses a concurrent exchange and nothing stops a viewer
  pressing it ten times in a row, ten seconds apart. Silent login is cheap and the platform may not
  agree; a backoff belongs with the real implementation.
- **`data-testid` attributes ship in the production bundle.** Unchanged, deliberate, reversible.

---

## 6. For the next slots

**For whoever implements identity.** There is one value to replace: `anonymousSession()` in
`main.tsx`. Give `SessionProvider` a stateful session whose `state` becomes
`{ status: 'AUTHENTICATED', openId }` after a successful exchange and whose `signIn` runs
`TTMinis.login()` → `POST /v1/auth/login` and resolves `true`. Three things then light up with no
other client change: the profile drops its login card and says the viewer's progress is saved, the
history screen's sign-in prompt reloads the list on success, and `SignInPrompt`'s failure hint stops
being the only reachable outcome. Two things must survive. `signIn` must keep resolving rather than
rejecting — every caller is a button on a screen the viewer is using. And the session state must
keep deciding copy only: the moment a surface uses it to decide whether to make a request, the
client has become an authority on identity (M6).

**For whoever adds the `Authorization` header.** It belongs in `createHttpClient`, which both read
clients already share (`main.tsx`), so one change covers the catalogue and the history. Note that
the catalogue reads must stay anonymous-capable: the server grants an `Authorization` header nothing
today (S28) and every catalogue endpoint answers anonymous requests, so attaching a header must not
become a precondition for reading the feed.

**For whoever implements watch progress on the server.** The client is waiting at
`GET /v1/users/me/watch-history` and will render the moment it answers `200`. Please include
`lastEpisodeId` (G-M1) — without it every row costs the viewer an extra tap. `nextCursor` must be
opaque and `hasMore` must agree with it, as everywhere else. And when the endpoint exists, the `404`
branch of `presentHistoryFailure` stops being a degradation and becomes dead weight worth deleting
(M2) — deliberately, not by accident, because a `405` from a proxy would then render as an empty
list rather than as the bug it is.

**For whoever builds the favourites screen (SCR-08).** `HistoryPage` is the template: the same
`usePagedResource` + `presentHistoryFailure` shape applies unchanged, because a favourites list has
exactly the same three-way "nothing here" problem. Declare `#/favorites` in `ROUTES` and swap the
profile's disabled button for a `Link` in the same commit — the two are one change, and doing the
first without the second is how a dead entry ships (M17).

**For whoever builds the tab bar.** `#/me` and `#/history` are registered and reachable, and the
feed's single link (M18) is the thing to delete when a real Tab root exists. The player route must
stay chrome-free: SCR-05 is immersive.

**For whoever wires the drama screen's resume point.** Unchanged from W2-H §6 and still true:
`DramaHeader` derives "watch now" from the first openable episode and should prefer
`viewer.lastWatched` when the server starts sending it. This slot deliberately did not touch it —
the history list and the detail screen's resume point are different reads, and W2-H's note is still
the right one.
