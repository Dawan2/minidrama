# One Page (Feishu / Lark) — Structured Extract

> **Slot:** Wave 1 · official research (W1 WORK SLOT 1), branch `cursor/w1-research-official-bb4f`.
> **Source:** 小程序短剧接入 One Page // Mini Drama Onboarding One Page —
> <https://bytedance.larkoffice.com/wiki/MJ2BwFqSxi4r2SkwHS8cRrlsnVb>
> **Retrieved:** 2026-08-27. Page header read "Modified Today", so this extract is a same-day snapshot.
> **Status:** research record. This file does **not** supersede or rewrite
> `docs/architecture/*` or `docs/design/*`. Where it contradicts them, the contradiction is registered
> in §12 and in `docs/research/gaps.md`, and the owning slot decides.

---

## 0. How this was obtained, and what that means for trust

The page is a Lark wiki document behind an anonymous-guest session, and it renders through a
virtualised (windowed) DOM: a plain HTTP fetch returns a login redirect, and a single rendered
snapshot returns only the first screen. It was captured by driving a headless Chromium through the
document top-to-bottom, harvesting every `data-block-id` node as it entered the DOM, and
de-duplicating nested blocks. 2,640 blocks were captured across a ~100,000 px document, reducing to
365 distinct content blocks (~103 KB of text) after removing the parent/child duplication that Lark's
DOM produces for tables and lists.

Two consequences that matter for how you read this extract:

- **Images, whiteboards and embedded screenshots did not survive.** The page carries 12 images, 14
  whiteboard/flow diagrams and 4 file attachments (including
  `行业准入审核授权书参考模板.pdf`, 138.67 KB, and `Letter of Authorization.docx`). Where the
  original conveys a step only through a screenshot, this extract records the caption and marks the
  content as visual-only.
- **The page contains two full versions** — 【中文版】 and *[English Version] Drama minis Onboarding
  One Page* — which are **not** exact translations of each other. Sections that differ in substance
  are called out in §13. Where they agree, the English wording is quoted, because that is the wording
  that matches the public developer docs.

The One Page is an onboarding/business document. It is authoritative on **process, commercial terms,
review gates and platform policy**, and it is thin on API surface — for API-level facts, prefer
`docs/research/tiktok-minis-official.md`.

**This resolves blocker B-1** (`docs/architecture/risks.md` §5: "official One Page not available").
The document exists, is readable, and is extracted here.

---

## 1. Document map

| § | Title (EN / CN) | What it settles |
|---|---|---|
| 1 | Introduction / 简介 | What a mini drama is |
| 2 | Short Drama Onboarding / 短剧入驻流程 | The whole onboarding pipeline, §2.1–§2.7 |
| 2.1 | Account Registration / 账号注册 | Org creation, test accounts |
| 2.2 | Create APP / 创建 app | App type `Minis Drama`, immutable name |
| 2.3 | Access Assessment & Compliance Moderation / 准入评估与合规审核 | Entity cert, EIS/USDS/TPRM, industry qualification |
| 2.4 | Contract Signing / 合同签署 | Online contract, IAP/IAA enablement |
| 2.5 | Configure basic information / 配置基本信息 | Portal field specs, library version, localization |
| 2.6 | Development & Debug / 开发调试 | Doc index, SKU submission, IAA policy |
| 2.7 | Testing Acceptance & Release Review / 测试验收与发版审核 | Preview, submission, review rules, rejection reasons |
| 3 | Media Asset Storage & Playback / 短剧媒资存储与播放 | **Pilot status of the BytePlus + VePlayer programme** |
| 4 | Traffic Scenarios and Entries / 流量场景及入口 | Ads, profile/sidebar, search card, feed shaped card |
| 5 | Data Analysis / 数据分析 | Portal analytics, TTAM reconciliation |
| 6 | Settlement Instructions / 结算说明 | Offline and online settlement, invoicing, payouts |
| 7 | Common FAQs / 常见 FAQ | Access, dev, login, payment, ad placement |

---

## 2. What a mini drama is (§1)

> "Short drama Minis, based on TikTok's mobile web technology product framework, supports seamless
> integration of Mini Programs developed by third-party service providers with the TikTok user
> experience, enabling users to smoothly and quickly watch short drama content provided by
> third-party platforms directly within TikTok without the need for downloading and installation."

Consistent with `docs/architecture/system-overview.md` §1. No new constraint.

---

## 3. Onboarding pipeline (§2)

### 3.1 Account and organisation (§2.1)

| Item | Requirement |
|---|---|
| Registration | On the TikTok for Developers site, then **My organizations** |
| Organisation name | Must be the **full legal name of the entity** (e.g. `ByteDance Inc.`) and **cannot be changed after creation** |
| Members | Additional development members can be added to the organisation |
| Test accounts | **One US account and one JP account are recommended** for mini-drama testing |
| Creating test accounts | The page suggests removing the SIM and setting the device system language to the target country (e.g. English (US) for a US account) |

The recommendation of a US **and** a JP account is not decorative: §2.7.1 requires the real-device
preview account's region to be **US, Japan or Indonesia**, and the payment FAQ (§7) says the store
account region must not be CN or HK.

### 3.2 Create the app (§2.2)

| Step | Instruction |
|---|---|
| STEP 1 | Dev Portal → **Create app** |
| STEP 2 | **App type: `Minis Drama`.** App name is the user-visible Minis name and **cannot be modified after creation** — "please confirm carefully" |

Two immutable identifiers are therefore decided before any code is written: **organisation name** and
**app name**. Both should be treated as business sign-offs with no engineering rollback.

### 3.3 Access assessment and compliance moderation (§2.3)

Three independent moderation stages, each answering a different question:

| Stage | Question it answers | Notes |
|---|---|---|
| Enterprise/Individual Identity Verification | "I am who I am" | Prevents impersonation, aligns legal responsibility, prevents account farming |
| USDS Moderation (US only) | "I can obtain US regional data" | Entity from a restricted country ⇒ **cannot list in the US at all**. Otherwise judged on the data types requested (protected or not) and the company's data-security capability, evidenced by a **system penetration test report** |
| Industry business qualification | "I can do this industry" | Media/education/healthcare need operating licences; Vietnam needs a game licence |

#### 3.3.1 Entity certification (§2.3.1)

Reviewed typically **within 3 working days**. Three document classes must be submitted
electronically:

1. **Certificate of Incorporation / business certificate**, issued by the competent government
   agency of the country of registration, containing the full legal business name (local **and**
   English), registration number, address, and legal person's name. Accepted types include
   certificate of incorporation, registration certificate, commercial-registry extract, tax
   registration certificate. **Multiple documents may be merged into one PDF** when no single
   document carries all required fields (worked examples given for Hong Kong — NNC1 for entities
   under one year, NAR1 otherwise — and Singapore — ACRA business licence plus Bizfile).
2. **Government photo ID of the principal or legal representative**, containing issuing
   country/region, full legal name, document number, nationality **or** full address, date of birth,
   and validity period if applicable. Front and back must be merged into one PDF.
3. **Proof of representation** showing the named person is the principal representative. If the
   entity certificate already names the representative, resubmit that; otherwise upload a document
   that shows both representative name and company name; only as a last resort ("Not Recommended❗️")
   submit a representative authorisation letter using the provided `Letter of Authorization.docx`
   template.

The page notes that merchant qualification verification "will be **a mandatory requirement** for
publishing mini-games and short dramas as well as using monetization features."

#### 3.3.2 Compliance review — EIS (§2.3.2), flagged "Very important, complete as soon as possible!"

This is the single largest schedule risk the One Page adds, and it is **not** in the current Wave 1
document set.

| Fact | Detail |
|---|---|
| Gate | External Information Sharing (**EIS**) compliance review |
| Scope | **From 2026-08-08, all IAA and IAP Minis launching in the US and EU must pass EIS review** |
| Purpose | Reduce risk of information sharing with third parties; due diligence that the third party can collect, retain and manage ByteDance data without exposing users to risk |
| Specification | "Detailed specification details cannot be made public for the time being" |
| Detailed rules | <https://developers.tiktok.com/doc/data-access-compliance-requirements> — readable by Org Admins/Owners **after signing an NDA** |
| Duration | **15–30 US business days after submission** |

Steps as recorded:

| Step | Content |
|---|---|
| STEP 1 | After enterprise qualification certification, click **Business** and complete the US compliance review |
| STEP 2 | Complete the US Launch Compliance Questionnaire. ⚠️ For IAA Minis: **do not indicate any restricted regions**, or monetization cannot be enabled after US launch |
| STEP 3 | Pre-selection questions — from 2026-08-08, both IAA and IAP Minis **must choose sensitive data** |
| STEP 4 | Select data type (pre-checked from previous answers). If Sensitive Data cannot be selected, the entity is probably associated with a restricted region |
| STEP 5 | Submit materials. IAA Minis additionally receive a **TPRM questionnaire** |
| STEP 6 | **USDS TPRM Review** — a separate review required for US launch, to confirm the developer may access US-region user data |
| STEP 7 | Review passed → the Minis can launch in the US region |

#### 3.3.3 Industry qualification (§2.3.3)

For **Minis Drama** specifically, the submission requires:

- **Company introduction** — establishment date, core business scope, team composition, company
  website, supplementary materials.
- **Work link** — an app link or playable link to a representative mini-drama on another platform
  (Google Play, App Store, WeChat Mini App, Douyin Mini App are the listed examples).
- **Proof of identity** — if the publishing entity of the work link differs from the TikTok
  registered entity, supporting documents with official seals from both parties. Same-group entities
  provide certification documents; publishing agents provide the authorisation document (PDF, e.g.
  an authorisation email from the development company); if no official document exists, use the
  attached `行业准入审核授权书参考模板.pdf` template.
- **TikTok account manager email**, if a mini-drama account manager has already been engaged.

### 3.4 Contract signing (§2.4)

Online contract signing is live in the Dev Portal; contracts and monetization are now an online
process.

| Step | Content |
|---|---|
| STEP 1 | Precondition: enterprise qualification certification complete. Without it, **contract signing and monetization activation cannot proceed** |
| STEP 2 | Dev Portal → **Monetization** → **Enable** for IAP and IAA. A contract template pops up; read and **Submit** to sign. **From 2026-07-09, IAA self-activation is supported on the Dev Portal — no whitelist application through an account manager is required** |
| STEP 3 | Slide the terms to the bottom, tick "read", submit |
| STEP 4 | Contract signed ⇒ capability activated |

FAQ §7 adds: multiple Minis under the same org each require contract coverage; if an existing
contract does not cover a new Minis, a **new contract must be signed**.

### 3.5 Basic information configuration (§2.5.1)

| Field | Requirement | Review? | Multi-language? |
|---|---|---|---|
| Icon | PNG/JPEG/JPG/BMP, **600 × 600 px, ≤ 6 MB**. No rounded corners, watermarks or QR codes. No IP infringement, no sensitive/adult content, must not be confusable with well-known brands, must be consistent with the app name/brand | Yes | Yes |
| App Name | **≤ 50 characters**. No sensitive words. Must not adopt/imitate other well-known app names (`TikTok`, `Tik Tok`, `T1kTok`, or Tik/Tok character combinations are the given examples). Must match the description and the actual content. English name preferred | Yes | Yes |
| Description | **≤ 500 characters**, consistent with actual content, compliant with the TikTok community guidelines and developer terms. English preferred | Yes | Yes |
| Terms & Privacy | Public Terms of Service URL, public Privacy Policy URL, and the **website domain** hosting them. Shown on the Minis loading page. The service entity in both must match the verified entity; the two must be **separate documents**; the governing law cited must have a reasonable and substantial connection to the primary user base, operating entity, or principal place of performance | Yes | Yes |
| Release Regions | See §13.1 — the CN and EN versions of the page list **different** regions | No | Yes |
| Copyright & Content | Sign a Copyright Content Self-Inspection Form | No | No |
| Developer Information | **Apple Team ID** (required so iOS users can access the Minis) and a support **email address verified with two-factor authentication**, used for user appeals | No | No |
| 信息修改 (information modification) | CN version only; review required, no multi-language | Yes | No |

### 3.6 Basic library version (§2.5.2)

- The **minimum supported library version** is a Dev Portal field under basic information.
- **Basic library version ↔ user's TikTok app client version is a one-to-one mapping.** If the user's
  client is below the configured minimum, **the system prompts the user to upgrade the app** —
  the developer does not have to build that prompt.
- If unset, the platform default minimum applies.
- The changelog (《基础库更新日志》) on the Portal page lists what each version contains.

This is the mechanism half of U-20. The concrete floor comes from the IAA note in §3.8 below.

### 3.7 Localization (§2.5.3, optional)

Configured under **localization** in the Portal side nav. The selected languages are matched against
the **user's TikTok app language**:

1. Language configured and `online status = online` ⇒ the user sees that language's app name, icon,
   description, ToS URL and Privacy Policy URL.
2. Language not configured, or `online status = offline` ⇒ the default version is shown.

Explicit scope note: this is **only** the localization of basic information on the TikTok client.
In-app localization must be developed and configured inside the Minis itself.

### 3.8 Development and debug (§2.6)

The section is largely a link index into the developer docs (technical architecture description,
debugging guide, silent login, explicit authorization, in-app payment, subscription, rewarded video
ads, interstitial ads). The substantive content is:

**Payment and subscription**

1. **A signed contract is required before configuring payment and subscription capabilities.**
2. "For the payment flow, we recommend developing a **merged flow**" (recharge and payment combined)
   "to shorten user steps and improve conversion rate."
3. **SKU tier self-submission launched 2026-05-12.** Subscription SKU sets and Beans SKUs are
   submitted through the Dev Portal (Monetization → SKU); offline spreadsheets are no longer needed,
   and anything already submitted offline should not be resubmitted.

| | Subscription SKU set | Beans SKU |
|---|---|---|
| How to create | Create a SKU set, manually configure billing cycles and platform-specific pricing | Search existing Beans SKUs, or submit new ones by CSV upload (**up to 1,000 per file**) or manual entry (**up to 10**). Platform-existing Beans tiers need not be resubmitted |
| Billing cycles | **Weekly, Monthly, Quarterly, Half-yearly, Yearly** | N/A — Beans are one-time purchases |
| Platform pricing | Set Apple and Google prices manually; specify the Webpay discount range | Set the Beans quantity per tier; TikTok auto-fills platform fees and pricing after approval |
| Review | TikTok reviews the SKU set; **result within 2 weeks** | Unmatched Beans tiers can be applied for; **review within 2 weeks** |
| Identifier | A unique **Tier ID per billing cycle type**, used for IAP configuration in the app | N/A |

Pricing rules stated once for both:

- Submitted prices are **inclusive of platform fees**, correspond to the **US base price**, and
  **exclude taxes**.
- Apple and Google platform fees differ (**30% and 15%** as written on the page — note this
  contradicts §6.1.1 of the same page, see §13.4); you may choose whether both end at the same
  final price.
- Each SKU is configured for **all TikTok-supported countries** on each platform; no per-region
  pricing setup.
- **Maximum price per SKU is 400 USD; for South Korea, 350 USD.**
- SKU combinations must be unique; only one entry per billing-cycle type within a SKU set.

**IAA content and placement policy** — these are review criteria, so they constrain product design,
not just implementation:

1. **Only the official IAA capability may be integrated. Custom pop-up ads are prohibited.**
2. Ads must load correctly when unlocking episodes, and the user must return correctly to the episode
   after viewing without disrupting the Minis.
3. **Rewarded ads are allowed in exactly two scenarios**: (a) after an episode finishes playing,
   before entering the next episode; (b) when the user manually skips the current episode, e.g. by
   dragging the progress bar. **Prohibited**: auto-triggered rewarded ads on auto-play / auto-next;
   rewarded ads popping up mid-episode when the user adjusts the progress bar.
4. **Interstitial ads**: must not be shown immediately when the user opens the Minis; must observe a
   cooldown and must not be shown frequently.

**Version floor (CN version only, §13.2):**

> IAA 功能要求 TikTok App 版本**不低于 44.2.0**，开发时请通过 `canIUse` 判断当前客户端是否支持 IAA
> 后再使用 IAA API。目前投放产品侧已经做了版本限制只会投放到 4420 以上版本的用户，请客户自行处理
> 自然流量部分的用户识别，和版本升级提示的工作（可以添加 toast 文字引导用户完成 TikTok 版本升级）。

That is: **IAA requires TikTok ≥ 44.2.0**; gate every IAA API behind `canIUse`. Paid traffic is
already restricted to clients ≥ 44.2.0 by the ads product, but **organic traffic is the developer's
problem** — the developer must detect it and prompt the upgrade (a toast is suggested).

### 3.9 Testing acceptance and release review (§2.7)

**Code release / preview (§2.7.1)**

1. **Add test users first (required)** — Testing & Permissions tab, add the TikTok accounts that may
   preview before release.
2. Upload the code package under **Code Versions**. Upload "may take several minutes".
3. Preview by QR code: the preview button appears on the code-version card; log into the test user
   account in TikTok and scan.

Real-device preview preconditions, stated as a checklist:

1. The account is added as a target user.
2. **The region is set to US / Japan / Indonesia.**
3. Short videos scroll smoothly (i.e. the network is genuinely good) before you blame the Minis.

Triage list when the Minis will not open or errors continuously: debug locally first (does the code
even compile?); check network quality and whether the **account registration region matches the
selected release region**; check the scanning account is a target user; check the login flow is
integrated **strictly** per the documentation; then raise an oncall in the group, **providing the
`client_key` and the error code/message**.

**Submit for review (§2.7.2)**

- STEP 1: basic information must have passed review first.
- STEP 2: submit the version. The code version is reviewed **with the basic information used as a
  reference**; it moves to *Under Review*; you can choose auto- or manual publish on approval;
  approved versions become *Publishable*.
- Publishing: **only 1 production version and 1 canary (gray) version may exist at the same time.**
  The production version must remain online for accessibility, and **you may only publish to
  production when launching for the first time.** One canary version may be kept online with a
  configured traffic allocation, and the production version's share is **adjusted automatically**
  from the canary allocation.

**Review rules (§2.7.3)** — two parts, **1–3 working days** overall, notified via platform, internal
message and email:

1. **Security review** — no illegal, pornographic, violent or hateful content; minors protected.
2. **Non-security review** — user experience and **mandatory integrated capabilities**: performance,
   dual-end (iOS/Android) loading, core functions, payment, agreements, and an **open-capability
   walkthrough**.

Four review dimensions are enumerated: content and services (legal, not misleading, actual service
matches the external description); functionality and product quality (core functions work, no
function-less or incomplete products, no severe blocking issues); user-experience specifications
(**no forced purchases and no forced ad viewing**; ads clearly labelled and separated from function;
**complaint and report entries must use official TikTok channels**); data and privacy (authentic
policy and terms, lawful/legitimate/necessary collection, no irrelevant data, clear disclosure).

**Rejection reasons (§2.7.4)** are readable in the Dev Portal (screenshot-only in the original).

---

## 4. Media asset storage and playback (§3) — the most consequential finding

The section describes the BytePlus media library plus TikTok Open Platform media management plus the
mini-drama player, and states the destination state:

> "After the official launch of the platform's media asset solution, developers are **required** to
> complete integration with the media asset player and get content approved before playing content
> within Mini Programs."

But the dated notice immediately below changes the timeline:

> **⚠️ Important Notice — 2026.6.25 (English version):** "Platform media storage player program
> optimization has been completed, and **pilot access will begin in July**. Please refer to platform
> notifications. **Developers who are not included in the pilot can continue to use their own
> solutions.** The specific access time will be notified by the platform. The platform will reserve
> sufficient switching time and will not affect the normal online operation of Mini Programs."
>
> 1. Developers not yet in the pilot: "First, use **your own storage and player** to complete the
>    development of short drama Mini Programs online. Currently, there is no need to access the
>    platform's official storage player program." They may meanwhile follow the media-library
>    integration guide to pre-register BytePlus account information; the platform will assign someone
>    to assist with BytePlus preferential pricing, account opening, and media upload preparation.
> 2. Developers already in the pilot: proceed per the document.

The Chinese version words the status more conservatively (§13.3): 方案**处于试点阶段，尚未开放统一
接入** — "in pilot, unified access is not yet open" — and notes 一期邀测已结束 ("phase-one invited
testing has ended").

**Why this matters:** `docs/architecture/system-overview.md` §1.1 corrections A1–A3 treat "VePlayer
only, BytePlus-hosted, platform-enforced playability" as a hard present-tense constraint, and derive
the whole media-plane design from it. The public [Minis Player](https://developers.tiktok.com/docs/en/minis-player)
doc does say third-party players "are not allowed" and will be replaced with a blocked UI, and offers
an exemption path by support ticket. The One Page says the programme is a pilot and non-pilot
developers keep their own storage and player until notified. Both can be true — the public doc
describes the destination, the One Page describes the rollout — but the difference decides whether
our **launch** media plane is ours or the platform's, which is a first-order architecture and
scheduling question. Registered as gap **G-R1** in `docs/research/gaps.md`.

§3.1/§3.2 are link-only, pointing at the media library & player integration guide, the TTOP short
drama playback doc, and the media asset library integration doc.

---

## 5. Traffic scenarios and entries (§4)

| Entry | How it works | Configuration |
|---|---|---|
| **Advertisement (§4.1)** | User taps a component button in TikTok ad content and enters the Minis | Requires asset registration and whitelisting, below |
| **TikTok Profile / sidebar (§4.2)** | Users reach the TikTok Minis centre page from their profile and the sidebar, showing recently visited Minis | **No configuration. Takes effect ~2 weeks after launch** |
| **Minis search card (§4.3)** | Users search by Minis name and enter via the search card | **No configuration. Takes effect ~2 weeks after launch** |
| **Feed stream shaped card (§4.4)** | A card in the recommendation feed showing core episode info; "Watch Now" goes **directly to the episode playback page** | **Under internal testing** |

Advertising prerequisites:

1. **Asset registration** — the customer registers the Mini Program asset and authorises the ad
   account in Business Center (BC) before Minis Ads campaigns can run.
2. **Product whitelisting** — provide the ad account's **ADV ID** to the customer manager.
3. Required product capabilities: **high/medium/low recharge panels** (marked *Required to Connect*)
   and the **middle-funnel event postback** integration (marked *Required*). Smart+ short-drama
   product-library ads via API are optional.

Getting the identifiers (CN §4.1 table):

- **Minis ID = Client Key**, auto-generated when the app is registered in the Dev Portal
  (developer portal → Manage Apps → the Minis). **Select the Production environment.**
- **Landing URL for a drama**: open the Minis, enter the drama, enter episode 1 playback, tap the
  three dots at the top right, tap **Copy Link**. A *Generate Minis Link Open API* exists for batch
  creation.

The feed shaped card and the "Copy Link" deep link are the platform's own deep-link mechanism into a
specific episode — relevant to the deep-link work in `docs/02-information-architecture.md` §7.3 and to
U-13.

---

## 6. Data analysis (§5)

- Since **2025-05-16**, developers view user data and revenue data on the TikTok for Developers site.
  **Roughly 2 days of data delay** because of time-zone and other factors.

| Dataset | Data | Portal path |
|---|---|---|
| User | User sources and user analysis | Operate → Analytics |
| IAP revenue | IAP monetization data | Monetize → IAP |
| IAA revenue | IAA monetization data | Monetize → IAA |

Reconciliation against TikTok for Business / TTAM (only valid for accounts whose account time zone is
UTC+0):

- The TTAM-side **Calendar dimension field has been taken offline platform-wide** — it is not an
  account problem.
- Short term, use **Day 0 Ad Revenue (ROAS)** over a longer period.
- **Settlement data**: the Dev Portal shows **T+1 post-risk-control** data; the TTAM backend shows
  **real-time** ad-side data. **Actual settlement follows the Open Platform**, and the gap against
  TTAM is **typically 1%–3%**.
- For ad-delivery model optimisation, use the TTAM backend, so operations can act in real time.

---

## 7. Settlement (§6)

Online (digitised) settlement was expected to go live in **April 2026**; statements before then are
processed offline.

### 7.1 Offline settlement (§6.1)

| Item | Value |
|---|---|
| Bill generation | Month N's bill is generated in month **N+2**, around the 10th |
| Payment | **Within 45 calendar days** after the platform receives the invoice |
| Settlement formula | `Settleable = Successful payment − refunds (before and after split) − test orders − app store payment channel fee − tax` |

Calculation factors:

- **Test orders — the developer must monitor these.** The stated method: watch the **`is_sandbox`**
  field in webhooks; `true` ⇒ test order, exclude from the settlement amount. And because the US
  supports web pay, **watch `pay_type`** to identify the user's payment channel. (`pay_type` is not
  documented in the public webhook reference — see §13.5.)
- **App store payment channel fee:** IAP — **Apple Store 15%**; Google Play (value conveyed only in
  an image in the original). **Webpay** (US iOS users only) — **Beans default 25%, not adjustable by
  developers; Subscription default 15%, developer-configurable.**
- **Taxes** per country policy.

### 7.2 Invoicing (§6.1.2)

Settlement is initiated by **three entities based on where user revenue is generated**, always in
**USD**, with **a separate invoice per region**:

| Region | Entity | Country | Tax ID | Address |
|---|---|---|---|---|
| AMS (Americas) | TikTok Inc. | United States | 473892853 | 5800 Bristol Pkwy, Suite 100, Culver City CA 90230 |
| Europe (EEA + UK + Switzerland) | TikTok Information Technologies UK Limited | United Kingdom | GB485763736 | Kaleidoscope, 4 Lindsey Street, London, EC1A 9HP |
| Rest of World (non-Europe, non-AMS) | TikTok Pte. Ltd. | Singapore | 201719908M | 1 Raffles Quay, #26-10, Singapore 048583 |

Invoicing content for all three: **"TikTok Minis Developer Revenue Share"**. Proforma invoices with
official seal are requested per region. Each invoice must clearly list the regional amount for the
settlement, the **Settlement No.**, the **Transaction Period**, and the final regional total.
Expense type is **Services**; invoices are **not tax invoices and must not include tax rates or tax
amounts**. Both PDF and Excel versions of each statement are downloadable from the settlement page.

Adjustment amounts are allocated per region in proportion to regional revenue. **Statements before
January 2026 required manual splitting; from January 2026 statements are issued by revenue region and
no manual adjustment calculation is needed.**

The page ends the section with a tax caution: rates and bank FX policies differ by country, so
developers should consult local tax authorities and banks in advance.

### 7.3 Online settlement (§6.2)

**Cycles.** Online settlement applies to transactions from **April** onward; March and earlier are
settled offline by email. **Funds are credited within 15 days after the customer confirms the invoice
is issued.**

| Transactions in | IAA | IAP-Beans | IAP-Subs |
|---|---|---|---|
| April – July | T+15, **biweekly** | T+15, **monthly** (e.g. 1–30 Jan ⇒ statement 15 Feb) | T+60, **monthly** |
| August | **T+5, biweekly** — effective from August transactions; first statement **20 August** covering 1–15 August | T+15, monthly | T+60, monthly |
| September onward | — | **IAP: T+5, monthly**, first statement **5 October** | **IAP: T+5, monthly** |

The transition table in the original also records the statement-generation cadence moving to
**M+5 days** and the payment cycle from **within 30 working days** (transition) to **within 15
working days** (online).

**Advance settlement.** TikTok may issue an upfront payment calculated with a **fixed exchange rate**
applied to the total Beans redeemed by end users in the calendar month; the specific fixed rate is
stated in the settlement report. All advances are reconciled in a later settlement cycle, appear as a
reconciliation line item in future reports, and future payouts are adjusted for any difference.

**Appeals.** A dispute may be filed against an **unpaid and unconfirmed** settlement record. Success
⇒ status becomes *Replaced* (original nullified, new statement issued); failure ⇒ back to *Pending
confirmation*. **Each unpaid record is eligible for exactly one appeal attempt**, regardless of
outcome.

**Statement statuses** — Dev Portal → My organizations → Monetization → Revenue → Details:

| Status | Definition | Required action |
|---|---|---|
| Pending confirmation | Statement generated, awaiting review; also the state an unsuccessful appeal returns to | Confirm or appeal |
| Confirmed | Manually accepted, now invoiceable | Submit invoice |
| Appeal review | An appeal was filed | Wait for the result |
| Replaced | Appeal succeeded; original nullified, new statement issued | Confirm the new statement |
| Paid | Invoice fully processed, funds disbursed | — |

**Invoice requirements (§6.2.2):** amount must equal the total settlement; organisation name must
match the contract; invoice date must be after settlement completion; **PDF, < 10 MB**.

**Invoice/payment statuses:** *Invoice under review* → *Processing payment* (payout follows the
contracted cadence; **you cannot freely request withdrawal at any time**) → *Paid*. Failure states
are *Invoice rejected* (submit another invoice) and *Payment failed* (update the payment method or
retry).

---

## 8. FAQ — access process (§7)

| Q | A |
|---|---|
| Can one developer open multiple Minis? | Yes, under the same org, but they must be **clearly distinguishable** — names and logos may not be duplicated — with a clear and reasonable business purpose. **Each needs contract coverage**; if the signed contract does not cover the new Minis, sign a new one |
| How to report an unanswered problem? | Feedback ticket via the support page or by escalating from the AI bot to a human: <https://developers.tiktok.com/portal/support> |

## 9. FAQ — basic development (§7)

> **How to obtain user language and device?** — "User language, location, and device information are
> all highly sensitive information, and **currently no JS API is provided**. The current architecture
> of short dramas runs on Webview, and some browser information can be obtained through JS."

This is a definitive negative answer for U-15 (and for the language/device half of U-12's
neighbourhood): there is **no** platform JSAPI for locale, geography, device or network. Everything
of that kind must come from standard browser APIs (`navigator.language`, UA parsing,
`navigator.connection` where present), with the resulting availability caveats.

## 10. FAQ — authorization and login (§7)

| # | Question | Answer as recorded |
|---|---|---|
| 1 | What is the OAuth process? | Obtaining the user's OpenID and access token. **OpenID relates only to the Client Key and is unrelated to region** |
| 2 | How to choose a login scheme? | No data needed ⇒ do not log in. Only OpenID needed ⇒ **silent login**: the frontend calls `.login` at a suitable point; no user perception, no authorization popup; **IAP can already run at this point**. Additional user info (username, avatar) ⇒ call `.authorize` with the appropriate `scope` **only when necessary**; this shows an authorization popup, so **do not request it immediately on entry** or the user may refuse and you lose the OpenID too. **When `.authorize` fails, fall back to `.login`** so basic login info is not lost. More sensitive data (email, phone) requires BD contact and a complex compliance process |
| 3 | Why can't I get an access token? | The exchange is server-side. Frontend calls `.login` → sends the code to your backend → backend calls `https://open.tiktokapis.com/v2/oauth/token/`. **Wrong**: frontend JS calling the OpenAPI (CORS will fail it); OCR-ing the code or token and pasting it (characters are easily misread) |
| 4 | Is the access token permanently valid? | **No, it expires.** Handle the return of every TT OpenAPI call: on HTTP 401 (or any non-200), your server must tell your frontend to re-run the OAuth flow |
| 5 | What if the user refuses or cancels authorization? | Silent login is imperceptible, so it **cannot be refused**. Refusing an *additional* authorization does not affect the silent-login result. Agreeing replaces the previous access token. **Manually cancelling authorization invalidates all permissions including silent login** — on a 401 from any OpenAPI, re-run silent login on the client |
| 6 | How to detect that the user switched TikTok account? | If login state lives in a second-level-domain cookie (e.g. `tiktok.com`), TikTok clears it on account switch and it presents as logged out. **If it lives in web storage, this cannot currently be detected.** Therefore **strongly recommended: trigger `Login` once after entering the Minis, or before placing an order, to make sure the account is correct. `Login` has no frequency control** |
| 7 | Can OAuth be invoked on the frontend? | **No.** The server completes the call through the OpenAPI; the frontend sends the code to the server. Never OCR the code and call the OpenAPI with a tool |
| 8 | How to obtain my TT UID and its region? | Tap the version repeatedly on the settings page. For the UID's region, give the UID to operations, who can query it |

FAQ 6 is a design input we did not have: because our session design puts nothing durable in web
storage and re-authenticates by silent login (`docs/design/minis-integration.md` §4.1), **"call login
on entry and again before any order"** is both permitted (no rate limit) and recommended, and it is
the only available account-switch detection.

## 11. FAQ — payment and settlement (§7)

| # | Question | Answer as recorded |
|---|---|---|
| 1 | How do I maintain products and prices? | **TikTok does not require registering products or prices.** Pass the Beans to be consumed in `token_amount` when creating the order |
| 2 | Can I reuse a payment order? | **No.** Once a `trade_order_id` is created, none of its fields can change; once paid it cannot be paid again. A new payment needs a new order with the correct `token_amount`, `order_id`, `product_name` |
| 3 | What if my Beans price exceeds the current limit? | Contact sales/BD; TikTok can apply for a higher Beans tier |
| 4 | What is the Beans:USD ratio? | No fixed price, because Beans prices must stay as consistent as possible across currencies. **Reference: TikTok reports 100 Beans = 1 USD to the stores; because of tax and channel fees the user pays roughly 100 Beans = 1.5 USD** |
| 5 | Can I get near-real-time local-currency pricing? | Not directly — "TT currently does not want third parties to perceive too much of the concept of Beans tiers". Workaround: call `https://open.tiktokapis.com/v2/minis/utility/get_tier_infos/` for tier **`1732621527608100`** (100 Beans); the response is the price **in the country of the user's TikTok account** |
| 6 | Can I compute the Beans a user actually consumed? | Yes — aggregate from the webhook messages; **`is_sandbox`** marks test orders; refunds are also derivable |
| 7 | How are Beans paid and counted? | Under the merged payment flow: no balance ⇒ recharge and consume directly; balance covers the tier ⇒ consume from balance; balance insufficient ⇒ recharge the tier's Beans and consume. **Developer revenue counts only the Beans consumed inside the Minis** — recharge 100, spend 90 ⇒ revenue corresponds to 90 Beans |
| 8 | Why is the recharged Beans amount larger than the consumed amount? | Recharge triggers when balance < amount to consume, and buys the **nearest available tier rounding up**. Balance 50, need 99 ⇒ recharge 100, consume 99, balance 51. Balance 100, need 99 ⇒ consume 99 directly, balance 1 |
| 9 | IAP errors on the "Recharge and Unlock" page? | The client failed to query the product in the store. Causes: device region is **CN or HK** or a region with no products configured; the store account's region has no products; the store region has no products. **Set the region to JP or US** |
| 10 | Display rules for the subscription tier product list? | The **background product list is yours** — you implement it and its prices come from your own UI; because the TikTok account region and the Google/Apple store region can differ and change, this price cannot be exactly aligned with what the user pays, so **display in USD**. If you must be exact, use the subscription query OpenAPI per Q5, at the cost of API calls and still without a currency guarantee. The **popup layer is TikTok's**, priced by the **TikTok account region** and worded in TikTok's own copy in the **user's TikTok app language**. **TikTok.com web payment is currently US-only.** The payment page amount follows the **Apple Store region** |

Q7, Q8 and Q10 together settle a design question the current docs leave open: our recharge sheet
(SCR-10 / PNL-03) should display in **USD** by default, and our wallet must reconcile against
**Beans consumed**, not Beans recharged, because the round-up leaves residual balance on the TikTok
account that is not our revenue.

## 12. FAQ — ad placement (§7)

| # | Question | Answer as recorded |
|---|---|---|
| 1 | Attribution standard for short-drama Minis ads? | **Last Click. IAP window 180 days, IAA window 7 days.** Ads for a Minis **automatically exclude users already subscribed to that Minis** |
| 2 | What is the ad ID? | **The Minis' Client Key is the advertising ID** |
| 3 | What is the traffic delivery URL? | Enter the Minis, open the drama, enter episode 1 playback (another episode can be chosen), tap the three dots top-right, **Copy Link**. Batch creation via the *Generate Minis Link Open API* |
| 4 | Can share links carry custom parameters? | **Parameters inside the short link require listening to the `share` event**, after which custom parameters can be appended to generate the short link. Parameters appended **after** generating a copylink **only take effect in the advertising link path** — direct QR scan or URL access does not honour them |

Q4 is the only public evidence found that a **`share` event exists** in the Minis runtime, which is
the entire basis for U-14. It is also the only statement about deep-link parameter behaviour, which
bears on U-13.

---

## 13. Divergences between the Chinese and English versions

These are not translation noise; they are substantive and each needs a Portal-side confirmation.

### 13.1 Release regions (§2.5.1) — the two lists do not match

| Version | "No special requirements" list | Additional conditions |
|---|---|---|
| **English** | Brazil, Indonesia, Japan, Malaysia, Philippines, Saudi Arabia, Thailand, Turkey | US requires TikTok review; **Vietnam requires a G1 online game license** from the Ministry of Information and Communications |
| **Chinese** | 巴西, 印度尼西亚, 日本, 泰国, **韩国, 澳大利亚, 新西兰, 加拿大, 墨西哥** (Brazil, Indonesia, Japan, Thailand, **South Korea, Australia, New Zealand, Canada, Mexico**) | US requires TikTok review; **Vietnam is not mentioned** |

Only Brazil, Indonesia, Japan and Thailand appear in both. The English list matches
`docs/architecture/system-overview.md` §10 and the public
[Basic Information Specifications](https://developers.tiktok.com/doc/tiktok-minis-basic-information-specifications).
Since the region list drives default currency, locale set, RTL requirement (Saudi Arabia) and legal
work (Vietnam G1), this must be read off the Portal rather than off either version of the page.
Gap **G-R2**.

### 13.2 IAA client version floor — Chinese only

The `TikTok ≥ 44.2.0` requirement, the `canIUse` instruction, and the "paid traffic is capped at
4420+, organic traffic is yours to handle" note appear **only in the Chinese §2.6**. The English
§2.6 IAA block stops after the four content-policy rules. The requirement is independently confirmed
by the public [In-App Ads: Rewarded Ads](https://developers.tiktok.com/doc/tiktok-minis-in-app-ads)
doc, so it is real; the English One Page is simply incomplete.

### 13.3 Media-asset pilot wording

English: "pilot access will begin in July… Developers who are not included in the pilot can continue
to use their own solutions." Chinese: 方案处于试点阶段，**尚未开放统一接入**, and 已加入试点的开发者
（**一期邀测已结束**）. The Chinese reads as "phase one is closed, unified access has not opened";
the English reads as "the pilot is starting". Same 2026-06-25 date on both. Gap **G-R1**.

### 13.4 Apple platform fee stated twice, differently

- §2.6 (both versions): "Apple and Google apply different platform fees (**30% and 15%**
  respectively)."
- §6.1.1 (both versions): IAP payment channel fee — "**Applestore 15%**", Google Play value
  conveyed only in an image.

30% vs 15% for Apple in the same document. The 15% figure sits in the settlement formula, so it is
the one with money attached, but neither can be relied on without confirmation. Gap **G-R3**.

### 13.5 Undocumented webhook field `pay_type`

§6.1.1 (both versions) instructs developers to monitor **`pay_type`** in webhooks to identify the
payment channel, because the US supports web pay. `pay_type` does not appear in the public
[Development Stage](https://developers.tiktok.com/doc/minis-development-stage) webhook structure or
in the [In-App Purchases](https://developers.tiktok.com/doc/in-app-purchases) payload examples,
which show only `trade_order_id`, `order_id`, `is_sandbox` and `refund_amount` inside `content`.
Our raw-payload-first webhook design (`docs/design/minis-integration.md` §6.2) already survives this,
but the field should be captured explicitly for settlement reconciliation. Gap **G-R4**.

### 13.6 CN-only Portal field

The Chinese §2.5.1 table has a trailing row **信息修改** (information modification: review required,
no multi-language) with no English counterpart. Low impact; noted for completeness.

---

## 14. What this page changes for the existing Wave 1 documents

Registered as findings for the owning slots. **No upstream file is edited by this slot.**

| # | Finding | Affects | Suggested owner |
|---|---|---|---|
| F-1 | **B-1 is closed.** The One Page exists and is extracted here; the conclusions in the Wave 1 set no longer rest on public docs alone | `docs/architecture/risks.md` §5, `docs/design/minis-integration.md` §2.1, `docs/11-official-onboarding-checklist.md` §0.1 | W1 architecture |
| F-2 | **The media asset/VePlayer programme is a pilot**, and non-pilot developers keep their own storage and player until platform notice. Corrections A1–A3 describe the destination, not necessarily the launch state | `docs/architecture/system-overview.md` §1.1, §5, §6 | W1 architecture |
| F-3 | **EIS compliance review is a hard, dated gate** (2026-08-08, US + EU, IAA and IAP) taking **15–30 US business days**, plus TPRM and USDS TPRM for the US. This is a critical-path business item that no Wave 1 document currently tracks | `docs/architecture/risks.md`, `docs/00-wave-plan.md` | W1 architecture + business |
| F-4 | **IAA ad placement policy is a review criterion**: rewarded ads only after an episode ends (before the next) or on a user-initiated skip; never auto-triggered, never mid-episode on a progress-bar drag. Interstitials never on open, always with a cooldown. This constrains the unlock panel (PNL-02) and journey J5, which currently assume a free-form "watch an ad to unlock" entry point | `docs/02-user-journeys.md` J5, `docs/02-information-architecture.md` §9, `docs/design/minis-integration.md` §4.3 | W1 design |
| F-5 | **IAA requires TikTok ≥ 44.2.0** and organic-traffic users below that must be detected and prompted to upgrade by us | `docs/design/minis-integration.md` §5.4, capability policy | W1 design |
| F-6 | **Login has no frequency control, and calling it on entry and again before ordering is the recommended practice** — and the only way to detect an account switch when state is not in a `tiktok.com` cookie | `docs/design/minis-integration.md` §4.1, `docs/design/domain-model.md` §4.3 | W1 design |
| F-7 | **Beans economics**: 100 Beans ≈ 1 USD reported to stores, ≈ 1.5 USD paid by the user; revenue counts **Beans consumed**, not recharged; recharge rounds **up** to the nearest tier; display prices in **USD** in our own UI | `docs/architecture/system-overview.md` §7.4, `docs/12-api-contracts.md` | W1 architecture + design |
| F-8 | **Settlement terms are now known** (U-22): IAA T+5 biweekly, IAP T+5 monthly from September, invoicing through three regional entities in USD, one appeal per record. This is an operations/finance requirement, not just a business note | `docs/design/minis-integration.md` §2.2 U-22 | W1 design + finance |
| F-9 | Release-region lists conflict between the CN and EN versions of this page | `docs/architecture/system-overview.md` §10 | W1 architecture |
| F-10 | **Only 1 production + 1 canary version** and **production publish is only available at first launch** — matches §11 of the architecture doc; independently confirmed here | `docs/architecture/system-overview.md` §11 | — (confirmation) |

---

## 15. Content present in the original but not recoverable here

For completeness, so nobody assumes this extract is exhaustive:

- 14 whiteboard/flow diagrams, including the §2 onboarding board and the §6.1 offline settlement
  flow.
- 12 embedded screenshots, notably the Dev Portal walkthroughs in §2.3.2, §2.4, §2.7.1, §2.7.2,
  §2.7.4, the Google Play fee figure in §6.1.1, and the subscription tier display figures in the
  §7 payment FAQ Q9/Q10.
- 4 file attachments: `行业准入审核授权书参考模板.pdf` (138.67 KB),
  `Letter of Authorization.docx`, and two Singapore reference documents
  (新加坡营业职照（ACRA）, 新加坡主体资格 bizfile 查询公证).
- Roughly 30 outbound links to other Lark documents (整体接入指南, 资质校验一站式入驻指南, the
  media library & player integration guide, the various capability integration guides, the Minis Ads
  playbooks). Their titles are recorded in `docs/research/sources.md`; their contents are separate
  Lark documents that were not fetched by this slot.
