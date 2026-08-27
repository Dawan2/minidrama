# 11. TikTok Minis API 与桥接层设计（Mini Drama）

> 工作槽：W1A（官方规范落地文档）
> 检索日期：2026-08-27。来源编号（S1–S13）与阻塞说明见 `docs/11-official-onboarding-checklist.md` §0。
> 本文为 W1 架构与方案文档：整理官方 API 面，并给出本项目桥接层的接口设计。不含业务实现代码。

## 1. 官方运行时模型（S5）

TikTok Minis（短剧走 H5 runtime）不是传统小程序运行时，官方定位为：

```text
Web App（标准 H5 工程） + 客户端 JSAPI（window.TTMinis） + CLI 工具链（tiktok-minis-cli）
```

要点：

- 应用是标准 web 工程（`index.html` + 前端框架 + 构建产物），运行于 TikTok App 内 WebView。
- TikTok 客户端能力通过全局 `window.TTMinis` 暴露，而非编入业务代码。
- 本地开发依赖三层联动：本地业务页面 ↔ Playground 调试页 ↔ TikTok 手机客户端。
- 上传前先跑业务自身构建（如 `npm run build`），再执行 `minis build` 按平台要求校验并打包。
- 官方明确提醒：不要把微信/抖音小程序概念直接映射过来。

两套互补 API 面：

| API 面 | 位置 | 职责 |
| --- | --- | --- |
| TikTok Minis SDK（`TTMinis`） | 客户端 JS，TikTok App 内 | 登录/授权、支付、UI、激励与插屏广告、生命周期、网络、能力探测 |
| TikTok Minis Server APIs | `open.tiktokapis.com`，仅后端 | OAuth v2 换 token、scope 化用户信息、订单创建/查询、定价、订阅管理 |

## 2. SDK 初始化与工具链（S5 / S13）

```html
<!-- index.html：官方要求在使用 SDK 的每个页面加载 -->
<head>
  <script src="https://connect.tiktok-minis.com/drama/sdk.js"></script>
  <script>
    TTMinis.init({ clientKey: "your_client_key_here" });
  </script>
</head>
```

约束：

- `TTMinis.init()` 必须先于所有其他 SDK 方法调用（方法在 init 前不存在）。
- `clientKey` 来自 Developer Portal App 页 Credentials。
- CLI：`npm install tiktok-minis-cli -g`，`minis -v` 验证；`minis dev` 启动时会强校验存在有效 `TTMinis.init({ clientKey })`（S8）。
- 能力探测：调用可选/新能力前用 `TTMinis.canIUse('<api>')`（S9 对广告明确推荐）。

## 3. 必接能力与官方 API 清单（S5）

官方要求短剧应用**必须**集成以下能力，缺失将无法过审（代码扫描会核查登录实现，S6）：

| 能力 | 客户端 API | 服务端 API | 必接 |
| --- | --- | --- | --- |
| 静默登录 | `TTMinis.login` | `POST /v2/oauth/token/` | 是 |
| 显式授权 | `TTMinis.authorize` | `POST /v2/oauth/token/`、`GET /v2/user/info/` | 否 |
| 激励视频广告 | `TTMinis.createRewardedVideoAd` | — | 是（需开通 IAA） |
| 插屏广告 | `TTMinis.createInterstitialAd` | — | 是（需开通 IAA） |
| Beans 一次性支付 | `TTMinis.pay` | `POST /v2/minis/trade_order/create/` | 是（需开通 IAP） |
| 订阅 | `TTMinis.createSubscription` | `POST /v2/minis/subscription/create/` | 是（需开通 IAP） |
| 导航栏 | `TTMinis.setNavigationBarColor`、`TTMinis.getMenuButtonBoundingClientRect` | — | 是 |

Server API 家族总览（S7）：

| 分组 | 端点能力 |
| --- | --- |
| OAuth | 换取/刷新 access token；scope 化用户信息 |
| Payment | 查询 Beans 充值档位（recharge tiers）；创建订单（产出 `trade_order_id`）；查询订单；校验 Beans 定价合规（check redeem amounts） |
| Subscription | 创建订阅；重新激活订阅；查询活跃订阅列表；按 trade order 查订阅详情；查交易单状态；查订阅档位定价/币种/账期 |

## 4. 关键时序（官方口径）

### 4.1 静默登录（S8）

```text
前端                          我方后端                        TikTok 服务端
 |-- TTMinis.login() ------------>|                              |
 |   （返回临时 code）             |                              |
 |-- code 上送 ------------------>|                              |
 |                                |-- POST /v2/oauth/token/ ---->|
 |                                |   client_key + client_secret |
 |                                |   + code                     |
 |                                |   + grant_type=              |
 |                                |     authorization_code       |
 |                                |<-- open_id / access_token ---|
 |                                |    / refresh_token           |
 |<-- 业务会话（我方自建） --------|                              |
```

官方要点：

- `login` 必须在 `init` 之后调用。
- 后端以 `open_id` 作为该应用下 TikTok 用户的唯一主键持久化。
- 后端负责存储 token 并在过期前刷新；`client_secret` 绝不下发前端。
- 静默登录只拿 OpenID，不打断用户，是 IAP 等基础功能的推荐默认；需要昵称/头像等资料时才用 `TTMinis.authorize` 显式授权。

### 4.2 Beans 一次性支付（S10）

前置：企业认证完成、IAP 已开通、静默登录已接、Portal 已配置支付 webhook 回调地址。

```text
前端                     我方后端                             TikTok
 |-- 选购（如解锁剧集）--->|                                    |
 |                        |-- POST /v2/minis/trade_order/ ---->|
 |                        |   create/（建单）                   |
 |                        |<-- trade_order_id -----------------|
 |<-- trade_order_id -----|                                    |
 |-- TTMinis.pay({trade_order_id}) -------------------------->|（用户完成 Beans 支付）
 |                        |<===== webhook 异步回调 ============|
 |                        | 1. 验签                             |
 |                        | 2. 幂等检查（订单是否已处理）         |
 |                        | 3. 按 open_id 发放权益（解锁剧集）    |
 |                        | 4. 更新订单状态/关单                 |
```

官方要点：

- Beans 为 TikTok 平台虚拟币，按**固定定价档位**售卖（有官方档位表）；可映射为应用内自有虚拟币。
- 支付结果以 TikTok 服务端 webhook 异步推送为准；后端必须做**验签、幂等、发货**三步。
- 上架前可用 check redeem amounts 端点校验商品 Beans 定价是否符合平台定价政策。

### 4.3 激励视频广告（S9）

前置：企业认证完成、IAA 已开通、Portal 已创建并激活激励视频广告位。

官方最佳实践（直接构成我方验收标准）：

1. 展示前先 `TTMinis.canIUse('createRewardedVideoAd')` 探测。
2. 创建实例后立即激活广告位。
3. **每次展示使用新的广告实例**。
4. 仅当回调 `res.isEnded === true`（完整播完）才发放奖励。
5. 风控要求高的场景，在后端记录奖励发放日志（或前端发放 + 后端记录双轨）。

插屏广告流程同激励视频，换用 interstitial JSAPI，且不发奖励。

短剧典型用法（官方举例）：看广告解锁单集、看广告领金币/体力等。

### 4.4 订阅（S7）

- 建订阅：后端 `POST /v2/minis/subscription/create/`（传 tier ID + 我方订单信息）→ 前端 `TTMinis.createSubscription`。
- 运营期：查活跃订阅列表、按订单查订阅详情、重新激活、查档位定价/账期。
- W1 决策：首发以「Beans 单点解锁 + 广告解锁」为主线，订阅按必接要求完成集成但作为二期运营重点（详见交接文档）。

## 5. 本项目桥接层设计（W1 方案，接口定义，不含实现）

### 5.1 设计目标

1. **隔离平台**：业务代码不直接触碰 `window.TTMinis`，全部经桥接接口，便于本地浏览器/Playground/真机三环境切换与单测 mock。
2. **收敛必接项**：官方 7 项必接能力一一对应桥接方法，缺一即无法过审，接口层显式化。
3. **可探测降级**：所有能力方法内置 `canIUse` 探测，宿主不支持时返回结构化错误而非抛裸异常。

### 5.2 接口草案（TypeScript 签名，仅契约）

```ts
// app/src/platform/bridge.ts（W2+ 落地，此处为契约草案）

/** 平台桥接总接口：业务层唯一入口 */
export interface PlatformBridge {
  init(opts: { clientKey: string }): Promise<void>;
  auth: AuthBridge;
  payment: PaymentBridge;
  ads: AdsBridge;
  ui: UiBridge;
  /** 能力探测，透传 TTMinis.canIUse */
  canIUse(api: string): boolean;
}

export interface AuthBridge {
  /** 静默登录：返回临时 code，由后端换 open_id/token（必接） */
  login(): Promise<{ code: string }>;
  /** 显式授权：昵称/头像等 scope（可选） */
  authorize(scopes: string[]): Promise<{ code: string }>;
}

export interface PaymentBridge {
  /** Beans 支付：入参为后端建单返回的 trade_order_id（必接） */
  pay(opts: { tradeOrderId: string }): Promise<PayResult>;
  /** 订阅（必接） */
  createSubscription(opts: { tradeOrderId: string }): Promise<PayResult>;
}

export interface AdsBridge {
  /** 激励视频：resolve 时以 isEnded 判定是否发奖（必接） */
  showRewardedVideo(opts: { adUnitId: string }): Promise<{ isEnded: boolean }>;
  /** 插屏（必接） */
  showInterstitial(opts: { adUnitId: string }): Promise<void>;
}

export interface UiBridge {
  /** 导航栏（必接） */
  setNavigationBarColor(opts: { frontColor: string; backgroundColor: string }): Promise<void>;
  getMenuButtonRect(): Promise<{ top: number; right: number; bottom: number; left: number; width: number; height: number }>;
}

export type PayResult =
  | { status: "success"; tradeOrderId: string }
  | { status: "cancelled" | "failed"; tradeOrderId: string; reason?: string };
```

实现形态（W2+）：

- `TikTokMinisBridge`：生产实现，薄封装 `window.TTMinis`，每个方法先 `canIUse` 再调用。
- `MockBridge`：本地浏览器/单测实现，返回可配置的假数据，使业务 UI 可脱离 TikTok 客户端开发（对应官方「非客户端依赖功能走标准浏览器工作流」的开发建议）。

### 5.3 后端 API 面（契约草案，W2+ 落地于 `server/`）

| 我方端点（草案） | 职责 | 对接官方端点 |
| --- | --- | --- |
| `POST /api/auth/login` | 收前端 code，换 open_id/token，建会话 | `POST /v2/oauth/token/` |
| `POST /api/orders` | 校验商品与定价，向 TikTok 建单，返回 trade_order_id | `POST /v2/minis/trade_order/create/` |
| `GET /api/orders/:id` | 查单（对账/补偿） | 订单查询端点 |
| `POST /api/webhooks/tiktok-pay` | 支付回调：验签 → 幂等 → 发货 → 更新状态 | TikTok webhook 推送 |
| `POST /api/subscriptions` | 建订阅 | `POST /v2/minis/subscription/create/` |
| `POST /api/ads/reward-log` | 激励广告发奖日志（风控可选） | — |

安全红线（官方硬约束的落点）：

- `client_secret` 仅存在于后端。
- webhook 处理必须验签 + 幂等（S10）。
- 前端所有网络请求域名必须在 Portal 可信域名（≤20 个，`https://`/`wss://`，无通配符/路径）内，且与代码包本地配置声明一致，否则被客户端拦截 / 过不了代码扫描（S4/S6）。

### 5.4 目录占位说明（W1 仅文档，不建实际工程）

```text
minidrama/
├── docs/                      # 本周期产出（已存在）
├── app/                       # W2+：H5 前端工程（index.html、播放器、付费墙、桥接层 src/platform/）
└── server/                    # W2+：后端（OAuth、订单、webhook、发奖日志）
```

## 6. 待官方/商务确认的开放问题

| # | 问题 | 依赖 |
| --- | --- | --- |
| Q1 | webhook 验签算法与事件字段全集（公开文档仅描述流程，字段表需 Portal 内文档/对接人确认） | R3（TikTok 对接人） |
| Q2 | Beans 定价档位表的当前值（官方有档位图表页，接入时以实时页面为准） | 变现开通后 Portal 可见 |
| Q3 | 订阅 webhook 事件（续费/退订/宽限期）明细 | 同 Q1 |
| Q4 | `minis.config.json` 字段全集（S12/第三方提及导航栏色、端口、产物目录、请求域名声明；以 CLI `minis init` 生成物为准） | D2 装好 CLI 后确认 |
| Q5 | 测试版 Android TikTok 客户端获取 | R3/R5 |
