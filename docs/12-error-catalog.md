# 12 — 错误码目录（Error Catalog）

> Wave 1 · 工作槽 W1B。本目录是全平台业务错误码的**唯一权威来源**。
> 错误响应结构见 `docs/12-api-contracts.md` §2.5。

## 1. 设计规则

1. **格式**：`<域前缀>_<语义>`，全大写下划线（如 `WALLET_INSUFFICIENT_BALANCE`）。采用字符串码而非数字码：自描述、日志可读、无需查表，且新增无编号冲突。
2. **分域前缀**：`COMMON` / `AUTH` / `USER` / `CONTENT` / `EPISODE` / `UNLOCK` / `WALLET` / `PAYMENT` / `PROGRESS` / `REC` / `COMMENT`。新增错误码必须先登记本目录再上线。
3. **稳定性**：错误码是契约的一部分，**只增不改不删**；废弃的码标注 deprecated 并保留至下一大版本。
4. **客户端契约**：客户端按 `code` 分支处理；`message` 为服务端下发的简体中文用户文案，可直接展示；`details` 字段结构按码约定（下表"details 约定"列）。
5. **HTTP 映射**：每个码绑定唯一 HTTP 状态码；同一状态码可对应多个业务码。

## 2. 通用 COMMON

| 错误码 | HTTP | 语义 | details 约定 |
|---|---|---|---|
| COMMON_VALIDATION_FAILED | 400 | 请求参数校验失败 | `{ fields: [{ field, reason }] }` |
| COMMON_MALFORMED_REQUEST | 400 | 请求体非法（非 JSON / 编码错误） | null |
| COMMON_IDEMPOTENCY_KEY_REQUIRED | 400 | 缺少 Idempotency-Key 请求头 | null |
| COMMON_IDEMPOTENCY_CONFLICT | 409 | 幂等键已存在但请求体不同 | `{ idempotencyKey }` |
| COMMON_RESOURCE_NOT_FOUND | 404 | 通用资源不存在（无更具体域码时使用） | `{ resourceType, resourceId }` |
| COMMON_RATE_LIMITED | 429 | 触发限流 | `{ retryAfterSec }` |
| COMMON_INTERNAL_ERROR | 500 | 服务端未预期错误 | null |
| COMMON_SERVICE_UNAVAILABLE | 503 | 依赖服务不可用，可稍后重试 | `{ retryAfterSec? }` |

## 3. 认证 AUTH

| 错误码 | HTTP | 语义 | details 约定 |
|---|---|---|---|
| AUTH_REQUIRED | 401 | 需要登录（缺少令牌） | null |
| AUTH_TOKEN_INVALID | 401 | 令牌非法（签名/格式错误） | null |
| AUTH_TOKEN_EXPIRED | 401 | accessToken 过期（客户端应静默刷新） | null |
| AUTH_REFRESH_TOKEN_INVALID | 401 | refreshToken 失效（需重新登录） | null |
| AUTH_SMS_CODE_INVALID | 400 | 短信验证码错误或过期 | `{ remainingAttempts }` |
| AUTH_SMS_SEND_TOO_FREQUENT | 429 | 验证码发送过于频繁 | `{ retryAfterSec }` |
| AUTH_PROVIDER_ERROR | 502 | 第三方授权失败（微信/Apple） | `{ provider }` |
| AUTH_USER_BANNED | 403 | 账号已被封禁 | `{ bannedUntil? }` |

## 4. 用户 USER

| 错误码 | HTTP | 语义 | details 约定 |
|---|---|---|---|
| USER_NOT_FOUND | 404 | 用户不存在 | null |
| USER_NICKNAME_INVALID | 400 | 昵称不合规（长度/敏感词） | `{ reason }` |
| USER_PHONE_ALREADY_BOUND | 409 | 手机号已绑定其他账号 | null |
| USER_ALREADY_HAS_PHONE | 409 | 当前账号已绑定手机号，不可重复绑定 | null |

## 5. 内容 CONTENT / EPISODE

| 错误码 | HTTP | 语义 | details 约定 |
|---|---|---|---|
| CONTENT_NOT_FOUND | 404 | 剧/季/集不存在或未发布 | `{ resourceType, resourceId }` |
| CONTENT_OFFLINE | 410 | 内容已下架 | `{ resourceType, resourceId }` |
| EPISODE_LOCKED | 403 | 集未解锁，需付费 | `{ episodeId, unlockPolicy, priceCoins }` |
| EPISODE_VIP_REQUIRED | 403 | 集仅限 VIP 观看 | `{ episodeId }` |
| EPISODE_ASSET_UNAVAILABLE | 503 | 视频资源暂不可用（转码中/存储异常） | `{ episodeId }` |

## 6. 解锁 UNLOCK

| 错误码 | HTTP | 语义 | details 约定 |
|---|---|---|---|
| UNLOCK_ALREADY_UNLOCKED | 409 | 已解锁过该集（响应 details 附既有记录） | `{ unlockId, unlockedAt }` |
| UNLOCK_POLICY_NOT_ALLOWED | 422 | 该集策略不允许此解锁方式（如免费集/VIP_ONLY 集发起币解锁） | `{ episodeId, unlockPolicy }` |
| UNLOCK_NOTHING_TO_UNLOCK | 422 | 整剧解锁时无剩余付费集 | `{ dramaId }` |
| UNLOCK_PRICE_CHANGED | 409 | 报价已变化（整剧解锁下单与报价间价格变动），客户端应重新获取报价 | `{ dramaId, currentPayableCoins }` |

## 7. 钱包 WALLET / 支付 PAYMENT

| 错误码 | HTTP | 语义 | details 约定 |
|---|---|---|---|
| WALLET_INSUFFICIENT_BALANCE | 402 | 余额不足 | `{ requiredCoins, coinBalance, bonusBalance }` |
| WALLET_FROZEN | 403 | 钱包被风控冻结 | null |
| WALLET_CONCURRENT_MODIFICATION | 409 | 并发扣费冲突且重试耗尽（客户端可原幂等键重试） | null |
| PAYMENT_PRODUCT_NOT_FOUND | 404 | 充值档位不存在或已下架 | `{ productId }` |
| PAYMENT_CHANNEL_UNAVAILABLE | 503 | 支付渠道暂不可用 | `{ paymentChannel }` |
| PAYMENT_ORDER_NOT_FOUND | 404 | 充值订单不存在 | `{ orderId }` |
| PAYMENT_ORDER_CLOSED | 409 | 订单已关闭（超时/取消），需重新下单 | `{ orderId }` |
| PAYMENT_CALLBACK_INVALID_SIGN | 400 | 渠道回调验签失败（服务端间接口） | null |

## 8. 进度 PROGRESS

| 错误码 | HTTP | 语义 | details 约定 |
|---|---|---|---|
| PROGRESS_INVALID_POSITION | 400 | positionSec 非法（负数或远超 durationSec） | `{ positionSec, durationSec }` |

> 说明：进度上报刻意宽容——时间戳过旧被 LWW 忽略时仍返回 204，不设错误码；仅明显非法数据拒绝。

## 9. 推荐 REC

| 错误码 | HTTP | 语义 | details 约定 |
|---|---|---|---|
| REC_SCENE_INVALID | 400 | 未知推荐场景 scene | `{ scene }` |
| REC_EVENTS_BATCH_TOO_LARGE | 400 | 埋点批量超过 50 条 | `{ maxBatchSize }` |

> 说明：埋点接口对单条事件的字段错误采取"丢弃并计数"策略，不整批失败，故无逐条错误码。

## 10. 评论 COMMENT

| 错误码 | HTTP | 语义 | details 约定 |
|---|---|---|---|
| COMMENT_FEATURE_DISABLED | 403 | 评论功能未开放（功能开关关闭） | null |
| COMMENT_NOT_FOUND | 404 | 评论不存在或不可见 | null |
| COMMENT_CONTENT_INVALID | 400 | 内容不合规（超长/空/敏感词命中硬拦截） | `{ reason }` |
| COMMENT_REJECTED | 422 | 机审直接拒绝（区别于进入 PENDING 的软审） | null |
| COMMENT_NOT_OWNER | 403 | 非本人评论，无权删除 | null |
| COMMENT_REPLY_DEPTH_EXCEEDED | 422 | 回复层级超限（仅支持两层） | null |
| COMMENT_USER_MUTED | 403 | 用户被禁言 | `{ mutedUntil? }` |

## 11. 客户端处理建议（规范性附录）

| 情形 | 客户端行为 |
|---|---|
| `AUTH_TOKEN_EXPIRED` | 用 refreshToken 静默刷新后重放原请求（至多一次） |
| `AUTH_REFRESH_TOKEN_INVALID` / `AUTH_USER_BANNED` | 清除本地会话，跳转登录 |
| `WALLET_INSUFFICIENT_BALANCE` | 弹出充值面板，携带 `details.requiredCoins` 预选档位 |
| `EPISODE_LOCKED` | 弹出解锁面板（`details` 含价格与策略） |
| `UNLOCK_ALREADY_UNLOCKED` | 视为成功，直接进入播放 |
| `UNLOCK_PRICE_CHANGED` | 重新拉取报价并提示用户确认 |
| `COMMON_RATE_LIMITED` / `COMMON_SERVICE_UNAVAILABLE` | 按 `retryAfterSec` 退避重试（仅幂等操作） |
| `COMMENT_FEATURE_DISABLED` | 隐藏评论入口（应以 `/config` 开关为准，此码为兜底） |
