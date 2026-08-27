# 03. 技术选型决策（Stack Decision）

> Wave 1 · 计划槽 P3。每项决策给出选择、落选备选与理由（ADR-lite）。架构视图见 `docs/03-tech-architecture.md`，非功能约束见 `docs/03-nonfunctional.md`。
> 选型原则：① 官方可上架优先（11 号文档红线是硬约束）；② 与 12/14 文档零返工兼容；③ TypeScript 全栈单语言，降低小团队维护成本；④ 包体积与 WebView 兼容性敏感（H5 运行于 TikTok WebView）。
> 版本号为 2026-08 时点建议，落地时取当期稳定版，锁定于 lockfile（14-security §8 供应链要求）。

## 1. 决策总览

| # | 层 | 选定 | 主要落选项 |
|---|---|---|---|
| D1 | Minis 运行时/前端框架 | 官方 H5 路径 + React 19 + TypeScript(strict) + Vite | Vue 3、Svelte、Drama Center 直传 |
| D2 | 路由 | react-router（hash 模式） | history 模式 |
| D3 | 播放 | 原生 HLS 优先 + hls.js 兜底；HLS AES-128 | Shaka Player、video.js、裸 mp4 |
| D4 | 状态 | Zustand + TanStack Query | Redux Toolkit、XState、Jotai |
| D5 | i18n | react-i18next | FormatJS |
| D6 | 后端 | Node.js LTS(≥22) + Fastify + TypeBox | NestJS、Go、Express |
| D7 | 数据 | PostgreSQL ≥16 + Redis 7 + BullMQ | MySQL、MongoDB、Kafka |
| D8 | ORM/迁移 | Drizzle ORM + drizzle-kit | Prisma、Knex |
| D9 | 鉴权 | TikTok 静默登录 + 自建 JWT（ES256/jose/KMS 轮换）；Minis 端 token 仅内存态 | Cookie 会话、localStorage 存 refresh token |
| D10 | 支付 | TikTok Beans（唯一渠道）+ 订阅；激励广告解锁 | 任何外部支付（平台不允许） |
| D11 | CDN/媒体 | S3 + CloudFront 签名 URL + MediaConvert 转码 | Cloudflare Stream、自建 nginx |
| D12 | 可观测性 | OpenTelemetry + Grafana Cloud（LGTM）+ Sentry | Datadog、ELK 自建 |
| D13 | 安全工具链 | Semgrep+CodeQL / gitleaks / osv-scanner / trivy / ZAP | —（映射 14 门禁，见 §3） |
| D14 | CI | GitHub Actions | GitLab CI、Jenkins |
| D15 | 仓库 | pnpm workspaces + Turborepo 单仓 | 多仓、npm/yarn |
| D16 | 测试栈 | Vitest / Playwright / Testcontainers / MSW / oasdiff / Stryker | Jest、Cypress、Pact（暂缓） |

## 2. 分项决策

### D1 Minis 运行时与前端框架

**选定**：官方 Mini Program（TikTok Minis，H5 runtime）路径；React 19 + TypeScript strict + Vite 构建；单 `index.html` SPA；`tiktok-minis-cli` 打包校验。

- 发行路径：11-checklist §0.3 已定 Minis 路径，Drama Center 直传为备选不在范围。本槽确认：自建播放器/付费墙能力是变现设计（钱包双账户、整剧解锁、广告解锁）的前提，Minis 路径正确。
- React 而非 Vue/Svelte：14-security §2.1 点名 React JSX 自动转义为 XSS 基线之一；测试生态（RTL/MSW/Playwright 组合成熟）直接满足 14-test-plan 工具默认项；团队可雇佣面最大。Vue 3 同样合格，属平票项，取 React 以定案。
- Vite：产物可控（manualChunks 控首屏 JS 预算）、dev server 与官方 `minis dev` 三层联动兼容（本地端口在 `minis.config.json` 声明）。
- 官方约束落点：`index.html` 头部引 `https://connect.tiktok-minis.com/drama/sdk.js` 并 `TTMinis.init({clientKey})`（11 §2）；构建后跑 `minis build` 校验（D13 核对项）。

### D2 路由：hash 模式

ZIP 静态包由 TikTok 托管，无服务端 rewrite 能力，history 模式深链刷新会 404。hash 模式零配置、深链参数经 deeplink 白名单校验（14-security §2.1 DOM XSS 条款）。

### D3 播放器

**选定**：自封装播放器组件 —— `<video>` + 原生 HLS 探测优先（iOS WKWebView），hls.js（MSE）兜底（Android WebView）；HLS 2s 切片，480p/720p/1080p 阶梯（与 12 §3.3 `VideoAsset.quality` 枚举一致）；付费内容 AES-128 加密 + 密钥接口鉴权。

- 落选 Shaka/video.js：全功能播放器为多 DRM/广告插播设计，体积 100KB+ gzip 起，短剧场景只需 HLS + 倍速/清晰度，hls.js（~90KB gzip，按需懒加载）+ 自绘 UI 更贴竖屏沉浸流交互（E-11）。
- 落选裸 mp4：14-security §5.1 明令付费内容禁止裸 mp4 直链；免费集也统一走 HLS，简化管线与防盗链。
- ABR：hls.js 自动降级满足 E-15 弱网用例；起播档位按网络探测定（首帧预算 G3.3）。
- DRM（Widevine/FairPlay）在 TikTok WebView 内可用性未知，Wave 1 以 AES-128 为下限（14-security 允许「DRM 或至少 HLS AES 加密」），DRM 列入风险 RK-2 待真机验证。

### D4 状态管理

**选定**：TanStack Query（服务端状态：缓存/去重/失效/重试）+ Zustand（客户端状态：播放器状态机、钱包面板、会话）。

- 落选 Redux Toolkit：模板量大，收益在中大型团队协作，本项目页面数少（feed/播放/钱包/我的）。
- 落选 XState：播放器状态机用 Zustand + 显式 reducer 即可测（14-test-plan §1.1 单测要求），XState 增加 15KB+ 与学习成本。
- 关键约定：「能不能看」只信服务端 `viewerAccess`（12 §3.3），客户端 store 不做解锁推导——与 W1B 决策 4 一致。

### D5 i18n：react-i18next

英文必备（官方 E14），首发区域语言按产品槽结论追加；命名空间按 feature 拆分保首屏体积；沙特（ar）RTL 预留。错误 message 由服务端按 `Accept-Language` 下发（见 handoff C9）。

### D6 后端框架

**选定**：Node.js 活跃 LTS（≥22，建议 24）+ Fastify 5 + TypeBox（JSON Schema）。

- TypeScript 全栈：前后端共享 `packages/shared` 的 DTO 类型与错误码枚举（从 `contracts/` OpenAPI 生成），契约漂移在编译期暴露——直接服务 G1.6 契约门禁。
- Fastify + TypeBox 而非 NestJS：TypeBox schema 即运行时校验又可导出 OpenAPI 3.1，实现「契约唯一事实源」闭环（14-test-plan §4.1）；NestJS 的 DI/装饰器体系对本规模是过度抽象。Express 性能与 schema 生态落后，不再考虑。
- 落选 Go：性能冗余（核心 API P95 ≤300ms 目标 Node 足够，瓶颈在 DB/网络），但引入第二语言、失去共享类型收益。
- 进程模型：单容器多副本水平扩展；无状态（会话在 JWT + Redis 吊销名单）。

### D7 数据存储

**选定**：PostgreSQL ≥16（主库）+ Redis 7（缓存/限流/幂等/进度缓冲）+ BullMQ（异步任务）。

- PG 而非 MySQL：两者均可，取 PG 的分区表（埋点 events 按月分区）、`SELECT ... FOR UPDATE` 语义与 JSON 能力；钱包乐观锁 + 单事务解锁编排（12 §6.1）在任一关系库都成立，选型不影响 W1B 模型。
- 不引入 Kafka/消息队列中间件：Wave 1 异步需求（对账、查单补偿、统计快照、进度刷库）均为任务型而非流式，BullMQ（复用 Redis）足够；12 §11 的最终一致场景均可由任务承载。事件契约（14-test-plan §4.1 第 2 条）待真正引入 MQ 时再启用。
- 埋点：PG append-only 分区表起步，量级超阈值（>5000 events/s 持续）迁 ClickHouse，模型不变。

### D8 ORM：Drizzle

SQL-first、零运行时魔法（钱包事务的锁与隔离级别需要精确控制 SQL）、drizzle-kit 生成可审查的迁移文件（G2.7 要求正向+回滚可执行）。落选 Prisma：引擎二进制与生成层在事务细粒度控制上受限；Knex 缺类型推导。

### D9 鉴权

**选定**：

1. **身份源**：TikTok 静默登录唯一（`TTMinis.login` → 后端 `POST /v2/oauth/token/` → `open_id` 唯一主键），显式授权（昵称/头像）按需二次触发——完全按 11 §4.1。
2. **会话**：自建 JWT（access token ≤30min，ES256，`jose` 库，密钥 KMS 托管带 kid 轮换，`alg` 白名单校验）——逐条落实 14-security §3.1。
3. **Minis 端 token 策略**：access token **仅内存态，不落盘**；过期或 WebView 冷启动时执行 `TTMinis.login` 静默重登（无感、免打扰，官方推荐默认）。**客户端不存 refresh token**，从根上满足 14-security §3.2「H5 禁止 localStorage 存长期 token」。契约中的 `POST /auth/refresh`（12 §4.1）保留给未来原生 App/站外 H5 端，Minis 客户端不调用——差异登记 handoff C8。
4. **TikTok access/refresh token**：仅后端持久化（加密落库），到期前定时刷新（11 §4.1 要点）。
5. 吊销：Redis 会话吊销名单 + 短效 access 兜底（封禁/风控实时生效，14-security §3.1）。

落选 Cookie 会话：TikTok WebView 内第三方 Cookie 行为不可控（ITP/清理策略），且跨端一致性差；Bearer 头方案免疫 CSRF（14-security §3.3 亦认可）。

### D10 Beans / 支付 / 变现

**选定**：TikTok Beans 为**唯一**充值渠道（Minis 分发内平台不允许外部支付），订阅承载 VIP，激励广告承载免费解锁。

- 映射到 W1B 模型：`RechargeOrder.paymentChannel` 需新增 `TIKTOK_BEANS`（handoff C2）；`channelOrderId` = `trade_order_id`；Beans→应用内「看点」的兑换由充值档位表配置（官方 S10 明确支持映射为自有虚拟币），钱包双账户与「先赠币后充值币」不变。
- 订单流：后端建单（`/v2/minis/trade_order/create/`）→ `TTMinis.pay` → webhook 验签→幂等→`PAID→CREDITED` 事务入账——11 §4.2 与 12 §5.3 已一致，无返工。
- 定价合规：上架前跑官方 check redeem amounts 端点校验档位（11 §4.2 要点）。
- 对账：每日 TikTok 订单查询 vs 本地订单全量核对 + 未回调订单主动查单（14-security §4.1），BullMQ 定时任务。
- 订阅（VIP）：必接项照做，首发运营主线为「Beans 单点解锁 + 广告解锁」（11 §4.4 W1 决策），订阅状态定时同步 `user.vip`；契约侧订阅端点缺口即 P2 登记的 G4，由 W1B 回写，本选型不受影响。
- 激励广告：`isEnded===true` 才发奖 + 每次新实例 + 服务端发奖日志双轨（11 §4.3 五条最佳实践即验收标准）；建议首发 `features.adUnlock=true`（handoff C10，与 P2 差距 G3 同源）。

### D11 CDN 与媒体管线

**选定**：S3（源片/产物分桶）+ AWS Elemental MediaConvert（HLS 阶梯转码 + AES-128）+ CloudFront（key group 签名 URL，TTL ≤10min，custom policy 通配路径覆盖 m3u8+分片）。

- Origin 区域 ap-southeast-1（新加坡）：居中覆盖首发候选区（ID/TH/PH/MY/JP）；CloudFront 边缘覆盖全部官方发行区（BR/SA/TR 等）。
- 落选 Cloudflare Stream：托管播放器与计费模型（按分钟）对短剧海量小视频不经济，且签名与密钥控制不如自管 HLS 灵活。
- 落选自建：CDN 自建无性价比。
- 密钥接口：AES-128 key 经我方 API 域鉴权下发（不走 CDN 匿名路径）。
- 图片（封面）：同一 CDN 域下发（节省可信域名名额），上传时统一压缩为 WebP 多档。

### D12 可观测性

**选定**：

| 面 | 方案 |
|---|---|
| 链路/指标/日志（后端） | OpenTelemetry SDK → OTLP → Grafana Cloud（Tempo/Mimir/Loki 托管）；`traceId` 注入错误响应（12 §2.5） |
| 错误聚合（前后端） | Sentry；前端经 API 域 tunnel 转发（不新占可信域名名额，且避免 WebView 拦截） |
| 播放 QoE | 自有埋点 `/events/batch`（12 §4.8）：首帧时间、卡顿、起播失败——喂给 G3.3 性能基线与 §5.3 放量熔断指标 |
| 拨测 | 每 5 分钟登录+起播合成探针（14-test-plan §7），Grafana Synthetic/Checkly |
| 告警 | Grafana Alerting → 值班 IM webhook；SLO：可用性 99.9%、核心 API P95 ≤300ms（14 一致） |

落选 Datadog：能力等价但成本曲线陡；落选自建 ELK：运维投入不匹配团队规模。日志全链路脱敏规则（14-security §6.1）在 logger 层统一实现（pino redact）。

### D13 安全工具链（映射 14 门禁）

| 门禁 | 工具 |
|---|---|
| G1.7 依赖快速审计 | osv-scanner |
| G1.8 secrets 扫描 | gitleaks |
| G2.4 SAST | Semgrep（自定义规则：禁 `dangerouslySetInnerHTML`、禁字符串拼接 SQL 等 14-security §2.1 条款）+ CodeQL |
| G2.5 SCA/镜像 | trivy |
| G2.8 许可证 | license-checker + 白名单（见 §4） |
| G3.4 DAST | OWASP ZAP baseline scan（staging） |
| 密钥管理 | 云 KMS + SSM Parameter Store；`.env` 禁入库 |

### D14 CI：GitHub Actions

14-quality-gates §7 已建议 GitHub Actions（与仓库同源），本槽确认采纳。L1/L2/L3 三级流水线按 14 §7.1 拓扑翻译为 workflow；**本 Wave 不创建任何 CI 配置**（遵守 W1D「门禁随首个代码 PR 落地」顺序与本槽「禁止削弱 CI」约束——当前无 CI 可改）。

### D15 仓库结构：pnpm + Turborepo 单仓

前后端共享类型/错误码/契约是单语言全栈的核心收益，单仓是前提。pnpm lockfile 入库（14-security §8）；Turborepo 提供任务图缓存（L1 十分钟预算，14 §7.2 速度预算靠缓存而非删检查）。

### D16 测试栈（回填 14-test-plan §1.3/§4 的「以架构槽选型为准」项）

| 层 | 工具 | 说明 |
|---|---|---|
| 单元 | **Vitest**（+ RTL） | 与 Vite 同源，天然 ESM；`expect-expect` 等空测规则启用（R5） |
| 前端 API mock | **MSW** | 14-test-plan §2 既定 |
| 集成 | **Testcontainers**（PG/Redis 真实版本） | 14-test-plan §1.2 既定 |
| E2E | **Playwright**（H5 主路径 + WebView 视口模拟）；真机矩阵走云真机跑 TikTok App 内冒烟 | 14-test-plan §1.3 默认项确认 |
| 契约 | **oasdiff**（OpenAPI 兼容 diff，G1.6）+ 后端 provider schema 校验；**Pact 暂缓**——当前唯一消费者是自家 H5，等出现第二类客户端（原生 App/管理后台）再引入 CDC | 对 14-test-plan §4.1 的裁剪，登记 handoff C11 |
| 变异测试 | **Stryker**（核心模块每周 + L3 达标，G3.7） | |
| 压测 | **k6**（核心接口 + 热剧峰值模型，14-test-plan §6.1） | |

**核心模块清单确认**（W1D §3 待架构槽确认项）：支付/订单、认证/会话、解锁/权益、内容审核 —— 确认，并**建议增补「播放令牌签发（playback）」**为第 5 个核心模块（资损等价：令牌逻辑被绕过 = 付费内容免费流出），覆盖率 ≥90% + 变异测试适用。请 W1D 回填 14-quality-gates §3.1 清单。

## 3. 与 11/12/14 文档一致性核对表

| 基线要求 | 本选型落点 | 状态 |
|---|---|---|
| 7 项必接能力（11 §3） | D9 登录、D10 支付/订阅/广告、桥接层 UI 方法 | 一致 |
| `client_secret` 仅后端、webhook 验签+幂等（11 §5.3） | D9(4)、D10 订单流 | 一致 |
| 可信域名 ≤20、请求域受限（E9/C13） | 前端仅 API+CDN 两域 + SDK 官方域；Sentry 走 tunnel | 一致（预算见 03-nonfunctional §5） |
| 播放地址不落库不直出（12 §3.3） | D11 签名 URL + playback 模块 | 一致 |
| 幂等键 + 乐观锁 + 两步入账（12 §5） | D8 事务控制 + Redis 幂等中间件 | 一致 |
| 错误码/traceId 契约（12 §2.5） | D12 OTel traceId 贯通 | 一致 |
| access ≤30min、轮换、KMS、alg 白名单（14-sec §3.1） | D9(2) | 一致 |
| H5 禁 localStorage 长期 token（14-sec §3.2） | D9(3) 内存态 + 静默重登 | 一致（C8 登记实现口径） |
| HLS AES / 禁裸 mp4（14-sec §5.1） | D3/D11 | 一致 |
| 测试金字塔工具默认项（14-test §1.3） | D16 全部确认 | 一致（Pact 裁剪见 C11） |
| CSP `default-src 'self'`（14-sec §2.1） | 需为官方 SDK 域开例外 | **冲突登记 C7** |
| 登录渠道 PHONE/WECHAT/DEVICE（12 §4.1） | Minis 唯一身份源为 TikTok | **冲突登记 C1**（与 P2 差距 G1 同源） |
| 支付渠道 WECHAT/ALIPAY/APPLE_IAP（12 §5.3） | Beans 唯一 | **冲突登记 C2**（与 P2 差距 G2 同源） |
| PIPL 国内合规基线（14-sec §6） | 发行区不含中国大陆 | **冲突登记 C3** |
| 兼容矩阵含微信 WebView/小程序（14-test §6.2） | 目标宿主为 TikTok App WebView | **冲突登记 C4** |
| APK/iOS 包体积预算（14-gates §5.4） | Minis 无原生包 | **冲突登记 C5** |
| App 证书固定（14-sec §3.3） | WebView 内不可行 | **冲突登记 C6** |

> 全部冲突的裁决建议见 `docs/handoff/w1-p3.md` §3；本槽未改写任何 11/12/14 文件。

## 4. 依赖许可证白名单（G2.8 待架构槽确认项，本槽给出初稿）

- **允许**：MIT、Apache-2.0、BSD-2/3-Clause、ISC、0BSD、Unlicense、CC0。
- **逐案评审**（需架构+安全 owner 双签）：MPL-2.0、LGPL（仅动态链接且不进前端 bundle）。
- **禁止进入任何分发产物**（前端 ZIP 属对外分发）：GPL-2.0/3.0、AGPL、SSPL、BUSL、Commons Clause。
- 执行：license-checker 在 G2.8 按本表校验；白名单变更走豁免流程（14-gates §6）。

## 5. 明确不做（Wave 1–2 边界）

- 不做微服务/K8s 编排复杂化（容器 + 托管平台即可）；不引入 Kafka；不做多区域多活。
- 不做自研 DRM；不做原生 App（契约已预留多端能力）。
- 不做管理后台技术选型细化（12 §1 非目标；仅约定复用 server 单体 + 独立前端、独立域名 + SSO，14-security §5.2）。
