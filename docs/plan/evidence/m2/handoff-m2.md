# 宗门系统 M2（百艺联动 · 规则赐予 · 隐藏机缘 · 多人因果）交接台账

## 1. 分支、基线与安全回退

- **只读受保护主仓**：`D:\GeminiProjects\修仙`（`main` 分支保持于 `2442d61`，全程未修改、未合并）。
- **冻结的 M1 基线分支**：`feat/sect-system-m1`（止于 `4520658`，含精致山门大地图、491 条文案库及 `handoff-m1.md`）。
- **M2 开发分支**：`feat/sect-system-m2`（工作树 `D:\GeminiProjects\修仙-宗门系统-M1`）。
- **回滚方式**：
  - 使用 `git revert <commit>` 安全撤销 M2 提交，或在 `D:\GeminiProjects\修仙-宗门系统-M1` 切换至 `feat/sect-system-m1`（`git checkout feat/sect-system-m1`）即可瞬间回到冻结 M1 状态。

## 2. 本阶段实现范围（M2 核心能力）

1. **Schema v2 与无损旧档升级**（[constants.ts](../../../src/sim/constants.ts) · [types.ts](../../../src/sim/types.ts) · [repository.ts](../../../src/storage/repository.ts)）：
   - `SCHEMA_VERSION = 2`、`RULES_VERSION = 'm2-rules-1.0.0'`、`CONTENT_VERSION = 'm2-content-1.0.0'`。
   - 新增 `upgradeWorldSnapshot()`：读取或导入 Schema v1 存档时先验证原 v1 校验和，再无损补全 `materials`、`furnaceHasWarmCore`、`spiritBeasts`、`forgingFacts`、`beastFacts`、`tournaments` 与成员 `grantedAbilities` 等 M2 字段。
2. **修仙百艺联动与跨技艺产物流通**（[forging.ts](../../../src/sim/forging.ts) · [beasts.ts](../../../src/sim/beasts.ts) · [alchemy.ts](../../../src/sim/alchemy.ts) · [combat.ts](../../../src/sim/combat.ts)）：
   - **炼器同材两用**：消耗同一种原材「潮纹玉」，依 `接锋蓄水纹` 锻出凡阶上品「储水回锋剑」（可当场或由藏器库交同门佩带，于试剑或历练激发蓄潮破防）；依 `温炉控潮纹` 锻成「潮纹温脉炉胆」嵌装凡炉，稳住炉温并提升成丹品相。
   - **御兽探泉采露**：依 `循铃御兽诀` 与「听泉云纹鹿 / 巡风苍青犬」赴寒泉寻回「潮纹玉」与完整「带露玉髓花」；丹堂在潮纹温脉炉胆或「留一息火」加持下封入带露玉髓花，炼成「二阶极品护脉丹」。
3. **道统根基成长、规则赐予与预封隐藏机缘**（[heritage.ts](../../../src/sim/heritage.ts) · [missions.ts](../../../src/sim/missions.ts)）：
   - 传承阶梯完整贯通：`分火提清法`（+2 根基 → 解锁 2 点 `自动悬赏`）→ `潮纹器道真解`（+3 根基，共 5 点 → 解锁 `规则赐予`）→ `循铃御兽诀`（+4 根基，共 9 点 → 解锁 `多人因果`）。
   - **规则赐予（5 点）**：可在任务奖赏或「道统·悬赏」面板耗道源直接赋予宿主永久神通「留一息火」「绝境爆发」「灵犀血脉觉醒」。
   - **预封隐藏机缘**：发令时可加留 4 道源封定 6 轮修为追加奖；主奖完成后保留 24 刻触发窗（同门服丹精进或佩新锻器赢战即触发且仅入账一笔），逾期未触发则自动释放预留道源。
4. **多人因果宗门大比（9 点）**（[tournament.ts](../../../src/sim/tournament.ts)）：
   - 同刻对甲（`阵前破关`）、乙（`擂上夺魁`）、护擂长老（`护我门人`）分别秘密派令并冻结各自预留。
   - 甲率先破关立即领奖后仍如期登台，即使乙夺魁（三方皆成）或甲反胜（乙失败退还 8 道源），三方始终按真实事实独立结算，互不见他人私令且公开纪事零系统禁用词。

## 3. 实机验收与稳定性证据

- **`npm.cmd run validate:drops`**：7 个内容文件共 491 条记录零错误通过。
- **`npm.cmd run test`**：`vue-tsc --noEmit` 零报错；Vitest **8 个文件共 24 项单元测试**（含 [m2-crafts-and-causal.test.ts](../../../tests/unit/m2-crafts-and-causal.test.ts) 对同材双产、v1→v2 迁移、隐藏奖触发/到期释放、规则赐予、多人因果正反双支、换种差异、三视角隔离与分片哈希等价的验证）全部通过；`vite build` 成功（[LXGWWenKai-subset.woff2](../../../public/assets/fonts/LXGWWenKai-subset.woff2) 2091 字，`463.67 KiB`）。
- **结构化因果与 30 小时稳定性审计**（`npx.cmd tsx tests/scripts/generate-m2-evidence.ts`）：
  - [m2-craft-branches.json](m2-craft-branches.json)：同起点「潮纹玉」A/B 双产与极品丹复现记录；
  - [m2-tournament-causal.json](m2-tournament-causal.json)：大比正反双分支与 0 泄露三视角隔离核查记录；
  - [m2-30h-audit.json](m2-30h-audit.json)：**30 小时（21,600 刻）**长期模拟实测耗时 **`50.64ms`**，账本无重复 ID、全库存与道源非负不变量成立，附带最近 20 条重点事件抽检。
- **`npm.cmd run test:e2e`**（[m1-playthrough.spec.ts](../../../tests/e2e/m1-playthrough.spec.ts) + [m2-playthrough.spec.ts](../../../tests/e2e/m2-playthrough.spec.ts)）：**3/3 全部通过**（桌面 M1、手机 390×844 M1、桌面 M2 全流程），控制台错误 0、页面异常 0、断图/404 为 0，首屏冷缓存指标见 [cold-cache-metrics.json](../m1/cold-cache-metrics.json)。
  - **M2 实机截图**：
    - 丹库灵材与灵兽：[vault-m2-crafts.png](vault-m2-crafts.png)
    - 权限解锁与规则赐予：[heritage-m2-unlocks.png](heritage-m2-unlocks.png)
    - 多人因果大比结算：[desktop-m2-tournament.png](desktop-m2-tournament.png)
- **独立浏览器盲玩验收与自主修复**：
  - 由独立 `browser` 子代理（`Independent M2 Blind Playtester`）对本地正式预览 `http://127.0.0.1:4179/` 从零开档完整盲玩走通招徒→首炼→分火传承→锻剑封隐→携兽探泉→丹库与百卷图鉴→规则赐予→三人同局大比→三视角 27 条公开纪事与 6 位宿主隔离检查。
  - 按盲玩观察到的体验建议完成 5 项自主修复并重跑全套验证：规则赐予卡片增加已掌握神通标记与防重复点击、派令台补充期限及二传根基提示、宿主回执显示完整 10 条账本记录与法器耐久区分、底部飞报条避让快捷浮签、灵兽配图去重。
- **真人试玩状态**：**待验**（已提供 `http://127.0.0.1:4179/` 预览入口供玩家真人试玩复核）。
