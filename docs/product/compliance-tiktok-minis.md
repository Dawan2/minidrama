# TikTok Minis Compliance and Onboarding (product view)

> **Slot:** Wave 1 · product IA / journeys / compliance.
> **Purpose:** close the "missing One Page" gap. This document is written against the official Feishu source
> *小程序短剧接入One Page // Mini Drama Onboarding One Page*, which no earlier Wave 1 slot had access to, and
> reconciles it with the public TikTok for Developers documentation the repository was previously built on.
> **Relationship to earlier documents:** `docs/11-official-onboarding-checklist.md` (the executable checklist) and
> `docs/01-tiktok-minis-requirements.md` (the product-view summary) are **adopted, not replaced**. This file adds
> what the One Page contains and they do not, and registers the conflicts (§6) for those documents' owners to
> resolve in place. `docs/architecture/risks.md` blocker **B-1** ("the official One Page could not be located") is
> **partially closed** by §2.

---

## 1. Why this document exists

Everything the repository knew about onboarding came from public developer documentation. Public documentation
describes the *mechanics* of each gate. The One Page describes the **sequence, the irreversible steps, and the
gates that are not documented publicly at all** — most importantly the EIS compliance review, which is a
prerequisite for monetized launches in Europe and the US and appears nowhere in the public docs or in this
repository before now.

For a product plan, that difference is the whole game. The engineering work is knowable; the onboarding chain is
what decides when any of it can ship.

---

## 2. Source, retrieval and coverage

| Property | Value |
|---|---|
| Source | *小程序短剧接入One Page // Mini Drama Onboarding One Page*, Feishu wiki, ByteDance tenant |
| URL | `https://bytedance.larkoffice.com/wiki/MJ2BwFqSxi4r2SkwHS8cRrlsnVb` |
| Retrieved | 2026-08-27 |
| Method | Anonymous read of the wiki page; the document's block payload is embedded in the server-rendered page and was parsed back into text and tables |
| Coverage obtained | Section 1 (introduction) through section 2.5 (basic information configuration), including all tables in that range |
| Coverage **not** obtained | Everything after the basic-information field table. The remainder is paginated and only served to authenticated Feishu sessions; the document API redirects anonymous callers to login |
| Non-text content not obtained | Screenshots, two "Board" flow diagrams, one embedded file attachment, and two synced blocks |

**Consequence for blocker B-1.** The onboarding half of the One Page is now in the repository (Appendix A). The
half that would confirm or contradict the *technical* corrections — media asset upload, VePlayer integration,
monetization APIs, dashboards, contacts — is still unread. B-1 should be narrowed rather than closed:

> **Proposed B-1 replacement text** (for the architecture slot to apply in `docs/architecture/risks.md` §5; not
> applied here, because this slot does not edit architecture files):
> *The official One Page has been located and its onboarding half (§1–§2.5) is transcribed in
> `docs/product/compliance-tiktok-minis.md` Appendix A. Sections after 2.5 are behind Feishu authentication and
> remain unread. Obtain an authenticated copy, then diff in the existing order, starting with the sections that
> cover media assets and the player.*

---

## 3. The onboarding chain

The One Page frames onboarding as one flow with five stages. The ordering is not advisory: each stage is a hard
precondition for the next, and two steps inside it are irreversible.

```text
1  Account registration        register → create organization → add members → prepare test accounts
2  Create the app              app name (permanent) · app type = "Minis drama" (permanent)
3  Verification and compliance business verification → EIS review → industry qualification → USDS/US approval
4  Contract signing            online in the Developer Portal; enables IAP (and IAA)
5  App configuration           basic information → development → preview → review → release
```

### 3.1 Account registration

- Register on TikTok for Developers and work from **My organizations**. The Portal has a language switcher in the
  top-right corner, including Chinese.
- **The organization name is the full legal entity name and cannot be changed after creation.** It is shown to
  users. Getting this wrong means creating a new organization.
- Organization members can be added afterwards; some settings remain admin-only.
- Prepare TikTok accounts for testing the drama. The One Page recommends **one US account and one JP account**, and
  notes the practical trick for registering them: remove the SIM and set the device system language to the target
  country's language.

That last point is not trivia. On-device verification of every required capability is a pre-submission checklist
item, and it cannot start until test accounts in the right regions exist.

### 3.2 Creating the app

| Step | Detail |
|---|---|
| Create app | Developer Portal → *Create app* |
| App name | **Cannot be changed after creation.** Confirm it against the intended store listing before creating anything |
| App type | **Minis drama.** The type determines which Minis surfaces and APIs the app gets; it is not editable later |

### 3.3 Verification and compliance review

The One Page explains the three verification tracks in terms of what each one proves, which is the clearest
statement of intent available anywhere:

| Track | What it proves | What it checks |
|---|---|---|
| Entity verification (business or individual) | "I am who I say I am" | Authenticity and legality of the entity; establishes a party that can be held responsible; prevents mass registration under fake identities and abuse of developer resources (API abuse, bulk low-quality or grey-market apps); required for organizations claiming educational or research use, since some APIs expose all public videos, comments and account information |
| USDS review (US only) | "I am allowed to hold US data" | Whether the developer entity may access US user data, judged on the entity's country, place of business and controlling owners. **Entities on the restricted-country list cannot pass and cannot list in the US.** Otherwise USDS judges by the data types requested (whether protected data is involved) and the company's data security capability, evidenced by materials such as a penetration test report. A questionnaire must be completed by the developer |
| Industry qualification | "I am allowed to operate in this industry" | Industry operating licences where applicable (education, medical, media); **Vietnam requires a game licence to publish Minis**; and, for mini dramas, a playable link to a representative work already published on another platform |

#### Entity verification (business)

Documents to submit electronically:

1. The company's business licence or business certification document.
2. Government-issued photo identification of the principal or legal representative.
3. Proof of authorization for the principal representative.

Review typically completes **within three working days**. The One Page also states plainly that merchant
qualification verification **will become mandatory** for publishing mini games and mini dramas and for using
monetization features.

#### EIS compliance review — new, and it gates monetized launches

This is the single largest addition to the repository's understanding of onboarding.

- **After 2026-08-08, launching an IAA or IAP mini program in Europe or the US requires passing the EIS compliance
  review.**
- Purpose: reduce the risk associated with sharing information with third parties.
- Basis: due diligence establishing that the third party can collect, retain and manage ByteDance data without
  exposing users to risk.
- Scope: every third party involved in information sharing, and all shared information, divided into personal
  information (anything that identifies, relates to, describes, is associable with, or could be linked directly or
  indirectly to a person or their device) and everything else.
- Mechanism: a TikTok team drawn from security, privacy and legal reviews each information-sharing activity,
  identifies risks, applies mitigations, and verifies the third party's ability to manage the information.
- Detailed criteria are **not public**; the One Page says they likely concern whether collection, disclosure and
  use of the relevant information comply with law and platform policy.
- **Process advice from the source, worth following literally:** before submitting in the system, contact your
  account manager and complete an information-collection questionnaire in advance, to reduce the risk of rejection
  before the formal review starts.

Related: the full US-operations compliance requirements — restricted-country controls, entity access restrictions,
sensitive data rules and the third-party risk management (TPRM) questionnaire — are documented at
`https://developers.tiktok.com/doc/data-access-compliance-requirements`, readable only after the organization's
Admin and Owner sign a non-disclosure agreement.

#### Industry qualification

| Step | Detail |
|---|---|
| 1 | After entity verification, submit the Minis industry access application. Review generally completes in **one to three working days** |
| 2 | Submit the fields required for the Minis type: a **representative work link**, plus identity proof. If the entity that published the linked work is not the verified entity: for different entities in the same group, provide supporting documents; for agency distribution, provide an authorization file as PDF, such as an authorization email from the development company. If no official authorization file or email exists, a sample authorization PDF is provided to work from |

This confirms and sharpens risk **P-2** in `docs/architecture/risks.md`: the representative-work requirement is
real, and the escape hatch for a publisher who did not produce the work is an authorization document, not an
exemption.

### 3.4 Contract signing

Online contract signing is live; the whole contract-and-monetization step is a Portal flow rather than an offline
exchange.

| Step | Detail |
|---|---|
| 1 | Confirm the prerequisite: entity verification is complete. Until it is, neither contract signing nor monetization enablement is possible |
| 2 | Developer Portal → *Monetization* → *Enable* IAP. The contract template opens automatically; read it and submit to sign. **From 2026-07-09, IAA can be enabled by the developer in the Portal without an account manager adding the organization to an allowlist** |
| 3 | Read the terms, scroll the slider to the bottom, tick the acknowledgement, submit |
| 4 | The Portal then shows IAP as enabled |

### 3.5 Basic information

Entry point: *basic information* in the sidebar. Each field carries two attributes that the repository's checklist
did not record: **whether it is reviewed**, and **whether it supports multiple languages**.

App icon requirements, as stated in the One Page:

- PNG, JPEG, JPG or BMP; 600 × 600 pixels; no larger than 6 MB.
- No rounded corners, watermarks or QR codes.
- No intellectual-property infringement and no illegal content.
- The image must be clear.
- No sensitive or inappropriate content of any kind — lottery, gambling, abortion, violence, drugs, pornography or
  other adult content, conspiracy theories, terrorism, or anything else with a negative or harmful effect.
- Must not be easily confused with another well-known brand's icon.
- Must be consistent with the app name or brand.
- Reviewed: yes. Multi-language: yes.

The remaining field rows (app name onward) are in the part of the document that could not be retrieved; the public
Basic Information Specifications already cover them and are transcribed in `docs/11-official-onboarding-checklist.md`
§4.1 (C1–C12).

---

## 4. What the One Page adds to this repository

Each row is a fact that was not in any repository document before this slot.

| # | Fact | Product impact | Lands in |
|---|---|---|---|
| ONE-1 | **EIS compliance review is required for IAA/IAP launches in Europe and the US after 2026-08-08** | A monetized European or US launch has a gate nobody had planned for, with unpublished criteria and a pre-submission questionnaire | Launch plan; risks (new entry proposed in §7); region decision B-4 |
| ONE-2 | EIS scope covers every third party involved in information sharing, and all shared information | Every third-party dependency that touches user data becomes a compliance object, not just an engineering choice. This strengthens the existing architecture rule of no third-party client SDKs | `docs/architecture/system-overview.md` §9 rationale (already aligned) |
| ONE-3 | Contact the account manager and pre-fill the information questionnaire **before** submitting for EIS | The review has an informal pre-stage; skipping it raises rejection risk | J24 in `docs/product/user-journeys.md` |
| ONE-4 | Contract signing is an online Portal flow tied to enabling IAP | Removes an assumed offline dependency from the monetization critical path | `docs/11-official-onboarding-checklist.md` C15 |
| ONE-5 | **IAA is self-service in the Portal from 2026-07-09**, no allowlisting by an account manager | Directly contradicts checklist risk R3/R7's assumption; shortens the ad-unlock enablement path | Conflict C-ONE-1 |
| ONE-6 | Entity verification typically completes within three working days | Gives the onboarding chain its first quantified lead time | Launch plan |
| ONE-7 | Merchant/entity qualification will become **mandatory** for publishing mini dramas and for monetization | Removes the "unverified soft launch" option from planning | `docs/01-tiktok-minis-requirements.md` §2 |
| ONE-8 | **The organization name and the app name cannot be changed after creation** | Two irreversible, business-visible decisions sit at the very start of the chain, before any engineering | J24; onboarding tracker in the ops console |
| ONE-9 | App type must be **Minis drama** at creation | A wrong type means recreating the app, losing the name | J24 |
| ONE-10 | Test accounts: one US and one JP recommended, registered with the SIM removed and the system language set to the target country | On-device capability verification is unblocked by an operational recipe rather than a support request | Test plan; pre-submission checklist |
| ONE-11 | USDS restricted-country list is disqualifying for US listing; otherwise the decision weighs requested data types against demonstrated data security capability, evidenced by materials such as a penetration test report | If the US is in scope, a security assessment artefact is a deliverable, not a formality | Region decision B-4; security slot |
| ONE-12 | The US data-access compliance requirements document is readable only after the org Admin and Owner sign an NDA | A named person has to sign something before anyone can even read the requirements | J24 |
| ONE-13 | Vietnam requires a game licence to publish Minis (stated in the industry-qualification track, alongside the licence-bearing industries) | Confirms the existing G1-licence note and places it inside the qualification gate rather than beside it | `docs/11-official-onboarding-checklist.md` §4.3 |
| ONE-14 | Representative-work mismatch is resolved with a group-relationship document or an authorization PDF, and a sample authorization PDF exists | P-2 has a documented workaround | `docs/architecture/risks.md` P-2 |
| ONE-15 | Icon must be clear and must not be confusable with a well-known brand icon; basic-information fields are individually flagged for review and multi-language support | Two extra rejection causes for the icon, and a per-field localization model for the listing | `docs/11-official-onboarding-checklist.md` C1 |
| ONE-16 | Entity verification exists partly to prevent bulk grey-market publishing and API abuse | Explains why the gates are strict and why appeals are slow; useful context for planning, not a requirement | — |

---

## 5. Runtime compliance obligations of the app itself

These are the obligations that must be visible in the built product rather than in a Portal form. They are
unchanged in substance from `docs/architecture/system-overview.md` §3.2 and `docs/11-official-onboarding-checklist.md`
§6.2; they are restated here because product decisions depend on them and because the acceptance criteria trace to
this list.

| # | Obligation | Product consequence |
|---|---|---|
| RC-1 | Episodes play **only** through the official VePlayer, obtained from `TTMinis.getPlayer()` | The player screen is a platform surface with our chrome over it (`docs/product/sitemap-and-ia.md` §2, §4) |
| RC-2 | Third-party players and native HTML `video` are not allowed; TikTok replaces them with a blocked UI | No `<video>` in the bundle at all, including trailers and marketing loops |
| RC-3 | Episode video is hosted in BytePlus and moderated by TikTok | Playability is platform-enforced; our entitlement can deny but cannot grant (J15) |
| RC-4 | TikTok Login must be implemented, and the code scan checks for it | Silent login is in the boot sequence, not behind a feature flag |
| RC-5 | Required capabilities: silent login, rewarded ads, interstitial ads, Beans purchase, subscription, navigation bar | All integrated for the first release; none can be dropped to save scope |
| RC-6 | No `eval`, no `Function` constructor, no string-form timers, no `iframe`; scripts and CSS from self only, fonts excepted | Build-time gates, not review-time surprises |
| RC-7 | Runtime requests only to registered trusted domains, at most 20, `https://` or `wss://`, no wildcards or paths | One API domain; everything third-party is proxied server-side |
| RC-8 | Package: ZIP ≤ 200 MB, no zero-byte files | Packaging gate |
| RC-9 | The app must be compatible with English to pass review | English is bundled and complete; the reviewer walkthrough (J19) is conducted in English |
| RC-10 | Terms of Service and Privacy Policy URLs are shown by the platform loading page and must be live | Legal URLs are a launch dependency with an owner, not a placeholder |
| RC-11 | Basic information is cross-referenced against the app during code review | Listing copy, icon and category are version-controlled next to the code |
| RC-12 | First release must be a full production release; afterwards at most one production plus one gray version | No canary for launch; every risky behaviour sits behind server-side config |

---

## 6. Conflicts with existing repository documents

Registered, not silently patched. The owning slot resolves each in its own document.

| # | Conflict | Existing statement | One Page statement | Recommended resolution |
|---|---|---|---|---|
| C-ONE-1 | IAA enablement | `docs/11-official-onboarding-checklist.md` R3/R7 and C15: monetization requires an account manager to allowlist the organization | IAA is self-service in the Portal from 2026-07-09; IAP enablement opens the contract template automatically | Follow the One Page; keep the account-manager contact as the escalation path, not the mechanism |
| C-ONE-2 | Contract signing | Described only as "sign relevant electronic contracts" | A four-step Portal flow tied to enabling IAP | Replace C15's wording with the flow in §3.4 |
| C-ONE-3 | Compliance gates | Two gates modelled: entity verification and industry qualification (plus US approval) | **Three**: entity verification, **EIS**, industry qualification, plus USDS/US approval | Add EIS as a first-class gate in the checklist and in the wave plan's business milestones |
| C-ONE-4 | Verification lead time | Not stated for entity verification | Typically three working days | Record it; it is the first quantified link in the chain |
| C-ONE-5 | Irreversibility | Organization name "must be the full legal entity name"; nothing about immutability, and nothing about the app name | Both are permanent | Mark both as irreversible decisions in the checklist and require sign-off before creation |
| C-ONE-6 | Icon specification | Checklist C1 lists format, size, no rounded corners/watermark/QR, no infringement | Adds clarity and brand-confusion criteria, and per-field review and multi-language attributes | Extend C1; the extra criteria are rejection causes |

No conflict was found between the One Page and the VePlayer/BytePlus architecture corrections A1–A6 — but the One
Page sections that would cover them were not retrievable, so this is an absence of contradiction rather than a
confirmation.

---

## 7. Proposed additions to the risk register

For the architecture slot to apply in `docs/architecture/risks.md`; not applied here.

| # | Risk | L | I | Mitigation | Early warning |
|---|---|---|---|---|---|
| **C-11** | **EIS compliance review is required for monetized launches in Europe and the US, with unpublished criteria** | High | High | Start EIS before engineering needs monetization; pre-fill the information questionnaire with the account manager; minimize third-party information sharing so the review surface is small (the no-third-party-SDK rule already helps) | Account manager cannot schedule the pre-review; questionnaire returns follow-up requests |
| **C-12** | Organization and app names are permanent and are created at the very start of the chain | M | M | Name sign-off from business and legal before the organization is created; record both in the onboarding tracker as irreversible | A rename request is raised at any point after creation |
| **C-13** | USDS may require a demonstrated data-security capability (for example a penetration test report) if the US is in scope | M | M | Decide the US question early (blocker B-4); if in scope, schedule the security assessment as a deliverable | US listed as a launch region with no assessment planned |

---

## 8. Critical path

Dependency order, with the platform-stated lead times attached to the steps that have them. No calendar estimate is
attached to steps whose duration the platform does not state.

```text
organization created (name permanent)
        │
        ▼
entity verification ──── typically 3 working days
        │
        ├──────────────► EIS review (Europe/US IAA-IAP) ── unpublished duration; pre-questionnaire first
        │                        │
        ├──► industry qualification ── 1–3 working days ── needs a representative work link
        │                        │
        └──► USDS / US launch approval (US only) ── needs the restricted-country and data-capability assessment
                                 │
                                 ▼
                        contract signing → IAP/IAA enabled
                                 │
                                 ▼
                 basic information submitted and approved
                                 │
                                 ▼
        development · on-device debugging (needs test accounts; Android needs a TikTok test client)
                                 │
                                 ▼
            content pipeline: ingest → album version → moderation (1–3 working days,
            urgent lane capped at 35 submissions per organization per day) → online version → listed
                                 │
                                 ▼
                        code review → full production release
```

The two longest and least controllable links are EIS and, if the US is in scope, USDS. Both are business-track.
Engineering can proceed against `MockBridge` and the documented contracts throughout, but no monetized release can
precede them.

---

## 9. Open questions that need the rest of the One Page

The retrieved portion stops at basic information. These questions are exactly the ones the unread sections are
likely to answer, and they should drive the request for an authenticated copy:

1. Does the One Page prescribe a media-asset upload workflow that differs from the public
   `/v2/sg/shortdrama/*` documentation (paths, priorities, quotas)?
2. Does it document the VePlayer integration with any constraint not in the public player documentation — in
   particular around the `play_auth_token` cutoff at TikTok 44.5.0, or required player configuration?
3. What does it say about IAA and IAP mechanics, tier configuration and settlement, beyond enablement?
4. Are there dashboards or data reports that operations is expected to use, and do they impose data obligations
   on us?
5. Does it name the required points of contact and their escalation paths (account manager, operations
   representative, support ticket routing)?
6. Does it state region availability in a way that resolves the contradiction registered as risk P-7?

---

## Appendix A — extract of the official One Page (§1 – §2.5)

Retrieved 2026-08-27 from `https://bytedance.larkoffice.com/wiki/MJ2BwFqSxi4r2SkwHS8cRrlsnVb`. Chinese source text
is reproduced as retrieved; images, two board diagrams, one file attachment and two synced blocks could not be
retrieved and are marked. Content after the basic-information field table is not present in the anonymous payload.

### 1. 简介 — Introduction

> **什么是小短剧？**
>
> 短剧Minis 基于TikTok移动网页技术的产品框架，支持第三方服务方开发的小程序与 TikTok 用户体验无缝衔接，实现用户在无需下载安装的情况下，直接在 TikTok 内顺滑、快捷地观看第三方平台提供的短剧内容。

*Mini dramas are a product framework built on TikTok's mobile web technology. Third-party mini programs integrate
seamlessly with the TikTok experience so that users watch third-party short-drama content directly inside TikTok,
with no download or installation.*

### 2. 短剧入驻流程 — Onboarding flow

*(An overview board diagram appears here and could not be retrieved.)*

#### 2.1 账号注册 — Account registration

> 1. **注册** — 在 TikTok for Developers 网站完成注册，进入 My organizations 管理组织。开始前，您可以在右上角切换多语言，选择中文🇨🇳
> 2. **创建组织并管理开发成员** — 创建组织，组织名为主体全称，注意创建后名称无法修改（如：ByteDance Inc.）。可以在组织内添加其他开发成员。
> 3. 准备用于测试短剧的的TikTok账号，建议一个US账号一个JP账号。新建TT账号可以尝试拔掉sim卡+调整系统语言至海外国家（比如想注册美国账号，就修改系统语言至英语【美国】）

#### 2.2 创建app — Create the app

| 步骤 | 说明 |
|---|---|
| STEP1 | 在 Dev Portal 点击 "Create app" |
| STEP2 | 在创建 App 的环节选择 "Mini Drama"。**App name**：minis 的名称【请慎重确认，创建后不支持修改】。**App type**：选择 Minis drama |

#### 2.3 入驻认证及合规审核 — Verification and compliance review

> 资质认证背景 — 为什么要进行资质认证？

| 审核环节 | 目标 |
|---|---|
| 企业/个人主体认证 — 证明"我是我" | 确认身份的真实性与合法性：确认开发者是否是真实存在的个体或公司组织。对接法律责任与合规监管：TT 作为平台方，需要能在必要时找到责任主体。防止刷号和滥用开发者资源：使用多个假身份注册大量账号，滥用 API 等资源；提交恶意或低质量应用扰乱平台生态（如通过 Posting API 大量发布黑灰产内容）。教育/研究用途需验证组织的真实性：Research API 等仅开放给研究机构的 API，能获取 TT 的全部公开视频、评论和账号信息，必须验证主体的真实性 |
| USDS 审核（仅美国地区）— 证明"我能拿美国地区数据" | 保证 US 用户数据合规开放：需要根据开发者主体所在国，判断能否获取 US 用户数据，因此 USDS 内部也需要走【开发者主体认证】流程。如果开发者主体（包含注册主体、公司经营地点、控股人等）来自受限国家名单，且开发者想在 US 发布 App —> 无法通过 USDS 审核，将无法上架 US 地区。如果开发者主体不在受限国家名单，USDS 部门会根据开发者希望获取的用户数据类型（是否为受保护数据）以及开发者公司的数据安全能力（系统渗透测试报告）判断是否能通过审核（请开发者及时关注，并配合完成问卷填写） |
| 行业经营资质 — 证明"我能做这个行业" | 确认是否有行业经营许可：如教育、医疗、媒体等行业，需要行业经营许可证才能准入；如越南地区，需要版号才可以上架 Minis。开发者可在这个环节设置准入门槛：开发者需要提交已发布在其他平台的 Minis 链接；若该作品链接的发布主体和 identity verification 中的主体不一致，请上传 PDF，提供证明材料（如研发公司授权邮件） |

**2.3.1 主体认证 - 企业认证**

> 为了确保开发者体验的安全性，开发者组织在门户创建账户时，需要验证机构身份并提供详细文件和认证。请注意，未来商家资质验证对于发布小游戏和短剧以及使用变现功能将是强制性要求。
>
> 关于认证具体操作、文件要求以及注意事项，您可以参考文档完成企业认证，通常 3 个工作日内完成审查。
>
> 为完成验证，您需要以电子方式提交 1）贵公司的营业执照或业务认证文件；2）您的主要或法定代表人的政府签发带照片的身份证明；3）您的主要代表人的授权证明。

*(A synced block with document links appears here and could not be retrieved.)*

**2.3.2 合规审查（非常重要，尽早完成！）— Compliance review (very important, complete early)**

> 有关美国地区业务运营的合规要求与相关限制，涵盖受限国家管控、实体准入限制、敏感数据规范及第三方风险管理（TPRM）问卷等全部细则内容，Org Admin 与 Org Owner 签署保密协议后可查阅以下文档了解：`https://developers.tiktok.com/doc/data-access-compliance-requirements`。
>
> **2026年8月8日后，在欧美地区上线 IAA 和 IAP 小程序，都需通过 EIS 合规审查。**
>
> 关于 EIS：
> - 审查目标：EIS 计划的目标是降低与第三方进行信息共享相关的风险。
> - 审查必要性：通过 EIS 流程进行的尽职调查，可确保第三方有能力收集、保留和管理字节跳动的数据，同时不会让用户面临风险。
> - 审查范围：审查对象包含所有涉及信息共享的第三方，范围包含所有共享信息，其中分为个人信息（涉及识别、关联、描述、联系、直接或间接链接个人或其设备的信息）和其他。
> - 如何实现：TikTok 平台部署了一个由安全、隐私和法务相关人员组成的团队，来审查每一项信息共享活动，识别潜在风险，实施降险措施，并验证第三方开发者是否有能力管理相关信息。
> - 规范要求：详细的规范细则暂无法公开，可能涉及相关信息的收集、披露与使用是否符合法律法规与平台政策等。
>
> 系统提交前请务必联系您的直客经理，前置填写信息收集问卷，充分减少拒审风险后再提交系统审查。

*(A board diagram and a synced block accompany this section and could not be retrieved.)*

**2.3.3 行业准入审核 — Industry access review**

| 步骤 | 说明 |
|---|---|
| STEP1 完成企业认证之后，需要提交 Minis 行业准入申请 | 行业资质审核一般在 1–3 个工作日内完成审核 |
| STEP2 根据 Minis 类型提交审核所需字段 | 代表作品链接；身份证明：若该作品链接的发布主体和 identity verification 中的主体不一致：如果同集团下的不同主体，请提供证明材料；如果是代理发行请提供授权文件（如研发公司授权邮件）的 PDF 文件；如果无官方授权文件/邮件，可参考授权文件 PDF 示例 |

#### 2.4 合同签署 — Contract signing

> 目前线上合同签署能力已经上线，开发者可以通过 Dev Portal 自动完成协议确认与签署操作，平台将合同和变现优化为线上化流程。更多详情参考：TikTok for Developers

| 步骤 | 说明 |
|---|---|
| STEP1: 确认前置条件已完成 | 需要开发者确认自己已经完成企业资质认证；如果还未完成前置条件，无法进行合同签署和变现功能开通 |
| STEP2: 开通 IAP 以及合同签署 | 在 developer portal 上点击 Monetization 按钮，点击 Enable 开通 IAP，会自动弹出合同模板，阅读之后点击 submit 完成合同签署。**自 26 年 7 月 9 日起，IAA 功能将支持在 dev portal 上自主开通，无需联系客户经理加白** |
| STEP3: 阅读条款，确认无误后进行勾选签署 | 请确保滑块滑动到底部，同时勾选已阅读的选项，然后点击 submit 完成签署 |
| STEP4: 完成合同签署 | 合同签署完成后代表 IAP 能力已经开通完成 |

#### 2.5 App 基础信息配置 — Basic information configuration

> 入口：侧边导航栏点击 "basic information"

填写项和说明：

| 字段 | 要求 | 是否要审核 | 是否支持多语言 |
|---|---|---|---|
| 应用图标 | 向用户展示的应用图标：PNG、JPEG、JPG、BMP；600 × 600 像素，不超过 6 MB；不得包含圆角、水印或二维码；不得侵犯知识产权或包含非法内容；图片必须清晰；不得包含任何敏感或不当内容，如彩票、赌博、堕胎、暴力、毒品、色情等成人内容，以及阴谋论、恐怖主义等可能具有负面影响或有害的内容；不得与其它知名品牌图标轻易混淆；必须与应用名称或品牌保持一致 | 是 | 是 |
| 应用名称 | *(row content is beyond the retrievable portion)* | | |

*Retrieval ends here. The remaining field rows and all sections after 2.5 require an authenticated Feishu session.*
