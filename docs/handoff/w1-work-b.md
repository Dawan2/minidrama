# W1B 交接文档 — 领域模型与契约

> Wave 1 · 工作槽 W1B。分支：`cursor/w1-work-b-1d0f`。仅架构方案，无任何实现代码；未开 PR，未触碰 CI。

## 1. 本槽产出

| 文件 | 内容 |
|---|---|
| `docs/12-domain-model.md` | 短剧平台领域模型：7 个限界上下文（内容/用户/钱包/解锁/进度/推荐/评论），实体字段、状态机、不变式、事务边界、ER 图 |
| `docs/12-api-contracts.md` | 面向客户端的 REST/JSON 契约：全局约定（认证、游标分页、幂等、统一错误结构）+ 10 组端点（Auth/Users/Dramas/Playback/Unlocks/Wallet/Progress/Rec/Comments/Config）及请求响应示例 |
| `docs/12-error-catalog.md` | 全平台业务错误码唯一权威目录：11 个分域约 40 个错误码，含 HTTP 映射、`details` 结构约定与客户端处理建议 |
| `docs/handoff/w1-work-b.md` | 本文档 |

三份文档互为引用、构成一体：领域模型定语义，契约定线上接口形态，错误目录定失败路径。**阅读顺序建议**：先领域模型 §2（全局约定）与 §3.4（解锁策略），再契约 §2–§3，最后按需查端点与错误码。

## 2. 关键架构决策（及理由）

1. **前缀化字符串 ID（ULID）**：`drm_`/`ep_`/`usr_` 等对外暴露，防遍历、日志自描述；DB 内部主键实现自由。
2. **钱包双账户（充值币 + 赠币）**：财务口径与退款处理必须分离；消耗顺序固定"先赠币后充值币"。
3. **资金与解锁写操作强制 `Idempotency-Key`**，钱包用乐观锁 `version`；充值"回调置 PAID"与"入账置 CREDITED"两步分离，以渠道订单号幂等，防回调重放重复入账。
4. **可看性由服务端计算**：集详情附 `viewerAccess` 视图（`FREE/UNLOCKED/VIP/NEED_UNLOCK/NEED_VIP/UNAVAILABLE`），客户端禁止自行推导解锁逻辑；剧级"前 N 集免费"优先于集级付费策略。
5. **播放地址不直出**：`POST /episodes/{id}/playback-token` 签发短时效 URL，是防盗链的核心口子，也是"锁定集拦截"的强制执行点。
6. **进度上报走 upsert + Last-Write-Wins**（按 `clientUpdatedAt`），过旧上报静默忽略仍返回 204；观看历史由进度联动更新，非独立写入口，允许最终一致。
7. **推荐 Wave 1 只定契约不定算法**：Feed 卡片视图 + `trackingId` 曝光回传 + 埋点事件模型（`/events/batch`），首版策略规则混排（继续观看 > 热门 > 新剧），为后续算法留接口不留债。
8. **评论带审核状态机 + 功能开关**：`PENDING→APPROVED/REJECTED→HIDDEN`，作者可见自己审核中的评论；合规不允许时以 `features.comments=false` 整体关闭，契约保留。
9. **错误码为字符串分域码**（`WALLET_INSUFFICIENT_BALANCE`），只增不改不删；客户端按 code 分支，message 直接展示。
10. **保留季（Season）层级但契约扁平化**：`GET /dramas/{id}/episodes` 跨季全局集序返回，兼顾"单季短剧"主场景与未来分季付费。

## 3. 给其他工作槽 / Wave 2 的接口约定

- **给后端实现槽**：以 `12-api-contracts.md` 为接口基线直接生成路由骨架；建议实现顺序：Auth → 内容读 → 播放令牌 → 钱包/解锁（含幂等中间件）→ 进度 → 推荐/评论。解锁与充值入账的事务不变式见领域模型 §5.2、§6.1，是测试用例的重点来源。
- **给前端/客户端槽**：所有"能不能看"以 `viewerAccess` 为准；错误处理直接按 `12-error-catalog.md` §11 的客户端处理建议表落地；启动时拉 `GET /config` 决定评论入口等开关。
- **给基建/CI 槽**：本槽未创建也未修改任何 CI 配置。契约冻结后建议加契约测试（如 OpenAPI schema 校验）；本契约可机械转写为 OpenAPI 3.1（Wave 2 任务）。
- **文档编号**：本槽占用 `12-` 前缀三份文档；`docs/handoff/` 为各槽交接目录，其他槽按 `w1-work-<x>.md` 命名即可，无冲突。

## 4. 开放问题（需产品/合规拍板，已在领域模型 §12 登记）

1. 剧下架后已解锁用户是否保留回看权（当前默认不可看）。
2. VIP 观看付费集是否落解锁凭证（影响 VIP 到期后的权限）。
3. 激励视频广告解锁的开关与风控（模型已留 `method=AD` 与 `features.adUnlock`）。
4. 评论功能最终是否开放（模型与契约已按"可整体关闭"设计，两个方向均无返工）。
5. 多端进度冲突是否需要比 LWW 更细的策略。

## 5. 仓库与分支状态

- 基线：`main`（初始提交，仅 README，无 CI、无代码）。
- 本槽分支：`cursor/w1-work-b-1d0f`，仅新增 `docs/` 下 4 个 Markdown 文件，零代码、零配置变更。
- 已 push 至 origin，**未开 PR**（按 Wave 1 规则由集成者统一处理）。
