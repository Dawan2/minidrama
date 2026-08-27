# 02 — 页面与组件清单（Screen Inventory）

> Wave 1 · 计划槽 P2。配套：`docs/02-information-architecture.md`（下称 IA，路由/返回栈/状态框架的权威定义）、`docs/02-user-journeys.md`（下称旅程）。
> 数据依赖列引用 `docs/12-api-contracts.md` 端点；错误码引用 `docs/12-error-catalog.md`；平台 API 引用 `docs/11-api-and-bridge.md`。

## 1. 编号与清单总表

编号规则：`SCR-` 页面（占路由）、`PNL-` 覆盖层面板（不占路由，IA §5）、`CMP-` 全局组件。

| 编号 | 名称 | 路由 | 层级 | 匿名 |
|---|---|---|---|---|
| SCR-01 | 启动页 | （启动序列，无业务路由） | — | 是 |
| SCR-02 | 首页·推荐流 | `#/home` | Tab 根 | 是 |
| SCR-03 | 剧场·分类 | `#/browse` | Tab 根 | 是 |
| SCR-04 | 剧详情 | `#/drama/:dramaId` | push | 是 |
| SCR-05 | 播放器 | `#/play/:episodeId` | push/replace | 是（受令牌拦截） |
| SCR-06 | 我的 | `#/me` | Tab 根 | 是（资产区降级） |
| SCR-07 | 追剧·历史 | `#/history` | push | 否 |
| SCR-08 | 我的收藏 | `#/favorites` | push | 否 |
| SCR-09 | 钱包 | `#/wallet` | push | 否 |
| SCR-10 | 充值页 | `#/recharge` | push | 否 |
| SCR-11 | VIP 页 | `#/vip` | push | 否 |
| SCR-12 | 设置·关于 | `#/settings` | push | 是 |
| SCR-13 | 全局兜底页 | `#/fallback` | replace | 是 |
| PNL-01 | 选集面板 | — | 播放器覆盖层 | — |
| PNL-02 | 解锁面板 | — | 播放器覆盖层 | — |
| PNL-03 | 充值面板 | — | 覆盖层（可叠于 PNL-02） | — |
| PNL-04 | 评论面板 | — | 播放器覆盖层（功能开关） | — |
| PNL-05 | 清晰度/倍速面板 | — | 播放器覆盖层 | — |
| CMP-01 | Toast | — | 全局 | — |
| CMP-02 | 确认对话框 | — | 全局 | — |
| CMP-03 | 骨架屏/加载指示 | — | 全局 | — |
| CMP-04 | 空态组件 | — | 全局 | — |
| CMP-05 | 页内错误/重试组件 | — | 全局 | — |
| CMP-06 | 弱网横幅 | — | 全局 | — |

所有页面共同义务（不再逐屏重复）：避让胶囊安全区并设置导航栏颜色（IA §2 P3）；实现五态（IA §8.1）；`AUTH_TOKEN_EXPIRED` 由全局拦截器处理（IA §8.2）。

## 2. 状态矩阵总表

`√`=必须实现；`—`=不适用；`特`=有本屏特有状态（见 §3 逐屏说明）。

| 编号 | 加载 | 内容 | 空态 | 可重试错误 | 终态错误 | 特有态 |
|---|---|---|---|---|---|---|
| SCR-01 | √ | — | — | √（init/登录失败重试） | — | 特：匿名降级放行 |
| SCR-02 | √ 骨架 | √ | √ | √ | — | — |
| SCR-03 | √ 骨架 | √ | √（筛选无结果） | √ | — | — |
| SCR-04 | √ 骨架 | √ | — | √ | √（404/410） | — |
| SCR-05 | √ 封面占位 | √ | — | √ | √（410） | 特：S6 锁定态、S7 卡顿态（旅程 J12） |
| SCR-06 | √ | √ | — | √（分区就地） | — | 特：匿名引导卡、封禁说明条 |
| SCR-07 | √ 骨架 | √ | √ | √ | — | 特：下架项蒙层 |
| SCR-08 | √ 骨架 | √ | √ | √ | — | 特：下架项蒙层 |
| SCR-09 | √ | √ | √（流水空） | √ | — | 特：到账确认中横幅（旅程 J11-3） |
| SCR-10 | √ | √ | — | √ | — | 特：支付轮询态 |
| SCR-11 | √ | √ | — | √ | — | 特：开通确认中（旅程 J6） |
| SCR-12 | — | √ | — | — | — | — |
| SCR-13 | — | √ | — | — | — | 按 reason 三变体 |
| PNL-01 | √ | √ | — | √（面板内） | — | — |
| PNL-02 | — | √ | — | √（面板内） | — | 特：通道显隐组合 |
| PNL-03 | √ | √ | — | √（面板内） | — | 特：支付轮询/到账确认 |
| PNL-04 | √ | √ | √ | √（面板内） | — | 特：审核中标注、禁言置灰 |
| PNL-05 | — | √ | — | — | — | — |

## 3. 逐屏说明

### SCR-01 启动页

- **职责**：承载启动序列（IA §8.4）：`TTMinis.init` → 静默登录 → `GET /config`。
- **数据依赖**：`POST /auth/login`（差距 G1）、`GET /config`。
- **状态**：加载（品牌 + 进度）；init 失败 → 终止性重试态；登录失败 → 放行为匿名模式（旅程 J1）；config 失败 → 默认开关放行。
- **返回**：无（序列 ≤3s 目标；超 5s 展示进度文案缓解焦虑）。

### SCR-02 首页·推荐流

- **数据依赖**：`GET /recommendations/feed?scene=HOME`（游标分页）。
- **交互**：继续观看卡片一击进播放器（旅程 J3）；普通卡进详情；下拉刷新、触底加载。
- **错误码**：`REC_SCENE_INVALID`（不应出现，兜底走可重试错误态）。
- **空态**：「暂时没有内容，下拉刷新试试」（服务端热门兜底后仍空属异常，旅程 J1）。
- **埋点**：卡片 IMPRESSION（携 `trackingId`，可视面积 ≥50% 计一次）/ CLICK。

### SCR-03 剧场·分类

- **数据依赖**：`GET /dramas?category=&tag=&sort=`（分页）。
- **交互**：分类/标签筛选条、HOT/NEW 排序；搜索入口预留但默认隐藏（差距 G5）。
- **空态**：「该分类暂无内容」+ 清除筛选按钮（行动出口指向可恢复操作）。
- **筛选变更**：筛选参数写入路由 query（IA §5），返回/分享可还原视图。

### SCR-04 剧详情

- **数据依赖**：`GET /dramas/{dramaId}`、`GET /dramas/{dramaId}/episodes`（首屏 50 集 + 分页）。
- **内容**：封面/简介/标签/统计（`statSnapshot`）、收藏按钮（幂等 PUT/DELETE，乐观 UI，旅程 J8）、集列表（每集渲染 `viewerAccess` 锁标）、主按钮「立即观看/继续观看」（登录态取 `viewer.lastWatched`）。
- **终态错误**：`404 CONTENT_NOT_FOUND`（不存在）/ `410 CONTENT_OFFLINE`（下架变体，旅程 J13）。
- **埋点**：CLICK（进入播放）、FAVORITE。

### SCR-05 播放器（核心屏）

- **数据依赖**：`GET /episodes/{episodeId}`、`POST /episodes/{episodeId}/playback-token`、`PUT /progress/episodes/{episodeId}`（心跳）、`GET /progress/dramas/{dramaId}`（选集面板已看标记）、`GET /recommendations/feed?scene=PLAYER`（完播推荐）。
- **布局**：竖屏沉浸；上滑/下滑切集（replace，IA §6 B4）；右侧操作栏（收藏/评论/选集）；底部进度条与集号。
- **状态**（在五态外的特有态）：
  - **S6 锁定态**：封面 + 锁标 + 自动弹出 PNL-02；触发于 `viewerAccess.playable=false` 或令牌 `403 EPISODE_LOCKED / EPISODE_VIP_REQUIRED`（`details` 直接渲染价格，IA §8.3）。深链落地付费集即此态（旅程 J4）。
  - **S7 卡顿态**：转圈 ≤8s → 自动降档 → 重试入口（旅程 J12-3）。
- **令牌管理**：`expiresAt` 预判静默重签（IA §8.3）；临近集尾预取下一集令牌（仅 `playable=true` 的下一集）。
- **返回**：回进入前页面；深链冷启动回合成的 `#/home`（IA §7.3）。
- **埋点**：PLAY_START / PLAY_COMPLETE / UNLOCK。

### SCR-06 我的

- **数据依赖**：`GET /users/me`、`GET /wallet`（余额卡）。
- **内容**：资料区（授权拒绝时默认昵称头像 + 「完善资料」入口，旅程 J10-A）、VIP 状态卡、余额卡（进 SCR-09/10）、追剧/收藏/设置入口。
- **特有态**：匿名 → 资产区替换为登录引导卡（旅程 J10-B）；封禁 → 顶部说明条（旅程 J14）。
- **分区加载**：资料与钱包分区独立请求、独立就地错误，互不阻塞。

### SCR-07 追剧·历史 / SCR-08 我的收藏

- **数据依赖**：`GET /users/me/watch-history`（按 `watchedAt` 倒序）/ `GET /users/me/favorites`；移除 `DELETE /users/me/watch-history/{dramaId}`、`DELETE /dramas/{dramaId}/favorite`。
- **交互**：历史项一击续播（携断点）；编辑模式批量移除；下架项蒙层（旅程 J13）。
- **空态**：「还没有追剧/收藏」+「去首页看看」。

### SCR-09 钱包

- **数据依赖**：`GET /wallet`（充值币/赠币分列展示，口径与领域模型 §5.1 一致）、`GET /wallet/transactions`（分页，`type` 筛选）。
- **特有态**：存在未终态订单时顶部「到账确认中」横幅，点击恢复轮询（旅程 J11-3）。
- **空态**：流水空「暂无明细」；入口按钮「去充值」常驻。

### SCR-10 充值页 / PNL-03 充值面板

同一组件两种容器（页面容器供钱包路径，面板容器供解锁路径叠加于 PNL-02，IA §6 B3）：

- **数据依赖**：`GET /wallet/products`、`POST /wallet/recharge-orders`（幂等键）、`GET /wallet/recharge-orders/{orderId}`（轮询）。
- **状态**：档位选择 → 拉起支付（`TTMinis.pay`，差距 G2）→ 轮询态（可取消返回）→ 成功/失败/到账确认中（旅程 J11 全分支）。
- **错误码**：`PAYMENT_PRODUCT_NOT_FOUND`（重拉档位）、`PAYMENT_CHANNEL_UNAVAILABLE`（通道置灰）、`PAYMENT_ORDER_CLOSED`（重新下单指引）。
- **面板容器特有**：携带解锁意图（`?intent=`/本地记录），到账后自动执行（旅程 J2 步 9、J11-9）。

### SCR-11 VIP 页

- **数据依赖**：`GET /wallet/products`（`productType=VIP`）、订阅端点（差距 G4）、`GET /users/me`（VIP 状态）。
- **状态**：未开通（权益 + 档位）/ 已开通（到期时间 + 续费）/ 开通确认中（旅程 J6）。

### SCR-12 设置·关于

- **内容**：ToS/隐私政策入口（checklist C4/C5，站内渲染或平台允许的方式打开）、联系客服（C11 邮箱）、清除本地缓存、版本信息、「完善资料」（同 SCR-06 入口）。
- **说明**：无退出登录（静默登录体系无登出语义；契约 `POST /auth/logout` 保留给多端会话管理，不在本产品 UI 暴露）。

### SCR-13 全局兜底页

按 `reason` 三变体：`NOT_FOUND`（路由/内容不存在）、`OFFLINE`（内容下架，附推荐位 `GET /recommendations/feed?scene=HOME` 复用）、`MAINTENANCE`（服务端 503 持续时的整页降级）。永远提供「回首页」；返回键等价回首页（IA §6 B8）。

### PNL-01 选集面板

- **数据依赖**：详情页已取的集列表 + `GET /progress/dramas/{dramaId}`（已看标记）。
- **内容**：网格集号（锁标 = `viewerAccess`；已看 = `completed`；当前集高亮）；分组切换（每 30 集一组，应对 80+ 集）。
- **交互**：点集 → 关面板 → replace 切集。

### PNL-02 解锁面板

- **通道结构位**（IA §2 P5，显隐矩阵见 IA §9）：单集币解锁（价格来自 `details`/集详情）、整剧解锁（入口带折扣角标，旅程 J7）、广告解锁（`features.adUnlock` + `canIUse`，旅程 J5）、VIP（旅程 J6）。
- **附带信息**：当前余额（`GET /wallet`）；余额不足时主按钮直接文案「余额不足，去充值」（预选差额档位，错误目录 §11）。
- **错误处理**：面板内就地（IA §8.1）；`UNLOCK_ALREADY_UNLOCKED` 视为成功关面板开播。

### PNL-04 评论面板

- **数据依赖**：`GET /episodes/{id}/comments?sort=HOT|NEW`、`GET /comments/{id}/replies`、发表/删除/点赞端点（契约 §4.9）。
- **状态**：审核中标注（`status=PENDING` 仅本人可见）、禁言置灰（`COMMENT_USER_MUTED`）、空态「抢首评」；开关关闭时整个入口不渲染（旅程 J9）。

### PNL-05 清晰度/倍速面板

- **内容**：清晰度（来自令牌响应 `quality` 与集的 `videoAssets` 能力集）、倍速（1.0/1.25/1.5/2.0）。
- **规则**：手动选清晰度后锁定，不再自动降档（IA §8.3）；选择持久化到本地。

### 全局组件要点

- **CMP-01 Toast**：单例队列，同 code 3s 内去重；文案默认取错误响应 `message`（错误目录 §1 规则 4：服务端下发可直接展示）。
- **CMP-02 确认对话框**：仅用于不可逆/资金操作（整剧解锁确认、支付中离开拦截、批量删除）。
- **CMP-04 空态组件**：插画 + 主文案 + 行动按钮三段式，行动出口逐屏定义（§3）。
- **CMP-05 错误/重试组件**：区分可重试与终态两种渲染（IA §8.1）；携带 `traceId` 的「问题反馈」暗入口（长按），便于客服排障（契约 §2.5）。
- **CMP-06 弱网横幅**：全局网络状态监听 + 连续失败计数触发（IA §8.2）；不阻断操作。

## 4. 埋点与页面对照（供数据侧核对）

| 事件（领域模型 §8.2） | 触发页面/组件 | context.page 取值 |
|---|---|---|
| IMPRESSION | SCR-02 / SCR-13 推荐位 | `HOME` / `FALLBACK` |
| CLICK | SCR-02 / SCR-03 / SCR-04 | `HOME` / `BROWSE` / `DETAIL` |
| PLAY_START / PLAY_COMPLETE | SCR-05 | `PLAYER` |
| UNLOCK | PNL-02（成功回调处） | `PLAYER` |
| FAVORITE | SCR-04 / SCR-05 | `DETAIL` / `PLAYER` |

上报走 `POST /events/batch` 本地队列（IA §8.2），任何页面卸载不等待埋点完成。
