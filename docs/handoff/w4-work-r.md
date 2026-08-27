# Handoff — Wave 4, Work Slot R: one player instance, and the episode switch that runs on it

> **Branch:** `cursor/w4-work-r-d943`, cut from `cursor/w3-work-o-1f19` (the search screen).
> **Scope:** the player facade and the player screen. One instance per surface, an episode switch
> that happens *on* that instance through `playNext()`, an idempotent teardown, and the tests that
> hold all three down.
> **Not in scope:** the search screen, the history screens and the watch-history API (in flight
> elsewhere), the trusted-domain configuration (in flight), anything under `server/`, and
> `contracts/openapi.yaml`. No `<video>`, `<audio>` or `<iframe>` entered the source or the
> artifact — §2.4 records the mutation that proves it. No pull request was opened.

---

## 1. What this slot closes

The facade had held one instance since Wave 1 and it exposed `playNext()`. Two things were missing,
and together they meant the invariant was written down rather than enforced.

**The player was never told the album's order.** `playNext()` was forwarded to a player that had
been handed exactly one episode at construction and no playlist. `docs/architecture/
system-overview.md` §5.3 is explicit about where "next" comes from — `setPreloadList(orderedEpisodes)`
— and nothing called it. The facade also had no idea which episode was on screen after it advanced,
so nothing else could either.

**The surface rebuilt the player on every render.** `PlayerSurface` kept `descriptor` in its
effect's dependency list and `PlayPage` built a fresh descriptor object literal on every render.
Every render therefore destroyed the player and constructed a new one. Nothing about that is
visible on screen — the placeholder looks identical — and it costs precisely what the preload
module exists to buy: the next episode is preloaded into an instance that is about to be thrown
away, and every episode starts cold. It also meant the "exactly one live instance" invariant was
true only in the sense that the instances were serial.

So the rule the slot exists to make real:

| The route asks for | What happens | Why |
| --- | --- | --- |
| The episode already playing | **Nothing at all** | A re-render is not an episode change |
| The immediately following episode | `playNext()` on the retained instance | The switch the preload module exists for |
| Anything else — backwards, a jump, another album | Destroy, then build one new instance | `playNext()` only goes forwards, and reaching episode five by calling it four times plays three episodes nobody asked for |

The third row is the one that is easy to get wrong in the tidy direction. A facade that loops
`playNext()` to reach an arbitrary episode looks like it upholds "one instance" and is worse than
rebuilding: it emits the play events, the analytics and the progress of every episode in between.

---

## 2. What was delivered

| File | Contents |
| --- | --- |
| `app/src/player/veplayer-types.ts` | `VePlayerPlaylistItem`, and `setPreloadList` on the instance — **optional**, see R2 |
| `app/src/player/player-facade.ts` | The episode queue: `upNext`, `currentEpisode()`, `playNext(): boolean`, `switchToEpisode()`, and teardown that makes every method inert |
| `app/src/player/mock-veplayer.ts` | Takes a preload list, *moves* on `playNext()`, and still renders a `div` |
| `app/src/player/PlayerSurface.tsx` | Takes the album and the episode separately; the create effect no longer depends on the episode |
| `app/src/routes/PlayPage.tsx` | The queue, the episode label, the next-episode link, and the end of the album |
| `app/tools/source-rules.ts` | One new rule: `createElement` must be given a literal element name (R16) |
| `app/src/core/i18n/locales/{en,ar}.json` | 2 new keys in both locales |
| `app/src/styles/app.css` | The player screen's meta line and next-episode button |

Nothing under `server/`, `packages/` or `contracts/` is in this diff. `app/src/data/`,
`app/src/catalog/`, `app/src/discovery/` and every other screen are untouched.

### 2.1 Verification

| Gate | Command | Result |
| --- | --- | --- |
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **698 passing, 0 skipped, 0 failing** — 333 app (was 306), 338 server, 16 config, 11 shared |
| Build | `pnpm build` | pass — `index-tc0zP-4t.js` 270.81 kB (86.34 kB gzipped) + `index-D3N-ut5I.css` 5.86 kB (1.60 kB) |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The bundle grew 2.39 kB raw / 0.71 kB gzipped, which is the queue, the switch logic and the
screen's two new elements. One pre-existing test file changed behaviourally — `player-facade.test.ts`
— and it gained assertions rather than losing any (§2.3). Nothing was weakened, skipped or deleted.

### 2.2 Verified in a real browser, not only in jsdom

jsdom can tell you a mock was called. It cannot tell you the player element on the page is the
*same element* it was before the switch, which is the whole claim. The built bundle was served with
`vite preview` and driven in headless Chrome over CDP at a 430 × 932 viewport, with the platform
SDK blocked at the network layer so `createBridge` selects `MockBridge` — the documented
browser-development path (§11). The live player node was tagged in the DOM on arrival and looked
for again after each switch.

| Probe | What the real page did |
| --- | --- |
| Arrive at `#/play/ep_demo_0001` | `data-state="playing"`, one player node, `vid_demo_0001`, **0** `video`/`audio`/`iframe`/`object`/`embed` elements |
| Tap "Next episode" | Route, surface and label all move to episode 2; the player node is **the same tagged node**, now showing `vid_demo_0002` |
| Tap it again | Episode 3, still the same tagged node, `vid_demo_0003`. One instance across a three-episode walk |
| Navigate back to `#/play/ep_demo_0001` | The tagged node is **gone**, replaced by a new one on `vid_demo_0001` — the rebuild path, with still exactly one player node in the container |
| Navigate to `#/play/ep_demo_0006` | No next-episode link; "That was the last episode." |

Two things that rendering confirmed and a unit test could not: the container never holds two
players at once — the destroy of the old instance and the mount of the new one leave exactly one
child, so a rebuild cannot stack a dead surface under a live one — and the "same node" result is
what distinguishes advancing from rebuilding-into-an-identical-looking-frame, which is precisely
the bug that was shipping.

### 2.3 Where the 27 new app tests go

| Group | Tests | Protects |
| --- | --- | --- |
| `player/player-facade.test.ts` | 10 new (12 → 22) | The queue handed to the player, `UNCHANGED`/`ADVANCED`/`OUT_OF_REACH`, the end of the queue, a player with no preload module, inertness after destroy, and an instance destroyed when configuring it throws |
| `player/PlayerSurface.test.tsx` | 6 new (3 → 9) | One instance across a switch and across a walk, no rebuild on a bare re-render, the rebuild path destroying the old instance, starting mid-album, and an empty album |
| `routes/PlayPage.test.tsx` | 7 (new file) | The route as the source of the episode, the switch as one instance, the end of the album, an unknown episode id, and no native media element on the one screen whose job is media |
| `tools/eslint-guardrails.test.ts` | 2 new | That `app/src/player/` is not exempt from the media-element ban |
| `tools/source-rules.test.ts` | 2 new | The computed-`createElement` rule, and that a literal one still passes |

### 2.4 Probed by mutation, not assumed

Three mutations were applied to the real source and the suite run against them.

- **Rebuild instead of advance** — make the switch effect bump the generation unconditionally.
  **4 tests fail** across `PlayerSurface` and `PlayPage`. The surface still renders the right
  episode, which is why this needed a test rather than a look.
- **Never hand the player its playlist** — drop the `setPreloadList` call. **8 tests fail.** Worth
  knowing: without it, `playNext()` on a real player is a request to advance through a list the
  player was never given.
- **Build the mock player on a `<video>`**, with the tag name computed so no AST rule can see it.
  **4 tests fail** — and `pnpm lint` and `pnpm check:guardrails` both stayed **green**. That is the
  hole R16 closes; the runtime DOM assertions were the only thing catching it.

---

## 3. Decisions taken in this slot

Numbered `R*` to avoid colliding with the server slots' `S*`, slot H's `H*` and slot O's `O*`.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| R1 | **The facade takes `descriptor` plus `upNext`, not a playlist and an index** | It is additive: every existing call site and every existing test stays valid, and there is no new failure mode. A `{ playlist, episodeId }` signature has to answer "what if that episode is not in that playlist", and the honest answer — a `BridgeError` — would be a *routing* problem wearing a bridge error's clothes | Change one signature; the queue logic is unaffected |
| R2 | **`setPreloadList` is declared optional on the instance type and feature-detected** | Preload needs MP4 + MSE and is absent below that bar (risk M-3), where playback still works and simply starts each episode cold. Declaring it required would be a wider guess than the docs support, and the failure mode would be a crash on exactly the low-end devices the degradation exists for | Make it required and delete one `?.` |
| R3 | **Only the immediately following episode is reachable; everything else rebuilds** | `playNext()` is the only switch verb the player gives us. Looping it to reach episode five plays three episodes in between, with their events, their analytics and their progress. Rebuilding is honest and costs one cold first frame | A loop, and the events it produces |
| R4 | **`playNext()` refuses at the end of the queue and calls nothing** | The end of a drama is a screen — the next drama, the detail page, a recommendation — not a playback command. Asking the player to advance past the last episode we hold a session for is asking it to pick something on its own | Delegate blindly and let the player decide |
| R5 | **Every facade method is inert after `destroy()`** | The calls that arrive late come from a promise that resolved after the surface unmounted. A destroyed player is the correct answer to them; a crash on a screen the viewer has already left is not | Drop the guards |
| R6 | **An instance that is built and then fails to configure is destroyed, not dropped** | Returning the typed error while letting the reference go is a live player with nobody able to tear it down — in a WebView, one that holds the network for as long as the mini app lives | Return the error and leak |
| R7 | **`PlayerSurface` takes `(playlist, episodeId)` and the create effect does not depend on the episode** | This is the fix. As long as the episode is a dependency of the effect that constructs the player, every episode change is a rebuild and no amount of care elsewhere changes that. The dependency array is the invariant | Put it back, and lose the guarantee |
| R8 | **A rebuild is an explicit generation bump, not an effect dependency** | It keeps the two paths distinguishable in the code and in a test: advancing is the default and rebuilding is a decision with a name. It also gives the async creation somewhere to reconcile to when the route moved while the player was being built | Key the effect on the episode again |
| R9 | **The `playlist` prop must be referentially stable, and `PlayPage` memoizes it** | The surface treats a new playlist as a new album. An array literal rebuilt per render is exactly the bug this slot removed, wearing a different prop name. It is documented on the prop rather than defended against by value-comparing descriptors, because a deep compare would silently accept a caller who reshuffles the album mid-playback | Compare by album id inside the surface |
| R10 | **The episode lives in the route, and the next-episode link `replace`s its history entry** | Route as source of truth is IA §5, so a deep link and a back navigation both land on the episode being watched. `replace` because inside a WebView the back gesture is also how a viewer leaves the mini app: one entry per episode makes leaving a forty-episode drama a forty-press exercise. The cost is that back does not step through episodes | One flag — but it belongs with the back stack (§6) |
| R11 | **The album stays a placeholder in `PlayPage`, widened from one episode to six** | It is the Wave 1 stub, and `POST /v1/playback/sessions` is what replaces it — that endpoint is where the entitlement gate and the real `vid` live. Widening it is the minimum that makes switching exist at all; fetching an album from the catalogue would need an episode-to-drama lookup that no endpoint offers yet | Delete one function when the session endpoint lands |
| R12 | **An unknown episode id opens the album's first episode rather than an error screen** | Which drama an episode belongs to is a question for the playback session (IA §5: the drama is looked up from the episode). Until that exists, this screen genuinely cannot tell "withdrawn" from "not in the demo album", and inventing a terminal error for a link that may be perfectly good is the worse guess | One branch, once there is an endpoint that can tell them apart |
| R13 | **An empty album degrades to the same "unavailable" surface as a missing player** | One surface, one degraded state. Nothing to play and no player to play it with are different causes with the same remedy, and a second variant of a black frame with a message is how a screen acquires four ways of saying nothing | Add a state |
| R14 | **`MockVePlayer` moves on `playNext()` instead of only counting the call** | A mock that counts lets a surface which advances *nothing* pass its tests. The placeholder now carries the episode it is actually on, which is what the browser probe reads (§2.2) | Revert to a counter, and lose the check |
| R15 | **The no-`<video>` rule is asserted over the live DOM, not only by lint** | Lint reads our AST and the bundle scan greps the artifact; both match a literal. The DOM does not care how the element was named. The player container is the one place worth paying for a runtime assertion, because it is the only place with a reason to create a media element | Delete three assertions |
| R16 | **The computed-`createElement` rule went into `app/tools/source-rules.ts`, not ESLint or the bundle scan** | It is a file-level rule, which is what that module is for, and it is the one place a new rule does not touch a config file that in-flight slots also touch. Both first-line defences demonstrably miss the case (§2.4) | Move the regex into either of the other two |
| R17 | **`player.unavailable` now comes from the locale bundle** | The key already existed in both locales and the component was rendering an English string literal next to it. English compatibility is a review condition (S6), and a string that is translated everywhere except the failure path fails exactly where a viewer is already stuck | None |

---

## 4. Deliberately not built

Listed so nobody re-scopes it as an omission.

- **No playback session.** The descriptor is still built on the client. `POST /v1/playback/sessions`
  is a server slot and the entitlement gate lives there, so this screen currently plays anything it
  is pointed at.
- **No lock state, no unlock panel** (SCR-05 S6). There is no `viewerAccess` on this route because
  there is no read behind it; `docs/handoff/w2-work-h.md` §4 still holds.
- **No progress reporting and no resume.** `resumePositionSec` is 0 for every episode. The
  `timeupdate` → throttled heartbeat mapping (§5.2) needs the watch-history API, which is in flight
  in another slot, and nothing here writes to it.
- **No gesture switching.** The affordance is a link, not a vertical swipe. The immersive
  full-screen feed layout is a screen-level design and this slot changed a lifecycle.
- **No episode panel and no episode picker on the player.**
- **No analytics.** The facade accepts an `onEvent` and the surface passes none: there is no event
  transport (`POST /events/batch` does not exist), and mapping player events to a sink that does not
  exist would be inventing the schema in the wrong slot.
- **No preload tuning.** `setPreloadList` is called; `prepare({ strategies: { preload: true } })`,
  `setPreloadScene(1, …)` and `setMediaInfoCacheConfig` from §5.3 are not. Those are player-module
  configuration with numbers that belong in server-side config (`tech-stack.md` §3), and guessing
  the counts here would put them in the bundle where a review cycle is needed to change them.
- **No error classification.** A player `error` event is not yet separated into "commercially
  locked" and "platform-blocked", which §5.2 is emphatic about. That separation needs the playback
  session's denial shape (`PlaybackDenial` exists in the shared types and nothing produces one).
- **No `<video>`, and no media of any kind.** There is none on this screen, none in the mock, and
  none in the artifact.

---

## 5. Known gaps in this slot's own work

Stated plainly rather than left for someone to discover.

- **The player advancing on its own would desync the route.** Our cursor moves when *we* call
  `playNext()`. If a real VePlayer auto-advances at the end of an episode — which is what a feed
  player does — the player is on episode 3 while the route and this facade still say 2. The fix is
  to move the cursor from the player's own event rather than from the call, and it needs a device
  to find out which event that is and what it carries. This is the single most likely thing to be
  wrong on first contact with the real player.
- **`playNext()` semantics are inferred from the architecture docs, not verified on a device.**
  §5.3 says one instance per feed page, switch with `playNext()`, playlist through
  `setPreloadList`. Whether the real player advances through the preload list, or through the album
  it was constructed with, or needs an argument this narrow type does not have, is unknown until
  W29. `MockVePlayer` currently defines the answer, which is exactly the risk a mock carries.
- **`data-state` stays `playing` through a rebuild.** The out-of-reach path destroys one instance
  and builds another without returning to `loading`, so for a few frames the surface claims to be
  playing an episode whose player does not exist yet. It avoids a flash and it is a small lie.
- **The queue is six invented episodes** (R11). Every `vid` is `vid_demo_000n` and nothing behind
  them exists, so the browser probe proves the *lifecycle* is right and proves nothing about
  playback.
- **Back does not step through episodes** (R10). A viewer who watches three and wants the first has
  to use the next-episode link's absence — there is no previous-episode affordance at all, which is
  a deliberate omission only in the sense that stepping backwards is the rebuild path.
- **The screen is not the immersive player.** It is a heading, a 9:16 box and a button underneath,
  on a scrollable page. It reads as a demonstration of episode switching, which is what it is.
- **Nothing announces the episode change to a screen reader.** The label under the player changes
  silently. A `role="status"` region is the obvious fix and it was left out rather than guessed at,
  for the same reason it was left out of the search screen.
- **The new elements have not been checked in RTL.** Both locale keys are present and the layout
  uses the same classes as the rest of the app, but nobody has looked at the player screen in
  Arabic.

---

## 6. For the next slots

**For whoever lands `POST /v1/playback/sessions`.** `PlayPage`'s `demoPlaylist` is the only thing to
delete, and the decision waiting for you is *when* a session is minted. A descriptor per episode
means a session per episode, and the queue this slot introduced wants them ahead of time — which is
the opposite of what an entitlement gate wants, since a session for an episode the viewer never
reaches is an authorization decision made too early. The shape that fits both: mint the current
episode's session on arrival and the *next* one when the current episode starts playing, so the
queue is always one deep and `switchToEpisode` still has its successor. The facade needs no change
for that; `upNext` is already a list you can supply with one entry.

**For whoever wires watch history.** The hook is `PlayerFacadeOptions.onEvent`, which the surface
does not currently pass. `timeupdate` is the heartbeat source and the episode switch is a flush
point (§5.2) — and note that the flush has to happen *before* `switchToEpisode`, because after it
the facade's `currentEpisode()` is already the new one and the position belongs to the old one.

**For whoever builds the immersive player and the gestures.** Two things here are yours to
overturn: R10's `replace`, and the fact that the next-episode affordance is a link at all. A
vertical swipe changes what the viewer does, not what the player does — it should still end in a
route change, because the route is what makes a deep link and a back navigation land on the right
episode. What must not change is the direction rule (R3): a swipe *up* is `playNext()`, and a swipe
*down* is a rebuild until the player offers a verb that goes backwards.

**For whoever owns the guardrails.** §2.4 found that a computed element name is invisible to both
the ESLint rule and the bundle scan. R16 closes it for `createElement`; the same shape of hole
exists for anything else the rules match as a literal — `innerHTML` with an assembled string is the
obvious next one, and it is not covered anywhere today.

**For whoever takes the player to a device (W29).** The three things to check in this order, all
from §5: that `playNext()` advances through the list given to `setPreloadList` and not something
else; what the player emits when it advances on its own, because that event is what the cursor
should be following (§5); and whether `setPreloadList` is present at all on an iOS client below
17.1, which is the assumption R2 is built on.
