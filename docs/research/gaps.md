# Remaining Gaps

> **Slot:** Wave 1 · official research (W1 WORK SLOT 1), branch `cursor/w1-research-official-bb4f`.
> **As of:** 2026-08-27, after reading the Feishu One Page in full and the public TikTok Minis
> developer documentation.
> **Scope:** this file lists **only what is still open**. Anything the research settled is recorded
> in `docs/research/tiktok-minis-official.md` §9 and `docs/research/one-page-feishu.md`, and is
> deliberately absent here. Items that were open before this slot and are now closed are listed once,
> in §4, so nobody re-opens them.

**Headline: nothing below blocks Wave 2 from starting.** Every gap is either behind an abstraction
whose shape is now known, or is a business/operations item with no code dependency. The two that
deserve a decision before detailed Wave 2 planning are **G-R1** (which media plane we launch on) and
**G-R5** (the EIS compliance clock).

---

## 1. Gaps that affect a decision, not just an implementation

### G-R1 — Is the BytePlus + VePlayer media plane available to us at launch, or is it still a pilot?

| | |
|---|---|
| **Conflict** | The public [Minis Player](https://developers.tiktok.com/docs/en/minis-player) doc states the VePlayer mandate in the present tense: third-party players and native HTML video "are not allowed" and are replaced with a blocked UI. The One Page §3 notice dated 2026-06-25 says the media storage/player programme is a **pilot**, that pilot access "will begin in July" (EN) / that unified access **尚未开放** with phase-one invited testing already closed (CN), and that **"developers who are not included in the pilot can continue to use their own solutions"**, with the switchover date to be announced and "sufficient switching time" reserved |
| **Why it matters** | It decides whether our launch media plane is the platform's or ours. `docs/architecture/system-overview.md` corrections A1–A3 and §5–§6 derive the entire media design — no `<video>` anywhere, no own CDN, playability enforced by the platform — from the mandate being in force today. If we are not in the pilot at launch, we need an interim own-media path **and** a migration to VePlayer, which is a different plan with different risks |
| **What is not known** | Whether this organisation is in the pilot; when unified access opens; what the transitional compatibility scope and validity period are (the media-asset doc says these "shall be subject to the platform's notice") |
| **How to resolve** | Ask the TikTok mini-drama account manager directly, and read S-OP-1 (短剧媒资库和播放器接入说明). The One Page also offers a concrete first step that is useful either way: pre-register BytePlus account information so the platform can assist with preferential pricing, account opening and upload preparation |
| **Isolation while open** | Keep the player behind `bridge.player` / the VePlayer facade, as designed. Do **not** build an own-CDN media pipeline speculatively; do **not** assume BytePlus is available on day one either. The playback API already returns a descriptor rather than a URL, which is the right shape for both |
| **Owner** | W1 architecture + business |

### G-R5 — EIS / TPRM compliance review is a dated, long-lead gate with no engineering workaround

| | |
|---|---|
| **What is known** | From 2026-08-08, **all IAA and IAP Minis launching in the US and EU must pass the External Information Sharing (EIS) compliance review**. Processing takes **15–30 US business days** after submission. IAA Minis additionally receive a **TPRM questionnaire**; US launch additionally requires a separate **USDS TPRM review**. From the same date, both IAA and IAP Minis must select **sensitive data** in the questionnaire; inability to select it indicates the entity is associated with a restricted region. IAA Minis must not indicate any restricted region on the US Launch Compliance Questionnaire, or **monetization cannot be enabled after US launch** |
| **What is not known** | The specification details — the One Page says they "cannot be made public for the time being". The full rules live behind an **NDA** at <https://developers.tiktok.com/doc/data-access-compliance-requirements>, readable only by Org Admins and Owners. Whether our entity, its operating location and its controlling shareholders fall on the restricted-country list is unknown to this slot and is the gating input to everything else |
| **Why it matters** | It is pure calendar with no engineering compression available, it sits on the critical path for any US or EU launch, and **no Wave 1 document currently tracks it**. It also interacts with G-R2: if the US and EU are out of scope for v1, this gate does not apply to v1 at all |
| **How to resolve** | Org Admin/Owner signs the NDA and reads the compliance document; confirm the entity's restricted-country status; then decide launch regions with the EIS lead time priced in |
| **Isolation while open** | None needed in code. This is a schedule and scope item |
| **Owner** | Business, with W1 architecture tracking it as a risk |

### G-R2 — The release-region list is stated three different ways

| | |
|---|---|
| **Conflict** | One Page **EN**: no special requirements for Brazil, Indonesia, Japan, Malaysia, Philippines, Saudi Arabia, Thailand, Turkey; US needs TikTok review; **Vietnam needs a G1 online game license**. One Page **CN**: Brazil, Indonesia, Japan, Thailand, **South Korea, Australia, New Zealand, Canada, Mexico**; US needs review; **Vietnam not mentioned**. Only four countries appear in both |
| **Why it matters** | Region selection determines the default currency presentation, the locale set, whether **RTL is required at all** (Saudi Arabia is EN-only), and whether Vietnam legal work exists. `docs/architecture/system-overview.md` §10 follows the EN list and commits to logical CSS properties from day one on the strength of Saudi Arabia |
| **How to resolve** | Read the region picker in the Dev Portal's basic-information page — the Portal, not either version of the document, is authoritative |
| **Isolation while open** | Building RTL-safe from the start stays correct either way: it costs little now and is expensive to retrofit. Nothing else in the architecture is region-specific apart from the domain allowlist and legal URLs |
| **Owner** | W1 architecture + business |

### G-R3 — Apple platform fee: 15% or 30%?

| | |
|---|---|
| **Conflict** | One Page §2.6 (SKU pricing, both language versions): "Apple and Google apply different platform fees (**30% and 15%** respectively)." One Page §6.1.1 (settlement formula, both versions): IAP payment channel fee — "**Applestore 15%**". The Google Play figure exists only as an image and was not captured |
| **Why it matters** | It is a factor-of-two error in any margin model. The 15% figure is the one inside the settlement formula, so it is the one with money attached, but a contradiction inside a single document is not a basis for a pricing decision |
| **How to resolve** | The signed contract governs. Confirm with the account manager and read the Google Play figure off the original page's image |
| **Isolation while open** | No engineering dependency — coin↔Beans mapping already lives in server-side product configuration |
| **Owner** | Business / finance |

---

## 2. Platform API surface that remains undocumented

These five are the residue of the U-register. Each already has an isolation mechanism in
`docs/design/minis-integration.md`; the mechanisms stand and need no change.

### G-R7 — SDK error codes and error object shape (U-05)

The login callback failure branch is described only as "handle different cases based on the specific
`error_code`", and the ad `onError(err)` / `show().catch(err)` paths document *causes* (unsupported
environment, invalid placement ID, creative fetch failure, playback exception) but publish **no code
enumeration or object schema**. Nothing in the One Page adds to this.

**Isolation (unchanged):** normalise everything to `BRIDGE_*`, attach `String(err)` as a summary, and
**never destructure the SDK error object**. Collect real samples during on-device debugging and
refine classification with evidence. **Resolve at:** Wave 2 device debugging, where the ad-mock
toggle in DevTool can force full playback / closed midway / fetch failure / play failure.

### G-R8 — Lifecycle callbacks in the drama namespace (U-12)

`onShow(cb)` / `offShow(cb)` and a background counterpart are documented for `TTMinis.game.*`.
Nothing equivalent is documented for the drama `TTMinis.*` namespace, so we do not know whether they
exist there under the same names.

**Isolation (unchanged):** dual-listen on the platform event and the Web `visibilitychange` /
`pagehide` events, taking whichever arrives first; probe with `canIUse` at boot. The Web events alone
are sufficient for progress flushing, so this can never become blocking. **Resolve at:** boot-time
capability probe on a real device.

### G-R9 — Launch parameters and deep-link resolution (U-13)

No `getLaunchOptions`-style JSAPI is published. What *is* known is the link mechanism: the in-app ⋯
panel's **Copy Link** produces an episode landing URL, a **Generate Minis Link Open API** (S-OP-14)
does batch creation, and per the One Page placement FAQ, parameters appended after generating a
copylink **take effect only in the advertising link path** — direct QR scan or plain URL access does
not honour them. So the parameter channel exists but is narrower than assumed.

**Isolation (unchanged):** `bridge.launch.getOptions()` behind an abstraction, falling back to URL
query/hash parsing. **Additional test to schedule:** verify the ad-link parameter path specifically,
since that is the path carrying attribution and the one paid traffic depends on. **Resolve at:**
Wave 2, plus reading S-OP-14.

### G-R10 — Share capability (U-14)

The One Page placement FAQ says custom parameters "require listening to the **`share` event**", which
is the only evidence anywhere that a share event exists in the Minis runtime. No JSAPI reference page
documents it — not its name, payload, registration function, or `canIUse` key.

**Isolation (unchanged):** keep the interface slot, keep share out of the information architecture,
gate on `canIUse`. **Resolve at:** ask the account manager, or read S-OP-14, which is where link
generation is documented and therefore the likeliest home of the share contract.

### G-R6 — Subscription API reference and webhook events (U-08)

`POST /v2/minis/subscription/create/` and `TTMinis.createSubscription` are listed as **required**
capabilities in *Develop Your Mini Drama*, but no public reference page for the subscription API was
found, and the published webhook event set is trade-order only. **No subscription lifecycle events —
renewal, cancellation, grace period, expiry — are published anywhere.**

What the One Page adds is commercial rather than technical: subscription SKU sets carry **Weekly,
Monthly, Quarterly, Half-yearly, Yearly** billing cycles, each approved cycle yields a **Tier ID**
used for IAP configuration, and IAP-Subs settle **T+60 monthly** (T+5 monthly from September).

**Isolation (unchanged):** our minimum subscription state set (`PENDING`/`ACTIVE`/`CANCELED`/
`EXPIRED`) plus **periodic full sync of active subscriptions as the primary path**, not event-driven.
Worst case, receiving zero events still converges to the correct state within one sync period. The
event→status mapping table in `docs/design/minis-integration.md` §6.4 stays empty. **Resolve at:**
S-OP-11 (TikTok Minis 订阅完整接入指南) or the account manager.

### G-R11 — WebView autoplay policy (U-17)

Not stated in any source. The only signal is that every official example calls `player.play()` "based
on user action", which hints at a gesture requirement without confirming one.

**Isolation (unchanged):** the player's `buffering` state can absorb a wait-for-gesture; a guidance
state is added only if device testing shows it is needed. **Resolve at:** first real-device playback
session.

### G-R12 — Does the SDK origin consume a trusted-domain slot? (U-19)

*Set Up Development Configuration* says **all** domains involved in network requests must be
registered, up to 20, `https://`, no wildcards or paths — with no carve-out for
`connect.tiktok-minis.com`. Not decidable from documentation.

**Isolation (unchanged):** the domain budget in `docs/03-nonfunctional.md` §5 already reserves ≥17
free slots, so the worst case costs one slot and changes nothing. CSP must allow the origin
regardless. **Resolve at:** first look at the Portal's Security tab.

### G-R13 — `minis.config.json` exact key names (U-11)

Now a documentation-quality gap rather than an unknown. The parameter table gives
`navbar.bgColorLight` / `bgColorDark`, `build.outputDir`, `domain.trustedDomains`; the same page's
examples give `navbar.lightModeBgColor` / `darkModeBgColor`, `build.output`, and **`domain.allowList`**;
and the prose references a `build.folderName` that appears nowhere else. The drama and games CLIs are
different packages with different binaries (`tiktok-minis-cli` / `minis` versus `@tiktok-minis/cli` /
`ttdx minis`), so the two documents may simply describe two different config schemas.

**Isolation (unchanged):** generate the file with the real CLI and commit the generated output; never
hand-author it; never hard-code key names in build scripts. **Resolve at:** first `minis init` on the
real toolchain in Wave 2.

### G-R14 — Undocumented webhook field `pay_type`

The One Page §6.1.1 instructs developers to monitor **`pay_type`** in webhooks to identify the payment
channel, because the US supports web pay. The field appears in no public webhook reference, whose
`content` examples show only `trade_order_id`, `order_id`, `is_sandbox` and `refund_amount`. The field
list is therefore documented-but-not-exhaustive.

**Why it still matters even though U-07 is closed:** knowing the signature algorithm does not tell us
the payload schema. Capturing `pay_type` is a **settlement-reconciliation requirement**, not an
optional extra, because web-pay orders carry a different channel fee (Beans 25% versus Apple 15%).

**Isolation:** the raw-payload-first design in `docs/design/minis-integration.md` §6.2 already stores
the full body in `raw_payload jsonb` before parsing, so nothing is lost. Add `pay_type` to the parsed
projection explicitly. **Resolve at:** first sandbox webhook sample.

---

## 3. Business and operations items with no engineering dependency

| # | Item | Status | Owner |
|---|---|---|---|
| G-R15 | **Beans SKU tier values.** The mechanism is settled (Dev Portal SKU submission, CSV ≤1,000 or ≤10 manual, 2-week review, Tier ID per billing cycle, ≤400 USD per SKU / ≤350 USD South Korea, 100 Beans ≈ 1 USD reported / ≈ 1.5 USD paid). Our own approved ladder does not exist yet | Awaiting IAP enablement and SKU approval | Business |
| G-R16 | **Ad placement IDs.** Mechanism settled: created on the Dev Portal, **inactive by default and must be toggled Active**, Placement ID used as `adUnitId`. Values do not exist yet | Awaiting IAA enablement | Business |
| G-R17 | **Minimum supported library version.** The mechanism and the concrete floors are settled (see U-20). Choosing the value requires reading S-OP-21, 《基础库更新日志》, which was not retrieved | Needs the changelog | W1 architecture |
| G-R18 | **Android TikTok test client.** Android device testing requires a test client from the operations representative or a support ticket; iOS uses the Portal QR preview. Not yet requested | Scheduling constraint on device testing | Business |
| G-R19 | **Google Play platform fee.** Present in the One Page only as an image, which the capture did not preserve | Read off the original page | Finance |
| G-R20 | **Whether an account manager relationship exists.** The industry-qualification submission asks for a "TikTok Account Manager Email" if one has been engaged, and several gaps above resolve fastest through that person | Unknown to this slot | Business |

---

## 4. Closed by this research — do not re-open

Recorded so that a reader of the older documents does not chase questions that now have answers.

| Was | Now | Where the answer is |
|---|---|---|
| **B-1** — the official One Page was unavailable, so all platform conclusions rested on public docs | **Closed.** The document was retrieved and extracted in full text | `docs/research/one-page-feishu.md` |
| **B-2 / U-07 / Q-MI-2** — webhook signature algorithm and field list unknown | **Closed (algorithm).** `Tiktok-Signature: t=…,s=…`; `signed_payload = t + "." + raw_body`; HMAC-SHA256 keyed with `client_secret`; then a timestamp window. Field list remains non-exhaustive — see G-R14 | `docs/research/tiktok-minis-official.md` §6.3 |
| **O-1** — `TTMinis.*` versus `TTMinis.game.*` | **Closed.** Mini dramas use bare `TTMinis.*`; `TTMinis.game.*` is the mini-games product line, with a different CLI too | `docs/research/tiktok-minis-official.md` §2 |
| **U-15** — network/device/locale signal | **Closed, negatively.** "Currently no JS API is provided"; use standard browser capabilities | `docs/research/one-page-feishu.md` §9 |
| **U-18 / Q-MI-6** — server-side ad reward verification | **Closed, negatively.** No SSV exists; backend reward logging is the platform's own recommendation for strict risk control | `docs/research/tiktok-minis-official.md` §6.4 |
| **U-22** — revenue settlement cycle | **Closed.** IAA T+5 biweekly; IAP T+5 monthly from September; funds within 15 days of invoice confirmation; three regional invoicing entities in USD | `docs/research/one-page-feishu.md` §7.3 |
| **U-10** — Beans integer or fractional | **Closed.** Integer throughout the API; recharge rounds up to the nearest tier | `docs/research/tiktok-minis-official.md` §6.1 |
| **U-20** — minimum library version mechanism | **Closed (mechanism).** 1:1 map to client version, platform prompts the upgrade itself, platform default when unset. Floors: IAA ≥ 44.2.0, `play_auth_token` below 44.5.0. Only the chosen value remains — G-R17 | `docs/research/one-page-feishu.md` §3.6 |
| **U-21** — ad placement identifiers | **Closed (mechanism).** Portal-created, activation-gated, Placement ID as `adUnitId`. Only the values remain — G-R16 | `docs/research/tiktok-minis-official.md` §6.4 |
