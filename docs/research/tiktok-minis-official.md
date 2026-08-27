# TikTok Minis / Mini Drama — Official Public Documentation Research

> **Slot:** Wave 1 · official research (W1 WORK SLOT 1), branch `cursor/w1-research-official-bb4f`.
> **Retrieved:** 2026-08-27. Every page cited carries a "Last updated" date of 2026-08-04 or
> 2026-08-19; those dates are recorded per source in `docs/research/sources.md`.
> **Status:** research record. It does **not** rewrite `docs/architecture/*` or `docs/design/*`.
> Its purpose is to (a) capture the primary-source detail that the Wave 1 set had to infer, and
> (b) close as much of the **U-01 – U-22** uncertainty register in
> `docs/design/minis-integration.md` §2.2 as the public documentation and the Feishu One Page allow.
> **Companion:** `docs/research/one-page-feishu.md` (the Feishu One Page extract).
> Anything still open after both is in `docs/research/gaps.md`.

---

## 1. Scope and reading order

`docs/architecture/system-overview.md` §15 and `docs/11-official-onboarding-checklist.md` §0.2
already list the public documentation set and derive an architecture from it. **This document does
not repeat that derivation.** It records the facts that are load-bearing for the open questions,
with enough verbatim detail that a Wave 2 implementer can act on them without re-reading the
sources, and it flags the four places where the official documentation contradicts itself.

Read §2 for the two SDK namespaces (this is the answer to open item O-1), §3–§7 for the
capability-by-capability detail, §8 for the self-contradictions, and §9 for the U-register
disposition table, which is the deliverable this slot was asked for.

---

## 2. Two SDKs, two namespaces, two CLIs — and which one is ours

This is the single most confusing thing in the public documentation set, and it is the source of
open item **O-1** in `docs/architecture/system-overview.md` §4.2. It resolves cleanly once you notice
that TikTok publishes **two parallel product lines** whose docs are interleaved on the same site.

| | Mini **Drama** (ours) | Mini **Games** |
|---|---|---|
| Entry doc | [Develop Your Mini Drama](https://developers.tiktok.com/docs/en/tiktok-minis-develop-your-mini-app) | [Development Stage](https://developers.tiktok.com/doc/minis-development-stage) |
| SDK script | `https://connect.tiktok-minis.com/drama/sdk.js` | same script path (`/drama/sdk.js`) is shown in both |
| JS namespace | **`TTMinis.*`** — `TTMinis.login`, `TTMinis.authorize`, `TTMinis.pay`, `TTMinis.createSubscription`, `TTMinis.createRewardedVideoAd`, `TTMinis.createInterstitialAd`, `TTMinis.setNavigationBarColor`, `TTMinis.getMenuButtonBoundingClientRect`, `TTMinis.getPlayer`, `TTMinis.canIUse`, `TTMinis.setValidateVideoReplaceElement` | **`TTMinis.game.*`** — `TTMinis.game.login`, `TTMinis.game.pay`, `TTMinis.game.canIUse`, `TTMinis.game.onShow`, `TTMinis.game.getMenuButtonBoundingClientRect`, … |
| CLI package | `npm install tiktok-minis-cli -g` | `npm install @tiktok-minis/cli@latest -g` |
| CLI binary | `minis` (`minis -v` ⇒ `0.0.4`), `minis dev`, `minis build` | `ttdx minis init`, `ttdx minis build:after`, `ttdx minis debug` |
| Player | **VePlayer via `TTMinis.getPlayer()`** — mandatory | n/a |

**Conclusion for O-1:** mini dramas use the bare `TTMinis.*` namespace and the `tiktok-minis-cli`
toolchain. Every `TTMinis.game.*` example in the docs comes from a mini-games page. The bridge's
runtime namespace resolution (`TTMinis.getPlayer ? TTMinis : TTMinis.game`) is still worth keeping as
a one-line insurance policy, but the expected answer is now documented rather than guessed. Note
that the [In-App Purchases](https://developers.tiktok.com/doc/in-app-purchases) page — the most
detailed payment document on the site — is a **mini-games** page and uses `TTMinis.game.pay`, while
[Develop Your Mini Drama](https://developers.tiktok.com/docs/en/tiktok-minis-develop-your-mini-app)
lists `TTMinis.pay` as the required drama capability. Read the IAP page for the *flow* and the drama
page for the *symbol names*.

### 2.1 Required capabilities for a mini drama

Verbatim from the required-capability table in *Develop Your Mini Drama*:

| Function | APIs | Required |
|---|---|---|
| Silent Login | `TTMinis.login`, `https://open.tiktokapis.com/v2/oauth/token/` | **Yes** |
| Explicit Authorization | `TTMinis.authorize`, `/v2/oauth/token/`, `/v2/user/info/` | No |
| In-App Ads: Rewarded | `TTMinis.createRewardedVideoAd` | **Yes** (IAA must be enabled) |
| In-App Ads: Interstitial | `TTMinis.createInterstitialAd` | **Yes** (IAA must be enabled) |
| IAP: Beans (one-time) | `/v2/minis/trade_order/create/`, `TTMinis.pay` | **Yes** (IAP must be enabled) |
| IAP: Subscriptions | `/v2/minis/subscription/create/`, `TTMinis.createSubscription` | **Yes** (IAP must be enabled) |
| Navigation bar | `TTMinis.setNavigationBarColor`, `TTMinis.getMenuButtonBoundingClientRect` | **Yes** |

This confirms correction A5 in `docs/architecture/system-overview.md` §1.1 (both ad formats are
required, not just rewarded) and matches the "必接能力" list in
`docs/11-api-and-bridge.md` §3.

### 2.2 SDK initialisation contract

```html
<head>
  <script src="https://connect.tiktok-minis.com/drama/sdk.js"></script>
  <script>
    TTMinis.init({ clientKey: 'your_client_key' });
  </script>
</head>
```

The [Get Started](https://developers.tiktok.com/docs/en/minis-sdk-get-started) page states the
constraint that drives the bridge's `initPromise` design:

> "`TTMinis.init()` is used to initialize and set up the SDK. **All other SDK methods must be called
> after this one, because they won't exist until you do.**"

"Won't exist" is literal — calling before `init` is a `TypeError`, not an error result. The
`init` queue in `docs/design/minis-integration.md` §5.3 is therefore mandatory, not defensive.
The SDK script must be the **first** `script` tag, and `init` must be called after the script is
imported or the SDK is not injected.

---

## 3. Identity

### 3.1 Silent login

```js
TTMinis.login(function (response) {
  if (response.authResponse?.code) {
    const code = response.authResponse.code;   // send to your backend
  } else {
    // handle based on the specific error_code
  }
}, { scope: 'user.info.basic' });
```

- Callback-style, not promise-style. Success shape is `response.authResponse.code`.
- The failure branch is described only as "the game can handle different cases based on the specific
  `error_code`" — **the error code enumeration is not published**. See U-05 in §9.
- The code is exchanged **server-side** at `POST https://open.tiktokapis.com/v2/oauth/token/` for
  `open_id` and `access_token`. Front-end JS calling the OpenAPI directly triggers CORS and fails
  (One Page §7, Authorize Login Q3).
- **Access token lifetime: "The access token will expire after 24 hours after initial issuance."**
  ([Development Stage](https://developers.tiktok.com/doc/minis-development-stage)). Users may also
  revoke authorization, which invalidates the token immediately. On HTTP 401 — or any non-200 — the
  server must tell the frontend to re-trigger the flow.
- `open_id` is scoped to the **client key** and is **region-independent** (One Page §7, Q1).
- `Login` has **no frequency control**, and the platform recommends calling it on entry to the Minis
  and again before placing an order, because that is the only way to notice an account switch when
  session state is not held in a `tiktok.com` cookie (One Page §7, Q6).

### 3.2 Explicit authorization

```js
TTMinis.authorize(function (response) { /* response.authResponse?.code */ },
                  { scope: 'user.info.basic' });
```

Official guidance, matching journey J10-A: do **not** pop the authorization box on start; complete
basic login first and request extra scopes only when needed, triggered by a button. **If
`.authorize` fails, fall back to `.login`** so the basic login is not lost. More sensitive scopes
(email, phone) require BD contact and a separate compliance process.

---

## 4. Playback (VePlayer)

The rule, verbatim from [TikTok Minis Player](https://developers.tiktok.com/docs/en/minis-player):

> "Your app **must** use the official TikTok Minis player (VePlayer) to play reviewed mini drama
> episodes… **Third-party players and native HTML video are not allowed. If they are used, TikTok
> will replace them with a default blocked UI.** If you need support for gradual migration, submit a
> support ticket or contact your operations representative."

Read alongside the pilot notice in the One Page §3 (see `docs/research/one-page-feishu.md` §4), this
is the destination state; the launch state depends on pilot inclusion. That tension is gap **G-R1**.

### 4.1 Construction and control

```js
TTMinis.getPlayer(channel)   // channel: 'byteplus' | 'volcengine'; returns Promise<typeof VePlayer>
```

Playback data comes from **our** server: `album_id`, `episode_id`, `vid` (the BytePlus video ID) and,
for TikTok clients **below 44.5.0**, a short-lived `play_auth_token`.

```js
const player = new VePlayer({
  id: 'player-container-xx',      // or root: HTMLElement
  vid, albumId, episodeId,
  lang: 'en',                     // documented: en, zh-cn, jp
  defaultDefinition: '720p',
  getVideoByToken: { playAuthToken, needPoster: true },
  closeVideoClick: false, closeVideoDblclick: true,
  videoFillMode: 'fillWidth',
  ignores: ['moreButtonPlugin','enter','fullscreen','volume','play','pip','replay',
            'playbackrate','sdkDefinitionPlugin'],
  enableMp4MSE: true,             // required for preload
});
```

- **The player kernel is created asynchronously.** `player.player` is null immediately after
  construction; obtain it inside the `READY` event. Kernel access gives `currentTime`, `paused`,
  `ended`, `play()`, `pause()`.
- **Episode switching uses `playNext({ albumId, episodeId, vid, getVideoByToken })`** on the retained
  instance, returning a promise. This confirms the amendment in
  `docs/architecture/system-overview.md` §4.3.
- Events used for our analytics: `READY`, `PLAY`, `TIME_UPDATE` (payload `{ currentTime }`), `ERROR`,
  `PRELOAD_INFO`.
- `destroy()` when the surface is torn down. Each instance needs its own correctly-sized container.
- **License configuration is not required for TikTok Minis** — worth knowing, because standard
  BytePlus VePlayer documentation talks about licences.

`play_auth_token` is fetched from
`GET https://open.tiktokapis.com/v2/sg/shortdrama/play_token/?client_key=…&episode_id=…`
with `Authorization: Bearer <access_token>`, returning `{ play_auth_token }`. It is short-lived, so
fetch it only when playback is actually about to happen.

Migration escape hatch, if ever needed:
`TTMinis.setValidateVideoReplaceElement((videoEl, replaceReason) => HTMLElement | null)` customises
the blocked-UI element that replaces a disallowed `<video>`.

### 4.2 Preload — the numbers behind the first-frame budget

| Item | Value |
|---|---|
| Format | **MP4 only** |
| Requirement | `enableMp4MSE: true` at construction, or preloaded bytes cannot be used |
| Environments | PC, Android H5, **iOS 17.1+** (`ManagedMediaSource`) |
| Init | `await VePlayer.prepare({ strategies: { preload: true } })` |
| `preloadScene` | `0` = manual (default), `1` = feed stream (player-driven) |
| `prevCount` / `nextCount` | `1` / `2` (feed scene only) |
| `preloadTime` | **5 s** per video, default |
| `preloadMaxCacheCount` | **15**, LRU eviction |
| Media info cache | `VePlayer.setMediaInfoCacheConfig({ enable: true })`; off by default; `memory` or `localStorage`; `expireTime` 1,800,000 ms; `maxEntries` 100; keyed by `episodeId + defaultDefinition` |
| Measurement | `player.preLoadData` and the `PRELOAD_INFO` event |

Documented failure modes worth encoding as engineering rules:

- **`defaultDefinition` must match the actual playback definition**, or both the media-info cache and
  the preload cache miss.
- A too-short interval between `setPreloadList`/`addPreloadList` and actual playback creates cache
  entries with **too few bytes to help the start**.
- A non-transcoded or otherwise incompatible video **degrades the player from MSE to native video**,
  and preloaded data cannot be used at all.
- Do not preload all episodes; bound the task count by user path, click probability and network.
- Clear old lists on page/mode switch to avoid network competition.

Official best practice, which matches `docs/architecture/system-overview.md` §5.3: manual mode
(`preloadScene: 0`, `preloadTime: 5`) to preheat episode 1 from the home/landing page, then auto mode
(`setPreloadScene(1, { prevCount: 1, nextCount: 2 })` plus `setPreloadList(orderedEpisodes)`) inside
the playback page.

### 4.3 Subtitles

External subtitles are platform assets bound to the video, surfaced with `autoSubtitle: true` plus a
registered `Subtitle` plugin, with `formatAutoSubtitleItem` to choose/filter/rename tracks and
`getSubtitleList()` / `switchSubtitle()` / `showSubtitle()` / `hideSubtitle()` as the control API.

**Format lists disagree between two official pages** — see §8.3.

---

## 5. Media assets and playability

From [Media Asset Management](https://developers.tiktok.com/doc/media-asset-management). The upload,
moderation and album-versioning pipeline is already modelled in
`docs/architecture/system-overview.md` §6; the facts below are the ones that change operational
behaviour and are not yet in the Wave 1 set.

### 5.1 Moderation SLA is two-tier, and the fast lane is a quota

| Category | Description | SLA |
|---|---|---|
| Normal | Recommended for the non-pending back catalogue, to get 500–1,000 dramas available on TikTok Minis | **2 weeks** |
| Urgent | Recommended for in-progress shows (first-time launches, recent-consumption titles); **each organisation limited to 35 shows per day** | **1–3 working days** |

`docs/architecture/system-overview.md` §6.1 labels moderation "1–3 working days" in the pipeline
diagram, which is the **urgent** lane only. Catalogue build-out planning must use the 2-week normal
lane as the default and treat the 35/day urgent lane as scarce.

### 5.2 Playability is per **version**, and one failure blocks everything in it

| Scene | Result |
|---|---|
| Version not submitted for moderation | Unplayable |
| Version under moderation | Unplayable |
| **Any drama shell element or any episode fails moderation** | **All episodes in that version are unplayable** |
| Version passed moderation but not launched | Unplayable |
| Version passed moderation and is live | Playable via the BytePlus player |
| Show taken off the shelves | Unplayable |
| Bound BytePlus account deleted or invalid | Related shows may not play; re-verify and re-launch |

The FAQ restates it twice: "Moderation approval only indicates that the version is eligible for
listing, while playback also requires that the version has been listed," and "As long as any drama
shell element or any episode within a drama version fails moderation, **all episodes under that
version cannot be played**."

**This is a blast-radius fact with product consequences.** A single rejected episode dark-screens the
whole drama, not one item in the episode grid. Our catalogue kill-switch and drift reconciler
(`docs/architecture/system-overview.md` §6.2–§6.3) must therefore operate at
`(album_id, version)` granularity and pre-emptively hide the whole drama, not the offending episode.

### 5.3 BytePlus binding constraints

- Credentials: the developer binds a BytePlus `AccessKeyID` / `SecretAccessKey` on the Dev Portal.
  **If they change and are not updated, every video-related open API call becomes invalid and videos
  stop playing in the Minis.** AK/SK rotation is therefore an operational runbook item with a
  production-outage failure mode.
- **A drama must be bound to one space of one BytePlus account**, and all its episode videos must
  live in that space. Multiple accounts or multiple spaces per drama are not allowed.
- **A BytePlus account may serve multiple apps**: app↔BytePlus account binding is many-to-many.
- The media-asset capability can only be activated after the **mini-drama industry qualification** is
  approved (this is why the Activate button is greyed out).
- Playback must be initiated from `album_id` + `episode_id`; **using the raw video address to bypass
  platform play control is explicitly disallowed**.

### 5.4 Ingest formats

| Type | Formats | Size |
|---|---|---|
| Video | MP4, FLV, ASF (WMV), RM, RMVB, MPEG, MOV, AVI, FLASH, MPEG-TS (MTS), M4S, M3U8, MKV | ≤ 20 GB per file |
| Audio | MP3, M4A, WAV, WMA, AMR, AAC, OGG | ≤ 20 GB per file |
| Subtitles (multilingual) | VTT, SRT, ASS, TTML — **English must be included** | — |

---

## 6. Monetization

### 6.1 Payment APIs (server side)

All under `https://open.tiktokapis.com`, all `POST` unless noted, all with
`Authorization: Bearer <user access_token>`.

| Endpoint | Purpose | Notes |
|---|---|---|
| `/v2/minis/utility/get_tier_infos/` | Tier price lookup | Request `{ token_type: "BEANS", tier_ids: [...] }`. Returns per tier: `tier_id`, `tier_name`, `token_type`, `token_amount` (**int**), `price` (string), `currency` (ISO 4217), `symbol`. **The price returned is for the country of the user's TikTok account** |
| `/v2/minis/trade_order/create/` | Create the trade order | `{ token_type, token_amount (int), order_info: { order_id, order_url, product_name, product_id, quantity, quantity_unit, image_url } }` ⇒ `{ trade_order_id }`. `quantity_unit` example given for our domain is literally `"episode"`; `image_url` should be the drama poster and is shown on the user's order history page |
| `/v2/minis/trade_order/query/` | Order status | ⇒ `{ trade_order_id, trade_order_status }` where status ∈ **`PENDING`, `SUCCESS`** — only two states |
| `/v2/minis/utility/check_redeem_amounts/` | Validate prices | `{ token_type, token_amounts: [int] }` ⇒ `{ valid: bool }` |
| `/v2/minis/subscription/create/` | Create a subscription | Listed as a required capability; no dedicated public reference page was found (gap **G-R6**) |

Design-relevant statements:

- **Anti-tampering**: "`token_amount` (price) must be calculated by your backend based on database
  configurations. **Never directly use price values sent from the frontend.**"
- **Order association**: store `trade_order_id` against your internal `order_id`; both appear in
  webhook callbacks.
- `trade_order_id` is **single-use and immutable** — a failed or cancelled payment needs a brand new
  order (One Page §7, Payment Q2).
- **No product pre-registration**: TikTok does not require registering SKUs or prices for Beans
  spend; only `token_amount` matters.
- Two integration options: **recharge+payment merged (recommended)** — TikTok prompts the top-up
  automatically on insufficient balance — or recharge and pay separately, which gives more control at
  the cost of more steps.

### 6.2 Client payment call and the polling contract

```js
TTMinis.pay({ trade_order_id, success, fail, complete })   // TTMinis.game.pay in the games docs
```

> "**The frontend success callback only indicates that the payment process has finished on the client
> side. Never use frontend callbacks as the basis for delivering virtual entitlements. Always wait
> for the server-side webhook confirmation.**"

The official reference polling loop is **every 2 seconds, up to 12 attempts (~24 s)**, after which
the user is shown "there is a slight delay in entitlement delivery, please refresh later". Our design
(`docs/design/minis-integration.md` §4.2) uses a 60 s poll window and a "到账确认中" banner; same
shape, more generous window. Nothing to change, but the official numbers are the baseline a reviewer
will expect.

### 6.3 Webhooks — signature algorithm (this closes U-07 / blocker B-2)

Transport rules ([Webhooks Overview](https://developers.tiktok.com/doc/webhooks-overview)):

- HTTPS POST, JSON, to the callback URL registered in the Developer Portal.
- **Respond 200 immediately** to acknowledge. A non-200 is treated as failed delivery.
- **Retries for up to 72 hours with exponential backoff**, then the notification is discarded.
- **At-least-once delivery** — "webhook endpoints might receive the same event more than once. There
  should be a guard against duplicated event receipts by making your event processing idempotent."

Verification ([Webhooks Verification](https://developers.tiktok.com/doc/webhooks-verification)):

```
Tiktok-Signature: t=1633174587,s=18494715036ac4416a1d0a673871a2edbcfc94d94bd88ccd2c5ec9b3425afe66
```

1. Split the header on `,`, then each element on `=`. `t` = timestamp, `s` = signature.
2. `signed_payload = t + "." + raw_request_body` — **use the raw body, do not re-serialise.**
3. `local_signature = HMAC_SHA256(key = client_secret, message = signed_payload)`.
4. Reject if `local_signature != s`.
5. Then check `now - t` is inside an acceptable window (**the IAP page suggests 5 minutes**) and
   reject expired payloads as replays.

Envelope and events ([Development Stage](https://developers.tiktok.com/doc/minis-development-stage),
[In-App Purchases](https://developers.tiktok.com/doc/in-app-purchases)):

| Field | Type | Meaning |
|---|---|---|
| `client_key` | string | Partner identifier |
| `event` | string | Event name |
| `create_time` | int64 | UTC epoch seconds |
| `user_openid` | string | TikTok user identifier |
| `content` | string | **A serialised JSON string**, not an object |

| Event | Status |
|---|---|
| `minis.trade_order.redeem.success` | Payment succeeded |
| `minis.trade_order.redeem.refund_success` | **Currently unavailable** |
| `minis.trade_order.redeem.refund_fail` | **Currently unavailable** |
| `minis.trade_order.redeem.refund_traceback` | Amount partially recovered after a store-initiated refund; `refund_amount` is the recovered amount |

`content` fields observed across the examples: `trade_order_id`, `order_id`, `is_sandbox`,
`refund_amount`. The One Page adds **`pay_type`** (§13.5 of the extract), which appears in no public
reference — so the field set is documented-but-not-exhaustive, and the raw-payload-first design in
`docs/design/minis-integration.md` §6.2 stays justified even though the algorithm is now known.

Recommended processing order, verbatim structure from the IAP page: signature → timestamp →
idempotency (`trade_order_id` or your `order_id`) → **optional secondary verification via
`/trade_order/query/`, delivering only when status is `SUCCESS`** → fulfil in an atomic transaction →
200 OK.

`is_sandbox` must be honoured: `true` ⇒ test order, never counted as production revenue — and per the
One Page §6.1.1, sandbox orders must be **excluded from the settlement amount** by the developer.

### 6.4 In-app ads

Both ad docs share the same shape. Placements are created on the Dev Portal
(**Operation → Monetization → In-App Ads (IAAs) → Ad placements → Add ad placement**), typed
`Rewarded ad` or `Interstitial ad`, and are **inactive by default — they must be toggled Active to
work**. The resulting **Placement ID** is what you pass as `adUnitId`. That is the mechanism behind
U-21.

```js
const ad = TTMinis.createRewardedVideoAd({ adUnitId });   // or createInterstitialAd
ad.onClose(handleClose);   // handleClose does ad.offClose(handleClose) first
ad.onError(handleError);
ad.show().then(...).catch(...);   // show() returns a promise
```

| Rule | Source |
|---|---|
| **IAA requires TikTok ≥ 44.2.0**; gate with `canIUse` before every call | Rewarded ads doc, and One Page CN §2.6 |
| **TikTok Pro Android does not support the short-drama IAA feature**; check for a thrown error code from that client | Rewarded ads doc |
| `canIUse('createRewardedVideoAd')` / `canIUse('createInterstitialAd')` detection before display | Both docs, "Best practices" |
| Activate the placement immediately after creation | Both docs |
| **Use a new ad instance for every display.** "Each instance… can only be shown once. After displaying, the instance is released" | Both docs |
| Grant the reward **only when `res.isEnded === true`** in `onClose` | Rewarded ads doc |
| Interstitials carry **no reward semantics**; resume the business flow on close, and degrade gracefully on failure — never block the main flow | Interstitial doc |
| Debug with the **ad mock** toggle in the DevTool developer options, exercising full playback / closed midway / fetch failure / play failure | Both docs |

**There is no server-side ad verification callback.** Step 6 of the rewarded-ad flow offers three
options — frontend-issued reward, backend-recorded result, or both — and says only: "When strict risk
control is required, developers can record reward distribution logs on the backend." That is the
answer to U-18: the platform provides no SSV, so the client-reports/server-enforces-quota-and-audit
design in `docs/design/minis-integration.md` §4.3 is the sanctioned pattern, not a compromise.

Documented `show()` failure causes: capability unsupported in the current environment; invalid
placement ID; ad creative fetch failure; playback exception.

---

## 7. Build, configuration and release

### 7.1 Runtime restrictions (platform-enforced, checked at upload)

From [Development Stage](https://developers.tiktok.com/doc/minis-development-stage):

- `eval()` forbidden.
- The `Function` constructor forbidden.
- String parameters to `setTimeout()` / `setInterval()` forbidden.
- `script` and CSS `src` may only come from self resources, fonts excepted.
- `iframe` not supported.
- Some web APIs forbidden — **clipboard, location, vibration** are the named ones.
- Server request addresses must be registered as trusted domains.

This confirms correction A6 in `docs/architecture/system-overview.md` §1.1 verbatim.

### 7.2 Trusted domains

From [Set Up Development Configuration](https://developers.tiktok.com/doc/set-up-development-configuration):

- "During runtime, your app can only initiate network requests to trusted domains that have been
  registered. **Any domain not registered will be denied access.**"
- Domains must start with `https://` and **cannot contain wildcards or paths**.
- **Up to 20 domains.**
- Separately, **URL ownership must be verified** for URLs in the app configuration, by **domain** or
  **URL prefix** (prefix verification requires downloading a signature file and hosting it at the
  URL). Some features require this verification before use.

The URL-ownership verification step is not in the current Wave 1 set and is a small but real
onboarding task for the ToS/privacy domain and the webhook domain.

### 7.3 `minis.config.json`

The documented parameter table (mini-games CLI page) is:

| Parameter | Required | Type | Description |
|---|---|---|---|
| `navbar` | No | object | Navigation bar settings |
| `navbar.bgColorLight` | No | string | Light-mode background |
| `navbar.bgColorDark` | No | string | Dark-mode background |
| `dev` | No | object | Local dev settings |
| `dev.host` | No | string | Default `localhost` |
| `dev.port` | No | number | Default `3000` |
| `build` | No | object | Build settings |
| `build.outputDir` | No | string | Default `build` |
| `build.htmlEntry` | No | string | Default `public/index.html` |
| `domain.trustedDomains` | **Yes** | string[] | Allowed API request list |

The same page's worked examples are internally inconsistent with this table — see §8.1. `ttdx minis
init` also injects the SDK bootstrap and a **vConsole** script into `index.html`, and requires the
`client_key`. `ttdx minis build:after` copies `minis.config.json` into the build output and generates
a **`minis.manifest.json`** resource listing (`{ type: "file" | "folder", name, children }`) that the
Minis service uses to resolve resources.

### 7.4 Environment data has no platform API

Also from *Development Stage*: for user environment details such as language and OS, "you can obtain
the data using standard browser capabilities", with `navigator.language` and UA sniffing given as the
worked examples. Combined with the One Page's "no JS API is provided" answer for language, location
and device, this is a definitive negative for U-15.

### 7.5 Release

- CLI for drama: `npm install tiktok-minis-cli -g --registry=https://registry.npmjs.org/`, verified
  with `minis -v` (expected `0.0.4`), then `minis build` to validate and package.
- **Android device testing requires a TikTok test client**, obtained from the operations
  representative or via a support ticket. **iOS testing goes through the Portal QR preview.**
- Publishing rules (One Page §2.7.2): one production plus one canary version, production publish only
  available at first launch, canary traffic allocation drives the production share automatically.
- Review: 1–3 working days, security plus non-security, with basic information used as a
  cross-reference during code review.

---

## 8. Where the official documentation contradicts itself

Four contradictions found. Each is a place where a Wave 2 implementer could reasonably write correct
code against one source and fail against the other, so each gets an isolation rule.

### 8.1 `minis.config.json` key names

The same page gives three mutually inconsistent shapes:

- Parameter table: `navbar.bgColorLight`, `navbar.bgColorDark`, `build.outputDir`,
  `domain.trustedDomains`.
- First example: `navbar.lightModeBgColor`, `navbar.darkModeBgColor`, `build.output`,
  `build.htmlEntry`.
- Second example: `navbar.lightModeBgColor` / `darkModeBgColor`, `build.outputDir`, and
  **`domain.allowList`** rather than `domain.trustedDomains`.
- The prose elsewhere refers to a `build.folderName` field that appears in neither.

**Isolation:** do not hand-author this file. Generate it from `ttdx minis init` / `minis init` on the
real toolchain and keep the generated shape under version control, exactly as U-11 already
prescribes. Do not let the build scripts hard-code key names.

### 8.2 CLI package and command names

`tiktok-minis-cli` + `minis dev|build` (drama pages, including the rewarded/interstitial ad debugging
steps) versus `@tiktok-minis/cli` + `ttdx minis init|build:after|debug` (mini-games development
stage). Note the ad docs are drama-facing but say `minis dev`, while the config documentation that
describes `minis.config.json` is games-facing and says `ttdx minis`. **Isolation:** install the drama
CLI first, record the actual binary and version in the repo, and treat every CLI invocation as a
scripted npm task so a rename is one edit.

### 8.3 Subtitle formats

`docs/architecture/system-overview.md` §5.4, following the player documentation, lists **WebVTT, SRT,
ASS, SSA**. The [Media Asset Management](https://developers.tiktok.com/doc/media-asset-management)
ingest table lists **VTT, SRT, ASS, TTML**. `SSA` and `TTML` are the disputed entries. **Isolation:**
author subtitles as **SRT or VTT**, which every source agrees on, and treat ASS/SSA/TTML as untested.

### 8.4 Apple platform fee

15% in the One Page settlement formula, 30% in the One Page SKU pricing section. Recorded here
because it affects any pricing model built before the contract is read. See
`docs/research/one-page-feishu.md` §13.4 and gap **G-R3**.

---

## 9. Disposition of the U-01 – U-22 register

This is the deliverable the slot was asked for: every uncertainty in
`docs/design/minis-integration.md` §2.2, answered where the One Page or the public documentation
answers it. **Status** uses that document's own vocabulary — `[已验证]` verified, `[待验证]` to be
verified, `[未知]` unknown — with the value **after** this research.

Sources are abbreviated: **OP** = Feishu One Page (`docs/research/one-page-feishu.md`),
**PD** = public developer docs (this document).

| # | Item | Before | **After** | Finding | Action for Wave 2 |
|---|---|---|---|---|---|
| U-01 | SDK script URL | `[已验证]` | `[已验证]` | `https://connect.tiktok-minis.com/drama/sdk.js`, confirmed in four independent PD pages | Keep as build-time config, as designed |
| U-02 | `init` must precede everything | `[已验证]` | `[已验证]` | PD is explicit that other methods "won't exist" before `init` — a `TypeError`, not an error result | `initPromise` queue is mandatory (§5.3) |
| U-03 | `login` ⇒ code, backend exchange | `[已验证]` | `[已验证]` | PD + OP §7 Q3/Q7. Frontend OpenAPI calls fail on CORS; never OCR the code | Unchanged |
| U-04 | `open_id` unique and stable | `[已验证]` | `[已验证]` **+ refined** | OP §7 Q1: `open_id` relates **only to the client key**, region-independent. OP §7 Q5: revoking authorization invalidates **all** permissions including silent login | Keep `open_id` as the user key; on any 401 re-run silent login (design already does this) |
| U-05 | SDK error codes / error object shape | `[未知]` | `[未知]` **(narrowed)** | Success shape is `response.authResponse.code`; PD refers to "the specific `error_code`" but **publishes no enumeration**. Ad errors surface via `onError(err)` and `show().catch(err)` with documented *causes* but no codes | **No change to the design.** Keep `BRIDGE_*` normalisation and `String(err)` summaries; do not destructure. Collect real samples during on-device debugging → gap **G-R7** |
| U-06 | SDK method timeout behaviour | `[未知]` | `[未知]` **(mitigated)** | No timeouts documented anywhere. However ads auto-close on fetch/playback failure so `onClose` always fires, and `show()` returns a rejecting promise — the ad path has a guaranteed terminator | Keep the §5.5 timeout wrapper. Keep **no timeout** on `pay` / `createSubscription` / `showRewardedVideo` |
| U-07 | **Webhook signature algorithm and field set** | `[未知]` | **`[已验证]`** | `Tiktok-Signature: t=<epoch>,s=<hex>`; `signed_payload = t + "." + raw_body`; **HMAC-SHA256 keyed with `client_secret`**; compare, then enforce a timestamp window (5 min suggested). Delivery is at-least-once with **72 h exponential-backoff retries**; 200 must be returned immediately | **Implement the real verifier** behind the existing `SignatureVerifier` interface. **Blocker B-2 can be closed.** Keep raw-payload-first storage: `pay_type` proves the field list is not exhaustive |
| U-08 | Subscription webhook event set | `[未知]` | `[未知]` | The published event list is trade-order only (`redeem.success`, `refund_success` and `refund_fail` **currently unavailable**, `refund_traceback`). **No subscription lifecycle events are published**, and no public `/v2/minis/subscription/*` reference page was found | **No change.** Periodic full sync of active subscriptions remains the primary path; the event→status map stays empty. Gap **G-R6** |
| U-09 | Beans tier table values | `[待验证]` | `[待验证]` **(mechanism resolved)** | Tiers come from **SKU sets submitted on the Dev Portal** (CSV up to 1,000, or ≤10 manual; **2-week review**; Tier ID issued per billing cycle). `get_tier_infos` returns `price`/`currency`/`symbol` **for the user's TikTok account country**. Anchor: **100 Beans ≈ 1 USD** reported to stores, **≈ 1.5 USD** actually paid. Reference tier `1732621527608100` = 100 Beans. **Max 400 USD/SKU; 350 USD in South Korea** | Read tiers from server config as designed; render `price`+`symbol` as returned. Our own tier values await SKU approval — business item |
| U-10 | Beans integer or fractional | `[待验证]` | **`[已验证]`** | `token_amount` is `int` in both create-order and tier APIs; `check_redeem_amounts` takes `list<int>`. Recharge **rounds up to the nearest available tier** | Keep `integer`. Model residual balance: revenue counts **Beans consumed**, not recharged |
| U-11 | `minis.config.json` field set | `[未知]` | `[待验证]` | Documented table exists (§7.3) but the same page contradicts itself three ways (§8.1), and the drama and games CLIs differ (§8.2) | **No change.** Generate from the real CLI in Wave 2 and commit the generated file. Do not hard-code key names |
| U-12 | Platform foreground/background lifecycle | `[未知]` | `[未知]` **(partially answered)** | `onShow(cb)` / `offShow(cb)` and a background counterpart are documented **for `TTMinis.game.*`**. Nothing equivalent is documented for the drama `TTMinis.*` namespace | Keep the dual-listen design (platform event + `visibilitychange`/`pagehide`, first-wins). Probe with `canIUse` at boot. Gap **G-R8** |
| U-13 | Launch parameters / deep links | `[未知]` | `[未知]` **(partially answered)** | No `getLaunchOptions`-style JSAPI is published. But deep links exist: the in-app ⋯ panel's **Copy Link** yields an episode URL, and a **Generate Minis Link Open API** does batch creation. Parameters appended to a copylink **work only in the ad link path**, not on direct QR/URL access (OP §7 Placement Q4) | Keep `bridge.launch.getOptions()` abstracted with URL query/hash fallback. **Test the ad-link parameter path specifically** — it is the one that carries attribution. Gap **G-R9** |
| U-14 | Share capability | `[未知]` | `[未知]` **(existence confirmed)** | OP §7 Placement Q4 states that custom parameters "require listening to the **`share` event**" — so a share event exists in the runtime. No JSAPI reference page found | Keep the interface slot and `canIUse` gating; do not put a share entry in the IA yet. Gap **G-R10** |
| U-15 | Network type / data-saver signal | `[未知]` | **`[已验证]` (negative)** | OP §7 Basic Development Q1: language, location and device info are "highly sensitive… **currently no JS API is provided**". PD says use standard browser capabilities (`navigator.language`, UA) | **Settled: there will be no platform API.** Use `navigator.connection` where present, otherwise assume "unknown network" and pick the conservative start definition |
| U-16 | WebView MSE availability, EME ceiling | `[未知]` | `[待验证]` **(MSE answered)** | MSE: preload requires `enableMp4MSE: true` and works on PC, Android H5, **iOS 17.1+ (`ManagedMediaSource`)**; MP4 only; incompatible video **degrades MSE → native video** and loses preload. EME is not mentioned anywhere — and is moot for platform-hosted content, where play control is enforced by the platform, not by our DRM | Instrument the MSE/preload hit rate from day one (`player.preLoadData`, `PRELOAD_INFO`). Drop the EME question for platform-hosted media |
| U-17 | WebView autoplay policy | `[待验证]` | `[待验证]` | Not stated. The only signal is that PD examples always call `player.play()` "based on user action" | Keep the `buffering` state able to absorb a wait-for-gesture; add the guidance state only if on-device testing shows it is needed. Gap **G-R11** |
| U-18 | Server-side ad reward verification | `[未知]` | **`[已验证]` (negative)** | Rewarded-ad Step 6 offers frontend reward, backend recording, or both; "when strict risk control is required, developers can record reward distribution logs on the backend". **No SSV callback exists** | **Settled.** Client reports `isEnded === true`; the server enforces quotas and writes `ad_reward_log`. The replaceable-verifier interface (AC-4) can stay, but nothing will be plugged into it |
| U-19 | Does the SDK domain consume a trusted-domain slot? | `[待验证]` | `[待验证]` | PD says "**all** domains involved in network requests must be registered", ≤20, https, no wildcards or paths — without carving out the SDK origin. Not decidable from documentation | Unchanged: the budget already reserves ≥17 free slots, so worst case costs one. Confirm on the Portal. Gap **G-R12** |
| U-20 | Minimum supported library version | `[待验证]` | **`[已验证]` (mechanism + floor)** | OP §2.5.2: the basic library version maps **1:1** to the client version, and **the platform itself prompts the user to upgrade** when the client is below the configured minimum; unset ⇒ platform default. Concrete floors: **IAA needs TikTok ≥ 44.2.0**; `play_auth_token` is needed **below 44.5.0**; **TikTok Pro Android does not support drama IAA** | Set the minimum deliberately. Ads stay `canIUse`-gated regardless, because **organic traffic below 44.2.0 is our problem to detect and prompt** |
| U-21 | Ad placement identifiers | `[未知]` | **`[已验证]` (mechanism)** | Placements are created on the Dev Portal (Operation → Monetization → IAA → Ad placements), typed rewarded/interstitial, **inactive by default and must be toggled Active**; the **Placement ID** is the `adUnitId` | Unchanged and now justified: deliver IDs from `/config`. Never bake them into the bundle — an ID change would otherwise cost a review cycle. Values await IAA enablement |
| U-22 | Revenue settlement cycle | `[待验证]` | **`[已验证]`** | OP §6.2.1. Online settlement from **April** transactions. **IAA: T+5, biweekly** (from August; first statement 20 Aug covering 1–15 Aug). **IAP: T+5, monthly** from September (first statement 5 Oct); before that IAP-Beans T+15 monthly, IAP-Subs T+60 monthly. **Funds within 15 days of invoice confirmation.** Formula: successful payments − refunds − test orders − store channel fee − tax. Three invoicing entities, USD, one invoice per region, **one appeal per unpaid record** | No longer "no technical landing point". It creates concrete engineering work: **exclude `is_sandbox` orders from revenue**, **capture `pay_type`**, and produce a per-region revenue report that reconciles against the platform statement |

### 9.1 Score

| Disposition | Count | Items |
|---|---|---|
| Newly resolved (`[未知]`/`[待验证]` ⇒ `[已验证]`) | **7** | U-07, U-10, U-15, U-18, U-20, U-21, U-22 |
| Mechanism resolved, values pending | **2** | U-09, U-11 |
| Narrowed but still open | **5** | U-05, U-06, U-12, U-13, U-14 |
| Unchanged and still open | **3** | U-16 (EME), U-17, U-19 |
| Already verified, re-confirmed | **5** | U-01, U-02, U-03, U-04, plus U-16's MSE half |

Ten items were `[未知]` before this slot; **four of those are now verified** (U-07, U-15, U-18, U-21),
and the remaining six are narrowed. **No item that was previously non-blocking has become blocking,
and one previously-blocking item (U-07 / blocker B-2) is now unblocked.**

The judgement in `docs/design/minis-integration.md` §11.2 — that none of the open questions blocks
Wave 2 — still holds, and holds more strongly: every remaining unknown is either behind an
abstraction that now has a known shape, or has a documented negative answer that removes the need for
the abstraction at all.
