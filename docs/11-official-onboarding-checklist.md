# 11. TikTok Minis / Mini Drama 官方 Onboarding 可执行对照表

> 工作槽：W1A（官方规范落地文档）
> 检索日期：2026-08-27
> 状态：W1 架构与方案阶段，仅文档，不含业务代码。

## 0. 来源说明与阻塞标注

### 0.1 用户 PDF：阻塞（BLOCKED）

- 已检索仓库工作区（`/workspace`，含全部子目录 `**/*.pdf`）与代理持久存储（`/cursor/stores/self`），**均未找到用户提供的官方要求 PDF**。
- 处置：本文档全部依据 TikTok 官方公开网页（developers.tiktok.com、ads.tiktok.com）整理，逐条附来源链接。
- 后续动作：若用户补充 PDF，需按 PDF 逐条 diff 本对照表，差异处以 PDF（通常为商务侧最新口径）为准并回写本文档。

### 0.2 官方公开来源清单（本文引用编号）

| 编号 | 文档 | URL | 官方更新日期 |
| --- | --- | --- | --- |
| S1 | Mini Dramas Integration Workflow | https://developers.tiktok.com/docs/en/tiktok-minis-integration-workflow | 2026-08-04 |
| S2 | Prepare Your Developer Account | https://developers.tiktok.com/docs/en/perpare-your-developer-account | — |
| S3 | Industry Qualification Review | https://developers.tiktok.com/doc/industry-qualification-review | 2026-08-04 |
| S4 | Basic Information Specifications | https://developers.tiktok.com/doc/tiktok-minis-basic-information-specifications | 2026-08-04 |
| S5 | Develop Your Mini Drama | https://developers.tiktok.com/docs/en/tiktok-minis-develop-your-mini-app | 2026-08-04 |
| S6 | Release Your Mini Drama | https://developers.tiktok.com/doc/tiktok-minis-release-your-mini-app | 2026-08-04 |
| S7 | TikTok Minis Server APIs Overview | https://developers.tiktok.com/docs/en/minis-server-apis-overview | — |
| S8 | Silent Login 实现指南 | https://developers.tiktok.com/doc/tiktok-minis-silent-login | — |
| S9 | In-App Ads: Rewarded Ads | https://developers.tiktok.com/docs/en/tiktok-minis-in-app-ads | — |
| S10 | In-App Purchases: TikTok Beans | https://developers.tiktok.com/doc/tiktok-minis-in-app-purchases | — |
| S11 | Publish Mini Dramas（TikTok for Business） | https://ads.tiktok.com/help/article/how-to-publish-your-mini-drama-content | — |
| S12 | Minis Preparation Stage（Minis 通用/较早版本） | https://developers.tiktok.com/doc/minis-preparation-stage | — |
| S13 | TikTok Minis SDK Get Started | https://developers.tiktok.com/docs/en/minis-sdk-get-started | 2026-08-04 |

> 注意：S12 属于 Minis 较早/通用文档，与 S4 在「可上线区域」等字段有出入（见 §7 澄清事项）。冲突时以 Mini Drama 专属新文档（S1/S4/S5/S6）为准。

### 0.3 官方两条发行路径（S11）

| 路径 | 形态 | 适用 |
| --- | --- | --- |
| Mini Program（TikTok Minis） | H5 web app，运行于 TikTok Mini Center，自建播放器/付费墙 | 本项目采用，本文全部内容围绕此路径 |
| TikTok Drama Center（Business Account） | 以 TikTok 广告平台账户直传剧集视频 | 备选，不在 W1 范围 |

---

## 1. 总体流程（官方 6 阶段，S1）

```text
阶段A 账号注册 → 阶段B 合规审核 → 阶段C 应用配置 → 阶段D 开发调试 → 阶段E 发布 → 阶段F 发布后运营
```

各阶段的可执行核对表见下。「状态」列约定：`[ ]` 未开始 / `[~]` 进行中 / `[x]` 完成 / `[!]` 阻塞。

---

## 2. 阶段 A：账号注册（S1 / S2）

| # | 核对项 | 要求细节 | 责任角色 | 状态 |
| --- | --- | --- | --- | --- |
| A1 | 注册 TikTok for Developers 开发者账号 | developers.tiktok.com 注册 | 商务/管理员 | [ ] |
| A2 | 创建 Organization（组织） | Developer Portal → My organizations → Create organization；**必须使用企业实体全称**（将对用户展示） | 管理员 | [ ] |
| A3 | 添加组织成员 | 成员可访问组织下应用；部分设置仅限组织 admin；创建者自动为 admin | 管理员 | [ ] |
| A4 | 创建 App（代表本 mini drama 应用） | Manage apps → Connect an app → 选组织为 owner → 填 App name → 选应用类型 | 管理员 | [ ] |
| A5 | 记录三元组凭据 | App ID / Client key / Client secret（后续 SDK 初始化与 Server API 必需） | 技术负责人 | [ ] |

---

## 3. 阶段 B：合规审核（S1 / S2 / S3）

### 3.1 企业资质验证（Business Verification，组织级）

| # | 核对项 | 要求细节 | 状态 |
| --- | --- | --- | --- |
| B1 | 提交企业认证材料 | 提供注册企业的详细文件与证书；**变现（monetization）强制要求**；仅组织 admin 可操作 | [ ] |

### 3.2 行业资质审核（Industry Qualification Review，一次性，组织级，S3）

前置：必须先完成 B1 企业认证；认证实体将被引用比对。

| # | 核对项 | 要求细节 | 状态 |
| --- | --- | --- | --- |
| B2 | 公司介绍（仅短剧类要求） | 成立日期、主营业务、人员构成（总人数/岗位类型/各岗位人数）、公司官网、补充材料；越详细越利于评审 | [ ] |
| B3 | 代表作短剧可播放链接 | 来自其他平台（Google Play / App Store / 微信小程序 / 抖音小程序等）的可播放链接；官方给出各平台取链接方法 | [ ] |
| B4 | 主体一致性证明（条件触发） | 仅当链接归属实体 ≠ 已认证实体时需要。二选一：① 两实体营业执照（法人相同）；② 开发方出具的**盖章授权书**（授权认证实体在 TikTok 发行运营）。上传 1 个 PDF，≤10 MB 且 ≤30 页 | [ ] |
| B5 | TikTok 客户经理邮箱（如有） | 仅接受 `@bytedance.com` 官方邮箱 | [ ] |
| B6 | 在 Portal 提交表单 | My organizations → Business → Industry qualification → Apply；仅组织 admin 可见可提交 | [ ] |
| B7 | 跟踪审核结果 | 官方 1–3 个工作日；结果三态：Approved / Couldn't verify（可改后重提）/ Rejected（联系代表或提工单） | [ ] |

### 3.3 美国上线审批（条件触发：目标区域含 US）

| # | 核对项 | 要求细节 | 状态 |
| --- | --- | --- | --- |
| B8 | 提交 US Launch Approval 申请表 | Developer Portal 内专用表单（S1/S6 引用「US Launch Approval Process」） | [ ] |
| B9 | USDS TPRM 供应商合规问卷 | 美国数据安全（USDS）第三方风险审查，含最终受益所有权（UBO）等评估；第三方渠道口径约 15–30 个工作日（非官方 SLA，需以官方沟通为准） | [ ] |

---

## 4. 阶段 C：应用配置（Developer Portal，S4 / S5）

### 4.1 基本信息（Basic Information，提交后官方逐项审核，发版前必须过审）

| # | 字段 | 硬性规格（S4） | 状态 |
| --- | --- | --- | --- |
| C1 | App icon | PNG/JPEG/JPG/BMP；600×600 px；≤6 MB；不得圆角/水印/二维码；不得侵权、违法、敏感内容；不得与知名品牌混淆；须与应用名/品牌一致 | [ ] |
| C2 | App name | ≤50 字符；不得含敏感词（赌博、暴力、毒品、阴谋论等）；不得仿冒知名应用名（如 TikTok/Tik Tok/T1kTok 及 Tik/Tok 拼接）；须与描述一致 | [ ] |
| C3 | Description | ≤500 字符；说明应用功能与玩法；须符合 TikTok 社区准则与开发者服务条款 | [ ] |
| C4 | Terms of Service URL | 对用户展示于加载页 | [ ] |
| C5 | Privacy Policy URL | 对用户展示于加载页 | [ ] |
| C6 | Service domains | 从 ToS / 隐私政策 URL 中提取自有平台域名并登记 | [ ] |
| C7 | 最低支持 SDK 版本 | 选定 Minis SDK 最低版本；用户端库版本低于该值时会提示升级 TikTok App；参照 SDK Changelog | [ ] |
| C8 | Release regions | 见 §4.3 区域要求表 | [ ] |
| C9 | 版权内容自查表 | 必须签署 copyright content self-inspection form，声明符合版权法 | [ ] |
| C10 | Apple Team ID | 必填；供 iOS 用户访问 mini drama；从 Apple Developer「Membership details」获取 | [ ] |
| C11 | 联系邮箱 | 用户申诉联络邮箱；**必须完成双因素验证** | [ ] |
| C12 | 提交并通过审核 | Submit 后官方逐字段审；后续修改走 Edit → Submit changes 单项复审 | [ ] |

### 4.2 可信域名（Trusted domains，S4 / S5）

| # | 核对项 | 要求细节 | 状态 |
| --- | --- | --- | --- |
| C13 | 注册可信域名 | App 页 → Development configuration → Security；**上限 20 个**；必须以 `https://` 或 `wss://` 开头；不得含通配符或路径；未登记域名的跨域请求会被 TikTok 客户端拦截 | [ ] |

### 4.3 区域特殊要求（S4）

| 区域 | 额外要求 |
| --- | --- |
| 巴西、印尼、日本、马来西亚、菲律宾、沙特、泰国、土耳其 | 无 |
| 美国 | 须获得 TikTok 的 US 上线批准（见 §3.3） |
| 越南 | 须持有越南信息通信部 G1 网络游戏牌照 |

### 4.4 多语言（可选）与变现开通

| # | 核对项 | 要求细节 | 状态 |
| --- | --- | --- | --- |
| C14 | 配置本地化语言（可选） | Configure Localization；注意发布审核要求**应用必须兼容英文**（S6） | [ ] |
| C15 | 开通变现能力（IAA/IAP） | 仅组织 admin 可开通；须完成企业认证、签署相关电子合同并获 TikTok 批准后方可集成 | [ ] |
| C16 | IAA 配置 | 创建并激活广告位（rewarded / interstitial），获取广告位唯一标识 | [ ] |
| C17 | IAP 配置 | 配置支付 webhook 回调 URL，接收 TikTok 服务端交易事件推送 | [ ] |

---

## 5. 阶段 D：开发与调试（S5 / S13 / S8）

技术细节与桥接设计见 `docs/11-api-and-bridge.md`，此处只列合规核对项。

| # | 核对项 | 要求细节 | 状态 |
| --- | --- | --- | --- |
| D1 | 项目形态 | 标准 H5 web 项目（`index.html` + 前端框架 + 构建产物），运行于 TikTok App 内 WebView；**不要照搬其他平台小程序概念**，官方定位 = Web App + 客户端 JSAPI + CLI 工具链 | [ ] |
| D2 | 安装 CLI | `npm install tiktok-minis-cli -g --registry=https://registry.npmjs.org/`；`minis -v` 验证（文档示例输出 0.0.4） | [ ] |
| D3 | SDK 初始化 | `index.html` 引入 `https://connect.tiktok-minis.com/drama/sdk.js` 并 `TTMinis.init({ clientKey })`；所有其他 SDK 方法必须在 init 之后调用 | [ ] |
| D4 | 必接能力：静默登录 | `TTMinis.login` + 后端 `POST /v2/oauth/token/`（必须，代码扫描会查登录实现） | [ ] |
| D5 | 必接能力：激励视频广告 | `TTMinis.createRewardedVideoAd`（必须；需 IAA 已开通） | [ ] |
| D6 | 必接能力：插屏广告 | `TTMinis.createInterstitialAd`（必须；需 IAA 已开通） | [ ] |
| D7 | 必接能力：Beans 一次性支付 | Server 建单 `/v2/minis/trade_order/create/` + `TTMinis.pay`（必须；需 IAP 已开通） | [ ] |
| D8 | 必接能力：订阅 | `/v2/minis/subscription/create/` + `TTMinis.createSubscription`（必须；需 IAP 已开通） | [ ] |
| D9 | 必接能力：导航栏 | `TTMinis.setNavigationBarColor` + `TTMinis.getMenuButtonBoundingClientRect`（必须） | [ ] |
| D10 | 可选能力：显式授权 | `TTMinis.authorize` + `/v2/user/info/`（获取昵称头像等，需用户同意，非必须） | [ ] |
| D11 | Android 真机调试 | 需向 TikTok 运营对接人或工单申请**测试版 TikTok 客户端** | [ ] |
| D12 | iOS 真机预览 | 上传构建产物至 Portal，扫预览二维码（需先加测试用户） | [ ] |
| D13 | 构建校验 | 业务构建（如 `npm run build`）后执行 `minis build` 按平台要求校验并打包产物 | [ ] |
| D14 | 沙箱测试（可选，推荐） | App 页 Create Sandbox，隔离环境调试，调完可导入生产配置（S12） | [ ] |

---

## 6. 阶段 E：发布（S6）与阶段 F：发布后（S1）

### 6.1 发布前置（全部满足才能进入发布流程）

| # | 前置 | 状态 |
| --- | --- | --- |
| E1 | 组织已通过企业认证（§3.1） | [ ] |
| E2 | 组织已通过行业资质审核（§3.2） | [ ] |
| E3 | 应用基本信息已提交并过审（§4.1） | [ ] |
| E4 | 全部必接能力已集成（§5 D4–D9） | [ ] |

### 6.2 代码包扫描硬性要求（不满足可能直接无法上传）

| # | 要求 | 状态 |
| --- | --- | --- |
| E5 | ZIP 包 ≤ 200 MB，包含目录内全部文件 | [ ] |
| E6 | 必须已实现 TikTok Login API 功能 | [ ] |
| E7 | 不得含空文件（0 字节） | [ ] |
| E8 | 限制动态引入脚本的来源（防绕过平台审核与任意更新） | [ ] |
| E9 | 限制运行时 API 请求来源：仅本地配置文件中声明的域名的请求有效 | [ ] |

### 6.3 上传 → 预览 → 送审 → 放量

| # | 核对项 | 要求细节 | 状态 |
| --- | --- | --- | --- |
| E10 | 上传 preview 版本 | Code version → Upload code asset；**最多 30 个 preview 版本**；建议填版本备注 | [ ] |
| E11 | 真机预览 | 需已添加测试用户；用测试用户 TikTok 账号扫码 | [ ] |
| E12 | 送审 | Submit for review；选择「人工发布」或「过审自动发布」 | [ ] |
| E13 | 发布类型 | Push to production（全量；**首发必须全量**）或 Gray release（灰度；需已有生产版本，灰度比例须大于当前比例） | [ ] |
| E14 | 英文兼容 | 审核会交叉核对基本信息；**应用必须兼容英文**才能过审 | [ ] |
| E15 | 线上版本上限 | 同时最多 2 个在线版本：1 生产 + 1 灰度，两者流量合计恒为 100%；生产版本必须保持在线 | [ ] |
| E16 | 区域发布确认 | US 需上线批准；其他区域按 §4.3 | [ ] |

### 6.4 发布后（S1；第三方渠道口径见注）

| # | 核对项 | 要求细节 | 状态 |
| --- | --- | --- | --- |
| F1 | 收入结算 | Revenue 页确认结算单（Manage Revenue Settlement）；第三方渠道口径：IAP 月结、IAA 双周结（需官方合同确认） | [ ] |
| F2 | 发票与打款 | 上传已结算收入的发票以收款（Process Invoices and Payouts）；**收款主体必须与认证企业主体完全一致**，否则结算失败 | [ ] |

---

## 7. 澄清事项 / 风险登记

| # | 事项 | 影响 | 处置建议 |
| --- | --- | --- | --- |
| R1 | 用户 PDF 缺失（§0.1） | 可能与商务侧最新口径有偏差 | **阻塞项**。取得 PDF 后逐条 diff 本表 |
| R2 | S12（Minis 通用旧文档）称区域仅日本/美国、图标 1024×1024，与 S4（短剧新文档）8+ 区域、600×600 不一致 | 配置素材规格与区域计划 | 以 S4 为准；素材同时备 600×600 与 1024×1024 两套成本极低，建议都备 |
| R3 | Minis 部分能力需向 TikTok 对接人（POC）报备 App ID/Client key/Secret/Org 信息开通，最长 24h（S12） | 排期依赖商务对接人 | 尽早建立 TikTok 运营/商务联系；无对接人则走工单 |
| R4 | US 审批（TPRM）第三方口径 15–30 工作日，官方未公开 SLA | 若首发含美国市场，是最长链路 | 将 US 审批作为最早启动的并行线 |
| R5 | Android 测试客户端需线下申请（S5） | 真机联调排期 | 与 R3 一并向对接人申请 |
| R6 | 官方称部分文档存在 Minis 通用（mini game 措辞）与 mini drama 专属混用 | 个别字段口径 | 落地时逐项在 Portal 实测为准，回写本表 |
| R7 | 变现前置链条长：企业认证 → 行业资质 → 开通 IAA/IAP → 签合同 → 审批 → 才能集成 | 支付/广告联调时间 | 按 §3→§4.4 顺序尽早推进，技术侧先以桥接抽象打桩（见 11-api-and-bridge） |

---

## 8. 与本仓库的映射（占位说明，W1 不写业务代码）

| 官方要求 | 本仓库未来落点（占位） |
| --- | --- |
| H5 项目 + `index.html` + 构建产物 | `app/`（W2+ 创建，前端工程） |
| SDK 初始化 / 平台桥接 | `app/src/platform/`（桥接层，接口定义见 `docs/11-api-and-bridge.md` §5） |
| 后端 OAuth / 订单 / webhook | `server/`（W2+ 创建） |
| ToS / 隐私政策 URL | 待商务提供正式 URL；开发期可用占位链接（S5 明确允许临时占位链接，避免登录报错） |
| 可信域名清单 | `docs/`（域名规划表，随后端域名确定后补） |
