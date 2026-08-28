# 14. 质量门禁(Quality Gates)与 CI 方案

> **状态**:Wave 1 规范定稿(W1D)
> **适用范围**:minidrama 全部代码仓库与子模块(客户端、后端、管理后台、基础设施即代码)
> **配套文档**:[14-test-plan.md](./14-test-plan.md)(测试策略)、[14-security.md](./14-security.md)(安全与合规)

---

## 0. 铁律(不可协商)

以下规则为**最高优先级约束**,任何人(包括项目负责人)不得以进度、演示、紧急上线等理由绕过。CI 系统必须以技术手段强制执行,而非仅靠约定。

| # | 铁律 | 含义 |
|---|------|------|
| R1 | **CI 失败即失败** | 任何门禁检查失败,流水线整体状态必须为失败(红色),**禁止**将失败步骤标记为 `allow_failure`、`continue-on-error`、`soft fail` 或"仅警告"。失败的流水线**禁止合并、禁止发布、禁止上架**。 |
| R2 | **禁止删除测试换绿** | 不得为了让流水线变绿而删除已有测试。删除测试仅允许出现在"被测功能本身被删除"或"测试被等价或更强的测试替代"两种场景,且必须在 PR 描述中明确说明并由评审人确认。 |
| R3 | **禁止跳过失败** | 不得使用 `skip` / `xit` / `test.skip` / `@Disabled` / `pytest.mark.skip` 等手段将失败的测试静默跳过。CI 中配置**跳过检测**:新增的 skip 标记必须附带追踪 issue 编号与到期日,否则流水线失败(见 §4.6)。 |
| R4 | **禁止降低标准换绿** | 不得为了通过门禁而下调覆盖率阈值、放宽 lint 规则、调低安全扫描等级、加宽超时时间掩盖性能回退。所有门禁阈值只允许**单调收紧**(ratchet 机制,见 §3.4);任何放宽必须走豁免流程(§6)并留痕。 |
| R5 | **禁止空测/假测** | 不得提交没有断言的测试、恒真断言(`expect(true).toBe(true)`)、仅为覆盖率而调用代码但不校验行为的"覆盖测试"。CI 集成断言密度检查与 mutation 抽测(见 §4.7)。 |
| R6 | **主干必须始终可发布** | `main` 分支任何时刻必须通过全部合并级门禁。主干变红为最高优先级事故:15 分钟内无法修复则回滚(revert)引入变红的提交。 |

> **执行方式**:R1–R5 写入 CI 配置与分支保护规则,由平台强制;人工评审只作为第二道防线。任何"绕过门禁"的操作(admin override、force merge)必须自动记录并在周会上通报复盘。

---

## 1. 门禁总览:三级模型

质量门禁按触发时机分为三级,逐级收紧、逐级变慢:

```
L1 提交/PR 级(每次 push,目标 < 10 分钟)
 └─ L2 合并级(合入 main 前后,目标 < 30 分钟)
     └─ L3 发布/上架级(打 release 标签,目标 < 2 小时)
```

- **L1** 保障开发反馈速度:静态检查 + 单元测试 + 契约校验。
- **L2** 保障主干可发布:L1 全部 + 集成测试 + 安全扫描 + 构建产物校验。
- **L3** 保障上架质量:L2 全部 + 全量 E2E + 性能基线 + 兼容性矩阵 + 合规清单。

任何一级失败,禁止进入下一级。**不存在"带病放行"。**

---

## 2. L1:提交 / PR 级门禁

每次向 PR 分支 push 时触发,全部通过才允许请求评审与合并。

| 门禁 | 内容 | 失败条件 |
|------|------|----------|
| G1.1 代码格式 | Prettier / gofmt / ktlint / SwiftFormat 等格式化校验(check 模式,不自动改写) | 存在未格式化文件 |
| G1.2 静态检查(Lint) | ESLint / detekt / SwiftLint 等,规则集中管理,`error` 级为主 | 任何 error;新增 `eslint-disable` 等抑制注释未附 issue 编号 |
| G1.3 类型检查 | TypeScript `strict` 模式 / 编译器警告视为错误(`-Werror` 等价配置) | 类型错误或编译警告 |
| G1.4 单元测试 | 全量单元测试,禁止 `--onlyChanged` 作为门禁依据 | 任一测试失败或超时 |
| G1.5 覆盖率 | 见 §3:全局阈值 + 增量代码阈值(diff coverage) | 低于任一阈值 |
| G1.6 契约校验 | OpenAPI / 事件 schema 变更的向后兼容检查 + 消费者契约验证(详见 [14-test-plan.md §4](./14-test-plan.md)) | 破坏性变更未走契约变更流程 |
| G1.7 依赖审计(快速) | `npm audit` / `osv-scanner` 等,阻断级:high 及以上且存在修复版本 | 命中阻断级漏洞 |
| G1.8 secrets 扫描 | gitleaks / trufflehog 扫描本次 diff | 检出疑似密钥、token、证书 |
| G1.9 提交规范 | Conventional Commits;PR 必须关联需求/缺陷编号 | 不合规 |
| G1.10 skip/空测检测 | 扫描新增 `skip`/`only`/无断言测试(见 §4.6、§4.7) | 命中且无豁免标注 |

**PR 合并附加条件**(分支保护规则强制):

- 至少 1 名非作者评审通过;涉及支付、认证、内容审核模块的代码必须由该模块 owner 评审(CODEOWNERS)。
- 分支必须基于最新 `main`(或启用 merge queue),防止"绿色 PR 合并后主干变红"。
- **禁止**仓库管理员绕过分支保护直接 push `main`。

### 2.1 Dated implementation notes (slot C)

**2026-08-27 (W16 C5-01 / D-20).** G1.10 is `pnpm check:skips`, an L1 step in `.github/workflows/ci.yml` and a required step inside `pnpm verify`. R3 / §6: skip exemptions do not apply. A committed skip / only / todo / empty `it('…', () => {})` in `app`, `server`, or `packages` test files is red. A comment that forbids skips is not this gate.

**2026-08-27 (W16 C5-01 / D-20).** G1.7 is discharged by G2.5 Trivy (`pnpm check:sca`, L2 job `sca`). Critical findings fail; high findings with a published fix older than seven days fail. A second L1 `osv-scanner` / `npm audit` job would duplicate that engine.

**2026-08-27 (W16 C5-01 remainder / D-20).** G1.9 is `pnpm check:commits`, an L1 step in `.github/workflows/ci.yml` and a required step inside `pnpm verify`. The range is merge-base with `origin/main` (or `--base`) through `HEAD`. Merge commits are skipped so absorbing `main` does not rewrite history. A prose subject is red. A Conventional header with no requirement/defect id (`D-20`, `G1.9`, `C5-01`, `#12`, …) is red. A comment that names Conventional Commits is not this gate.

**2026-08-27 (W16 G1.9 leftover / D-20).** The format-only half landed first (`bc-72e30448` / `cf7ecd4`). This slot adds the 需求/缺陷编号 half: `feat: add a widget` is G1.9 red even though it is Conventional Commits. History on `main` is still not rewritten.

**2026-08-28 (W16 QA-010).** Smallest axe-core scan is `pnpm check:a11y`, an L1 step in `.github/workflows/ci.yml` and a required step inside `pnpm verify`. It runs axe-core in **jsdom** over committed implemented-screen HTML (`packages/quality/a11y/screens`, SCR-13 first). critical + serious = 0 fails the job. jsdom cannot complete axe's `color-contrast` (no canvas); the equivalent checker on declared CSS colors is the S-A2 reverse path — an injected white-on-white fixture is red. Tests are not skipped. This is **not** a TikTok WebView measurement (X-04 / PLY-002 still unmeasured) and does **not** close protocol-C4 exit 3 / S-A1 on every SCR/PNL. A comment that names WCAG is not this gate.

**2026-08-28 (W18 QA-010 remainder).** The scan now requires SCR-02 (home) next to SCR-13. Deleting either stem is red. Remaining implemented SCR/PNL fixtures are later remainders. Host is still jsdom, not TikTok WebView. This still does **not** close protocol-C4 exit 3 / S-A1 on every screen.

**2026-08-28 (W20 QA-010 remainder).** The scan now requires SCR-03 (browse / theatre) next to SCR-02 and SCR-13. Deleting any of the three stems is red. Remaining implemented SCR/PNL fixtures are later remainders. Host is still jsdom, not TikTok WebView. This still does **not** close protocol-C4 exit 3 / S-A1 on every screen.

**2026-08-28 (W20 QA-010 remainder, SCR-04).** The scan now requires SCR-04 (drama detail) next to SCR-02, SCR-03, and SCR-13. Deleting any of the four stems is red. Remaining implemented SCR/PNL fixtures are later remainders. Host is still jsdom, not TikTok WebView. This still does **not** close protocol-C4 exit 3 / S-A1 on every screen.

**2026-08-28 (W20 QA-010 remainder, SCR-05).** The scan now requires SCR-05 (player / `#/play/:episodeId`) next to SCR-02, SCR-03, SCR-04, and SCR-13. Deleting any of the five stems is red. Remaining implemented SCR/PNL fixtures are later remainders. Host is still jsdom, not TikTok WebView. This still does **not** close protocol-C4 exit 3 / S-A1 on every screen.

**2026-08-28 (W20 QA-010 remainder, SCR-06).** The scan now requires SCR-06 (profile / `#/me`) next to SCR-02, SCR-03, SCR-04, SCR-05, and SCR-13. Deleting any of the six stems is red. Remaining implemented SCR/PNL fixtures are later remainders. Host is still jsdom, not TikTok WebView. This still does **not** close protocol-C4 exit 3 / S-A1 on every screen.

**2026-08-28 (W20 QA-010 remainder, SCR-07).** The scan now requires SCR-07 (history / continue watching) next to SCR-02, SCR-03, SCR-04, SCR-05, SCR-06, and SCR-13. Deleting any of the seven stems is red. Remaining implemented SCR/PNL fixtures are later remainders. Host is still jsdom, not TikTok WebView. This still does **not** close protocol-C4 exit 3 / S-A1 on every screen.

**2026-08-28 (W18 INF-004 / S-C1).** CI self-audit is `pnpm check:audit`, an L1 step in `.github/workflows/ci.yml` and a required step inside `pnpm verify`. It scans committed GitHub workflow files. `continue-on-error: true`, `if: false`, `allow_failure: true`, and a `|| true` swallowed exit are red. A comment that names those keys is not this gate. A scan that saw no workflow files is red. S-C3 echo-only steps, S-C4 required-checks vs branch protection, and a job-count ratchet are further slices. `workflow_dispatch:` as an event is not a bypass.

**2026-08-28 (W18 INF-004 / S-C3).** The same `pnpm check:audit` job now fails on an echo-only / `true` / `exit 0` `run` step. A `run` that echoes and then invokes a real command is not this gate. A comment that names `echo` is not this gate. S-C4 required-checks vs GitHub branch protection stay a further slice.

**2026-08-27 (W16 QA-011 / C-12 / X-12 / X-04 / X-05).** a11y is a release blocker: `docs/14-test-plan.md` §6.4 now matches `docs/plan/definition-of-done.md` §6 rather than "P2, 不阻断首个上架版本". The L3 host matrix is TikTok WebView (`§6.2`). Native APK/iOS size and crash/ANR are N/A; §5.4 and G3.8 use the Minis ZIP / first-screen JS / JS-error budgets from `docs/03-nonfunctional.md` §2. `QA-010` (axe-core in CI) is not this writeback.

---

## 3. 覆盖率门禁与 ratchet 机制

### 3.1 阈值定义

| 指标 | 初始阈值 | 说明 |
|------|----------|------|
| 增量行覆盖率(diff coverage) | ≥ 80% | 本 PR 新增/修改的行;这是主要门禁,防止新债 |
| 全局行覆盖率 | ≥ 60% 起步,ratchet 上调 | 存量代码逐步还债 |
| 核心模块行覆盖率 | ≥ 90% | 核心模块清单:支付/订单、认证/会话、剧集解锁与权益、内容审核状态机 |
| 全局分支覆盖率 | ≥ 50% 起步,ratchet 上调 | 防止只覆盖 happy path |

### 3.2 覆盖率不是目标,是下限

覆盖率只能证明"代码被执行过",不能证明"行为被验证过"。因此:

- 覆盖率门禁与 R5(禁止空测)配套使用;
- 评审时关注断言质量,而非数字;
- **禁止**将覆盖率写入个人 KPI,防止刷数字。

### 3.3 排除规则

允许从覆盖率统计中排除:自动生成代码(protobuf、ORM 生成物)、纯类型声明文件、迁移脚本。排除清单集中放在仓库根部覆盖率配置中,**任何新增排除项等同于降低标准,必须走豁免流程(§6)**。

### 3.4 Ratchet(棘轮)机制

- CI 在 `main` 每次构建后记录实际覆盖率;
- 当实际覆盖率连续 7 天高于当前阈值 2 个百分点以上时,机器人自动提 PR 将阈值上调至"实际值 − 1%";
- 阈值**只升不降**;下调唯一途径是豁免流程。

---

## 4. L2:合并级门禁

PR 进入 merge queue 后、以及合入 `main` 后的每次构建触发。

| 门禁 | 内容 | 失败条件 |
|------|------|----------|
| G2.1 L1 全量复跑 | 基于合并结果(而非 PR 分支)重跑 L1 | 同 L1 |
| G2.2 集成测试 | 服务 + 真实依赖(数据库、缓存、消息队列,容器化拉起),覆盖仓储层、外部网关适配层 | 任一失败 |
| G2.3 冒烟 E2E | E2E 关键路径中的 P0 子集(登录、播放、支付沙箱下单,见 [14-test-plan.md §5](./14-test-plan.md)) | 任一失败 |
| G2.4 SAST | 静态应用安全测试(CodeQL / Semgrep,规则集见 [14-security.md](./14-security.md)) | high 及以上告警 |
| G2.5 依赖与镜像扫描 | 全依赖树 SCA + 容器镜像漏洞扫描(trivy 等) | critical 漏洞;high 且有修复版本超过 7 天未处理 |
| G2.6 构建产物校验 | 客户端包体积预算(见 §5.4)、混淆/压缩产物可用性、debug 符号剥离、**禁止 debug 开关/测试后门进入 release 构建**(扫描 `DEBUG`、硬编码测试账号、绕过支付的 flag) | 超预算或检出后门 |
| G2.7 数据库迁移检查 | 迁移脚本可正向执行 + 可回滚;禁止破坏性 DDL 未分级发布 | 迁移失败或不可回滚 |
| G2.8 许可证合规 | 依赖许可证白名单(禁止 GPL 系进入客户端分发产物,具体白名单由架构槽确认) | 命中黑名单许可证 |

### 4.6 skip 检测规则(细则)

- CI 脚本 diff 扫描新增的跳过标记(`\.skip\(`、`xit\(`、`xdescribe\(`、`@Disabled`、`@Ignore`、`pytest.mark.skip` 等);
- 每个跳过必须形如 `// SKIP(#1234, expires=2026-09-30): 原因`,含 issue 与到期日;
- 到期未处理:CI 失败;
- 全仓库 skip 总数出现在每次构建报告中,趋势上升需在周会解释。

### 4.7 空测/假测检测(细则)

- 静态检查:无断言的测试函数(eslint-plugin-jest `expect-expect` 等价规则各语言启用)直接失败;
- 对核心模块(支付、认证、解锁、审核)每周跑一次**变异测试(mutation testing)**抽测(Stryker / pitest 等价工具),变异存活率异常升高(> 40%)时,在周报中标红并要求补测;变异测试为观测型指标,不作为逐 PR 门禁(耗时原因),但**核心模块发布前(L3)必须完成当期变异测试且达标**。

---

## 5. L3:发布 / 上架级门禁

打 `release/*` 标签或触发发布流水线时执行。**上架(App Store / Google Play / 国内安卓商店 / 小程序审核)前必须全部通过并归档证据。**

### 5.1 自动化门禁

| 门禁 | 内容 | 失败条件 |
|------|------|----------|
| G3.1 全量 E2E | 全部 E2E 关键路径(见 [14-test-plan.md §5](./14-test-plan.md)),含支付沙箱全流程 | 任一 P0/P1 用例失败 |
| G3.2 兼容性矩阵 | 客户端在约定设备/系统矩阵上跑通冒烟(矩阵定义见 [14-test-plan.md §6.2](./14-test-plan.md)) | 任一矩阵项失败 |
| G3.3 性能基线 | 冷启动、首帧起播时间、播放卡顿率、关键接口 P95 延迟,对比上一发布版本 | 任一指标回退超过预算(§5.4) |
| G3.4 安全发布清单 | DAST 扫描、证书固定校验、release 构建不可调试、混淆生效、签名 URL 防盗链抽测(详见 [14-security.md §8](./14-security.md)) | 任一项失败 |
| G3.5 隐私合规清单 | SDK 收集行为与隐私政策一致性核对、权限清单 diff 审查、App Store 隐私标签/安卓合规检测(详见 [14-security.md §6](./14-security.md)) | 未完成核对或存在不一致 |
| G3.6 内容安全就绪 | 审核通道可用性探活、敏感词库版本确认、应急下架开关演练记录在有效期内(详见 [14-security.md §7](./14-security.md)) | 任一项缺失 |
| G3.7 变异测试达标 | 核心模块当期变异测试报告存在且存活率 ≤ 40% | 缺报告或超标 |
| G3.8 稳定性准入 | 灰度阶段 JS 错误率 < 0.5% 会话、白屏率 < 0.1%(Minis 口径,DoD S-M10)。原生崩溃率/ANR 对本形态 N/A | 超标则终止放量 |

### 5.2 人工确认项(必须留痕,签署人记录在发布单)

- 发布负责人确认:回滚方案已演练,回滚时间目标 ≤ 30 分钟;
- 支付 owner 确认:支付沙箱与生产配置 diff 已核对(商户号、回调地址、证书有效期 > 30 天);
- 内容安全 owner 确认:本版本新增 UGC 入口(若有)已接入审核;
- 法务/合规确认(涉及隐私政策、会员协议、自动续费条款变更时)。

### 5.3 灰度发布门禁

- 客户端按 1% → 5% → 20% → 50% → 100% 放量,每档观察期 ≥ 24 小时;
- 任一档触发:JS 错误率/白屏率超标(G3.8)、支付成功率环比下跌 > 3 个百分点、播放失败率环比上升 > 2 个百分点 —— **自动暂停放量并告警**,人工决策回滚或修复;
- 后端采用金丝雀发布,错误率/延迟超 SLO 自动回滚。

### 5.4 性能与体积预算(Minis 形态;允许收紧、放宽须豁免)

**2026-08-27 (W16 QA-011 / X-05).** Native APK/iOS 体积与崩溃率/ANR 不是本产品的形态。替代口径取自 `docs/03-nonfunctional.md` §2 与 DoD S-M4 / S-M10。官方硬限 ZIP ≤ 200 MB、无空文件(`AC-CMP-1`)仍在上层;下表是更严的内部预算。APK/AAB 与 App Store 下载大小对本形态 N/A,不作为门禁指标。

| 指标 | 预算 |
|------|------|
| ZIP 包体积 | ≤ 20 MB(官方硬限 200 MB 的 10%);单次增量 > 2 MB 需说明 |
| 首屏 JS(gzip) | ≤ 300 KB;单 PR 增幅 > 30 KB 需说明 |
| 首屏总传输(不含视频) | ≤ 800 KB |
| 冷启动到可交互(TTI,TikTok WebView) | P90 ≤ 2.5 s(中端机基线) |
| 点击剧集到首帧起播 | P90 ≤ 1.2 s(WiFi)/ ≤ 2.5 s(4G) |
| 播放百秒卡顿时长 | P95 ≤ 1 s |
| 核心 API(登录、鉴权、解锁、下单)P95 | ≤ 300 ms(服务端) |
| JS 错误率 / 白屏率 | 错误率 < 0.5% 会话;白屏率 < 0.1%(替代原生崩溃率) |

---

## 6. 豁免流程(唯一的例外通道)

任何"放宽门禁"的诉求走且仅走本流程:

1. 提交豁免申请 issue,写明:哪条门禁、放宽到什么程度、原因、风险评估、**恢复期限(≤ 14 天)**;
2. 需质量 owner + 对应模块 owner 双签批准;涉及安全门禁另需安全 owner 批准;
3. 豁免以配置文件形式进入仓库(如 `quality/waivers.yml`),CI 读取并在报告中**显式标注"本次构建含 N 项豁免"**;
4. 到期自动失效:过期未续期(续期同样走双签)则 CI 恢复原阈值,失败即失败;
5. 所有豁免每周汇总通报。

**豁免不适用于**:R1(失败即失败)、R2(删测试)、R3(跳过失败)、R5(空测)。这四条没有例外。

---

## 7. CI 方案(流水线设计)

> 平台建议 GitHub Actions(与仓库同源);以下为平台无关的阶段设计,落地时按所选平台翻译。

### 7.1 流水线拓扑

```
[push 到 PR 分支]
  ├─ stage: fast-checks(并行)
  │    ├─ format + lint + typecheck
  │    ├─ secrets 扫描(diff)
  │    ├─ commit/PR 规范检查
  │    └─ skip/空测检测
  ├─ stage: test(依赖 fast-checks 通过)
  │    ├─ 单元测试(按模块分片并行)+ 覆盖率汇总与门禁
  │    ├─ 契约校验(provider 验证 + 兼容性 diff)
  │    └─ 依赖快速审计
  └─ stage: report
       └─ 覆盖率/测试报告回写 PR;失败 → PR 状态红,禁止合并

[merge queue / 合入 main]
  ├─ L1 全量复跑(基于合并结果)
  ├─ 集成测试(docker compose 拉起真实依赖)
  ├─ 冒烟 E2E(P0 路径)
  ├─ SAST + SCA + 镜像扫描
  ├─ 构建产物校验(体积预算、后门扫描)
  └─ 失败 → 主干红 → 触发 R6 处置(15 分钟修复或 revert)

[打 release/* 标签]
  ├─ L2 全部
  ├─ 全量 E2E(真机云测 + 支付沙箱)
  ├─ 兼容性矩阵 + 性能基线对比
  ├─ 安全/隐私/内容安全清单(自动项 + 人工签署收集)
  └─ 产物签名、符号表归档、发布单生成 → 灰度流水线

[定时任务(nightly/weekly)]
  ├─ nightly:全量 E2E(扩展路径)、弱网/断网专项、长时播放稳定性
  ├─ weekly:核心模块变异测试、全依赖树深度扫描、许可证审计
  └─ 结果进入质量周报;nightly 失败次日站会必须认领
```

### 7.2 CI 纪律

- **失败即失败**:所有 job 的失败都使流水线失败;唯一允许"非阻断"的是纯信息类报告生成步骤(其自身出错也必须失败,防止报告静默丢失)。
- **不稳定测试(flaky)处置**:检测到同一测试在无代码变更下时好时坏 → 24 小时内要么修复,要么按 §4.6 带 issue 与到期日隔离到独立的 `quarantine` 套件(quarantine 套件 nightly 仍然跑,结果进周报);**禁止**直接重试掩盖(全局自动重试上限 1 次,且重试通过的用例自动登记为 flaky 候选)。
- **CI 环境即代码**:流水线配置、镜像、工具版本全部入库评审,禁止在 CI 平台界面手改。
- **速度预算**:L1 P90 ≤ 10 分钟;超预算优先做分片与缓存优化,**禁止**通过删减检查项提速。
- **禁止空跑换绿**:新增流水线步骤必须有真实校验逻辑;echo-only / 恒成功的占位步骤不允许合入(评审 checklist 项)。

### 7.3 度量(每周质量报告)

- 主干红灯次数与平均恢复时长(目标:恢复 ≤ 1 小时);
- 门禁拦截数(按门禁类型分布)——拦截是门禁在工作的证据,不是负面指标;
- flaky 率(隔离区大小与滞留时长);
- 覆盖率趋势与 ratchet 记录;
- 豁免存量与到期情况;
- 逃逸缺陷数(线上缺陷回溯:哪一级门禁本应拦截 → 补门禁,形成闭环)。

---

## 8. 职责矩阵

| 角色 | 职责 |
|------|------|
| 质量 owner | 门禁配置维护、豁免审批、周报、flaky 治理 |
| 模块 owner | 本模块覆盖率与测试质量、CODEOWNERS 评审 |
| 安全 owner | G2.4/G2.5/G3.4–G3.6 规则维护与豁免审批 |
| 发布负责人 | L3 门禁执行、灰度决策、回滚演练 |
| 全体工程师 | 遵守铁律 R1–R6;发现绕过行为有义务上报 |
