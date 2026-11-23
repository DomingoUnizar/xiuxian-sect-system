# 素材、视觉校样与工具核验

素材根为 `D:\GeminiProjects\修仙素材`，工具根为 `D:\GeminiProjects\修仙素材工具`。素材盘点、工具调用和旧版静态校样记录于 2026-11-22。以下数量沿用当时按字节内容、主题和尺寸去重的口径。当前任务画面应能表达玩家是宗门系统、各宿主各收私令，以及奖励实际到账。[玩法设计](gameplay.md)

## 新局与回山时先看什么

新局先给玩家一届可考察的候选，列出已知资质与试艺表现。正式入宗后，新人拥有稳定的肖像和宿主身份。发令前列出「首炼灵丹」的条件“用凡炉亲手炼成一枚入阶丹药”，并写明奖励“十轮修为灌注”。玩家按下「发布」，发令事实提交后，才在对应宿主页出现“【叮！系统发布任务「首炼灵丹」】”。山门和丹炉插画要给中文条件与奖励留足空间。

| 画面 | 该认清的东西 | 配什么反馈 |
| --- | --- | --- |
| 候选与宿主名册 | 公开试艺、是否正式入门、已知所长及玩家关注的人。换届可以换脸，重开同档能认出同一个人 | 肖像随人物 ID 保存，灵根和境界用文字与图标表达。新入门者的私令只进入其本人消息及系统全览 |
| 私令与实奖 | 谁能接、需要做成什么、奖什么。达成后显示真实丹药、功法或修为差额，能去人物页看这份本事 | “叮”可以全用文字。重要结算可选一次短声，支持静音与减弱动态。相同奖励回执再次打开只展阅记录 |
| 离线归来与公开纪事 | 系统侧汇总已完成并发奖、进行中、推辞或到期的数量，突出本次最值得看的结算。公开视角只写丹成、得胜、平安离台等可见行为 | 回归先给几条可展开的真实收获。相连的三道私令在系统视角分列收件人，各宿主只看得到本人的文字与奖品 |

手机优先保证宿主、条件、奖励和主要操作可见，长说明可展开。桌面可以并列名册、当前宿主与因果经过。已有背景可先选 `07_immortal_gate.jpg`、`13_volcano_cauldron.jpg`，有真实斗法事件时再按需使用相应场景。新首屏及发奖反馈需从可操作构建实拍。[产品证据要求](workflow.md#交接证据)

**接入细节。** `Xianxia_RPG_UI_GUI_And_Rarity_Frames_Full/INTEGRATION.md` 与 `manifest.json` 给出 straight alpha、文字安全区、九宫格、按钮三态。青玉面板的原图左／上／右／下切片为 224／208／224／208 像素，CSS 的顺序为上右下左。先换算屏幕边宽，再拉伸中部。固定造型的牌框保比例。按下态保持热区，白玉面用深字。手机以立绘、纸墨留白和青玉描边表达层级。长人名、200% 字体缩放、键盘焦点、触控、深色背景和减弱动效要在产品页面再审。

### 历史排版校样

两张旧图来自 Chrome 实际渲染，情境是药谷历练。其作用是核对中文换行、肖像框、留白、九宫格及触控尺寸。原图使用 `21_herb_valley.jpg`、两张角色肖像与青玉组件，两种视口当时均无横向溢出，手机选项区域高 44 CSS px。图中人物、旧选项与纪年仅属于该次排版夹具。当前派令页、离线结算和触屏体验的证据由 N4 另行取得。[手机旧校样，390 × 844](evidence/mobile.jpg) · [桌面旧校样，1280 × 760](evidence/desktop.jpg)

## 资产数量与发布条件

| 资产 | 核验口径与大小 | 首版取用及许可 |
| --- | --- | --- |
| 肖像 | 合集 `catalog_portraits.csv` 有六类各 50。取透明 256px，合集 300 个不同 SHA-256。三个百张分包的 300 个哈希与其完全相同。含凡人、修士、妖与灵兽。 | 按本届候选、已绑定新人、宗主长老和实际对手取像。名册用小图，档案按需载大图。合集 LICENSE 允许个人／商业游戏嵌入及修改，禁止把独立图再分发为素材包。 |
| 场景 | `Xuanhuan_Mood_Art` 与 `_PNG` 各 24 张、24 个相同主题 ID。配对缩图逐通道均值差最大 0.27/255。1920 × 1080 JPG 合计 8.85 MiB，PNG 56.43 MiB。 | 首轮按招生、任务和真实事件选山门与丹炉背景。网页用适配尺寸 JPG 或 WebP，章首页才预载。包内 CC0。 |
| 综合图标、兵器法宝 | 分别取透明 256px，300 个不同文件（31.27 MiB）和 500 个（17.35 MiB）。两组哈希交集为空。法宝合集索引为原 300 加后续 200。 | 先用实际可获得的丹药、功法、遁符或法器，并在奖励旁写明品阶或效果，列表取 64/128px。两包许可允许游戏嵌入及修改，限制原图／改图作为素材包分发。美术色阶不决定游戏法器品阶。 |
| 青玉等三套 UI | 110 个可用 PNG（12.42 MiB），manifest 110 条。README 说明源自 53 个设计，另有三幅拼装样稿。尺寸、按钮状态和衍生页签均有复用。 | 先用青玉一套。README 和 PROVENANCE 记作本地交付，商业分发条件由项目所有者决定。内部校样可继续。对外发布前补该包授权或换有明确许可的组件。 |
| 霞鹜文楷 | Light、Regular、Medium 三个 TTF，各约 25～29 MB。Regular 内嵌版本 1.530，授权字段 SIL OFL 1.1。目录里只有字体文件。 | 首屏可先用系统回退，标题按需加载一个字重。发布时附匹配的版权与 OFL。若做 WOFF2 子集核对保留名条款并保留中文回退。[字体上游许可](https://github.com/lxgw/LxgwWenKai/blob/main/OFL.txt) |
| Abstraction 音乐 | 334 个不同字节内容的 OGG，805.78 MiB。系列、分层和过渡版各占文件。例如同一周的曲子有多种状态。12 份包内许可均标 CC0。 | 用本地 `music-loop-bundle-song-browser/song_browser.html` 选曲。试听一次完整循环和山门与历练场景的切换后再定曲目。首屏不预载整曲库。[作者发布页](https://tallbeard.itch.io/music-loop-bundle) |
| Sonniss GDC 2026 | 五个解包共 347 个不同 WAV，7,652.89 MiB。音频先按长度分组，对同长度文件作 SHA-256 排重。 | 供离线挑选、裁切、转码。包内 Readme、随包 License PDF 和发布方授权允许成品内商用。留供应商、曲目与原条款，独立音效库不得转售，遵守训练用途限制。[Sonniss 授权](https://sonniss.com/gdc-bundle-license/) |
| 已有剑气、落雷和两个散装 WAV | Arcadia 剑气 4×4、16 帧、256px/帧，导出元数据时长 0.58 秒。AetherFX 落雷 4×4 实用 15 帧、12 fps、标称 1.2 秒。两个 WAV 经 ffprobe 均为 PCM 24-bit、44.1kHz 双声道，挥剑约 0.84 秒，雷击约 9.84 秒。 | 剑气位于素材根 `Arcadia Effector`。落雷在**工具根** `AetherFX/out/test_xianxia`。按已导出帧表播放，查明散装音频来源再进发布清单。声音风格与响度尚待试听。 |
| 其他美术、村民 | 两份村民目录各 44 GLB，合计 44 种字节内容，逐个读 GLB 的 JSON 块，88 个文件均无 skins 或 animations。2D 村民、通用图标和压缩归档另存。 | 招生、宿主与自动战报共用统一二维画风。其他包缺某类图标时才查。Colorless Lab 有独立条款，来源与风格按选中项核对。 |

资源以逻辑 ID 进清单，至少记 `id, variantOf, sourcePack, relativePath, sha256, format, bytes, licenseRef, credit, useScope`。源文件留在素材库，构建只收录已引用且适合该发布范围的派生文件。原包和解包同盘属于两个副本，独立备份须放在另一个可靠位置并抽样恢复。备份位置与容量由所有者选定后再安排大文件复制。

## 哪些工具真的能用

本节记录上次盘点所见的服务、本机 CLI 和 MCP 客户端能力。当次会话未直接注册四个素材工具和 Playwright MCP，盘点者用本机 CLI 或独立 MCP 客户端做了下列免费探测。新执行环境按需要重新确认可用性。

| 路径 | 现场证据 | Neon 何时调用 |
| --- | --- | --- |
| **sxhzju/sfx** | 上游是 Agent Skill + Python 脚本。已有 Antigravity 临时工作副本 `scratch/sfx.py`。索引重定向至临时目录，真实执行 Mixkit 搜索 `thunder`，返回 `mk:2390`、`mk:1287`。未发现本聊天注册的同名 MCP。 | 本地库无合适音效后，通过已核验／固定版本的脚本搜索，逐条记录 Mixkit、Kenney、Freesound 等实际来源及许可证。临时副本的位置不写入游戏构建。[sfx 源码与用法](https://github.com/sxhzju/sfx) · [Mixkit 条款](https://mixkit.co/license/) |
| **Soundza** | 远程 HTTP MCP 完成 initialize 和 tools/list，列出 10 项。实调 `search_sounds` 搜索 `paper rustle`，当时返回 66 项。本次检索没有传私人凭据。生成、下载、账号权限和价费未实测。 | sfx 搜索无合适结果再搜这里，先试听。确有缺口才评估 Soundza 生成和该次成本。按实际客户端的 OAuth／密钥要求接入，记录失败，不把某次匿名读取推广成长期权限。[Soundza 官方 MCP](https://github.com/soundza/soundza-mcp) |
| **Arcadia-Effects** | 工具仓库 `ed2bd1b`。Node 的 `tools/validate.mjs` 实跑现有剑气 JSON，9 层、0 错误。独立 JS 编辑器可输出带帧表的图集。仓库有 `afx-effect-authoring` Skill。本次复用了既有导出。 | 本地无匹配图集时，优先用编辑器／Skill 写效果 JSON，脚本校验，预览后导出。原工程时长 0.72 秒与导出采样窗不同步时，以导出帧表为播放器依据。[Arcadia-Effects](https://github.com/xaidan777/Arcadia-Effects) |
| **AetherFX** | 工具仓库 `78d0ff6`。本机 `build/bin/aetherfx.exe validate examples/effects/lightning_strike.json` 返回 20 节点、0 错误／警告。仓库 venv 的 stdio MCP 握手、列出 34 工具、真实调用 `describe_vocabulary` 成功。探测关闭在线分析器。Studio 的 8770 端口当时未监听。 | 重要且已有图集、Arcadia 均不能满足的画面，才用该 CLI／MCP。运行时只交付导出图集与帧表。两特效工具本体为 MIT，外来贴图另记来源。[AetherFX](https://github.com/holokat/AetherFX) |
| **Playwright Test / MCP** | 当前项目尚无测试依赖。上次用机器缓存的 Playwright 和本机 Chrome 渲染上述历史校样。缓存的 MCP 0.0.86 以隔离 stdio 启动，列出 25 工具，导航空页和获取快照成功。 | 产品回归使用项目锁定的 Playwright Test，把脚本和 trace 留给下一位。探索布局、复现陌生故障时可用 MCP。模拟手机另列为“模拟”，M3 再上真机。[设备模拟](https://playwright.dev/docs/emulation) · [Playwright MCP](https://github.com/microsoft/playwright-mcp) |

本机复核路径示例，从素材工具根运行。AetherFX 的 `python/.venv/Scripts/aetherfx-mcp.exe` 可经 stdio 使用。已有源码和可执行文件就足以验证，Neon 需在自己的进程中重新探测连接。

```powershell
node '.\Arcadia-Effects\Arcada Effects\tools\validate.mjs' '..\修仙素材\Arcadia Effector\Cyan_Crescent_Slash.json'
& '.\AetherFX\build\bin\aetherfx.exe' validate '.\AetherFX\examples\effects\lightning_strike.json'
```

## Skills 路由

上次盘点逐一阅读了本机七份 `SKILL.md`。Neon 直接复用下列方法，各套件的脚手架和提供商只在用到对应能力时才有意义。

| Skill | 使用时机与可移植部分 |
| --- | --- |
| `threejs-game-director` | 里程碑启动时检查玩法、美术来源、试玩和交付缺口。项目总控由 Neon 承担。 |
| `threejs-gameplay-systems` | 从真实玩家动作、反馈与风险设计切片。取用玩法 brief 和验证方式。 |
| `threejs-game-ui-designer` | 规划招徒名册、宿主私令、到账反馈、中文长文、触控安全区、字号、状态与游戏美术的协调。 |
| `threejs-qa-release` | 复用从真实入口、桌面与手机视口、资源加载到构建预览的验收。Canvas 像素检查按是否有该图层选用。 |
| `threejs-debug-profiler` | 仅在出现加载慢、卡顿、音频或输入异常时记录基线、定位瓶颈、比较修复前后。 |
| `threejs-image-generator` | 使用 Gemini 图像 API。库内及可复用资产仍有明确缺口、风格参考和成本授权时才考虑。 |
| `threejs-audio-generator` | ElevenLabs 工具链，可参考循环、音量、清单与浏览器解锁方法。项目的缺音效生成优先级仍是 Soundza，额外提供商须另有用途与预算。 |
