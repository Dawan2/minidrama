# 12 — REST/JSON API 契约（API Contracts）

> Wave 1 · 工作槽 W1B。本文档定义面向客户端（App/H5）的 REST/JSON 契约。
> 领域语义见 `docs/12-domain-model.md`；错误码见 `docs/12-error-catalog.md`。
> 与现行 `contracts/openapi.yaml` 的端点对照见 `docs/12-api-parity.md`。

## 1. 契约地位

本契约是**前后端并行开发的接口基线**。字段命名、状态枚举、错误结构一经 Wave 2 采纳即视为冻结，破坏性变更须升版本（`/api/v2`）。示例中省略的通用字段（`createdAt`/`updatedAt`）默认存在。

## 2. 全局约定

### 2.1 基础

- Base URL：`https://api.<domain>/api/v1`
- 内容类型：请求与响应均为 `application/json; charset=utf-8`
- 命名：JSON 字段一律 **camelCase**；枚举值一律 **UPPER_SNAKE_CASE**
- 时间：UTC ISO-8601 毫秒（`2026-08-27T10:00:00.000Z`）
- 空值：可空字段返回 `null`，不省略键

### 2.2 认证

- 除 §4.1 认证接口与内容公开读接口外，均要求 `Authorization: Bearer <accessToken>`（JWT）。
- accessToken 短时效（建议 2h），refreshToken 长时效（建议 30d），刷新见 §4.1。
- 内容公开读接口（剧/集列表与详情）允许匿名访问，但携带令牌时返回个性化视图（`viewerAccess`、进度等）。

### 2.3 分页（游标式）

列表接口统一使用游标分页：

- 请求：`?cursor=<opaque>&limit=20`（`limit` 默认 20，最大 100）
- 响应包裹：

```json
{
  "items": [ ... ],
  "pageInfo": { "nextCursor": "b3BhcXVl", "hasMore": true }
}
```

`nextCursor` 为不透明字符串，客户端原样回传；`hasMore=false` 时 `nextCursor` 为 `null`。

### 2.4 幂等

以下写操作**必须**携带请求头 `Idempotency-Key: <uuid>`（同一操作重试时复用同一键）：

- `POST /episodes/{episodeId}/unlock`、`POST /dramas/{dramaId}/unlock`
- `POST /wallet/recharge-orders`

参数名与 §4.5 一致（`{episodeId}` / `{dramaId}`）。与现行 OpenAPI 的对照见 `docs/12-api-parity.md`（D-07 / D-11）。现行解锁写路径是 `POST /v1/unlock/coin-orders`，不是把 `{id}` 再写一遍。

服务端对相同键在 24h 内返回首次执行的结果（含首次的错误结果）；键冲突但请求体不同时返回 `COMMON_IDEMPOTENCY_CONFLICT`。

### 2.5 错误响应结构（全局统一）

非 2xx 响应一律返回：

```json
{
  "error": {
    "code": "WALLET_INSUFFICIENT_BALANCE",
    "message": "余额不足，无法解锁本集",
    "details": { "requiredCoins": 300, "coinBalance": 100, "bonusBalance": 20 },
    "traceId": "01J6..."
  }
}
```

- `code`：机器可读错误码（目录见 `12-error-catalog.md`），客户端**按 code 分支**，不得解析 message。
- `message`：可直接展示给用户的简体中文文案。
- `details`：结构化上下文，按错误码约定字段，可为 `null`。
- `traceId`：链路追踪 ID，客服/排障用。

### 2.6 限流与安全

- 限流以 `429 + COMMON_RATE_LIMITED` 返回，附 `Retry-After` 响应头。
- 埋点批量接口、进度心跳接口有独立更宽松的限流桶。

## 3. 公共视图对象（DTO）

### 3.1 DramaSummary（列表/推荐卡片用）

```json
{
  "id": "drm_01J6...",
  "title": "重生之豪门夜宴",
  "coverUrl": "https://cdn.../cover.jpg",
  "category": "REVENGE",
  "tags": ["逆袭", "豪门"],
  "totalEpisodes": 80,
  "freeEpisodes": 5,
  "isCompleted": true,
  "stat": { "playCount": 1200000, "favoriteCount": 34000, "score": 9.1 }
}
```

### 3.2 DramaDetail = DramaSummary + 以下字段

```json
{
  "description": "...",
  "horizontalCoverUrl": null,
  "seasons": [ { "id": "ssn_...", "seasonNumber": 1, "title": null, "episodeCount": 80 } ],
  "viewer": {
    "favorited": true,
    "lastWatched": { "episodeId": "ep_...", "episodeNumber": 12, "positionSec": 45 }
  }
}
```

`viewer` 仅登录态返回，匿名为 `null`。

### 3.3 EpisodeItem（含观看权限视图）

```json
{
  "id": "ep_01J6...",
  "dramaId": "drm_01J6...",
  "seasonId": "ssn_01J6...",
  "episodeNumber": 12,
  "title": null,
  "durationSec": 95,
  "unlockPolicy": "COIN_OR_VIP",
  "priceCoins": 300,
  "viewerAccess": {
    "playable": false,
    "reason": "NEED_UNLOCK",
    "unlockedBy": null
  }
}
```

`viewerAccess.reason` 枚举：`FREE`（免费可看）/ `UNLOCKED`（已解锁）/ `VIP`（VIP 身份可看）/ `NEED_UNLOCK`（需付费解锁）/ `NEED_VIP`（仅 VIP）/ `UNAVAILABLE`（内容不可用）。匿名请求按"未解锁的普通用户"计算。

### 3.4 WalletView

```json
{ "coinBalance": 100, "bonusBalance": 20, "totalBalance": 120 }
```

## 4. 端点契约

### 4.1 认证 Auth

| 方法与路径 | 说明 |
|---|---|
| `POST /auth/sms-codes` | 发送短信验证码。体：`{ "phone": "+8613800138000", "scene": "LOGIN" }`。成功 `204`。限流严格。 |
| `POST /auth/login` | 登录/注册二合一。体见下。成功 `200` 返回令牌对。 |
| `POST /auth/refresh` | 体：`{ "refreshToken": "..." }`。成功 `200` 返回新令牌对（refreshToken 轮换）。 |
| `POST /auth/logout` | 注销当前 refreshToken。成功 `204`。 |

`POST /auth/login` 请求体（三选一）：

```json
{ "provider": "PHONE",  "phone": "+8613800138000", "smsCode": "123456" }
{ "provider": "WECHAT", "wechatAuthCode": "..." }
{ "provider": "DEVICE", "deviceId": "ab12..." }
```

响应：

```json
{
  "accessToken": "eyJ...",
  "accessTokenExpiresIn": 7200,
  "refreshToken": "rt_...",
  "user": { "id": "usr_...", "nickname": "书友_8271", "avatarUrl": null, "isNewUser": true }
}
```

游客（`DEVICE`）登录后可调 `POST /users/me/bind-phone`（体同 PHONE 登录）绑定手机号升级账号。

### 4.2 用户 Users

| 方法与路径 | 说明 |
|---|---|
| `GET /users/me` | 当前用户资料 + VIP 状态：`{ id, nickname, avatarUrl, phoneMasked, vip: { active, expiresAt } }` |
| `PATCH /users/me` | 更新资料，体：`{ "nickname"?, "avatarUrl"? }`，返回更新后资料 |
| `POST /users/me/bind-phone` | 游客绑定手机号，体：`{ phone, smsCode }`。成功 `204`；手机号已被占用返回 `USER_PHONE_ALREADY_BOUND` |

### 4.3 内容 Dramas / Episodes（公开读，可匿名）

| 方法与路径 | 说明 |
|---|---|
| `GET /dramas` | 剧列表。查询参数：`category?`、`tag?`、`sort?=HOT\|NEW`（默认 HOT）、`cursor`、`limit`。返回 `DramaSummary` 分页。 |
| `GET /dramas/{dramaId}` | 剧详情，返回 `DramaDetail`。未发布/下架返回 `404 CONTENT_NOT_FOUND` / `410 CONTENT_OFFLINE`。 |
| `GET /dramas/{dramaId}/episodes` | **扁平化集列表**（跨季按全局集序排列，适配单季短剧主场景）。查询参数：`seasonNumber?`、`cursor`、`limit`（默认 50）。返回 `EpisodeItem` 分页。 |
| `GET /episodes/{episodeId}` | 单集详情，返回 `EpisodeItem`。 |
| `PUT /dramas/{dramaId}/favorite` | 收藏（幂等）。成功 `204`。 |
| `DELETE /dramas/{dramaId}/favorite` | 取消收藏（幂等）。成功 `204`。 |
| `GET /users/me/favorites` | 我的收藏，`DramaSummary` 分页。 |

### 4.4 播放 Playback

播放地址不随集详情下发，需单独换取短时效令牌（防盗链核心）：

`POST /episodes/{episodeId}/playback-token`

请求体：`{ "quality": "720p" }`（可选，默认最高可用清晰度）

成功 `200`：

```json
{
  "playUrl": "https://cdn.../ep.m3u8?sign=...",
  "format": "hls",
  "quality": "720p",
  "expiresAt": "2026-08-27T10:30:00.000Z",
  "resumePositionSec": 45
}
```

失败：`403 EPISODE_LOCKED`（未解锁，`details` 附 `unlockPolicy`、`priceCoins`）、`403 EPISODE_VIP_REQUIRED`、`410 CONTENT_OFFLINE`。匿名用户请求付费集返回 `401 AUTH_REQUIRED`。

### 4.5 解锁 Unlocks（要求 `Idempotency-Key`）

`POST /episodes/{episodeId}/unlock`

请求体：`{}`（价格以服务端实时计算为准，客户端不传价格）

成功 `200`：

```json
{
  "unlock": { "id": "ulk_...", "episodeId": "ep_...", "method": "COIN", "costCoins": 280, "costBonus": 20 },
  "wallet": { "coinBalance": 0, "bonusBalance": 0, "totalBalance": 0 }
}
```

失败：`402 WALLET_INSUFFICIENT_BALANCE`、`409 UNLOCK_ALREADY_UNLOCKED`（返回既有解锁记录）、`422 UNLOCK_POLICY_NOT_ALLOWED`（如 VIP_ONLY 集）。

`POST /dramas/{dramaId}/unlock` — 一键解锁全剧剩余付费集。

请求体：`{}`；成功 `200`：

```json
{
  "unlockedEpisodeCount": 68,
  "totalCostCoins": 15000,
  "discountApplied": 0.8,
  "wallet": { "coinBalance": 200, "bonusBalance": 0, "totalBalance": 200 }
}
```

`GET /dramas/{dramaId}/unlock-quote` — 解锁报价预览（不扣费）：`{ "remainingEpisodes": 68, "originalCoins": 18750, "payableCoins": 15000, "discount": 0.8 }`。

`GET /users/me/unlocks?dramaId=...` — 我的解锁记录分页。

### 4.6 钱包 Wallet

| 方法与路径 | 说明 |
|---|---|
| `GET /wallet` | 返回 `WalletView`。 |
| `GET /wallet/transactions` | 流水分页：`{ id, type, coinDelta, bonusDelta, refType, refId, createdAt }`。查询参数 `type?`。 |
| `GET /wallet/products` | 充值档位：`[{ productId, productType: "COIN"\|"VIP", amountCents, coins, bonusCoins, vipDays, badge }]`。 |
| `POST /wallet/recharge-orders` | 下单（要求 `Idempotency-Key`）。体：`{ "productId": "prod_...", "paymentChannel": "WECHAT" }`。成功 `201` 返回 `{ orderId, status: "PENDING", amountCents, paymentPayload }`，`paymentPayload` 为渠道拉起支付所需参数（结构按渠道而异，客户端透传给支付 SDK）。 |
| `GET /wallet/recharge-orders/{orderId}` | 订单状态轮询：`{ orderId, status, coins, bonusCoins, paidAt }`。客户端支付完成后轮询至 `CREDITED`。 |

支付渠道回调 `POST /payments/callbacks/{channel}` 为服务端间接口，不在客户端契约内，此处仅声明存在；验签与幂等要求见领域模型 §5.3。

### 4.7 观看进度 Progress

`PUT /progress/episodes/{episodeId}`（upsert，心跳 + 退出上报）

请求体：

```json
{ "positionSec": 45, "durationSec": 95, "clientUpdatedAt": "2026-08-27T10:00:00.000Z" }
```

成功 `204`。冲突按 `clientUpdatedAt` Last-Write-Wins，旧于服务端记录时静默忽略（仍返回 `204`）。

| 方法与路径 | 说明 |
|---|---|
| `GET /progress/dramas/{dramaId}` | 该剧下我的全部集进度（断点续播 + 集列表"已看"标记）：`{ items: [{ episodeId, episodeNumber, positionSec, completed }], lastWatched: {...} }` |
| `GET /users/me/watch-history` | 追剧列表分页：`{ drama: DramaSummary, lastEpisodeNumber, lastPositionSec, watchedAt }`，按 `watchedAt` 倒序。 |
| `DELETE /users/me/watch-history/{dramaId}` | 从追剧列表移除。成功 `204`。 |

### 4.8 推荐 Recommendations 与埋点 Events

`GET /recommendations/feed?scene=HOME&cursor=&limit=10`

```json
{
  "items": [
    {
      "cardType": "CONTINUE_WATCHING",
      "drama": { "...": "DramaSummary" },
      "continueEpisode": { "episodeId": "ep_...", "episodeNumber": 12, "positionSec": 45 },
      "recReason": "继续观看",
      "trackingId": "trk_01J6..."
    },
    {
      "cardType": "DRAMA",
      "drama": { "...": "DramaSummary" },
      "continueEpisode": null,
      "recReason": "热播榜 Top3",
      "trackingId": "trk_01J6..."
    }
  ],
  "pageInfo": { "nextCursor": "...", "hasMore": true }
}
```

`scene` 枚举：`HOME`（首页信息流）/ `PLAYER`（播放页"猜你喜欢"）。匿名可用（返回非个性化热门）。

`POST /events/batch` — 埋点批量上报（≤50 条/批，尽力送达，服务端总是 `202`）：

```json
{
  "events": [
    { "eventType": "IMPRESSION", "dramaId": "drm_...", "trackingId": "trk_...", "clientTs": "...", "context": { "page": "HOME", "position": 3 } },
    { "eventType": "PLAY_COMPLETE", "episodeId": "ep_...", "clientTs": "..." }
  ]
}
```

### 4.9 评论 Comments（功能开关控制）

功能关闭时所有评论接口返回 `403 COMMENT_FEATURE_DISABLED`；客户端应依据 `GET /config`（见 §4.10）的 `features.comments` 决定是否展示入口。

| 方法与路径 | 说明 |
|---|---|
| `GET /episodes/{episodeId}/comments` | 根评论分页（`sort?=HOT\|NEW`）。返回体见下。 |
| `GET /comments/{commentId}/replies` | 某根评论下的回复分页。 |
| `POST /episodes/{episodeId}/comments` | 发评论。体：`{ "content": "...", "parentId": null }`。成功 `201` 返回评论对象（`status` 可能为 `PENDING`，客户端标注"审核中"）。 |
| `DELETE /comments/{commentId}` | 作者删除自己的评论（置 `HIDDEN`）。成功 `204`；非作者返回 `403 COMMENT_NOT_OWNER`。 |
| `PUT /comments/{commentId}/like` | 点赞（幂等）。成功 `204`。 |
| `DELETE /comments/{commentId}/like` | 取消点赞（幂等）。成功 `204`。 |

评论对象：

```json
{
  "id": "cmt_01J6...",
  "episodeId": "ep_...",
  "author": { "userId": "usr_...", "nickname": "书友_8271", "avatarUrl": null },
  "content": "反转太爽了",
  "parentId": null,
  "status": "APPROVED",
  "likeCount": 12,
  "viewerLiked": true,
  "replyCount": 3,
  "createdAt": "2026-08-27T09:00:00.000Z"
}
```

### 4.10 客户端配置 Config

`GET /config`（匿名可用）— 客户端启动时拉取功能开关与静态配置。**Live OpenAPI is `GET /v1/config`.** The design example below still shows `comments: true` as the flag's *shape*; the running handler returns the conservative product state (`comments: false`, `adUnlock: false`, heartbeat 10 s) because PNL-04 is not on `main` and GATE-4 has not named a unit id (C4-08 wired the grant path; the flag stays off). Legal URLs, ad-unit ids and `wallet.coinName` are omitted — C4/C5 URLs are unpublished (SCR-12), GATE-4 has not named a unit id, and the coin name already lives in i18n (`C4-04`).

```json
{
  "features": { "comments": true, "adUnlock": false },
  "playback": { "progressHeartbeatSec": 10 },
  "wallet": { "coinName": "看点" }
}
```

## 5. HTTP 状态码使用约定

| 状态码 | 使用场景 |
|---|---|
| 200 / 201 / 202 / 204 | 成功：读或写返回体 / 创建 / 已受理（异步）/ 无返回体 |
| 400 | 参数校验失败（`COMMON_VALIDATION_FAILED`） |
| 401 | 未认证或令牌失效（`AUTH_*`） |
| 402 | 余额不足（`WALLET_INSUFFICIENT_BALANCE`，专用） |
| 403 | 已认证但无权限 / 功能关闭 / 内容锁定 |
| 404 | 资源不存在 |
| 409 | 状态冲突（重复解锁、幂等键冲突） |
| 410 | 内容已下架 |
| 422 | 语义不允许（策略不允许该操作） |
| 429 | 限流 |
| 500 / 503 | 服务端错误 / 依赖不可用（客户端可重试幂等操作） |

完整错误码目录与 `details` 字段约定见 `docs/12-error-catalog.md`。
