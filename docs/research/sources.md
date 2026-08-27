# Source Register — Wave 1 Official Research

> **Slot:** Wave 1 · official research (W1 WORK SLOT 1), branch `cursor/w1-research-official-bb4f`.
> **All retrievals:** 2026-08-27.
> Every factual claim in `docs/research/one-page-feishu.md`, `docs/research/tiktok-minis-official.md`
> and `docs/research/gaps.md` traces to a row in this register. Sources are graded so a reader can
> tell a platform commitment from a screenshot caption.

---

## 1. Grading

| Grade | Meaning |
|---|---|
| **A** | Primary, first-hand, retrieved in full this session. Quotable. |
| **B** | Primary but partial — the page was retrieved, but some content is image-only or was truncated. |
| **C** | Referenced by an A/B source but **not retrieved** (access-gated, or another Lark document). Its existence and title are known; its contents are not. |

---

## 2. Primary source — the Feishu One Page

| ID | Source | Grade | Notes |
|---|---|---|---|
| **S-OP** | 小程序短剧接入 One Page // Mini Drama Onboarding One Page — <https://bytedance.larkoffice.com/wiki/MJ2BwFqSxi4r2SkwHS8cRrlsnVb> | **B** | Retrieved 2026-08-27; page header read "Modified Today". Contains a full Chinese version and a full English version that differ in substance (see `docs/research/one-page-feishu.md` §13). Text captured in full; **images, whiteboards and attachments not captured** |

**Retrieval method, recorded so the result is reproducible and its limits are visible.** A plain
HTTPS GET to the wiki URL returns `302` to
`accounts.larkoffice.com/accounts/page/login?...&with_guest=1`; following redirects with a cookie jar
establishes an anonymous guest session (`is_anonymous_session=1`) and returns the SSR shell. The
shell carries the document object token `LP04d7IrUocVhGxTuM0lbMdCgzd` but not the body; the Lark
`/space/api/docx/...` content endpoints reject the guest session with `302`. The document body is
rendered client-side into a **virtualised DOM**, so any single snapshot yields only the first screen.

The capture was therefore done with a headless Chromium session that scrolled the document container
top to bottom in ~45%-viewport steps, harvesting every `[data-block-id]` node on each step and
recording first-seen order. That produced **2,640 blocks over a ~100,000 px document**, reduced to
**365 distinct content blocks (~103 KB)** after collapsing the parent/child text duplication that
Lark's DOM produces for tables, lists and callouts. The scroll terminated on a stable scroll
position, and section numbering is continuous from §1 to §7 in both language versions, which is the
evidence that nothing in the middle was skipped.

**Known capture losses** (enumerated in `docs/research/one-page-feishu.md` §15): 12 images, 14
whiteboard/flow diagrams, 4 file attachments, and the Google Play platform-fee figure in §6.1.1,
which exists only as an image.

### 2.1 Documents referenced *by* the One Page but not retrieved

These are all separate Lark documents or access-gated pages. They are listed because they are the
next things to read, not because anything here relies on them.

| ID | Title as cited | Grade | Why it matters |
|---|---|---|---|
| S-OP-1 | 短剧媒资库和播放器接入说明 / Mini Drama Media Library & Player Integration Guide | C | The authority on the BytePlus + VePlayer pilot; needed to resolve gap G-R1 |
| S-OP-2 | TTOP Official Website Document for Short Drama Playback / TTOP 短剧播放官网文档 | C | Player integration |
| S-OP-3 | TikTok 小程序短剧媒资库接入文档 | C | Media asset library integration |
| S-OP-4 | 资质校验一站式入驻指南【开发者查看版】 | C | Entity certification walkthrough |
| S-OP-5 | Data access compliance requirements — <https://developers.tiktok.com/doc/data-access-compliance-requirements> | C | **NDA-gated**, Org Admin/Owner only. The authority on restricted countries, entity access limits, sensitive-data standards and the TPRM questionnaire |
| S-OP-6 | TikTok Minis 技术形态说明 | C | Superseded for us by the public *Develop Your Mini Drama* page (S-PD-1) |
| S-OP-7 | TikTok Minis 开发调试指南 / Development Debugging Guide | C | Debugging; partially covered by S-PD-8 |
| S-OP-8 | TikTok Minis 静默登录（login）能力接入说明 | C | Covered in substance by S-PD-8 and S-OP FAQ |
| S-OP-9 | TikTok Minis 显示授权（authorize）接入指南 | C | Same |
| S-OP-10 | TikTok Minis 端内支付能力接入指南 | C | Covered in substance by S-PD-5 and S-PD-6 |
| S-OP-11 | TikTok Minis 订阅完整接入指南 | C | **The likely home of the subscription webhook events (U-08 / gap G-R6)** |
| S-OP-12 | API Schema【IAP 小程序充值面板金额展示】 | C | Recharge panel amount display |
| S-OP-13 | TikTok Minis 激励视频广告接入指南 / 插屏广告接入指南 | C | Public equivalents retrieved as S-PD-3 and S-PD-4 |
| S-OP-14 | Generate Minis Link Open API | C | **Batch deep-link creation — relevant to U-13** |
| S-OP-15 | [Minis-Series] 中间事件回传对接指南 / Middle Funnel Event Postback Guideline | C | Marked *Required* for advertising |
| S-OP-16 | TikTok Minis Series｜High, Medium, and Low Recharge Panels | C | Marked *Required to Connect* for advertising |
| S-OP-17 | TikTok Minis Assets Registration Process｜资产登记与投放流程 | C | BC asset registration before Minis Ads |
| S-OP-18 | 【Mini Series Ads - IAP / IAA】Q1 Product Test【对外版】; CNOB 短剧｜Minis Ads 产品建议; [External] 使用 API 创建 Smart+ 短剧商品库广告; Create an Upgraded Smart+ TikTok Minis Campaign via API | C | Ad campaign construction |
| S-OP-19 | 结算地区分类 / Classification of Settlement Regions; 我方对应打款主体及开票信息 | C | Region→entity mapping for invoicing; the three entities themselves are captured in S-OP |
| S-OP-20 | 美国上线审核申请 (US launch review application) | C | US launch gate |
| S-OP-21 | 《基础库更新日志》 (basic library changelog) | C | **Needed to choose the minimum supported library version (U-20)** |
| S-OP-22 | 行业准入审核授权书参考模板.pdf (138.67 KB); Letter of Authorization.docx | C | Attachments; templates for industry-qualification and representative authorisation |
| S-OP-23 | Support portal — <https://developers.tiktok.com/portal/support> | A | The escalation route: support page or AI-bot → human ticket |

---

## 3. Public TikTok for Developers documentation

All retrieved 2026-08-27. "Updated" is the page's own last-updated stamp.

| ID | Page | URL | Updated | Grade | What it was used for |
|---|---|---|---|---|---|
| S-PD-1 | Develop Your Mini Drama | <https://developers.tiktok.com/docs/en/tiktok-minis-develop-your-mini-app> | 2026-08-04 | A | Required-capability table; the `TTMinis.*` namespace; drama CLI (`tiktok-minis-cli`, `minis -v` ⇒ 0.0.4); Android test client / iOS QR asymmetry; Web App + JSAPI + CLI mental model |
| S-PD-2 | TikTok Minis Player | <https://developers.tiktok.com/docs/en/minis-player> | 2026-08-04 | A | VePlayer mandate and blocked-UI replacement; `getPlayer(channel)`; constructor options and `ignores`; `playNext`; events; `play_token` endpoint; **preload compatibility and configuration**; `setValidateVideoReplaceElement`; subtitles |
| S-PD-3 | In-App Ads: Rewarded Ads | <https://developers.tiktok.com/doc/tiktok-minis-in-app-ads> | 2026-08-04 | A | **TikTok ≥ 44.2.0**; TikTok Pro Android unsupported; placement creation and activation; single-use instances; `isEnded`; **absence of any server-side reward verification** (U-18) |
| S-PD-4 | In-App Ads: Interstitial Ads | <https://developers.tiktok.com/doc/tiktok-minis-in-app-ads-interstitial-ads> | 2026-08-04 | A | `createInterstitialAd`; `canIUse` version gate; no reward semantics; graceful-degradation requirement; frequency control is the developer's job |
| S-PD-5 | In-App Purchases | <https://developers.tiktok.com/doc/in-app-purchases> | 2026-08-04 | A | Full IAP flow; **webhook validation and processing order incl. the 5-minute window**; webhook event table and payloads; `is_sandbox`; the 2 s × 12 polling reference; anti-tampering rule. **Mini-games page — uses `TTMinis.game.*`** |
| S-PD-6 | Payment APIs | <https://developers.tiktok.com/doc/minis-payment-apis> | 2026-08-19 | A | `get_tier_infos`, `trade_order/create`, `trade_order/query` (**`PENDING` \| `SUCCESS` only**), `check_redeem_amounts`; full request/response field tables |
| S-PD-7 | Set Up Development Configuration | <https://developers.tiktok.com/doc/set-up-development-configuration> | 2026-08-04 | A | **≤20 trusted domains, https only, no wildcards or paths**; webhook callback URL and Test URL button; **URL ownership verification by domain or prefix** |
| S-PD-8 | Development Stage | <https://developers.tiktok.com/doc/minis-development-stage> | 2026-08-04 | A | Runtime restrictions (eval/Function/string timers/iframe/self-src/blocked web APIs); **`minis.config.json` parameter table**; games CLI (`@tiktok-minis/cli`, `ttdx minis`); `minis.manifest.json`; login/authorize signatures; **24-hour access token**; webhook envelope; "use standard browser capabilities" for environment data |
| S-PD-9 | Media Asset Management | <https://developers.tiktok.com/doc/media-asset-management> | 2026-08-04 | A | **Two-tier moderation SLA (normal 2 weeks / urgent 1–3 working days, 35 shows per org per day)**; **per-version playability blast radius**; BytePlus AK/SK binding rules; one-space-per-drama; many-to-many app↔account; ingest formats and 20 GB limit; playback-failure handling |
| S-PD-10 | Webhooks Overview | <https://developers.tiktok.com/doc/webhooks-overview> | — | A | 200-immediately rule; **72-hour exponential-backoff retry**; at-least-once delivery and the idempotency requirement |
| S-PD-11 | Webhooks Verification | <https://developers.tiktok.com/doc/webhooks-verification> | 2026-08-04 | A | **`Tiktok-Signature: t=…,s=…`; `signed_payload = t + "." + body`; HMAC-SHA256 keyed with `client_secret`; timestamp tolerance.** This is the source that closes U-07 / blocker B-2 |
| S-PD-12 | Get Started (Minis SDK) | <https://developers.tiktok.com/docs/en/minis-sdk-get-started> | 2026-08-04 | A | `TTMinis.init({ clientKey })`; "all other SDK methods must be called after this one, because they won't exist until you do" |
| S-PD-13 | Mini Games SDK Overview | <https://developers.tiktok.com/docs/en/mini-games-sdk-overview> | 2026-08-04 | B | The `TTMinis.game.*` API inventory — `canIUse`, `request`/`RequestTask.abort`, **`onShow`/`offShow`** and the background counterpart, `getMenuButtonBoundingClientRect`. Retrieved via search-result excerpt after a direct fetch hit a rate limit, so graded B |
| S-PD-14 | UI (Mini Games SDK) | <https://developers.tiktok.com/docs/en/mini-games-sdk-ui> | 2026-08-04 | B | `getMenuButtonBoundingClientRect()` return shape (`width`, `height`, `top`, `right`, `bottom`, `left`, px from the top-left of the screen). Same retrieval caveat |

### 3.1 Pages cited by the existing Wave 1 documents and not re-retrieved here

`docs/architecture/system-overview.md` §15 lists several further pages — Mini Dramas Integration
Workflow, Release Your Mini Drama, Media Asset API Reference, Basic Information Specifications,
Industry Qualification Review, Prepare Your Developer Account. This slot did not re-fetch them
because nothing in the One Page contradicts the architecture document's use of them. They remain
valid A-grade sources under that document's own retrieval date of 2026-08-27.

---

## 4. Internal documents this research reads against

Not sources of platform truth — these are the artefacts the research is reconciled with. **No file in
this list was modified by this slot.**

| Document | Branch | Read for |
|---|---|---|
| `docs/architecture/system-overview.md` | `cursor/w1-architecture-bed5` | Corrections A1–A6, open items O-1…O-7, the media and playback design being checked |
| `docs/architecture/tech-stack.md`, `docs/architecture/risks.md` | same | Blockers B-1…B-4 |
| `docs/design/minis-integration.md` | `cursor/w1-technical-design-docs-8a32` | **The U-01 – U-22 register**, integration points IP-01…IP-14, open questions Q-MI-1…Q-MI-10 |
| `docs/design/api-contracts.md`, `docs/design/domain-model.md`, `docs/design/player-state-machine.md` | same | Bridge error model, subscription modelling, playback state machine |
| `docs/11-api-and-bridge.md`, `docs/11-official-onboarding-checklist.md` | `main` | Prior official API-surface pass and the onboarding checklist |
| `docs/02-*`, `docs/03-*`, `docs/12-*`, `docs/14-*` | `main` | IA, journeys, NFRs, contracts, quality gates referenced by the findings |

---

## 5. Reproducing the One Page capture

Recorded because a same-day snapshot of a document whose header says "Modified Today" has a short
shelf life, and the next person to check it should not have to rediscover the method.

1. `curl -sL -c jar -b jar <wiki-url>` with a desktop user agent. A `200` and ~1.1 MB of SSR HTML
   confirms the anonymous guest session works; a `302` to `accounts.larkoffice.com` means it does
   not, and the rest will fail.
2. Drive a headless browser (Playwright Chromium is what was used) to the same URL, wait ~18 s for
   hydration, then find the scroll container as the tallest `div` whose `scrollHeight` exceeds its
   `clientHeight`.
3. Step the container's `scrollTop` by ~45% of `clientHeight`, pausing ~650 ms per step, harvesting
   `[data-block-id]` nodes into a first-seen-ordered map on every step. Stop when `scrollTop` stops
   advancing across several consecutive checks.
4. Collapse nesting by dropping any block whose whitespace-normalised text is contained in a longer
   nearby kept block. Without this the output is roughly 2.5× larger and reads as triplicated.

The document height was ~100,000 px and the full pass took ~2.5 minutes. If a future capture returns
substantially fewer than ~365 content blocks, the scroll terminated early and the result is
incomplete.
