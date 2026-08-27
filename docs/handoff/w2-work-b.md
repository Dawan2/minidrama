# W2 Work Slot B — Handoff

> Wave 2 · work slot B. Branch `cursor/w2-work-b-1a8e`, created from `cursor/w2-plan-p1-0453` (`fc39e3e`).
>
> **What this slot was asked to do:** find the Wave 1 official-research slot's pushed branch, merge it into a
> continuation of the W2 plan-P1 branch without rewriting any architecture or product file, survey the remaining
> `cursor/w1-*` branches for unabsorbed handoff, and record what the research adds over the One Page extract the
> W1 product-IA slot already produced.
>
> Constraints observed: no pull request, no subagents, no application code, no repository skeleton merged, no CI
> created or weakened, no test removed, no threshold lowered, no other slot's file rewritten. The only file this
> slot authored is this one.

---

## 1. Branch and SHAs

| Item | Value |
|---|---|
| This slot's branch | `cursor/w2-work-b-1a8e` |
| Base | `cursor/w2-plan-p1-0453` (`fc39e3e`) |
| Merged in | `cursor/w1-research-official-bb4f` (`bb12f0d`) at merge commit `93753f4` |
| Merge outcome | `ort` strategy, **zero conflicts**, five files added, **zero files modified, zero deleted** |
| Files this slot authored | `docs/handoff/w2-work-b.md` (this file) |

The research branch was itself cut from `cursor/w1-architecture-bed5` (`3692cf5`), which is already an ancestor of
`cursor/w2-plan-p1-0453`, so the merge base was exactly that commit and the merge was purely additive by
construction. Reproduce with:

```bash
git diff --name-status cursor/w2-plan-p1-0453 cursor/w2-work-b-1a8e
# expect exactly five 'A' rows and nothing else
git diff --name-only cursor/w2-plan-p1-0453 cursor/w2-work-b-1a8e -- docs/architecture docs/product docs/design docs/plan
# expect empty
```

---

## 2. Origin `cursor/w1-*` branch inventory

Taken from `git ls-remote --heads origin` at the start of this slot. **Twelve** Wave 1 branches exist on the
remote — two more than the ten `docs/handoff/w2-plan-p1.md` §1 could see, because the research and skeleton slots
had not yet pushed when P1 ran.

| Branch | Head | On this branch | Note |
|---|---|---|---|
| `cursor/w1-plan-p1-1d0f` | `2eedf89` | yes | transitively, via `cursor/w1-plan-p3-e16a` |
| `cursor/w1-plan-p2-1d0f` | `07cd250` | yes | transitively |
| `cursor/w1-plan-p3-1d0f` | `3c2b296` | yes | transitively |
| `cursor/w1-work-a-1d0f` | `f42a67f` | yes | transitively |
| `cursor/w1-work-b-1d0f` | `71d27fe` | yes | transitively |
| `cursor/w1-work-d-1d0f` | `ef9fba5` | yes | transitively |
| `cursor/w1-plan-p3-e16a` | `580e46b` | yes | merged by P1 |
| `cursor/w1-architecture-bed5` | `3692cf5` | yes | transitively, via the research branch and via `8a32` |
| `cursor/w1-technical-design-docs-8a32` | `4c73e5e` | yes | merged by P1 |
| `cursor/w1-product-ia-9cd1` | `bcfa5ee` | yes | P1's base |
| **`cursor/w1-research-official-bb4f`** | **`bb12f0d`** | **yes — merged by this slot** | the subject of this handoff |
| `cursor/w1-repo-skeleton-e7c9` | `abfc664` | **no — deliberately excluded** | see §7 |

Verified mechanically with `git merge-base --is-ancestor origin/cursor/<branch> HEAD` for each row. Every Wave 1
**documentation** branch is now an ancestor of `cursor/w2-work-b-1a8e`; this branch is the first place in the
repository where all eleven coexist.

### 2.1 Research handoff incorporated

`docs/handoff/w1-research.md` arrived with the merge and is complete. Its §2 declares five deliverables and all
five are present at the declared paths, with the declared content:

| Declared | Present | Lines |
|---|---|---|
| `docs/research/one-page-feishu.md` | yes | 697 |
| `docs/research/tiktok-minis-official.md` | yes | 610 |
| `docs/research/sources.md` | yes | 146 |
| `docs/research/gaps.md` | yes | 208 |
| `docs/handoff/w1-research.md` | yes | 244 |

Its §10 self-verification claim — five files added, zero modified, zero deleted — was re-derived against this
branch rather than trusted, and holds. All twenty `docs/**` paths cited across the research set resolve to files
that exist here. **No `docs/research` file was missing, and none needed to be written or amended by this slot**,
which is why this handoff is the only file it authored.

One defect, cosmetic and recorded so nobody hunts for it: `docs/research/gaps.md` numbers its gaps `G-R1`…`G-R13`
and `G-R15`…`G-R20`. **`G-R14` does not exist** anywhere in the repository. The sequence has a hole, not a missing
gap. Registered below as `W2B-D1`.

---

## 3. The headline: the One Page was retrieved in full

This is the single fact that reorders standing work, so it goes first.

The W1 product-IA slot retrieved the One Page **anonymously over plain HTTP** and got §1 through §2.5. It
concluded — reasonably, on that evidence — that "the remainder is paginated and only served to authenticated
Feishu sessions" (`docs/product/compliance-tiktok-minis.md` §2). The W2 P1 slot re-checked with the same method,
got `HTTP 302` to `login.feishu.cn` with a zero-byte body, and recorded the boundary as an access-control
boundary that "no amount of further scraping work will close"
(`docs/plan/w1-conflict-register.md` §8.1, and `VF-9` in its §4).

**That diagnosis was wrong, and the research slot demonstrated it by retrieving the whole document.** The obstacle
was never authentication for the *body* — it was that Lark renders the document into a **virtualised DOM**, so any
single fetch or snapshot returns only the first screen. Driving a headless Chromium through the full ~100,000 px
scroll height and harvesting `[data-block-id]` nodes as they entered the DOM produced 2,640 blocks, reducing to
**365 distinct content blocks (~103 KB)**, with continuous section numbering §1–§7 in **both** the Chinese and
English versions. The method is written up reproducibly in `docs/research/sources.md` §5.

Consequences, in descending order of how much work they change:

1. **Blocker `GATE-0` / B-1 is closed, not narrowed.** Every wording in the repository that says otherwise is now
   stale — see §5.
2. **All six of `docs/product/compliance-tiktok-minis.md` §9's open questions are answered** — see §6. Two of them
   were named in `docs/handoff/w2-plan-p1.md` §6 as biting in W2.
3. **The request package in `docs/plan/w1-conflict-register.md` §8.4 is largely satisfied.** What remains worth
   asking for is much smaller: the images (12 screenshots, 14 whiteboards, 4 attachments), which the capture could
   not preserve, and the 23 referenced Lark sub-documents, which are separate documents.
4. **One new contradiction appeared that could not have been seen before** — the media-asset pilot notice, §4.2
   below. It is the most consequential single finding in the merge.

What is still genuinely unavailable: the images. The **Google Play platform fee** in §6.1.1 exists only as a
figure and was lost, as were the Dev Portal walkthrough screenshots. And the page header read "Modified Today",
so this is a same-day snapshot of a living document — the dated notices in §2.3.2, §2.4 and §3 should be
re-checked rather than assumed stable.

---

## 4. Absorbed versus already present

The comparison the brief asks for: the research set against `docs/product/compliance-tiktok-minis.md`, the W1
product-IA slot's One Page extract.

### 4.1 Already present — all sixteen `ONE-*` facts confirmed from the full capture

`docs/product/compliance-tiktok-minis.md` §4 lists sixteen facts as new-to-the-repository. **All sixteen survive
the full capture.** None is contradicted. The product-IA extract of §1–§2.5 was accurate, and the value the
research adds to this half of the document is depth, not correction.

| # | Fact | Disposition against the full capture |
|---|---|---|
| ONE-1 | EIS required for IAA/IAP launches in Europe and the US after 2026-08-08 | **Confirmed and extended.** The full §2.3.2 adds the duration — **15–30 US business days** after submission — plus a seven-step process, a **TPRM questionnaire** for IAA Minis, a separate **USDS TPRM review** for US launch, mandatory **sensitive-data selection** from the same date, and the warning that an IAA Minis indicating any restricted region **cannot enable monetization after US launch** |
| ONE-2 | EIS scope covers every third party and all shared information | Confirmed verbatim |
| ONE-3 | Contact the account manager and pre-fill the questionnaire before submitting | Confirmed verbatim |
| ONE-4 | Contract signing is an online Portal flow tied to enabling IAP | **Confirmed and extended.** FAQ §7 adds that multiple Minis under one organisation **each require contract coverage**; an existing contract that does not cover a new Minis means signing a new one |
| ONE-5 | IAA is self-service in the Portal from 2026-07-09 | Confirmed verbatim |
| ONE-6 | Entity verification typically completes within three working days | **Confirmed and extended.** The full §2.3.1 specifies the three document classes field by field — the incorporation certificate's required contents, merging multiple documents into one PDF, worked examples for Hong Kong (NNC1 under one year, NAR1 otherwise) and Singapore (ACRA licence plus Bizfile), front-and-back ID merged into one PDF, and the representative-authorisation letter marked "Not Recommended" as a last resort |
| ONE-7 | Merchant qualification becomes mandatory for publishing and monetization | Confirmed verbatim |
| ONE-8 | Organization name and app name cannot be changed after creation | Confirmed verbatim |
| ONE-9 | App type must be `Minis Drama` at creation | Confirmed verbatim |
| ONE-10 | Test accounts: one US and one JP, SIM removed and system language set | **Confirmed and explained.** The recommendation was not arbitrary: §2.7.1 requires the real-device preview account's region to be **US, Japan or Indonesia**, and the payment FAQ says a device or store region of **CN or HK** has no products configured and breaks IAP |
| ONE-11 | USDS restricted-country list disqualifies US listing; otherwise data types versus demonstrated security capability, evidenced by a penetration test report | Confirmed verbatim |
| ONE-12 | The US data-access compliance document is NDA-gated to Org Admin and Owner | Confirmed verbatim |
| ONE-13 | Vietnam requires a game licence to publish Minis | **Confirmed but complicated.** It appears in the **English** §2.5.1 release-region block as a **G1 online game licence**; the **Chinese** version of the same section does not mention Vietnam at all. See §4.3 |
| ONE-14 | Representative-work mismatch resolved with a group document or authorization PDF, with a sample template | **Confirmed and extended.** The submission also requires a **company introduction** (establishment date, core business scope, team composition, website), names the acceptable work-link platforms (Google Play, App Store, WeChat Mini App, Douyin Mini App), asks for a **TikTok account manager email** if one has been engaged, and identifies the template as `行业准入审核授权书参考模板.pdf` |
| ONE-15 | Icon clarity and brand-confusion criteria; per-field review and multi-language attributes | **Confirmed and completed.** Product-IA's Appendix A stops mid-table at the `应用名称` row. The remaining rows are now available — see §4.2 group A |
| ONE-16 | Entity verification exists partly to prevent bulk grey-market publishing and API abuse | Confirmed verbatim |

The twelve runtime obligations `RC-1`…`RC-12` in that document's §5 are also all confirmed, and `RC-12` gains a
detail: **production publish is only available at first launch**, after which the one production plus one canary
rule governs and the canary's traffic allocation adjusts the production share automatically. `RC-1`, `RC-2` and
`RC-3` are the exception and are qualified by §4.2 finding F-2 below.

### 4.2 Absorbed — what the full capture adds

Everything below was unreachable to the product-IA slot. Grouped by One Page section, with the research file that
carries it.

**Group A — the rest of §2, which product-IA's Appendix A stops inside.**

| § | Absorbed | Why it matters here |
|---|---|---|
| 2.5.1 | The remaining basic-information field rows: **App Name ≤ 50 characters** with the imitation rules (`TikTok`, `Tik Tok`, `T1kTok` and Tik/Tok character combinations given as prohibited examples); **Description ≤ 500 characters**; Terms and Privacy as **two separate documents** whose service entity must match the verified entity and whose **governing law must have a reasonable and substantial connection** to the user base, operating entity or place of performance, plus the hosting **website domain**; **Release Regions**; a **Copyright Content Self-Inspection Form**; **Developer Information** — an **Apple Team ID**, required for iOS users to access the Minis at all, and a support **email verified with two-factor authentication** used for user appeals | Completes `ONE-15`. The Apple Team ID and the 2FA support mailbox are launch dependencies with named owners that appeared in no repository document; the two-separate-documents and governing-law rules are rejection causes against `RC-10` |
| 2.5.2 | **Basic library version.** The configured minimum maps **one-to-one to the user's TikTok client version**, and when the client is below it **the platform itself prompts the user to upgrade** — the developer does not build that prompt. Unset means the platform default | Closes `U-20`'s mechanism. It removes an assumed piece of client work, and it is the mechanism half of `IAG-11`'s below-minimum-client copy |
| 2.5.3 | **Localization** of basic information is matched against the **user's TikTok app language**, per-language with an online/offline status, falling back to the default version. Explicitly scoped to the TikTok client shell only — in-app localization is ours | Separates two things the repository treated as one |
| 2.6 | **SKU self-submission since 2026-05-12** (Portal → Monetization → SKU; CSV up to 1,000 rows or 10 manual entries; **two-week review**; a **Tier ID per billing-cycle type**); billing cycles **Weekly, Monthly, Quarterly, Half-yearly, Yearly**; prices are **platform-fee-inclusive, US-base, tax-exclusive**, configured for all supported countries with no per-region setup; **max 400 USD per SKU, 350 USD in South Korea**. Plus the **IAA content and placement policy** and the **IAA client version floor** — both called out separately below | The commercial half of `CTR-002`/`CTR-003` |
| 2.7 | **Testing and release**: test users must be added before preview; QR preview from the code-version card; the real-device precondition that the **account region is US, Japan or Indonesia**; a triage list ending in "raise an oncall with the `client_key` and the error code"; review is **security plus non-security**, **1–3 working days**, across four named dimensions including **no forced purchases and no forced ad viewing** and **complaint and report entries must use official TikTok channels**; **one production plus one canary**, production publish **only at first launch** | The four review dimensions are acceptance criteria in all but name. The forced-purchase and forced-ad rule and the official-report-channel rule bear directly on the unlock panel and on `IAG-14`'s report desk |
| 3 | **The media-asset pilot notice** — the most consequential finding in the merge. See below |
| 4 | **Traffic entries**: advertising requires **BC asset registration** and **ADV ID whitelisting**, with high/medium/low **recharge panels** marked *Required to Connect* and **middle-funnel event postback** marked *Required*; **profile/sidebar and search-card entries need no configuration and take effect roughly two weeks after launch**; the **feed shaped card** is in internal testing and goes **straight to the episode playback page**. **Minis ID = Client Key**, production environment. Episode landing URLs come from the in-app ⋯ panel's **Copy Link**, with a **Generate Minis Link Open API** for batch creation | The deep-link mechanism is now known, which is what `U-13` was about. The two zero-configuration entries mean discovery traffic exists without work, on a two-week lag |
| 5 | **Data analysis**: Portal paths for user, IAP and IAA data; **roughly two days of data delay**; the Dev Portal shows **T+1 post-risk-control** figures while TTAM shows real-time, **actual settlement follows the Open Platform**, and the gap is **typically 1%–3%** | Answers §9 question 4. Direct input to `IA-002`'s operations console |
| 6 | **The full settlement model**: offline bills generated in month N+2 and paid within 45 days; the settlement formula; **online settlement cycles** (IAA **T+5 biweekly**; IAP **T+5 monthly** from September; funds **within 15 days of invoice confirmation**); three regional invoicing entities with names, countries, tax IDs and addresses, always in **USD**, one invoice per region; advance settlement at a fixed rate; **exactly one appeal per unpaid record**; the five statement statuses and the invoice requirements (**PDF < 10 MB**) | Closes `U-22`, which the design set had recorded as having "no technical landing point". It has one now — see §7 |
| 7 | **Five FAQ sections, 24 questions**: access process, basic development, authorization and login (8), payment and settlement (10), ad placement (4) | The densest source of design input in the whole document. Several items below come from here |
| 13 | **Six substantive divergences between the Chinese and English versions** of the same page | See §4.3 |
| 15 | An inventory of what the capture could **not** recover | So nobody assumes the extract is exhaustive |

**Group B — the second and third research files, which have no counterpart in the product-IA extract at all.**

- `docs/research/tiktok-minis-official.md` (610 lines) is a primary-source pass over fourteen public developer
  pages: the two SDK namespaces and toolchains, identity, VePlayer and preload, media assets and playability,
  monetization including the **webhook signature algorithm**, build/config/release, **four places the official
  documentation contradicts itself**, and — the deliverable the slot was set — **§9, the disposition of the
  `U-01`…`U-22` register** from `docs/design/minis-integration.md` §2.2.
- `docs/research/sources.md` grades every source A/B/C and catalogues the **23 Lark documents the One Page
  references but which were not retrieved**, with an ID each, so the next capture pass can be prioritised rather
  than rediscovered.
- `docs/research/gaps.md` lists **only what is still open** — four decision-level gaps, nine API-surface gaps, six
  business items — and closes with a "do not re-open" table.

**The `U-01`…`U-22` disposition, which is the part slot A and the design set will want:** seven items moved to
verified (`U-07`, `U-10`, `U-15`, `U-18`, `U-20`, `U-21`, `U-22`); two resolved in mechanism with only values
outstanding (`U-09`, `U-11`); five narrowed; four unchanged; four re-confirmed. **No previously non-blocking item
became blocking, and one previously-blocking item became unblocked.** Note the standing caveat the research
records: this disposition is a **commentary on** the register in `docs/design/minis-integration.md` §2.2, not an
edit to it. Carrying the resolved values into that file is still owed, and it belongs to slot A.

**The findings with the largest effect on work already queued.** The research slot's own full list is `F-1`…`F-10`
in `docs/research/one-page-feishu.md` §14, with `F-2` and `F-3` singled out in `docs/handoff/w1-research.md` §4 as
needing a decision rather than an implementation, and `F-4`…`F-7` in its §5 as changing work rather than
confirming it. `F-3` is the EIS gate, already covered as `ONE-1` in §4.1 above. The rest:

| # | Finding | Owner |
|---|---|---|
| **F-2** | **The BytePlus + VePlayer media plane is a pilot.** §3 carries a notice dated 2026-06-25: pilot access "will begin in July" and **"developers who are not included in the pilot can continue to use their own solutions"**, with the switchover date to be announced and "sufficient switching time" reserved. The Chinese version is more conservative still — 尚未开放统一接入, phase-one invited testing already closed. Corrections A1–A3 read the public player doc's present tense as the current state; it may be the destination | W2 architecture + business. Gap **G-R1** |
| **F-4** | **IAA placement policy is a review criterion.** Rewarded ads are permitted in exactly two places: after an episode finishes and before the next starts, and when the user **manually** skips, for example by dragging the progress bar. Prohibited: auto-triggered rewarded ads on auto-play or auto-next, and rewarded ads appearing mid-episode on a progress-bar drag. Interstitials must never show on open and must observe a cooldown | Product and design. Constrains journey J5 and panel PNL-02 |
| **F-5** | **IAA requires TikTok ≥ 44.2.0**, and TikTok Pro Android does not support drama IAA at all. Paid traffic is already capped at 44.2.0+ by the ads product, but **organic traffic below that is ours to detect and prompt** | Design. Note this appears **only in the Chinese** §2.6 |
| **F-6** | **`login` has no frequency control**, and calling it on entry and again before ordering is the platform's own recommendation. It is also the **only** way to detect an account switch: TikTok clears the `tiktok.com` cookie on switch, but state held in web storage is undetectable. Our session design keeps nothing durable in web storage, so the pattern is both available and necessary | Design. Bears on `CTR-001` |
| **F-7** | **Beans economics.** TikTok reports **100 Beans = 1 USD** to the stores; the user pays roughly **1.5 USD** after tax and channel fees. Recharge **rounds up to the nearest tier**, so residual balance stays on the TikTok account — and **developer revenue counts Beans consumed, not Beans recharged**. Own-UI prices should display in **USD**, because the TikTok account region and the store region can differ and change | Architecture and design. Bears on `CTR-002` |

**Two operational facts from the public-documentation pass** that are in neither the product-IA extract nor any
Wave 1 document:

- **Moderation has two lanes and the repository documents only the fast one.** Normal content moderation takes
  **two weeks**; the urgent lane takes **1–3 working days** and is capped at **35 shows per organisation per day**.
  `docs/architecture/system-overview.md` §6.1 labels the pipeline "1–3 working days", and
  `docs/product/compliance-tiktok-minis.md` §8's critical path inherits the same figure for the content pipeline.
  Both are quoting the urgent lane as if it were the default. Catalogue build-out should be planned against two
  weeks. Registered below as `W2B-D2`.
- **One rejected episode dark-screens the whole drama.** Playability is a property of the `(album_id, version)`
  pair, not of the episode: "as long as any drama shell element or any episode within a drama version fails
  moderation, all episodes under that version cannot be played." A kill switch or drift reconciler that greys out
  one cell in the episode grid is the wrong shape.

And a production-outage risk with no owner: the BytePlus `AccessKeyID` / `SecretAccessKey` bound on the Dev Portal
are a single point of failure — if they rotate without the Portal being updated, **every video-related open API
call becomes invalid and playback stops**. Key rotation needs a runbook.

### 4.3 Absorbed — contradictions that only a full capture could reveal

`docs/product/compliance-tiktok-minis.md` §6 closes by saying no conflict was found between the One Page and
architecture corrections A1–A6, while noting honestly that "the One Page sections that would cover them were not
retrievable, so this is an absence of contradiction rather than a confirmation." **That caveat has now been
discharged, and it resolves negatively**: §3 does contradict them, via the pilot notice (F-2 / `G-R1`).

The other five, from `docs/research/one-page-feishu.md` §13, are all **internal** to the One Page — the same
document saying two things, which is a class of problem no partial capture can detect:

| # | Divergence | Effect |
|---|---|---|
| 13.1 | **Release regions.** English: Brazil, Indonesia, Japan, Malaysia, Philippines, Saudi Arabia, Thailand, Turkey, with Vietnam needing a G1 licence. Chinese: Brazil, Indonesia, Japan, Thailand, South Korea, Australia, New Zealand, Canada, Mexico, with Vietnam unmentioned. **Only four countries appear in both** | Decides default currency presentation, locale set, whether **RTL is in scope at all** (Saudi Arabia is English-list-only), and whether Vietnam legal work exists. `docs/architecture/system-overview.md` §10 follows the English list and commits to logical CSS properties on the strength of Saudi Arabia. **Read the Portal's region picker, not either version of the page.** Gap `G-R2` |
| 13.2 | **The IAA `≥ 44.2.0` floor and the `canIUse` instruction appear only in the Chinese §2.6.** The English §2.6 stops after the four content rules | The requirement is real — independently confirmed in the public rewarded-ads doc — so the English One Page is simply incomplete. Anyone reading only the English version would miss a hard version floor |
| 13.3 | **Media-asset pilot wording differs between versions** on the same 2026-06-25 date: English reads "the pilot is starting", Chinese reads "phase one is closed, unified access has not opened" | Feeds `G-R1` |
| 13.4 | **The Apple platform fee is stated twice, differently, in the same document** — 30% in §2.6's SKU pricing, **15%** in §6.1.1's settlement formula. The Google Play figure exists only as an image and was lost | A factor-of-two error in any margin model. The 15% figure is the one inside the settlement formula, so it is the one with money attached, but a self-contradicting document is not a basis for a pricing decision. The contract governs. Gap `G-R3` |
| 13.6 | The Chinese §2.5.1 table carries a trailing **信息修改** row with no English counterpart | Low impact; noted for completeness |

Plus one field-level discovery: §6.1.1 instructs developers to monitor **`pay_type`** in webhooks to identify the
payment channel, because the US supports web pay. **`pay_type` appears in no public webhook reference**, whose
`content` examples show only `trade_order_id`, `order_id`, `is_sandbox` and `refund_amount`. The field list is
documented-but-not-exhaustive, and capturing `pay_type` is a settlement-reconciliation requirement rather than an
optional extra, because web-pay orders carry a different channel fee. Gap `G-R4`.

### 4.4 Summary of the comparison

| Measure | Count |
|---|---|
| `ONE-*` facts in the product-IA extract | 16 |
| …confirmed by the full capture | **16** |
| …contradicted | **0** |
| …materially extended by the full capture | 6 (`ONE-1`, `ONE-4`, `ONE-6`, `ONE-10`, `ONE-13`, `ONE-14`) |
| One Page sections product-IA could not reach, now absorbed | §2.5.1 (partial) and §2.5.2 through §7 — **the majority of the document** |
| CN/EN and internal divergences newly visible | 6 |
| `U-01`…`U-22` items moved to verified | 7 |
| Blockers closed | 2 (**B-1** the One Page, **B-2** the webhook signature algorithm) |
| Repository documents rewritten to absorb any of this | **0** |

The honest one-line version: **the product-IA slot got the onboarding half right, and the research slot got the
other three-quarters of the document plus the parts where it disagrees with itself.**

---

## 5. Standing repository statements this merge makes stale

Registered, **not patched** — every one of these files belongs to another slot. Each row names the owner.

| # | Statement | Where | Why it is now wrong | Owner |
|---|---|---|---|---|
| `W2B-S1` | "Coverage **not** obtained: everything after the basic-information field table. The remainder is paginated and only served to authenticated Feishu sessions" | `docs/product/compliance-tiktok-minis.md` §2 | The remainder was obtained without authentication. The obstacle was a virtualised DOM, not an access-control boundary | P2 / product |
| `W2B-S2` | The "**Proposed B-1 replacement text**" — "Sections after 2.5 are behind Feishu authentication and remain unread. Obtain an authenticated copy, then diff…" | `docs/product/compliance-tiktok-minis.md` §2 | Moot. B-1 is closed outright; there is nothing left to obtain except images and the 23 sub-documents | P2 / product, then architecture |
| `W2B-S3` | "**No conflict was found** between the One Page and the VePlayer/BytePlus architecture corrections A1–A6… an absence of contradiction rather than a confirmation" | `docs/product/compliance-tiktok-minis.md` §6 | The caveat is discharged and it resolves the other way: §3's pilot notice **does** conflict (F-2 / `G-R1`) | P2 / product, escalate to architecture |
| `W2B-S4` | The six open questions of §9, and "the retrieved portion stops at basic information" | `docs/product/compliance-tiktok-minis.md` §9 | All six answered — §6 below | P2 / product |
| `W2B-S5` | `VF-9` "The One Page is still only half retrievable — **Confirmed**" | `docs/plan/w1-conflict-register.md` §4 | The verification was sound for the method used and wrong about the cause. It should be re-recorded as superseded rather than deleted, with the method difference stated, because that is the transferable lesson | P1 |
| `W2B-S6` | §8.1's "This is an access-control boundary, not a retrieval bug, so **no amount of further scraping work will close it**" | `docs/plan/w1-conflict-register.md` §8.1 | Directly falsified. Further retrieval work closed it | P1 |
| `W2B-S7` | §8.2 "the source is located, **roughly half** of it is transcribed… the replacement wording proposed in `compliance-tiktok-minis.md` §2 should be applied by P3 as part of `GOV-005`" | `docs/plan/w1-conflict-register.md` §8.2 | The whole text is transcribed. `GOV-005` should apply a **closure**, not the narrowing | P1, carried by P3 in `GOV-005` |
| `W2B-S8` | §8.3's six questions and §8.4's request package | `docs/plan/w1-conflict-register.md` §8.3, §8.4 | Answered. The residual ask shrinks to the images and the three high-value Lark sub-documents (`S-OP-1`, `S-OP-11`, `S-OP-14`) | P1, carried by `GOV-002` |
| `W2B-S9` | `GATE-0` "blocked", and the §6 blocker row "The One Page is readable only to §2.5 anonymously. Re-verified 2026-08-27: `HTTP 302`… zero bytes of document body" | `docs/plan/w1-conflict-register.md` §6, §9; `docs/handoff/w2-plan-p1.md` §6, §9 check 7 | The gate's subject no longer exists. Both W2 questions P1 flagged as biting in this wave — the VePlayer constraint for `PLY-020`, and the media-asset workflow for `CTR-011` — now have answers | P3 in `GOV-005`; P1 for the handoff record |
| `W2B-S10` | "The brief named a research slot and a skeleton slot as possibly still in flight. **Neither exists on the remote**" | `docs/handoff/w2-plan-p1.md` §1 | True when written; both exist now. P1's own instruction covers the case — "if they appear, their findings enter through the same conflict register" — and this handoff is that entry for the research slot | P1 |
| `W2B-D1` | `docs/research/gaps.md` numbers gaps `G-R1`…`G-R13`, `G-R15`…`G-R20`; **`G-R14` is undefined** | `docs/research/gaps.md` | A hole in the sequence, not a lost gap. Verified: no occurrence of `G-R14` anywhere in `docs/` | Whoever folds `G-R*` into the conflict register |
| `W2B-D2` | The content-moderation pipeline is labelled "1–3 working days" | `docs/architecture/system-overview.md` §6.1; `docs/product/compliance-tiktok-minis.md` §8 | That is the **urgent** lane, which is capped at 35 shows per organisation per day. **Normal moderation takes two weeks.** Both documents quote the exception as the rule | Architecture; P2 for the product copy |

`W2B-S5`, `W2B-S6` and `W2B-S9` deserve a note rather than a silent correction. P1 did the right thing —
it re-verified rather than inheriting the claim, and recorded the method and the result. The failure was that both
slots used the same retrieval method and so reproduced the same false negative, and P1's phrasing then hardened a
method-specific result into a general one. The lesson worth carrying into `VER-001` is that **a re-check with the
same method is a repetition, not an independent verification**.

---

## 6. The six open questions of `compliance-tiktok-minis.md` §9, answered

`docs/plan/w1-conflict-register.md` §8.3 attached a Wave 2 consequence to each. All six now have answers, though
two answer negatively and one makes its problem worse.

| # | Question | Answer from the full capture | Consequence |
|---|---|---|---|
| 1 | Does the One Page prescribe a media-asset upload workflow different from the public `/v2/sg/shortdrama/*` docs? | **No — it defers.** §3.1 and §3.2 are link-only, pointing at `S-OP-1`, `S-OP-2` and `S-OP-3`, none of which is in the repository. But §3 carries something more important: the **pilot notice** | `CTR-011` may continue to be written from public documentation without fear of a contradicting private workflow — but it should not over-commit while `G-R1` is open |
| 2 | Does it constrain VePlayer beyond the public player docs — the `play_auth_token` cutoff at 44.5.0, or required configuration? | **No.** The One Page adds no player configuration constraint. The 44.5.0 `play_auth_token` boundary comes from the public player doc, not from here | **This is what P1 named as the last unknown constraint on `PLY-020`, and it is now closed.** `PLY-020` can proceed on the public surface. The pilot question is about *whether* VePlayer is the launch plane, not about *how* it behaves |
| 3 | What does it say about IAA/IAP mechanics, tier configuration and settlement beyond enablement? | **A great deal** — the whole of §2.6's SKU model and §6's settlement model, plus fourteen FAQ answers on payment and ad placement | The largest single input to `CTR-002`, `CTR-003` and `CTR-004`. See §7 |
| 4 | Are there dashboards or data reports operations is expected to use, and do they impose data obligations? | **Yes**, §5. Three Portal datasets, roughly two days of delay, T+1 post-risk-control versus TTAM real-time, actual settlement following the Open Platform with a typical 1%–3% gap. No new data obligation on us is stated | Input to `IA-002`'s operations console IA and to the settlement-reconciliation work in §7 |
| 5 | Does it name the required points of contact and escalation paths? | **Partly.** The support portal is the documented route, escalating from the AI bot to a human ticket; the on-call route requires the `client_key` and the error code; the industry-qualification form asks for an account manager email if one exists. **No named contact is given** | `GATE-6` can be specified as a process. Whether an account manager relationship exists at all is gap `G-R20` and is unknown to both slots |
| 6 | Does it state region availability in a way that resolves risk P-7? | **No — it makes it worse.** The Chinese and English versions give different lists that overlap in only four countries | Blocker B-4 cannot be settled from this document. **Read the Dev Portal's region picker.** Gap `G-R2`. This decides whether `GATE-5` and `GATE-7` apply at all |

---

## 7. What this changes for slot B's own Wave 2 queue

`docs/handoff/w2-plan-p1.md` §7 assigns slot B eight adjudications in W2 — `CTR-009` first, then `CTR-001`
through `CTR-006` and `CTR-010` — plus `CTR-011`, `CTR-012` and `CTR-013`. **None of them is invalidated by the
research and none is blocked by it.** P1's claim that the eight adjudications "require no new research" survives.
What changes is that several of them now have primary-source backing where they previously had inference, and two
acquire a concrete new obligation.

**No adjudication was performed by this slot.** The rows below are inputs for whoever runs them.

| Task | Research input | Effect |
|---|---|---|
| `CTR-009` playback descriptor | The descriptor shape survives `G-R1` in either direction — the research handoff says so explicitly: "the playback API already returns a descriptor rather than a URL, so nothing needs to be undone. What changes is the plan, not the interfaces." `U-20` confirms `playAuthToken` is needed **below TikTok 44.5.0** | **Unblocked and independently justified.** Proceed as queued |
| `CTR-002` Beans channel | The whole of `U-09`: tiers come from Portal SKU sets, two-week review, Tier ID per billing cycle, **max 400 USD per SKU / 350 USD South Korea**, reference tier `1732621527608100` = 100 Beans, `get_tier_infos` returns `price`/`currency`/`symbol` **for the user's TikTok account country**. `U-10`: `token_amount` is an integer throughout, and recharge **rounds up** | `AC-MON-8`'s "never locally converted" is now the platform's own position. **Add the residual-balance consequence:** revenue counts Beans consumed, not recharged, so the wallet must reconcile against consumption |
| `CTR-003` minor units and currency | FAQ Q10: the subscription product list and its prices are **ours**, and because the TikTok account region and the store region can differ and change, **display in USD**. The payment popup is TikTok's, priced by TikTok account region, worded in the user's TikTok app language. TikTok.com web payment is **US-only** | Settles the display-currency question the contract left open |
| `CTR-004` ad-unlock and subscription | **`U-18` closes negatively: no server-side ad-reward verification callback exists.** The platform's own recommendation for strict risk control is exactly backend reward logging. Separately, **F-4** constrains *when* a rewarded ad may be offered at all. On the subscription half, **`G-R6`**: no subscription lifecycle events are published anywhere and no public `/v2/minis/subscription/*` reference page exists, while billing cycles are Weekly / Monthly / Quarterly / Half-yearly / Yearly, each carrying its own Tier ID | **This confirms P1's decision** to adopt `AC-MON-6`'s server-side grant with quotas and an audit record over D-AC-4's weaker position — it is now the only correct design, not merely the stricter one. **New input:** the endpoint's session nonce should be issuable only from the two permitted placements, so the contract cannot express a prohibited one. The subscription entity's **periodic full sync as the primary path** (MI-4, IAG-4) is likewise confirmed as the only workable design; the event-to-status map stays empty |
| `CTR-005` Minis-side token posture | `U-03` and `U-04`: the code-for-token exchange is **server-side only** — a frontend OpenAPI call fails on CORS. The access token **expires**, and on any 401 the server must tell the client to re-run the flow. **Manually cancelling authorization invalidates every permission including silent login**, so a 401 is also how account revocation presents. `open_id` relates only to the client key and is region-independent | The security posture in `docs/14-security.md` §3.2 is now the platform's documented model rather than our inference. **F-6** adds that `login` has no frequency control, so re-running it is cheap |
| `CTR-006` search endpoint | The One Page constrains our search endpoint in no way. Its §4.3 **Minis search card** is a separate platform-side discovery surface that needs no configuration and takes effect roughly two weeks after launch | Proceed as queued. Worth one line in the contract so the two searches are not later confused |
| `CTR-010` blocked playback | **Playability is per `(album_id, version)`, not per episode.** One failing episode or shell element blocks every episode in the version | The `BLOCKED` outcome must be expressible at **version** granularity. An error payload carrying only `episodeId` cannot describe the actual failure mode |
| `CTR-011` media-ops surface | §9 question 1 answered — no private workflow to contradict it. The public media-asset pass adds the **two-tier moderation SLA** and the **35-per-org-per-day urgent quota** (which `AC-OPS-3` already wants readable), **BytePlus AK/SK binding rules**, one-space-per-drama, many-to-many app↔account, and a 20 GB ingest limit | Proceed. `G-R1` argues for specifying the surface without committing the schedule to it |
| `CTR-012` contract and error deltas | **`pay_type` must be added to the parsed webhook projection** (`G-R4`) — settlement reconciliation needs it because web-pay orders carry a different channel fee (Beans 25% versus Apple 15%). **`is_sandbox` must be excluded from revenue.** `U-21` confirms placements are Portal-created and **inactive by default**, with Placement ID as `adUnitId` | The raw-payload-first design already survives the unknown field; this makes the projection explicit. MI-2's `/config` ad unit IDs are now justified by a documented failure mode, not just prudence |
| `CTR-013` domain-model deltas | `U-22` is no longer "no technical landing point". Three-entity regional invoicing in USD, one appeal per unpaid record, five statement statuses | Creates concrete work: a **per-region revenue report that reconciles against the platform statement**, with `is_sandbox` excluded and `pay_type` captured. This has no carrier task today |

**One new obligation with no carrier**, raised for P1 and P3 rather than taken by this slot: the settlement model
implies a per-region revenue report reconcilable against the platform statement, and nothing in the 142-task
backlog or the 24-task W2 queue owns it. It is not W2 work — it needs `CTR-011` and the media-ops surface first —
but it should be registered before it loses its carrier the way corrections A1–A6 did.

**Two items for other slots that this slot is not touching**, restated so they are not lost between handoffs:

- **Slot A** owes the carry-through of `U-01`…`U-22` into `docs/design/minis-integration.md` §2.2. The research
  set is a commentary on that register, not an edit to it, and `PLY-020` is the natural place to do it.
- **Product and P2** own **F-4**. The rewarded-ad placement rules are review criteria, and journey J5 and panel
  PNL-02 currently assume a free-form "watch an ad to unlock" button that fits neither permitted slot.
  Discovering that at submission time would be expensive.

---

## 8. Explicitly not done

- **No `docs/research` file was written or amended.** The brief said to deliver research updates *only if
  missing*; nothing was missing. All five declared deliverables are present, complete and internally consistent,
  and all twenty of their `docs/**` cross-references resolve. Writing over another slot's complete work to leave a
  fingerprint would be the wrong trade.
- **No architecture, product, design or plan file was modified.** `docs/architecture/*`, `docs/product/*`,
  `docs/design/*`, `docs/plan/*`, `docs/0*`, `docs/1*` are byte-identical to `cursor/w2-plan-p1-0453`. The twelve
  stale statements in §5 are registered with an owner each, per the one-file-one-owner rule. Verifiable with the
  `git diff --name-only` command in §1.
- **No repository skeleton merged.** `cursor/w1-repo-skeleton-e7c9` (`abfc664`) exists on the remote and carries
  81 files of application scaffold — pnpm workspace root, `app/`, `server/`, `packages/`, `contracts/` and a CI
  workflow. The brief excludes it and that slot is still running. It also interacts with `INF-009`, which has not
  yet frozen the repository layout or the backend module map, and with `INF-001`, which is slot A's task. Merging
  it here would pre-empt both. **Recommendation:** it should be integrated after `INF-009` lands, by slot A, and
  its tree checked item by item against the frozen fourteen-module map rather than adopted as-is.
- **No adjudication performed.** `CTR-001`…`CTR-013` are untouched. §7 is input, not output.
- **No application code, no CI, no pull request, no merge to `main`.**
- **No identifier renames.** `N-1`…`N-7` remain P1's `GOV-006` pass. Note that the research introduces a `G-R*`
  namespace and reuses `F-n` for findings, neither of which was in the seven registered collisions — worth
  checking in that pass.
- **No attempt to authenticate to Feishu, and no re-capture attempted.** The research slot's extract is taken as
  given; its method was read and recorded, not re-run.
- **No calendar estimates.**

---

## 9. Verification performed on this slot's own output

| # | Check | Method | Result |
|---|---|---|---|
| 1 | The merge is additive only | `git diff --name-status` between base and head | Pass — five `A` rows, zero `M`, zero `D` |
| 2 | No architecture, product, design or plan file changed | `git diff --name-only … -- docs/architecture docs/product docs/design docs/plan` | Pass — empty |
| 3 | The research branch is the one the idle W1 research agent pushed | Agent id `bc-1806f510-…-637112abbb4f` ends `bb4f`; branch `cursor/w1-research-official-bb4f` | Pass |
| 4 | Every `cursor/w1-*` branch is accounted for | `git ls-remote --heads origin`, then `git merge-base --is-ancestor` for each of the twelve | Pass — eleven ancestors, one deliberate exclusion, documented in §2 |
| 5 | The research handoff's five declared deliverables exist | Path and line-count check against §2 of `docs/handoff/w1-research.md` | Pass |
| 6 | The research set's cross-references resolve | Extracted all `docs/**.md` references from the five files, tested each for existence | Pass — 20 distinct paths, 0 unresolved |
| 7 | The research slot's own no-modification claim | Re-derived on this branch rather than trusted | Pass |
| 8 | All sixteen `ONE-*` facts checked individually against the full capture | Row-by-row read of `compliance-tiktok-minis.md` §4 against `one-page-feishu.md` §3–§12 | Pass — 16 confirmed, 0 contradicted, 6 extended |
| 9 | `G-R` identifiers are contiguous | `rg 'G-R[0-9]+'`, sorted | **Fail** — `G-R14` undefined. Registered as `W2B-D1` |
| 10 | Numeric claims re-derived rather than copied | 365 blocks, ~103 KB, 2,640 raw, 12 images / 14 diagrams / 4 attachments, 23 Lark documents, 7 verified U-items, 22 register rows | Pass — each traced to its source line |
| 11 | Nothing lowers a threshold, removes a test, weakens a gate or adds an exemption | Review of this file's recommendations | Pass. Two entries make requirements **stricter**: `W2B-D2` replaces a 1–3 working day moderation assumption with two weeks, and `CTR-004` gains a placement constraint on nonce issuance. None makes any requirement looser. `GATE-0` is recorded as closed **by evidence**, not waived |

---

## 10. Suggested next work

1. **P3, in `GOV-005`:** close `GATE-0` / B-1 outright rather than applying the narrowing wording that
   `compliance-tiktok-minis.md` §2 proposes. `W2B-S1`, `W2B-S2`, `W2B-S7` and `W2B-S9` are the same edit.
2. **Architecture, and it is the largest blast radius open:** adjudicate **F-2 / `G-R1`** — whether the BytePlus
   plus VePlayer plane is available to us at launch or is a pilot we are not in. The fastest route is a single
   question to the account manager. Nothing needs to be undone either way; what changes is the plan. The One Page
   also offers a step that is useful regardless — pre-register BytePlus account information so the platform can
   assist with preferential pricing, account opening and upload preparation.
3. **Business, and it is the longest lead time in the project:** start the **EIS clock** or decide the US and EU
   are out of scope for v1. **15–30 US business days**, no engineering compression available, and its first input
   — whether the entity, its operating location and its controlling shareholders fall on the restricted-country
   list — is not knowable from any document either slot could read.
4. **Read the Dev Portal's region picker** (`G-R2`) rather than either version of the One Page, and settle the
   launch region list. It decides currency presentation, the locale set, whether RTL is in scope at all, and
   whether `GATE-5` and `GATE-7` exist.
5. **Product, before the unlock panel is built:** take **F-4** to the design of PNL-02 and journey J5.
6. **Slot A:** carry the `U-01`…`U-22` dispositions into `docs/design/minis-integration.md` §2.2 as part of
   `PLY-020`, and close `U-07` by implementing the real webhook verifier behind the existing `SignatureVerifier`
   interface — the algorithm is now known, and the compensating order-query sweeper stays as the safety net.
7. **Whoever runs the next capture pass:** the three high-value Lark sub-documents are `S-OP-1` (media library and
   player — resolves `G-R1`), `S-OP-11` (subscription integration — likely resolves `U-08` / `G-R6`) and
   `S-OP-14` (Generate Minis Link Open API — likely resolves `G-R9` and `G-R10`). The method is in
   `docs/research/sources.md` §5. Note the shelf life: the page header read "Modified Today".
8. **A standing item, addressed to `VER-001`:** two slots reached the same false conclusion about the One Page
   because they used the same retrieval method and treated the repetition as verification. Independent
   verification has to vary the method, not just the operator.
