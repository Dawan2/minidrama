# 波次执行协议（Wave Protocol）— 60 波 / 12 周期 / 6 槽

> 工作槽：W1 计划槽 P3（任务核验与 60 波地图）· 日期：2026-08-27 · 分支 `cursor/w1-plan-p3-e16a`
> 本文定义**怎么执行**（节奏、槽位、闸门、交接、验证）。**做什么**（波次主题与产品内容）以 `docs/00-wave-plan.md`、`docs/01-product-scope.md` 为准，任务级拆分以 `docs/plan/backlog.md` 为准，完成判据以 `docs/plan/definition-of-done.md` 为准。
> **引用说明**：本文引用的 `docs/00-*`、`01-*`、`02-*`、`03-*`、`11-*`、`12-*`、`14-*` 由 Wave 1 其他槽产出，当前位于分支 `cursor/w1-plan-p3-1d0f`（SHA `3c2b296`，已 octopus 合并 work-a/b/d 与 plan-p1/p2）。本槽分支基线为 `main`（`fc1333f`），仅新增 `docs/plan/` 三份文件，未改写任何其他槽文件；集成后上述链接即生效。
> **闸门回写**：W13 work/docs（`cursor/w13-gate-writeback-f515`）在 §5.1 状态列、§6 登记表、§8 规则 3、§9 变更记录上回写。依据是 `docs/verify/cycle-2-report.md`（D-08、D-15）与 `docs/plan/cycle-3-backlog.md` C3-03。商务项记为**未答问题**，不编造 EIS / BytePlus 日期。细节见 `docs/gates/open-questions.md` 与 `docs/handoff/w13-gate-writeback.md`。

---

## 1. 为什么需要本文

`docs/00-wave-plan.md` 给出了 50 波的**主题骨架**，但没有回答四个执行问题，而这四个问题正是多槽并行下最容易返工的地方：

1. 一波里有几个槽、各槽边界在哪、如何避免文件冲突？
2. 计划、实现、验证之间的节奏是什么？谁有权宣布"完成"？
3. 验证由谁做才算"独立"？验证不通过怎么办？
4. 商务闸门与官方 PDF 缺失这类外部阻塞，如何在不空转的前提下被强制记账？

本文用**「12 周期 × 5 波 = 60 波」+「每波 6 槽（3 计划 + 3 工作）」**回答上述问题。60 波地图见 §5，与 00 号文档 50 波主题的对应关系见 §5.2。

---

## 2. 术语与记法

| 术语 | 定义 |
| --- | --- |
| **波（Wave）** | 一轮并行工作单位，编号 W1–W60。一波内各槽同时开工、互不等待。 |
| **周期（Cycle）** | 连续 5 波构成一个交付周期，编号 C1–C12。周期是**唯一的验收单位**——只有周期能宣布"这批东西做完了"。 |
| **槽（Slot）** | 一波内的一条独立工作线，独立分支、独立交接文档。每波 6 槽：计划槽 P1/P2/P3 + 工作槽 A/B/C。 |
| **闸门（Gate）** | 外部条件（商务/官方），未解除则相关任务禁止进入"完成"态。闸门清单见 §6。 |
| **就绪（Ready）** | 一个任务的全部依赖已完成且其闸门已解除 → 可被排进工作槽。 |

状态记法（沿用 `docs/00-wave-plan.md` §1）：`[ ]` 未开始 / `[~]` 进行中 / `[x]` 完成 / `[!]` 阻塞。

**波号公式**（周期 k = 1…12）：

| 角色 | 波号 | k=1 | k=12 |
| --- | --- | --- | --- |
| 计划波（Plan） | `5k−4` | W1 | W56 |
| 实现波（Implement）×3 | `5k−3`、`5k−2`、`5k−1` | W2、W3、W4 | W57、W58、W59 |
| 验证波（Verify） | `5k` | W5 | W60 |

即：**每个周期 = 1 波计划 + 3 波实现 + 1 波独立验证**。

---

## 3. 槽位模型：3 计划槽 + 3 工作槽

### 3.1 槽位职责与文件所有权

文件所有权是**硬约束**：一个文件只有一个 owner 槽可以写。跨槽差异一律走"冲突登记"（§3.4），不得直接改写他槽文件。这条规则在 Wave 1 已被验证有效（`docs/handoff/w1-p3.md` §3 登记了 C1–C11 共 11 项冲突且零改写）。

| 槽 | 角色 | 主要职责 | 独占文件路径 |
| --- | --- | --- | --- |
| **P1** | 产品与路线 | 产品范围、波次主题、优先级、验收口径、backlog 排序 | `docs/00-*`、`docs/01-*`、`docs/plan/backlog.md` |
| **P2** | 体验与信息架构 | 信息架构、页面与组件清单、用户旅程、状态矩阵、埋点事件字典 | `docs/02-*` |
| **P3** | 架构与执行协议 | 技术架构、选型 ADR、非功能预算、波次协议、完成定义 | `docs/03-*`、`docs/plan/wave-protocol.md`、`docs/plan/definition-of-done.md`、`docs/gates/` |
| **A** | 客户端与平台桥接 | H5 前端、播放器、桥接层、i18n、官方平台 API 对接 | `app/`、`docs/11-*` |
| **B** | 服务端与契约 | Fastify 模块、数据层、OpenAPI 契约、共享类型 | `server/`、`contracts/`、`packages/`、`docs/12-*` |
| **C** | 基建·质量·安全 | CI 门禁、测试脚手架、可观测性、安全工具链、发布流水线 | `.github/`、`infra/`、`docs/14-*` |

> **历史对照**：Wave 1（`-1d0f` 运行）的三个工作槽命名为 `work-a`（官方要求 → `docs/11-*`）、`work-b`（领域模型/契约 → `docs/12-*`）、`work-d`（质量门禁 → `docs/14-*`）。自 W2 起第三工作槽统一称 **C**，职责与 `work-d` 完全一致，文档前缀不变（仍为 `docs/14-*`）。

### 3.2 各角色波中的槽行为

槽是常设的，但**在不同角色的波里做不同强度的事**。这样既保证 6 槽始终有事可做，又保证责任清晰。

| 波角色 | P1 / P2 / P3（计划槽） | A / B / C（工作槽） |
| --- | --- | --- |
| **计划波** `5k−4` | **主角**：吸收上一周期验证结论 → 把本周期史诗拆成任务（ID/依赖/验收/槽位）→ 回写 backlog 与闸门表 | 配角：技术预研、探针、脚手架预备、上周期遗留缺陷修复（**不得开新功能**） |
| **实现波** `5k−3…5k−1` | 配角：闸门跟踪、冲突裁决、契约回写、需求澄清（**不得改动本周期已冻结的验收标准**） | **主角**：按 backlog 就绪队列实现，每波结束推分支 + 交接文档 |
| **验证波** `5k` | **主角**：周期报告、下一周期计划草案、backlog 重排 | 转为**独立验证槽 V1/V2/V3**：交叉验证他槽产出（§4） |

### 3.3 分支与交接（恒定规则）

- 分支名：`cursor/w<波号>-<槽名>-<运行后缀>`，例：`cursor/w7-work-b-e16a`、`cursor/w10-verify-v2-e16a`。
- **只 push，不开 PR**；由集成者统一合并到 **`main`**（集成分支，见 §8 规则 3）。任何槽不得自行合并他槽分支到 `main`，集成槽除外。
- 每槽收工必须产出 `docs/handoff/w<波号>-<槽名>.md`，内容至少包含：分支与 SHA、产出清单、关键决策、**冲突登记**、阻塞项、给后续槽的接口、明确未做的范围。
- 交接文档缺失 = 该槽本波未完成，不计入周期验收（见 `definition-of-done.md` §4）。

### 3.4 冲突登记规程

发现自己需要改他槽文件时：**不改，登记**。在自己的交接文档中开"冲突登记"表，逐条写明：冲突点、涉及文档与章节、裁决建议、建议裁决人。裁决人在其后的**计划波或实现波**回写自己的文件，并在 backlog 中标记该冲突条目关闭——回写任务必须有独立任务 ID，不得作为其他任务的附带产物（否则无法被验证波按 V-d 核对）。

> 允许工作槽在实现波回写裁决，是为了避免"计划槽等工作槽、工作槽等计划波"的死锁：裁决人是谁由文件所有权决定（§3.1），而工作槽的正常工作波是实现波。示例：a11y 冲突 C-12 的裁决人是槽 C，其回写任务 `QA-011` 排在实现波 W17。

---

## 4. 独立验证波（`5k`）规程

验证波是本协议的核心防线，目的只有一个：**让"完成"这件事不由作者本人宣布**。

### 4.1 独立性规则

1. **验证者 ≠ 作者**：验证槽 Vi 不得验证自己在本周期实现波中产出的任何内容。
2. **轮转分配**：第 k 周期，验证槽 Vi 验证工作槽的映射按 `(i + k) mod 3` 轮转，保证长期内每个验证槽都验过每个工作槽，避免固定配对产生的盲区共谋。

| 周期 | V1 验证 | V2 验证 | V3 验证 |
| --- | --- | --- | --- |
| C1、C4、C7、C10 | B | C | A |
| C2、C5、C8、C11 | C | A | B |
| C3、C6、C9、C12 | A | B | C |

3. **从干净检出开始**：验证槽必须在全新工作区从周期集成分支检出，按文档描述的命令重跑，**不得复用实现槽的中间产物**。文档没写的隐含步骤即缺陷。
4. **禁止"帮修"**：验证槽发现问题只记录不修复（除非是 1 行以内的文档笔误）。修复归属下一周期计划波排期，防止验证者与作者身份混同。

### 4.2 验证清单（每周期固定五问）

| # | 验证问题 | 判据 |
| --- | --- | --- |
| V-a | 本周期每个任务的**验收标准**是否逐条可复现地满足？ | 逐任务 通过/不通过/不适用，不允许"基本通过" |
| V-b | CI 是否**真的在拦**？ | 对每条本周期新增门禁做一次**反向验证**：故意注入违规 → 流水线必须变红（判据见 `definition-of-done.md` §7.1 的 S-C6） |
| V-c | 是否存在被跳过/删除/弱化的测试与门禁？ | `skip`/`only`/`continue-on-error`/阈值下调/排除项新增，一律视为不通过（铁律 R1–R5） |
| V-d | 文档与代码是否一致？交叉引用是否可解析？ | 契约 ↔ 实现 ↔ 文档三方对照；死链、指向不存在章节的引用记为缺陷 |
| V-e | 闸门与阻塞项状态是否被如实回写？ | §6 闸门表 + 各槽阻塞项，不允许"静默乐观" |

### 4.3 产出与裁决

- 验证槽产出 `docs/verify/c<周期号>-v<槽号>.md`（例 `docs/verify/c02-v1.md`），含逐条判据与证据（命令、输出摘要、SHA）。
- 计划槽 P1 汇总为 `docs/verify/c<周期号>-report.md`，给出周期裁决：**通过 / 有条件通过 / 不通过**。
- **有条件通过**：仅允许残留 P2 级问题，且每条必须带 ID 进入下一周期 backlog 的最前列。
- **不通过**：下一周期计划波必须把整改排为最高优先级，实现波不得开启新史诗，直到复验通过。复验仍由原验证槽做。
- **不允许**：以"下个周期再说"作为默认处置而不登记任务 ID。

---

## 5. 60 波地图

### 5.1 12 周期总表

| 周期 | 波次 | 周期目标 | 出场标准（周期验收） | 闸门 | 状态 |
| --- | --- | --- | --- | --- | --- |
| **C1** | W1–W5 | **方案基线冻结**：官方要求、领域模型、契约、选型、质量门禁定稿；冲突 C1–C11 裁决；契约转写 OpenAPI；monorepo 与 CI L1 上线 | 契约 lint 零 error 且与 12 号文档逐端点对照无缺漏；CI L1 十条门禁**反向验证全部变红**；冲突台账全部关闭或书面延期 | M0 登记 | `[!]` 未通过（`docs/verify/cycle-1-report.md`；C2 复验仍未通过，`docs/verify/cycle-2-report.md` §7.2） |
| **C2** | W6–W10 | **工程地基**：后端基座（错误结构/幂等/限流/配置/日志）、数据层与迁移、前端脚手架与路由、CI L2、可观测性 | 迁移正向+回滚可执行；种子数据 ≥2 部剧 ≥80 集；L2 门禁全绿且反向验证通过；traceId 端到端贯通 | — | `[!]` 未通过（`docs/verify/cycle-2-report.md` §0：出场 1/4；无迁移、无 L2；`traceId` 已通） |
| **C3** | W11–W15 | **读路径闭环（Mock）**：认证闭环、目录/详情/分集、播放令牌与 `viewerAccess` 强制执行、播放器骨架 | Mock 登录 E2E 通过；锁定集在连播/深链/切集三入口均被**服务端**拦截；**等价 WebView 宿主**的 MSE/EME 探测结论回写（B-3 由"未知"降级为"待 TikTok 宿主内真机复验"，复验任务 `PLY-003` 在 C9，受 M1 闸门） | — | `[~]` 实现进行中（W13 回写时 `main` 已有 Mock 登录、静默再登录、VePlayer 替换回调；C2 地基仍缺，见 §6.2） |
| **C4** | W16–W20 | **播放体验**：播放器完整交互（手势/进度/倍速/切集/连播）、续看与观看历史、无障碍基线 | 交互验收单全过（`01-product-scope` §4.3）；跨端进度冲突用例通过；a11y 门禁上线且核心屏零 critical/serious | — | `[ ]` |
| **C5** | W21–W25 | **变现闭环（Mock 渠道）**：钱包双账户、充值档位、单集/批量解锁、支付建单与回调发货、对账 | 「先赠后充」有测试；解锁事务不变式测试通过；重复/乱序回调不重复发货 | — | `[ ]` |
| **C6** | W26–W30 | **发现与数据 + 阶段验收**：广告解锁（Mock）、Feed 混排、搜索与分类、埋点全链路；核心闭环 E2E 进 CI | 未完整观看不发奖有测试；事件字典逐条可查证；登录→浏览→播放→解锁→续看 E2E 全绿 | — | `[ ]` |
| **C7** | W31–W35 | **平台真集成 I**：CLI 工具链、`TTMinis.init`、静默登录真集成、导航栏与安全区、可信域名与代码扫描合规 | `minis build` 产物通过校验；真机静默登录成功；E5–E9 自检全过；运行时请求域全部在清单内 | **M1** | `[ ]` |
| **C8** | W36–W40 | **平台真集成 II（变现）**：Beans 支付、订阅、激励视频与插屏广告真集成 | 沙箱支付-发货闭环；webhook 验签+幂等有测试（解除 B-2）；广告 `isEnded` 发奖 + 服务端日志双轨 | **M2+M4** | `[ ]` |
| **C9** | W41–W45 | **国际化与真机**：英文全量、语言切换、双端真机联调、7 项必接自检回写 | 英文走查零缺漏/零截断；Android 测试客户端 + iOS 预览核心旅程全过；checklist D4–D9 全 `[x]` | **M6** | `[ ]` |
| **C10** | W46–W50 | **硬化 I**：错误态全覆盖、弱网与离线、性能优化、资金链路健壮性、安全加固 | 错误码 × UI 映射 100%；弱网矩阵全过；性能预算达标；重复回调压测零重复发货；安全检查单全过 | — | `[ ]` |
| **C11** | W51–W55 | **硬化 II 与质量门**：埋点校验与看板、UI 打磨、全量回归、低端机专项、质量门终审 | P0/P1 清零且 P2 有处置结论；`01-product-scope` §6 七条质量门逐条签字 | — | `[ ]` |
| **C12** | W56–W60 | **上架冲刺与放量**：素材定稿、内容合规自审、基本信息提交、代码包预检、送审、全量上线、值守与移交 | 版本 Ready For Release → Push to production；线上 7 项必接验证通过；举报 72h SLA 值守就位；复盘与移交签收 | **M3+M5** | `[ ]` |

### 5.2 与 `docs/00-wave-plan.md`（50 波主题）的映射

60 波地图**不替换**、也不改写 00 号文档，它是把 00 号文档的主题铺进"计划/实现/验证"节奏后的执行视图。多出的 10 波全部用于**独立验证与整改**（原 50 波计划中没有为验证单独留波）。

| 本文周期 | 覆盖 00 号文档波次 | 说明 |
| --- | --- | --- |
| C1 | 旧 W1–W3 | 旧 W2（选型/规范）与旧 W3（测试策略/门禁）的产出已由 Wave 1 的 P3/work-d 前置完成，故并入 C1，剩余为裁决与转写 |
| C2 | 旧 W4–W7 | 仓库工程化 + 后端基座 + 数据层 |
| C3 | 旧 W8–W10 | 认证 + 内容读 + 播放令牌与播放器骨架 |
| C4 | 旧 W11–W12 | 播放器交互 + 续看历史（新增 a11y 基线） |
| C5 | 旧 W13–W15 | 钱包 + 解锁 + 支付闭环 |
| C6 | 旧 W16–W20 | 广告 + Feed + 搜索 + 埋点 + 阶段验收 |
| C7 | 旧 W21–W22、W26–W27 | 工具链/登录/导航栏/域名合规（同属 M1 闸门，合并为一个周期） |
| C8 | 旧 W23–W25 | 支付/订阅/广告真集成（同属 M2+M4 闸门） |
| C9 | 旧 W28–W30 | 英文本地化 + 真机联调 + 必接自检 |
| C10 | 旧 W31–W35 | 错误态/弱网/性能/资金/安全 |
| C11 | 旧 W36–W40 | 埋点校验/UI 打磨/回归/低端机/质量门 |
| C12 | 旧 W41–W50 | 上架冲刺 10 波压缩进 1 个周期的 3 实现波 + 1 验证波；其中"上线监控值守/灰度演练/运营移交"（旧 W48–W50）按 §5.3 处理 |

### 5.3 溢出与压缩规则

- **C12 容量提示**：旧 W41–W50 十个主题压进一个周期，是因为其中多数为**提交-等待**型（提交后等平台审核），实际占用的工程波次少于日历波次。若 C12 实现波无法容纳，按 §7 的溢出规则处理，**不得靠删减出场标准来"塞下"**。
- **闸门阻塞时不空转**：某周期被闸门阻塞时，从 backlog 中顺位提取**无闸门依赖**的就绪任务填充实现波（`docs/00-wave-plan.md` §4 规则 2 的同款约定），但周期出场标准不因此下调——该周期改判为"未完成，延续到下一周期"。
- **60 波是节奏而非承诺**：若某周期不通过验证，整改占用下一周期的实现波，整体地图顺延。**顺延必须显式记录在 §9 变更记录**，禁止靠"压缩验证波"回补进度。

---

## 6. 闸门登记表

闸门是**外部依赖**，不受工程努力影响，因此必须独立跟踪、每个计划波回写一次状态。M1–M6 继承 `docs/00-wave-plan.md` §2；**M0 为本槽新增**。

**编号对照**（W13 采纳，关闭 D-08 的登记缺口）：`GATE-n` 即 `Mn`（n = 0…6）。`GATE-7`（EIS）与 `GATE-8`（BytePlus / VePlayer）此前只存在于 `docs/plan/w1-conflict-register.md` §7 与 `docs/plan/media-plane-decision.md` §7 的提案中，W1 表不含二者。权威表是 **§6.1**。提案原文仍保留，避免静默改写；后续计划槽应把那两份改为指向本节，而不是再抄一份（C3-03 验收 2，属 P1/P2 文件，本槽未改）。

W1 原文（状态列已被 §6.2 取代；行文保留）：

| 闸门 | 内容 | 阻塞什么 | 明确不阻塞什么 | 解除条件 | 状态（W1） |
| --- | --- | --- | --- | --- | --- |
| **M0 官方要求 PDF** | 用户侧官方要求 PDF 至今**未提供**（`docs/11-official-onboarding-checklist.md` §0.1、`docs/handoff/w1-work-a.md` B-1、`docs/handoff/w1-p3.md` B-1 三次确认工作区无此文件） | ① 任何"官方口径已核实/已定稿"的**终态声明**；② C12 送审前的合规终审；③ 版本可上架 DoD（`definition-of-done.md` §8 的 S-M0，为送审否决项） | **不阻塞开工**。W1–W11 周期全部基于官方公开网页来源 S1–S15 推进，技术方案对 PDF 内容零返工假设 | PDF 入库并完成逐条 diff：顺序为 `11-official-onboarding-checklist` → `01-tiktok-minis-requirements` → `03-*` 系列，差异以 PDF 为准回写并记录提交 SHA（任务 `GOV-002`） | `[!]` **阻塞中** |
| **M1 账号与组织** | 开发者账号、组织、App 三元组凭据（checklist A1–A5） | C7 全部真集成任务 | C1–C6 全部 Mock 路径任务 | Portal 中三元组可用且已注入 CI/运行环境密钥库 | `[ ]` |
| **M2 企业认证** | Business Verification（checklist §3.1） | C8 变现真集成；C12 送审 | C1–C7 | 认证状态 Approved | `[ ]` |
| **M3 行业资质** | 代表作短剧链接 + 公司介绍（checklist B2–B7） | C12 基本信息过审 | C1–C11 | 资质审核通过 | `[ ]` |
| **M4 变现开通** | IAA/IAP 签约、广告位创建、webhook 配置（checklist §4.4） | C8 | C1–C7 | 广告位 ID 与 webhook 地址已配置且可回调 | `[ ]` |
| **M5 US 审批** | US Launch Approval + TPRM（若首发含美国） | C12 美区发布 | 非美区发布 | 审批通过，或首发区域书面排除美国（依赖开放问题 P-1） | `[ ]` |
| **M6 对接人 POC** | TikTok 运营/商务联系或工单通道；Android 测试客户端申请 | C9 真机联调；B-2（webhook 验签口径）的解除 | C1–C8 | 通道建立且 Android 测试客户端可安装 | `[ ]` |

### 6.1 Authoritative register (W13)

Four required fields per gate, as `GOV-005` / `GOV-008` specified. Status is the **external** condition. Engineering progress is in §6.2 and must not be read as a release. Amendments in the content column are One Page facts already in `docs/plan/w1-conflict-register.md` §7.2, applied here rather than invented.

| Gate | Content | Blocks | Explicitly does not block | Release condition | Status (2026-08-27, `main` `a6c04d3`) |
| --- | --- | --- | --- | --- | --- |
| **GATE-0 / M0** official requirements | User PDF is still absent from the workspace (`find` over `*.pdf` → empty). The Feishu One Page is **located** and roughly half transcribed (`docs/product/compliance-tiktok-minis.md`); the rest still requires authenticated access (`docs/plan/w1-conflict-register.md` §8). Wording is therefore "authenticated access required", not "not locatable". | Any terminal "requirements verified" claim; C12 pre-submission compliance sign-off; DoD S-M0 | Starting work. Cycles continue on public sources S1–S15 with a zero-rework assumption that has not been tested against the missing half | PDF in-repo **or** authenticated One Page export covering everything after §2.5, then a recorded diff (`GOV-002`) | `[!]` **blocking — no movement** |
| **GATE-1 / M1** account / org / credentials | Developer account, organisation, App triple (checklist A1–A5). **Precondition (One Page):** organisation name, app name and app type (*Minis drama*) are permanent and need written business and legal sign-off **before** the organisation is created — there is no correction path | All real integration (C7); the last step of real TikTok login (`C3-08`) | Every Mock-path task, including the login flow behind `createMockIdentityPort` | Triple available in Portal and injected into the runtime secret store | `[ ]` **no movement** |
| **GATE-2 / M2** business verification | Business Verification. Lead time typically three working days (ONE-6). Entity qualification is mandatory for publishing dramas and for monetisation — there is no "unverified soft launch" | C8 real monetisation; C12 submission; trade-order API access (with GATE-4) | C1–C7 Mock paths | Status Approved | `[ ]` **no movement** |
| **GATE-3 / M3** industry qualification | Representative short-drama links + company profile (checklist B2–B7). Partner / industry approval sits here | C12 basic-information approval | C1–C11 | Qualification approved | `[ ]` **no movement** |
| **GATE-4 / M4** monetisation enablement | IAA/IAP. **IAA has been self-service in Portal since 2026-07-09** (ONE-5); enabling IAP opens a four-step contract flow. The account manager is the escalation path, not the mechanism | C8 Beans, subscription, ads; observed Beans amounts (`C3-09`) | C1–C7 | Ad-slot IDs and webhook URL configured and callable | `[ ]` **no movement** |
| **GATE-5 / M5** US launch + TPRM | US Launch Approval + TPRM. USDS half: restricted-country screening plus demonstrated data-security capability (e.g. a penetration-test report) | C12 US release | A launch whose documented region set excludes the US | Approval, **or** a written first-launch region set that excludes the United States (open question B-4 / Q-G-1) | `[ ]` **no movement** |
| **GATE-6 / M6** partner / POC | TikTok operations / business contact or ticket channel; Android test client. Establishing the account-manager relationship is the same first action as for GATE-7 and GATE-8 | C9 on-device integration; B-2 (webhook-signature questions); real-device half of D4 | C1–C8 Mock paths | Channel exists and an Android test client can be installed | `[ ]` **no movement** |
| **GATE-7** EIS | External Information Sharing review for IAA/IAP launches in Europe or the US after 2026-08-08. Criteria unpublished; starts with an account-manager questionnaire; published duration 15–30 US business days **after submission**. Adopted from `docs/plan/w1-conflict-register.md` §7.2 (`GOV-005`). **No submission date is known. None is invented.** | Monetised EU/US launch: `REL-003` / `REL-005` / `AC-CMP-12`; sits upstream of contract signing (C8) | Cycles C1–C6 entirely; all Mock-path work; a launch whose documented region set excludes Europe and the US | Review passed, **or** the launch-region set is documented as excluding Europe and the US | `[ ]` **no movement — escalated, §6.4** |
| **GATE-8** BytePlus / VePlayer media plane | Whether this organisation may use the platform media plane at launch: pilot membership, whether `/v2/sg/shortdrama/*` accepts our `client_key`, whether `<video>` replacement is live and how it is scoped, switchover terms. Adopted from `docs/plan/media-plane-decision.md` §7 (`GOV-008`). **No ingest date is known. None is invented.** The distinguishing property: this is the only gate whose *unfavourable* resolution **creates** work (MP-B) rather than merely unblocking it | Implementing BytePlus ingest, moderation submission or listing against real platform APIs; committing catalogue volume to a dated launch; scheduling `CTR-011` implementation | The whole of C1; client build; player façade; writing the `CTR-011` spec; every Mock-path task; VePlayer-only client work under `D-MP-1` | Written answer from the account manager or platform, or retrieved `S-OP-1`, establishing **either** (a) pilot membership with a date from which our `client_key` may ingest, **or** (b) non-membership plus switchover terms. A device probe narrows; it does not release | `[ ]` **no movement — escalated, §6.4** |

Two related business inputs that are not numbered gates, tracked with them because W10's nine-blocker table and `C3-08` / `C3-09` treat them as the same class:

| Item | What is true in engineering | What is blocked | Status |
| --- | --- | --- | --- |
| **Real TikTok login** (last step of `C3-08`) | Whole path exists and is honest. `createTiktokIdentityPort` still refuses every real code (`PROVIDER_UNCONFIGURED` / `PROVIDER_UNAVAILABLE`). Silent re-login on `401` is on `main` (`a6a0404` / `2eabdbd`) | D4 as `[x]`; every authenticated journey against a real credential | Gated on GATE-1 + GATE-6. **Not `[x]`** |
| **Beans conversion rate** (`C3-09`) | `trade-order-port.ts` carries `priceCoins` and performs no conversion. No `beansPerCoin` / `coinToBeans` / `BEANS_RATE` in `app/`, `server/` or `packages/` | D7 coin pricing; wallet recharge amounts | Missing business input. **No rate is invented** |

### 6.2 Writeback — engineering truth versus the business track

Measured against `origin/main` `a6c04d3` ("Merge origin/main: no overlap with VePlayer replace files"), 2026-08-27. Commands are in `docs/handoff/w13-gate-writeback.md` §3.

`docs/plan/wave-protocol.md` had **one commit**, from W1 (`e47fe21`), until this writeback. No plan wave had written gate status with evidence since then. C1 set the clock (`docs/verify/cycle-1-report.md` §8.1); C2 closed with the same table (`docs/verify/cycle-2-report.md` §8 / D-15). This implement-wave writeback is the overdue plan-wave duty in C3-03, taken under §3.4 so the register does not wait another cycle on a slot that has already missed twice.

**Engineering, moved (not a gate release):**

| Fact | Evidence |
| --- | --- |
| `main` is the integration branch and holds the product | Named in §3.3 / §8 rule 3; C2 report §1. Closes the paper half of D-09 |
| Mock login is exercisable end to end | `createMockIdentityPort` behind `config.testLoginEnabled`; C3's first exit reached early |
| Silent re-login on a refused token | `app/src/session/session-recovery.ts` on `main` |
| Fail-closed VePlayer `<video>`-replace callback | `app/src/platform/video-replace.ts`; installer returns `null`. Does **not** release GATE-8 |
| `D-MP-1` / GATE-8 engineering side still held | No BytePlus ingest, moderation or listing implementation on `main` |
| Cover allowlist at the `<img>` | `CoverImage` + import-hygiene (W12/W13). Not a business gate |
| Paging flake class D-10 closed | `renderSettled` conversion (W13). Not a business gate |
| Paid unlock grant | On `main` (W9/W12). Mock-channel; GATE-4 still `[ ]` |

**Business track, unmoved.** Nine items, three cycles, zero external evidence. Each is an open question in §6.3, not an optimistic status.

C2's own exits remain: no database, no migration, 27 seed episodes against a floor of 80, no CI L2. Those are engineering, not AM-blocked, and they are still open. Recording them here so a green gate table cannot be mistaken for a passed C2.

### 6.3 Open questions (account manager / business)

Answers are **unknown**. This slot did not ask the platform, did not invent dates, and did not treat a missing answer as a no. Forward verbatim; each is one sentence. Full list: `docs/gates/open-questions.md`.

| # | Question | Releases / decides |
| --- | --- | --- |
| **Q-G-1** | What is the documented first-launch region set? Does it include the EU, the US, both, or neither? | Whether GATE-5 and GATE-7 apply at all (B-4) |
| **Q-G-2** | Has an EIS questionnaire been started with an account manager? If submitted, on what date? | GATE-7. **Do not fill a date here** |
| **Q-G-3** | From what date can our `client_key` upload through `/v2/sg/shortdrama/*` and submit albums for moderation? | GATE-8 (Q-MP-1). **Do not fill a date here** |
| **Q-G-4** | Is our organisation in the media-storage-and-player pilot (One Page §3, 2026-06-25)? If not, what is the admission path? | GATE-8 (Q-MP-2) |
| **Q-G-5** | Does a TikTok mini-drama account-manager relationship exist for this organisation, and what is the contact? | GATE-6; entry point for GATE-7 and GATE-8 |
| **Q-G-6** | Are the developer-account / organisation / App credentials available to inject into the runtime secret store? | GATE-1; last step of real login |
| **Q-G-7** | What Beans amount did a real (sandbox) trade order of a known coin price actually charge? | The conversion rate. **No rate in code until this is observed** |
| **Q-G-8** | Industry qualification / partner approval: submitted? If so, on what date, and what was the result? | GATE-3 |
| **Q-G-9** | Where is the official requirements PDF, or an authenticated One Page export covering everything after §2.5? | GATE-0 |

### 6.4 Rule-3 escalations (fired at C2 close; filed here)

§6 discipline rule 3: a gate with no movement across two consecutive cycles escalates to a risk entry with a named alternative. C1 started the clock; C2 closed unchanged; C3's plan wave specified the filing as C3-03 and did not write this file. Filed now. Alternatives are priced, not taken — taking one is a product decision.

| Gate | Risk | Alternative if it still does not move | Cost of taking the alternative late |
| --- | --- | --- | --- |
| **GATE-7** | Long-lead opaque review (15–30 US business days after a submission that has not happened) sits upstream of C8 | Document a first launch that **excludes the EU and the US**. Removes EIS and USDS TPRM from the critical path. Product decision B-4 / Q-G-1 | A submission that then slips on unpublished criteria, after engineering has already built the monetised EU/US path |
| **GATE-8** | "Still open" here **creates** work if the answer is unfavourable (MP-B: own media plane) | **Price MP-B now** (`docs/plan/media-plane-decision.md` §3), including reversal cost, while the standing default remains MP-C | Pricing MP-B during a launch slip, with catalogue volume already committed and no switchover terms |
| **GATE-0 / M0** | Five-plus cycles of public-source work rest on a zero-rework assumption nobody can test | None. There is no alternative to obtaining the PDF or the authenticated remainder; there is only the growing cost of not having it | A late PDF that contradicts S1–S15 rewrites checklist, requirements and architecture together |
| **GATE-1 / M1** | Real login, real CLI, real trusted-domain work cannot leave Mock | Continue Mock-path (already the plan). Do not synthesise `open_id` | A stubbed live exchange that issues sessions to arbitrary strings |
| **GATE-2 / M2** | No verified entity → no publishing, no monetisation | Do not plan an unverified soft launch (One Page closed that option) | Discovering the three-day lead time on the critical path of a listing date |
| **GATE-3 / M3** | Partner / industry approval is a listing gate | Keep C1–C11 unblocked; do not schedule C12 basic-information as if the links existed | A listing package that waits on representative-work URLs nobody collected |
| **GATE-4 / M4** | No Beans, ads or subscription | Keep the refusing trade-order port; IAA is self-service and can start without waiting on IAP | Inventing a coin→Beans rate in a type definition that the viewer will believe |
| **GATE-5 / M5** | US release blocked | Same region decision as GATE-7: exclude the US from first launch | Building US-only evidence (TPRM, USDS) for a launch that then drops the US |
| **GATE-6 / M6** | No device, no AM, no ticket path | Treat establishing the AM relationship as the single action that also unblocks GATE-7 and GATE-8 asks | Six separate escalations for one missing contact |

**闸门纪律**：

1. 闸门状态只能由**计划波**回写，且必须给出依据（邮件/工单号/Portal 截图归档路径）。本 W13 回写是实现波补记逾期的计划波义务（C3-03 / D-15）：连续两周期无人回写。下一次仍归计划波；无证据不得改状态。
2. 任何任务在其闸门未解除时**不得标记 `[x]`**，最多 `[~]`；试图以 Mock 结果宣布真集成完成，验证波按 V-e 判不通过。
3. 闸门长期不动（连续 2 个周期无进展）必须在周期报告中升级为风险条目并给出替代方案（如 M5 未动 → 首发区域排除美国）。**已触发，见 §6.4。** 对 GATE-8，"无进展"必须按 MP-B 的成本阅读，而不是按"仍被阻塞、无额外工作"。
4. 不得把工程进展写进闸门状态列。Mock 登录、静默再登录、VePlayer 回调都是工程事实，不是 GATE-1 / GATE-8 已解除。

---

## 7. 溢出、插入与优先级规则

| 场景 | 规则 |
| --- | --- |
| 实现波做不完 | 未完成任务**原 ID 顺延**到下一实现波，不拆新 ID、不改验收标准。连续两波顺延 → 计划波必须重新评估拆分粒度 |
| 周期内发现新工作 | 一律进 backlog 尾部，由**下一个计划波**排期。实现波中途插任务仅限：主干变红（铁律 R6）、资金/安全事故、闸门刚解除且已排期的任务 |
| 验证不通过 | §4.3：整改占据下一周期实现波最高优先级，复验由原验证槽做 |
| 缺陷优先级 | P0（崩溃/资金错误/无法登录播放）立即插入；P1（核心旅程失败）当周期内修复；P2 进 backlog 排期。定义见 `01-product-scope` §6.1 |
| 主干变红 | 15 分钟内修不好即 revert（铁律 R6），不受波次边界限制 |

---

## 8. 恒定禁止项（全 60 波适用）

以下条款在任何波次、任何进度压力下均不可协商，与 `docs/14-quality-gates.md` §0 铁律 R1–R6 同级：

1. **不删除/跳过/弱化测试与门禁**换绿（R1–R5）；阈值只允许单调收紧。
2. **不伪造官方来源**：PDF 缺失期间只引用编号化的官方公开网页来源（S1–S15），引用必须可追溯到具体来源编号；不得写"根据官方文档"而无来源编号。
3. **不开 PR**：各槽只 push 分支，合并由集成者执行，目标分支是 **`main`**。`main` 是集成分支。验证与交接以 `origin/main` 为准。
4. **不改他槽文件**：走 §3.4 冲突登记。
5. **不创建子代理**。
6. **不以 Mock 结果宣布真集成完成**（见 §6 闸门纪律 2）。
7. **不静默改写历史计划**：波次/周期调整走 §9 变更记录追加。

---

## 9. 变更记录

| 日期 | 波·槽 | 变更 |
| --- | --- | --- |
| 2026-08-27 | W1·P3 | 首版：确立 12 周期 × 5 波 = 60 波、每波 3 计划槽 + 3 工作槽、验证槽轮转规则、M0 闸门（官方 PDF 缺失）登记、与 `docs/00-wave-plan.md` 50 波主题的映射 |
| 2026-08-27 | W13·work/docs | 闸门回写（C3-03 / D-08 / D-15）。§6 采纳 `GATE-7`、`GATE-8` 并与 M0–M6 对照；状态按 `main` `a6c04d3` 的工程事实与商务未答问题分开记录，不编造 EIS / BytePlus 日期。§6.4 补记规则 3 升级。§5.1 回写 C1/C2 未通过、C3 进行中。§3.3 / §8 规则 3 写明集成分支是 `main`（D-09 纸面一半）。§3.1 增加 `docs/gates/`。§2 周期算术**未改**（X-21 仍待 P3：仓库运行计数把 W9 称作 C3，与 §2 的 W6–W10 = C2 并存） |
