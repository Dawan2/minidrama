# 技术设计 — TikTok Minis 集成点（Minis Integration Points）

> Wave 1 · 工作槽 **W1 WORK SLOT 2**（技术设计文档）。分支：`cursor/w1-technical-design-docs-8a32`。
> 文档定位、基线来源见 `docs/design/domain-model.md` §0。

## 0. 定位与范围

`docs/11-api-and-bridge.md`（W1A）已整理官方 API 面与桥接层接口草案，`docs/11-official-onboarding-checklist.md` 已给出 onboarding 对照表。**本文不重复也不改写它们**，而是回答"这些平台能力具体接在我们系统的哪一行、失败了怎么办、不确定的部分如何隔离"：

| 本文章节 | 内容 | 相对 W1A 的增量 |
|---|---|---|
| §2 | **不确定性总表** | W1A 已登记 Q1–Q5，本文把不确定性下沉到**字段/行为粒度**，并规定每一项的隔离手段 |
| §3 | 集成点登记表 IP-01…IP-14 | 每个平台能力 → 我方代码落点、触发时机、失败模式、降级、验收判据 |
| §4 | 四条官方时序 → 我方状态映射 | 与播放器状态机、订单状态机、会话状态的精确对接 |
| §5 | 桥接层设计增补 | 错误归一化、init 排队、能力门控、超时取消、MockBridge 规格 |
| §6 | 服务端适配层设计 | 可替换验签器、webhook 三步的实现约束、补偿查单 |
| §7–§9 | 凭据矩阵、可信域名/CSP、能力未开通降级 | 工程落地约束 |

差异登记编号前缀 `MI-`。

---

## 1. 集成形态回顾（一句话）

TikTok Minis 短剧应用 = **TikTok App 内 WebView 运行的标准 H5 工程 + 自建后端**（`docs/11-api-and-bridge.md` §1）。平台能力经 `window.TTMinis`（客户端）与 `open.tiktokapis.com`（服务端）两个 API 面提供。业务代码**不直接触碰任何一个** —— 客户端经 `PlatformBridge`，服务端经 `platform-tiktok` 适配模块（`docs/03-tech-architecture.md` §4.1）。

本文的全部设计都服务于一个目标：**把平台的不确定性关进两个盒子里**，使 Q1–Q5 与 PDF 缺失不阻塞其余 90% 的开发。

---

## 2. 不确定性总表（硬规则要求，本文核心）

### 2.1 来源基线与 PDF 缺失

`docs/11-official-onboarding-checklist.md` §0.1 记载：已检索工作区（`/workspace`，含 `**/*.pdf`）与代理持久存储（`/cursor/stores/self`），**均未找到用户提供的官方要求 PDF**。本槽复核结论一致 —— 本次工作中仓库内仍无任何 PDF。

因此本系列文档的**全部平台侧结论均来自官方公开网页**（`docs/11-official-onboarding-checklist.md` §0.2 的 S1–S13）。PDF 到手后的处置顺序（继承 P3 阻塞 B-1）：`11-official-onboarding-checklist` → `01-tiktok-minis-requirements` → `docs/design/minis-integration.md`（本文）→ 其余 03 系列。

### 2.2 逐项不确定字段登记

标记含义见 `docs/design/domain-model.md` §0.2（`[已验证]` / `[待验证]` / `[未知]`）。

| # | 字段 / 行为 | 标记 | 依据或缺口 | **隔离手段（不得写死）** |
|---|---|---|---|---|
| U-01 | SDK 脚本地址 `https://connect.tiktok-minis.com/drama/sdk.js` | `[已验证]` S5/S13 | 官方文档示例 | 作为常量，但置于构建期配置 |
| U-02 | `TTMinis.init({ clientKey })` 必须先于一切方法 | `[已验证]` S5 | 官方明确 | §5.3 init 排队机制 |
| U-03 | `TTMinis.login()` 返回临时 `code`，后端换 `open_id` | `[已验证]` S8 | 官方时序图 | — |
| U-04 | `open_id` 在本应用内唯一且稳定 | `[已验证]` S8 | 官方要求以此为主键持久化 | 设计上不依赖跨应用稳定性（`docs/design/domain-model.md` §4.3） |
| U-05 | **SDK 方法的错误码/错误对象结构** | `[未知]` | 官方公开文档未列出错误枚举 | §5.2 全部归一化为 `BRIDGE_*`，未识别的落 `BRIDGE_UNKNOWN`；**禁止对错误结构做任何假设性解构** |
| U-06 | **SDK 方法的超时行为**（是否会一直不回调） | `[未知]` | 未文档化 | §5.5 桥接层为每个调用包一层超时，超时产出 `BRIDGE_TIMEOUT` |
| U-07 | **支付 webhook 的验签算法与字段全集** | `[未知]` | W1A Q1；P3 阻塞 B-2 | §6.2 `SignatureVerifier` 接口 + 原始报文整表落库（`raw_payload jsonb`），解析层可事后重写 |
| U-08 | **订阅 webhook 事件全集**（续费/退订/宽限期） | `[未知]` | W1A Q3 | §6.4 只定义我方最小订阅状态集，平台事件→我方状态的映射表留空待填 |
| U-09 | Beans 定价档位表当前值 | `[待验证]` | W1A Q2；变现开通后 Portal 可见 | 档位从服务端配置读取，客户端不内置任何价格 |
| U-10 | Beans 是否整数计价、是否有小数档 | `[待验证]` | 同上 | `recharge_order.beans_amount` 暂用 `integer`，列可改 |
| U-11 | `minis.config.json` 字段全集 | `[未知]` | W1A Q4；以 `minis init` 生成物为准 | Wave 2 装 CLI 实测回填；构建脚本不硬编码字段 |
| U-12 | **平台前后台/生命周期回调** | `[未知]` | 官方能力清单未见 | `docs/design/player-state-machine.md` §8：平台事件与 Web `visibilitychange`/`pagehide` **双监听取先到者** |
| U-13 | **启动参数 / 深链参数获取 API** | `[未知]` | P2 差距 G6（已建议 W1A 追加进开放问题清单，当前 W1A 仅有 Q1–Q5） | 深链解析经桥接抽象 `bridge.launch.getOptions()`，缺失时回落 URL query/hash |
| U-14 | 分享能力（拉起 TikTok 分享面板） | `[未知]` | P2 差距 G7 | 分享入口暂不进 IA；接口位预留，`canIUse` 门控 |
| U-15 | 网络类型 / 省流量信号 | `[未知]` | 官方清单未见 | 回落 `navigator.connection`（WebView 支持度亦 `[待验证]`）；缺失时按"未知网络"取保守起播档 |
| U-16 | WebView 内 MSE 可用性、EME 上限 | `[未知]` | P3 阻塞 B-3 / 风险 RK-2 | AES-128 为已定下限；真机链路开通后跑探测页（D11/D12） |
| U-17 | WebView 自动播放策略（是否需用户手势） | `[待验证]` | 平台未说明 | 播放器 `buffering` 态可吸收"等待手势"，必要时插引导态（Q-PS-2） |
| U-18 | 广告解锁是否有**服务端校验**能力 | `[未知]` | W1A §4.3 仅提"前端发放 + 后端记录双轨" | `docs/design/api-contracts.md` §6.3 的可替换校验器接口（AC-4） |
| U-19 | 官方 SDK 域是否占用可信域名 20 名额 | `[待验证]` | `docs/03-nonfunctional.md` §5 注记「以 Portal 实测为准」 | 名额预算已留 ≥17 空位，最坏情况占 1 个无影响 |
| U-20 | 最低支持 SDK 版本（Portal 配置项 C7）的取值 | `[待验证]` | 需参照 SDK Changelog 选定 | 所有可选能力一律 `canIUse` 门控（§5.4），不依赖版本假设 |
| U-21 | 广告位标识（rewarded / interstitial adUnitId） | `[未知]`（尚未开通 IAA） | `docs/11-official-onboarding-checklist.md` C16 | 从 `/config` 或服务端配置下发，**绝不硬编码进客户端包**（改一次要重新送审） |
| U-22 | 收入结算周期（IAP 月结 / IAA 双周结） | `[待验证]` | 第三方渠道口径，需官方合同确认 | 无技术落点，商务项 |

**纪律**：表中标记 `[未知]` 的 10 项，任何一项都**不得**以"先按合理猜测实现，回头再改"的方式落地。每一项都已指定隔离手段，实现必须走隔离手段。这是 PDF 缺失情况下唯一能保证不返工的做法。

---

## 3. 集成点登记表

「必接」列依据 `docs/11-official-onboarding-checklist.md` §5（D4–D9）与 `docs/11-api-and-bridge.md` §3 —— 缺失将无法过审。

| # | 能力 | 必接 | 客户端落点 | 服务端落点 | 触发时机 | 失败降级 | 验收判据 |
|---|---|---|---|---|---|---|---|
| IP-01 | SDK 加载 + `init` | 是 | `index.html` 引 SDK；`platform/bootstrap.ts` 调 `init` | — | 启动第一步 | 启动页终态错误 + 重试；**不可带病进入**（`docs/02-information-architecture.md` §8.4） | `minis dev` 强校验通过（S8）；无 SDK 环境下 `MockBridge` 生效 |
| IP-02 | 静默登录 `TTMinis.login` | **是**（代码扫描核查 E6） | `bridge.auth.login()` | `POST /auth/login`（`provider=TIKTOK`，提案 §6.1 of api-contracts）→ `platform-tiktok` 调 `POST /v2/oauth/token/` | 启动第二步 | **匿名模式**进首页（IA §8.4）；触达资产/付费操作时就地重试登录 | 后端持久化 `open_id`；`client_secret` 不出后端 |
| IP-03 | 显式授权 `TTMinis.authorize` | 否 | `bridge.auth.authorize(scopes)` | `GET /v2/user/info/` | 用户点"完善资料" | 拒绝 → 默认昵称头像，**功能完全不受影响**（J10-A）；本会话不再主动弹 | 拒绝路径零阻塞 |
| IP-04 | Beans 建单 | **是** | — | `POST /wallet/recharge-orders` → `POST /v2/minis/trade_order/create/` | 用户选档位 | `PAYMENT_CHANNEL_UNAVAILABLE` → 通道置灰 | 返回 `paymentPayload.tradeOrderId` |
| IP-05 | Beans 支付 `TTMinis.pay` | **是** | `bridge.payment.pay({ tradeOrderId })` | — | 建单成功后 | 用户取消 → `BRIDGE_USER_CANCELLED`，**不弹错误**；失败 → 保留订单，可重试 | 前端回调**不作为入账依据** |
| IP-06 | 支付 webhook | **是**（IAP 配置项 C17） | — | `POST /payments/callbacks/tiktok` → 验签 → 幂等 → 发货 | TikTok 异步推送 | 未收到回调 → 补偿查单（§6.5） | webhook P95 ≤2s（`docs/03-nonfunctional.md` §3）；重放不重复入账 |
| IP-07 | 订单查询 | 是（对账） | — | `platform-tiktok.queryOrder()` | 补偿任务 / 客服排障 | 查不到 → 工单，**禁止静默抹平**（`docs/03-nonfunctional.md` §6） | 每日全量核对 |
| IP-08 | 激励视频广告 | **是**（需 IAA） | `bridge.ads.showRewardedVideo({ adUnitId })` | `POST /episodes/{id}/ad-unlock`（提案） | 锁定集选"看广告解锁"（J5） | IAA 未开通/`canIUse` false → **解锁面板不渲染广告通道** | 仅 `isEnded === true` 才请求发奖；**每次展示用新实例**（S9） |
| IP-09 | 插屏广告 | **是**（需 IAA） | `bridge.ads.showInterstitial({ adUnitId })` | — | 运营配置时机 | 同上，静默跳过 | 播放中弹出须先 `PLATFORM_INTERRUPT`（`docs/design/player-state-machine.md` §8） |
| IP-10 | 订阅创建 | **是**（需 IAP） | `bridge.payment.createSubscription({ tradeOrderId })` | `POST /subscriptions`（提案）→ `POST /v2/minis/subscription/create/` | VIP 页开通 | IAP 未开通 → VIP 入口隐藏 | 订阅状态由服务端同步任务刷新，非前端回调 |
| IP-11 | 订阅状态同步 | 是 | — | 定时拉活跃订阅列表 → 刷 `app_user.vip_expires_at` | 定时任务 | 拉取失败 → 保持上次状态，不误降权 | VIP 判定用 `vip_expires_at > now()` |
| IP-12 | 导航栏 `setNavigationBarColor` | **是** | `bridge.ui.setNavigationBarColor()` | — | 进入播放器（沉浸）/ 离开（恢复） | `canIUse` false → 跳过，UI 用安全区兜底 | 播放器沉浸式适配（`docs/01-tiktok-minis-requirements.md` §4.3） |
| IP-13 | 胶囊按钮位置 `getMenuButtonBoundingClientRect` | **是** | `bridge.ui.getMenuButtonRect()` | — | 布局计算 | 失败 → 用保守默认安全区常量 | 右上操作区不被胶囊遮挡 |
| IP-14 | 启动参数 / 深链 | — | `bridge.launch.getOptions()` `[未知]` U-13 | — | 冷启动 | 回落 URL query/hash 解析 | 深链合成返回栈 `[#/home, 落地页]`（IA §7.3） |

### 3.1 必接能力与过审的强绑定

IP-02、IP-05、IP-08、IP-09、IP-10、IP-12、IP-13 是官方**必接**能力（7 项，`docs/11-api-and-bridge.md` §3），缺一无法过审。其中 IP-08/IP-09/IP-10 依赖 IAA/IAP 开通，而开通链路很长：企业认证 → 行业资质 → 开通 → 签合同 → 审批（`docs/11-official-onboarding-checklist.md` R7）。

**工程结论**：这三项必须在平台能力未开通时也能**完成代码集成并通过构建**，只是运行时被 `canIUse` 门控关闭。因此桥接层的能力门控（§5.4）不是可选优化，而是排期解耦的必要条件 —— 它让开发不必等待商务链路。

---

## 4. 官方时序 → 我方状态映射

官方时序以 `docs/11-api-and-bridge.md` §4 为准，本节只补我方状态机的对接点。

### 4.1 启动与登录

```text
TTMinis.init（IP-01）
  → bridge.auth.login() 取 code（IP-02）
  → POST /auth/login { provider: "TIKTOK", authCode }
  → 后端 platform-tiktok 换 open_id/access_token/refresh_token
  → 后端签发自建 JWT（会话）
  → GET /config
  → 进首页
```

会话形态（P3 冲突 `C8` 的裁决建议）：**accessToken 仅内存态，客户端不存 refreshToken**；过期时走 `TTMinis.login` 静默重登而非 `/auth/refresh`。因此 Minis 端的会话恢复链路是"平台身份 → 新会话"，而非"刷新令牌 → 新会话"。

对错误分类学的影响：`AUTH_TOKEN_EXPIRED` 的自动处理动作在 Minis 端 = **静默重登**（而非刷新），落在全局拦截器内，业务层与播放器状态机均无感（`docs/design/player-state-machine.md` §9）。

### 4.2 Beans 支付（J2 / J11）

```text
选档位 → POST /wallet/recharge-orders（Idempotency-Key）
      → 我方订单 PENDING + TikTok 建单，返回 tradeOrderId（IP-04）
  → bridge.payment.pay({ tradeOrderId })（IP-05）
  → 【前端回调仅用于 UI 提示，不作为入账依据】
  → 客户端轮询 GET /wallet/recharge-orders/{orderId}
  → 后端 webhook（IP-06）：验签 → 幂等 → PAID→CREDITED 入账
  → 轮询见到 CREDITED → 刷新钱包 → 若有待执行解锁意图则自动执行（J2 步 9）
```

三个状态机在此汇合，映射关系：

| 平台事件 | `recharge_order.status` | 客户端 UI 状态 |
|---|---|---|
| 建单成功 | `PENDING` | 拉起支付中 |
| `TTMinis.pay` resolve success | `PENDING`（**不变**） | 轮询态 |
| `TTMinis.pay` 用户取消 | `PENDING` | 返回档位选择，**不报错**（`BRIDGE_USER_CANCELLED`） |
| webhook 到达并验签通过 | `PAID` | 轮询态 |
| 入账完成 | `CREDITED` | 成功 → 执行解锁意图 |
| 60s 轮询超时未到终态 | 仍 `PAID` 或 `PENDING` | 「到账确认中」横幅（SCR-09），后台继续 |
| 订单超时关闭 | `CLOSED` | `PAYMENT_ORDER_CLOSED` → 引导重新下单 |

**"前端回调不作为入账依据"是资损防线**，在 `docs/02-user-journeys.md` J11 与 `docs/11-api-and-bridge.md` §4.2 均已定，此处第三次重申并落到状态映射表里，因为它是本项目最容易被"优化掉"的一条约束（前端回调成功后直接加余额看起来更快）。

### 4.3 激励视频广告解锁（J5）

```text
播放器处于 locked 态（viewerAccess.playable=false）
  → 解锁面板渲染"看广告解锁"通道（前提：features.adUnlock && canIUse('createRewardedVideoAd')）
  → bridge.ads.showRewardedVideo({ adUnitId })   ← adUnitId 来自 /config（U-21）
  → 回调 isEnded === true ？
      ├─ 是 → POST /episodes/{id}/ad-unlock（Idempotency-Key）
      │        → 服务端：次数上限校验 + 发奖日志 + 写 Unlock(method=AD)
      │        → 成功 → 播放器 UNLOCK_SUCCEEDED → resolving → 自动开播
      └─ 否 → BRIDGE_AD_NOT_COMPLETED，面板保持，可重试（不消耗次数）
```

官方最佳实践的落点（S9，直接构成验收标准）：

| 官方要求 | 落点 |
|---|---|
| 展示前 `canIUse` 探测 | `bridge.ads` 每个方法内置（§5.4） |
| 创建实例后立即激活广告位 | 桥接层实现细节，`AdsBridge` 对业务隐藏实例管理 |
| **每次展示使用新的广告实例** | 桥接层不缓存广告实例；`showRewardedVideo` 每次内部新建。这是**最容易违反**的一条（复用实例看起来更省），列入代码评审检查项 |
| 仅 `isEnded === true` 才发奖 | 上图分支；且服务端二次校验（U-18 隔离） |
| 后端记录发奖日志 | `ad_reward_log` 表（Q-DM-2），记录成功与失败/作弊尝试 |

### 4.4 订阅（J6）

```text
VIP 页 → POST /subscriptions（提案）→ 平台建订阅 → tradeOrderId
  → bridge.payment.createSubscription({ tradeOrderId })（IP-10）
  → 客户端轮询 GET /subscriptions/me
  → 服务端同步任务（IP-11）拉活跃订阅列表 → 刷 app_user.vip_expires_at
```

`[未知]` U-08：续费、退订、宽限期的平台事件全集未知，故**我方只定义最小状态集** `PENDING / ACTIVE / CANCELED / EXPIRED`，平台事件到我方状态的映射表在 §6.4 留空待填。设计上用"定期全量同步活跃订阅"而非"依赖事件驱动"作为主链路，正是为了让 U-08 不阻塞：即使一个事件都收不到，定期同步也能收敛到正确状态（代价是最长一个同步周期的延迟）。

---

## 5. 客户端桥接层设计增补

`docs/11-api-and-bridge.md` §5.2 已给出 `PlatformBridge` 的 TypeScript 接口草案。本节补齐该草案未覆盖的行为契约。

### 5.1 隔离原则

```text
features/（业务）
    ↓ 只依赖 PlatformBridge 接口，不 import 任何 TikTok 相关符号
platform/
    ├── bridge.ts              接口定义（11 §5.2）
    ├── tiktok-bridge.ts       生产实现：薄封装 window.TTMinis
    ├── mock-bridge.ts         本地/单测实现
    ├── errors.ts              BRIDGE_* 归一化（§5.2）
    └── capability.ts          canIUse 门控与能力表（§5.4）
```

**可执行的纪律**：ESLint `no-restricted-globals` 禁止 `platform/` 之外的任何文件引用 `TTMinis` / `window.TTMinis`。这条规则让"业务不直接触碰平台"从约定变成 CI 门禁。

### 5.2 错误归一化（对应 U-05）

```text
桥接层每个方法的实现骨架：

  1. 若无 window.TTMinis           → BRIDGE_NOT_AVAILABLE
  2. 若未完成 init                 → BRIDGE_NOT_INITIALIZED
  3. 若 canIUse(api) === false     → BRIDGE_CAPABILITY_UNSUPPORTED
  4. 调用 SDK，包超时（§5.5）
  5. 结果分类：
       成功           → 归一化结果对象
       用户主动取消    → BRIDGE_USER_CANCELLED
       超时           → BRIDGE_TIMEOUT
       其他任何情况    → BRIDGE_UNKNOWN（附原始错误的**字符串化摘要**，不解构）
```

第 5 步的"不解构"是 U-05 的直接落点：**官方 SDK 的错误对象结构未文档化**，任何 `err.code`、`err.errMsg` 之类的假设都可能在 SDK 升级后静默失效。归一化层只做 `String(err)` 摘要并上报，等到真机联调拿到真实错误样本后，再有依据地细化分类。

`BRIDGE_*` 的分类属性（category/retryable/actionable）见 `docs/design/api-contracts.md` §5.4，与 HTTP 错误共用同一套客户端处理决策树。

### 5.3 init 排队与单例（对应 U-02）

官方硬约束：`TTMinis.init()` 必须先于所有其他方法，且**方法在 init 前不存在**（S5）。这意味着"先调用后 init"不是返回错误，而是 `TypeError`。

设计：桥接层维护 `initPromise` 单例，所有能力方法 `await initPromise` 后再执行。

- 好处：业务层不需要关心时序，任何时刻调用 `bridge.auth.login()` 都安全。
- 边界：`initPromise` reject（SDK 加载失败）时，所有后续调用立即以 `BRIDGE_NOT_AVAILABLE` 失败，不重试 —— 因为 SDK 脚本加载失败通常是宿主/网络问题，重试单个方法无意义，恢复入口在启动页（IP-01 的降级）。
- `init` **只调用一次**：重复 `init` 的行为 `[未知]`，故用单例规避而非依赖 SDK 幂等。

### 5.4 能力门控与降级矩阵

```text
capability.ts 维护能力表：
  { api: 'createRewardedVideoAd', required: true,  featureFlag: 'features.adUnlock' }
  { api: 'createSubscription',    required: true,  featureFlag: 'features.subscription' }
  { api: 'setNavigationBarColor', required: true,  featureFlag: null }
  { api: 'getLaunchOptions',      required: false, featureFlag: null }   // U-13，未知能力

可用性 = canIUse(api) && (featureFlag == null || config[featureFlag] === true)
```

**两级门控**：平台侧（`canIUse`，宿主版本能力）与业务侧（`/config` 开关，IAA/IAP 开通状态）。二者都为真才渲染入口。

| 场景 | `canIUse` | `/config` 开关 | UI 表现 |
|---|---|---|---|
| IAA 未开通（审核期） | true | false | 广告通道**不渲染**（不是置灰） |
| 宿主 TikTok 版本过低 | false | true | 同上；平台自身会提示用户升级 TikTok（C7 最低 SDK 版本机制） |
| 全部支付/广告通道不可用 | — | — | 解锁面板文案「暂不可购买，敬请期待」（`docs/02-information-architecture.md` §9） |

"不渲染"而非"置灰"：置灰的入口会诱发点击并需要解释文案，而平台能力未开通对用户而言不可解释也无从解决。

### 5.5 超时与取消（对应 U-06）

| 调用 | 超时 | 超时后行为 |
|---|---|---|
| `init` | 10s | `BRIDGE_NOT_AVAILABLE`，启动页错误态 |
| `login` / `authorize` | 15s | `BRIDGE_TIMEOUT`；登录失败走匿名模式 |
| `pay` / `createSubscription` | **不设超时** | 支付面板停留时间完全由用户决定；**改为依赖订单轮询判定结果**（本就不以前端回调为准，§4.2） |
| `showRewardedVideo` | 不设超时 | 同理，广告时长由平台决定；但需 `PLATFORM_INTERRUPT`/`RESUME` 配对保护播放器状态 |
| `setNavigationBarColor` / `getMenuButtonRect` | 3s | 超时静默跳过，用默认安全区 |

支付与广告**刻意不设超时**：给一个用户正在操作的原生面板设超时，只会制造"客户端认为失败、平台侧却成功"的不一致 —— 这类不一致在资金链路上代价最高。取而代之的是"以服务端订单状态为唯一真相"。

### 5.6 MockBridge 规格

`MockBridge` 不只是"返回假数据"，它必须能复现所有失败分支，否则本地开发覆盖不到降级路径：

| 可配置维度 | 取值 |
|---|---|
| `login` | 成功（返回假 code）/ 超时 / 拒绝 |
| `pay` | 成功 / 用户取消 / 失败 / 长时间无响应 |
| `showRewardedVideo` | `isEnded=true` / `isEnded=false` / 拉取失败 |
| `canIUse` | 按能力逐项开关（模拟低版本宿主与 IAA/IAP 未开通） |
| 生命周期事件 | 可手动触发 `PLATFORM_INTERRUPT` / `RESUME`（U-12 的本地验证手段） |

配置经 URL query（如 `?mock=pay:cancel,ads:unavailable`）或开发面板注入，与 `docs/design/api-contracts.md` §7.3 的 `X-Mock-Scenario` 机制并列，共同覆盖"平台侧失败 × 服务端失败"的组合。

---

## 6. 服务端适配层（`platform-tiktok` 模块）

### 6.1 模块职责边界

该模块是 `docs/14-test-plan.md` §4.1 所称「第三方契约适配层」。硬边界：

- **只有它**持有 `client_secret` 与 TikTok token；其他模块通过它的公开接口调用，拿不到凭据。
- **只有它**知道 `open.tiktokapis.com` 的存在；其他模块的类型签名里不出现任何 TikTok 概念（除 `open_id` 经 `user_auth_provider` 落库外）。
- 它对外暴露的接口是**我方语义**（`createPaymentOrder(order)` 而非 `createTradeOrder(...)`），使得未来若增加渠道，替换成本可控。

### 6.2 Webhook 处理（对应 U-07，最高不确定性）

官方要求三步：**验签 → 幂等 → 发货**（S10）。验签算法与字段全集 `[未知]`，因此设计如下：

```text
POST /payments/callbacks/tiktok
  1. 原始报文**先落库**：platform_webhook_event { id, source='TIKTOK', raw_payload jsonb,
                                                  headers jsonb, received_at, verified, processed }
  2. 验签：调用 SignatureVerifier 接口
        interface SignatureVerifier {
          verify(rawBody: Buffer, headers: Record<string,string>): boolean
        }
     - Wave 2 打桩实现：可配置开关；staging 用沙箱真实样本验证
     - 算法确定后只替换该实现，调用方零改动
  3. 幂等：以 trade_order_id 对 recharge_order 做条件 UPDATE（PAID→CREDITED），
     受影响行数为 0 视为已处理，直接返回成功
  4. 发货：单库事务内 订单状态迁移 + 钱包入账 + 写流水
  5. 标记 platform_webhook_event.processed
```

三条关键设计：

1. **先落原始报文再解析**。字段表未知（U-07），任何解析都可能漏字段；原始报文入库使得算法/字段澄清后可以**重放历史事件**补齐数据，而不是永久丢失。
2. **验签抽象为接口而非函数**。这是 P3 阻塞 B-2 的处置建议（"以可替换验签器接口隔离"）的具体形状。
3. **验签失败不返回 4xx 就完事**：计数并告警（§8 of api-contracts 的限流表已注明 webhook 不限流但验签失败要告警）。持续的验签失败要么是我方配置错误（漏钱），要么是攻击。

### 6.3 出站调用的可靠性

| 项 | 规格 |
|---|---|
| 超时 | 连接 3s / 总计 10s |
| 重试 | 幂等的读（查单、查订阅）自动重试 3 次指数退避；**写（建单、建订阅）不自动重试**，失败向上返回，由用户重试并复用同一 `Idempotency-Key` |
| 熔断 | 连续失败触发熔断，期间下单接口返回 `PAYMENT_CHANNEL_UNAVAILABLE`（降级预案：**关闭下单保播放**，`docs/03-nonfunctional.md` §6） |
| 观测 | 每次出站调用记录 traceId、耗时、状态；平台侧错误单独打点（区分我方错误与平台错误是排障的前提） |
| 夹具 | 用官方沙箱（D14）真实响应做**录制回放**夹具（`docs/03-tech-architecture.md` §4.1） |

### 6.4 TikTok token 管理

- `access_token` / `refresh_token` 按 `open_id` 存储于服务端，加密静态存储。
- 过期前主动刷新（官方要求后端负责刷新，S8）。
- 刷新失败 → 标记该用户平台身份失效 → 下次前端 `login` 时重新建立（对用户无感）。
- **我方业务会话（JWT）与 TikTok token 生命周期解耦**：TikTok token 失效不立即使业务会话失效，只影响需要平台身份的操作（建单、查订阅）。这避免了平台侧抖动直接把用户踢下线。

订阅状态映射表（U-08 待填）：

| 平台事件 / 状态 `[未知]` | 我方 `subscription.status` |
|---|---|
| （创建成功） | `PENDING` → 支付完成后 `ACTIVE` |
| （续费成功）`[未知]` | `ACTIVE`，延长 `currentPeriodEnd` |
| （用户退订）`[未知]` | `CANCELED`（当期仍有效至 `currentPeriodEnd`） |
| （宽限期）`[未知]` | 建议映射为 `ACTIVE` + `inGrace=true`，待确认 |
| （到期）`[未知]` | `EXPIRED` |

**主链路不依赖此表**：定期全量同步活跃订阅列表即可收敛（§4.4）。此表补齐后可把延迟从"一个同步周期"降到"事件到达即时"。

### 6.5 对账与补偿

| 任务 | 频率 | 动作 |
|---|---|---|
| 未回调订单补偿查单 | 每 5 分钟 | 扫 `recharge_order` 中 `PENDING`/`PAID` 且超过阈值的订单，主动向 TikTok 查单并推进状态（`docs/14-security.md` §4.1） |
| 钱包不变式对账 | 每日 | `balance == Σ(delta)` 校验（`docs/12-domain-model.md` §5.2） |
| TikTok 订单全量核对 | 每日 | 我方订单与平台订单逐笔比对；**差异生成工单，禁止静默抹平**（`docs/03-nonfunctional.md` §6） |
| 广告发奖日志核查 | 每日 | 异常账号（发奖次数/时间分布异常）标记风控 |
| 订阅状态同步 | 每小时 | 拉活跃订阅刷新 VIP（IP-11） |

补偿查单是 U-07 的**安全网**：即使 webhook 因验签算法未知而暂时不可用，5 分钟一轮的主动查单也能保证用户最终到账。这使得 B-2 阻塞不会阻塞变现链路的端到端联调。

---

## 7. 配置与凭据矩阵

| 项 | 来源 | 存放位置 | 环境隔离 | 备注 |
|---|---|---|---|---|
| App ID | Portal（A5） | 后端配置 | 沙箱 / 生产分离 | |
| `clientKey` | Portal（A5） | **客户端包内**（`TTMinis.init` 需要） | 同上 | 公开值，非机密 |
| `client_secret` | Portal（A5） | **仅后端密钥管理** | 同上 | 官方红线；泄漏 = 账号被冒用建单 |
| Webhook 回调 URL | 我方定义，Portal 配置（C17） | Portal | 同上 | 必须是可信域名下的 HTTPS |
| 广告位 ID（rewarded/interstitial） | Portal（C16）`[未知]` U-21 | **服务端 `/config` 下发** | 同上 | 不进客户端包，避免改一个 ID 就要重新送审 |
| 可信域名清单 | Portal（C13）+ `minis.config.json` | 两处**必须一致** | 沙箱可独立配置 | 不一致会被客户端拦截或过不了代码扫描（E9） |
| 最低支持 SDK 版本 | Portal（C7）`[待验证]` U-20 | Portal | — | 参照 SDK Changelog 选定 |
| ToS / 隐私政策 URL | 商务（C4/C5） | Portal | — | 开发期可用占位链接（S5 明确允许） |

**沙箱（D14）与生产必须使用不同的凭据集**，且 staging 域名放沙箱应用的独立配置，不占生产可信域名名额（`docs/03-nonfunctional.md` §5）。

---

## 8. 可信域名与 CSP 的集成落点

### 8.1 可信域名（≤20 硬限，C13）

预算表见 `docs/03-nonfunctional.md` §5（3 个已规划，≥17 空余）。本文补两条集成纪律：

1. **任何新增的前端直连第三方（评论机审、行为验证码、A/B 服务等）都必须先评估"能否走后端代理"**。代理是默认答案，直连是例外，例外需架构 owner 评审。这既省名额，也减少攻击面与代码扫描风险（E9）。
2. Sentry 等可观测 SaaS **必须走自有域 tunnel**（已在预算表体现），不单独占名额。

### 8.2 CSP 与官方 SDK 的冲突

P3 已登记 `C7`：`docs/14-security.md` §2.1 的 `default-src 'self'` 与官方要求加载 `connect.tiktok-minis.com/drama/sdk.js` + 内联 `TTMinis.init` 冲突。裁决建议：

```text
script-src  'self' https://connect.tiktok-minis.com 'nonce-<per-response>'
connect-src 'self' https://api.<domain> https://media.<domain>
media-src   'self' https://media.<domain>
object-src  'none'
base-uri    'self'
```

本文补充一点：该 CSP 同时满足官方 E8「限制动态引入脚本的来源」—— 即 CSP 不是安全与合规之间的妥协，而是**同一目标的两种表述**。这个论点对 W1D 裁决 C7 有帮助，故在此明确记录。

`[待验证]` U-19：官方 SDK 域是否需登记为可信域名（`docs/03-nonfunctional.md` §5 注记「以 Portal 实测为准」）。CSP 侧无论如何都必须放行该域。

---

## 9. 平台能力未就绪时的整体降级矩阵

这张表回答一个排期问题：**在企业认证/行业资质/IAA/IAP 全部未完成时，产品能做到什么程度**（R7 的长链路应对）。

| 平台状态 | 可用功能 | 不可用 | 客户端表现 |
|---|---|---|---|
| 无 SDK（本地浏览器开发） | 全部业务功能（`MockBridge`） | 真实登录/支付/广告 | 开发面板可切换 mock 场景 |
| SDK 可用，未开通 IAA/IAP | 浏览、免费集播放、进度、收藏、评论、**VIP/币解锁均不可** | 变现全链路 | 充值入口隐藏；解锁面板「暂不可购买，敬请期待」 |
| 仅 IAA 开通 | 上述 + **广告解锁** | 币充值、订阅 | 解锁面板只渲染广告通道 |
| 仅 IAP 开通 | 上述 + 币充值 + 订阅 | 广告解锁 | 解锁面板不渲染广告通道 |
| 全部开通 | 全功能 | — | — |

**关键结论**：内容消费链路（浏览 → 播放 → 进度 → 收藏）与变现链路完全解耦，前者不依赖任何需要商务审批的平台能力。因此 Wave 2 的开发可以在商务链路推进的同时全速进行，只有变现相关的**联调**需要等待。这是把 R7 从"阻塞"降级为"并行等待"的设计依据。

---

## 10. 过审验收清单映射

`docs/11-official-onboarding-checklist.md` 的核对项 → 本设计的落点，供发布前自查：

| 官方项 | 落点 | 自查判据 |
|---|---|---|
| D3 SDK 初始化 | IP-01、§5.3 | `index.html` 有 SDK 引入 + `init`；`minis dev` 强校验通过 |
| D4 静默登录 | IP-02 | 后端有 `open_id` 落库；代码扫描可见 `TTMinis.login` 调用 |
| D5/D6 激励与插屏广告 | IP-08/IP-09 | 代码内有 `createRewardedVideoAd` / `createInterstitialAd` 调用路径（即使运行时被门控关闭） |
| D7 Beans 支付 | IP-04/IP-05 | 建单 + `TTMinis.pay` 完整链路 |
| D8 订阅 | IP-10 | 建订阅 + `createSubscription` |
| D9 导航栏 | IP-12/IP-13 | 两个 API 均有调用 |
| E5 ZIP ≤200MB | 构建产物预算 ≤20MB（`docs/03-nonfunctional.md` §2） | CI 体积门禁 |
| E6 已实现 Login API | IP-02 | 同 D4 |
| E7 无空文件 | 构建后校验 | `minis build` 前置检查脚本 |
| E8 限制动态脚本来源 | §8.2 CSP | CSP 无 `unsafe-eval`、无通配 `script-src` |
| E9 请求仅限声明域名 | §8.1 | 运行时请求域名集合 ⊆ `minis.config.json` 声明 ⊆ Portal 可信域名；**建议加自动化校验脚本** |
| E14 兼容英文 | i18n（`docs/03-tech-architecture.md` §3.1）+ `Accept-Language` 错误文案（C9） | 英文全量遍历无缺字 |

**E9 的自动化校验**是本文的一条新建议（登记为 `MI-3`）：构建期扫描代码中的所有请求域名（fetch/XHR/媒体 URL 常量），与 `minis.config.json` 声明比对，不一致则构建失败。这条检查能把"上传后才发现被拦截"的返工提前到本地构建，且直接对应 E9 这一可能导致无法上传的硬性要求。

---

## 11. 差异登记与开放问题

### 11.1 差异登记（不改写上游）

| # | 事项 | 涉及文档 | 建议 | 建议裁决人 |
|---|---|---|---|---|
| MI-1 | 桥接层接口草案未定义错误模型、超时、init 时序、能力门控行为 | `docs/11-api-and-bridge.md` §5.2 | 采纳本文 §5.2–§5.5 作为接口的行为契约补充 | W1A |
| MI-2 | 广告位 ID 的下发方式未定义；若内置客户端包，则调整广告位需重新送审 | `docs/11-official-onboarding-checklist.md` C16 | 由 `/config` 服务端下发（`docs/design/api-contracts.md` §3） | W1A + W1B |
| MI-3 | E9（运行时请求域名受限）无自动化校验手段，只能靠上传后被拦截才发现 | `docs/11-official-onboarding-checklist.md` E9、`docs/14-quality-gates.md` | 增构建期域名一致性校验脚本（代码 ∩ `minis.config.json` ∩ Portal 清单） | W1D |
| MI-4 | 订阅在契约中被建模为 `RechargeOrder(productType=VIP)`，与平台订阅 API 形态不匹配（= P2 差距 G4） | `docs/12-domain-model.md` §4.1/§5.3 | 独立订阅实体 + 定期全量同步为主链路（本文 §4.4/§6.4） | W1B |
| MI-5 | 支付/广告类 SDK 调用不应设客户端超时，但通用超时策略（IA §8.2）未做例外说明 | `docs/02-information-architecture.md` §8.2 | 明确"平台原生面板类调用不设超时，以服务端状态为准"（本文 §5.5） | P2 |

### 11.2 开放问题（全部继承或细化自 W1A Q1–Q5 / P3 B-1…B-5）

| # | 问题 | 标记 | 阻塞什么 | 何时可解 |
|---|---|---|---|---|
| Q-MI-1 | 官方要求 PDF 缺失 | 阻塞 | 全部平台侧结论可能与商务口径有偏差 | 用户补充 PDF 后按 §2.1 顺序 diff |
| Q-MI-2 | Webhook 验签算法与字段全集（U-07） | `[未知]` | `SignatureVerifier` 实现；**不阻塞**联调（补偿查单兜底，§6.5） | TikTok 对接人 / Portal 内文档 |
| Q-MI-3 | 订阅 webhook 事件明细（U-08） | `[未知]` | 订阅状态映射表；**不阻塞**（全量同步兜底） | 同上 |
| Q-MI-4 | SDK 错误码与超时行为（U-05/U-06） | `[未知]` | 错误分类精细度；**不阻塞**（归一化兜底） | 真机联调拿到样本 |
| Q-MI-5 | 平台生命周期与启动参数 API（U-12/U-13） | `[未知]` | 播放打断恢复精度、深链解析；**不阻塞**（Web 事件兜底） | CLI 实测 + 对接人确认 |
| Q-MI-6 | 广告解锁的服务端校验能力（U-18） | `[未知]` | 风控强度（当前为"信任客户端 + 日志"） | 对接人确认 |
| Q-MI-7 | WebView MSE/EME 可用性（U-16） | `[未知]` | 播放内核方案上限；AES-128 下限已定，**不阻塞开工** | 真机链路开通（D11/D12） |
| Q-MI-8 | Beans 档位表与计价精度（U-09/U-10） | `[待验证]` | 充值页展示与 `beans_amount` 类型 | 变现开通后 Portal 可见 |
| Q-MI-9 | Android 测试客户端获取（R5） | 商务 | 真机联调排期 | 向对接人/工单申请 |
| Q-MI-10 | 首发区域（P3 B-4） | 商务 | 默认币种、语言集、US/TPRM 是否启动 | 商务拍板 |

**总体判断**：10 项开放问题中，**没有一项阻塞 Wave 2 的开工**。全部已通过抽象接口、兜底链路或保守默认值隔离，代价是这些位置需要在信息到位后做一次定向替换，而非重构。

---

## 12. 交叉引用

| 主题 | 文档 |
|---|---|
| 官方 API 面与桥接接口草案（权威） | `docs/11-api-and-bridge.md` |
| Onboarding 核对表与发布红线（权威） | `docs/11-official-onboarding-checklist.md` |
| 平台身份在用户模型中的落地 | `docs/design/domain-model.md` §4.3 |
| 桥接错误的分类属性与处理决策树 | `docs/design/api-contracts.md` §5.4/§5.5 |
| 平台打断对播放状态的影响 | `docs/design/player-state-machine.md` §8 |
| 可信域名名额预算 | `docs/03-nonfunctional.md` §5 |
