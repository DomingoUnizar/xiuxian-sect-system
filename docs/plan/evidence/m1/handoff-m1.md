# 宗门系统 M1（N0～N4 与视觉交互重做版）交接台账

## 1. 仓库、分支、入口与回退

- **主仓与只读基线**：`D:\GeminiProjects\修仙`，`main` 基线提交 `2442d61`（严守未改 `main` 与未改参考项目 `D:\DeepseekProjects\云岗宗`）
- **开发工作树与分支**：`D:\GeminiProjects\修仙-宗门系统-M1`，分支 `feat/sect-system-m1`
- **提交链**：
  - `6352f3b` — N0：工程脚手架、PRNG/规范哈希、Dexie 双快照持久化、Web Worker 与山门初态
  - `195ba12` — N1：五域无放回招贤、试艺不改先天数值、自愿应邀/婉拒、原子绑定与退宗重入边界
  - `c0d301e` — N2：点名悬赏（首炼灵丹 / 擂上首胜 / 后续任务）、预留与释放、四步真实炼丹、文本战斗 V0.2、幂等账本与三视角隔离
  - `afc3eea` — N3：道统首成与 2 点根基解锁「自动悬赏」、常开悬赏自动发令、分片与崩溃续算等价、8 小时离线补算与回归摘要弹窗
  - `efe0d04` — N4 复验修复：盲玩 5 项缺陷与控制开关
  - `c71ab5b` — 首轮素材接入检查点（回滚安全点）
  - `2361a16` — 表现层重构（正常山地可交互宗门大地图 `SectMapStage.vue`、单行松烟青玉顶栏 `TopHudBar.vue`、宣纸白五标签侧栏、全品类素材落地）
  - `92844e2` — 正式定名《修仙系统模拟器》并补全 DeepSeek 文案任务单
  - `5cd2c0f` — 接入 50 条地图双层气泡与 80 名五域候选库及零额度自检脚本 `validate:drops`
  - `e32d507` — 清洗并接入全部 5 份 DeepSeek 叙事文案库（全库 7 份 JSON 合计 491 条，`LXGWWenKai-subset.woff2` 2057 字）
- **本地启动与构建命令**（Windows PowerShell 使用 `.cmd`）：
  - 安装依赖：`npm.cmd install`
  - 类型检查、单测与构建：`npm.cmd run test`
  - 启动本地试玩预览：`npm.cmd run preview`（已固定独立端口 **`http://127.0.0.1:4179/`**，避开本机 `4173` 其他项目服务）
  - 浏览器全流程 E2E：`npm.cmd run test:e2e`
- **回滚方式**：
  - 切回 M1 封版检查点或安全撤销提交：在 `D:\GeminiProjects\修仙-宗门系统-M1` 中使用 `git checkout e32d507` 查看基线或用 `git revert <commit>` 安全撤销（亦保留 `D:\GeminiProjects\修仙` 的只读 `main` @ `2442d61`）。

## 2. 全品类素材落地清点（246 项优化后运行资源，登记于 `asset-manifest.json`）

1. **NPC 2D 全身透明立绘与头像**（`NPC素材3D+2D/2D/Portraits & Icons`）：提取 18 套性别/年龄透明 WebP 全身立绘（`public/assets/standees/*.webp`）与配套头像（`npc-icons/*.webp`），用于宿主面板全身展立绘与招徒候选立绘。
2. **四大肖像与灵兽图库**：
   - `Xianxia_Portraits_FULL_300`：26 枚正道宗主/长老/弟子圆框肖像 + 9 枚 256px 透明高清图；
   - `Xianxia_Wanderers_FULL_100`：16 枚凡俗游方散修（`assets/wanderers/mortal_001..016.png`）；
   - `Xianxia_Cultivators_FULL_100`：12 枚擂台劲敌与散修肖像（`assets/cultivators/demonic_001..012.png`）；
   - `Xianxia_Beasts_FULL_100`：10 只妖兽圆像 + 透明 HD（含寒鸦岭 `玄角妖狼` / `赤瞳石猿` / `青鳞幽蟒`，并联动寒鸦山口地图守护妖影）。
3. **十二类武器与百宝图标全覆盖**：
   - `Xianxia_Weapons_Artifacts_FULL_500`：覆盖刀、剑、枪、斧、弓、杖、扇、拳套、铃、镜、印、琴全 12 大类 40 件兵器图标（含丹库「修真界十二兵械法器录」展示、角色佩剑与地图演武兵器架）；
   - `Xianxia_Icons_FULL_PACK_300`：覆盖灵草、灵兽、丹液、灵石、功法、丹药、古宝、符纹、武技、阵符、道袍、神兵全 12 类 36 枚图标；
   - `Xianxia_RPG_UI_GUI_And_Rarity_Frames_Full`：补齐 T1–T6 六阶品阶框（`wood / bronze / jade / amethyst / dragon / phoenix`）、3 种玉/竹/龙纹头像框、三态青玉与白玉云纹按钮、血蓝修为槽及八卦/五行/突破阵纹符号（其中 `shared_bagua_symbol.webp` 直接嵌绘于地图天枢中庭道场）。
4. **玄幻意境图、字体与多曲雅乐**：
   - 8 张 `Xuanhuan_Mood_Art` 转码轻量 `.webp` 随五域招徒、百宝藏阁、离山归来弹窗懒加载；
   - `LXGWWenKai-subset.woff2` 重新覆盖全界面与 491 条文案 **2057 字**（`456.81 KiB`）；
   - 4 首古风空灵循环曲（`山门清音 / 灵泉静修 / 云海观道 / 古道试锋`）+ 3 实景音效（全部 `preload="none"` 懒加载）。

## 3. 实机验证记录

- **类型检查、20 项单测与生产构建**（`npm.cmd run test`）：0 错误通过；
- **Playwright 全流程浏览器实机验收**（`npm.cmd run test:e2e`，`http://127.0.0.1:4179/`）：2/2 通过，`0` console error、`0` page error、`0` 404；
  - 首屏冷缓存实测传输 **`949,674 bytes`（`927.42 KiB`）**（低于 `1.5 MiB` 上限）；
  - 实测验证宗门地图 `sect-map-canvas` 绘景非空、地图点击人物与山门/药庐/演武台真实跳转、招徒试艺秘密绑定、「首炼灵丹」成丹领十轮修为、真实关页静候 6.2s 重开回归简报、传承「分火提清法」解锁常开悬赏与二届自动发令、三视角公开零系统禁词、多曲雅乐切换与 0/1x/2x/5x 挂机观演；
  - **桌面与手机实机截图**：
    - 桌面主视野（1440×860）：[desktop-m1.png](desktop-m1.png)
    - 开山招徒与立绘意境卡：[recruit-standee-m1.png](recruit-standee-m1.png)
    - 丹库·十二兵械百宝格：[vault-showcase-m1.png](vault-showcase-m1.png)
    - 关页重开离山归来简报：[return-summary-m1.png](return-summary-m1.png)
    - 手机端竖屏适配（390×844）：[mobile-m1.png](mobile-m1.png)
- **真人试玩验收状态**：**待验**（留待交付给首次接触的玩家实际试玩后照实登记反馈）。

## 4. 宗门地图重绘

- **素材来源与工具**：使用 `image-generator` 子代理调用 `generate_image`（4:3 横幅），以 `D:\GeminiProjects\修仙素材\图像素材\Xuanhuan_Mood_Art\21_herb_valley.jpg` 为画风参考，共生成并评审 2 轮（第 1 轮构图偏右导致山口超出安全区，第 2 轮清理后通过全部安全区与无文字/人物校验）。
- **原图与提示词备份**：`D:\GeminiProjects\修仙素材\图像素材\Sect_Map_Generated\`（含两轮原图与 `prompt.txt`）。
- **运行资源与清单登记**：等比缩放导出 `public/assets/scenes/sect_map_qingheng.webp`（`1600×1195`，quality 85，`319,024` 字节 / `311.55 KiB`），登记于 `src/content/asset-manifest.json`，manifest ID 为 `scene_sect_map_qingheng`。
- **交互层对齐**：保留全部 `MAP_ZONES` / `MAP_NODES` ID 与寻路拓扑，坐标对齐手绘底图建筑与青石山道；移除程序化建筑/山道/树木绘制，改为底图叠加区域径向光晕、常驻玉金牌匾、丹炉与试剑台特效及 cover 铺满相机边界夹紧。
- **二次核查与打磨**：牌匾、候选人、弟子标记与气泡改为固定屏幕尺寸绘制并在 720px 以下自动切换精简模式（仅显示当前选中/悬停弟子名牌），同步乘算反向缩放点击命中半径；为路网边补充 `MAP_EDGE_VIA` 石路拐点避免斜穿草地或建筑，开启 `high` 品质双线性采样，并补齐全景缩放下限（`containScale / coverScale`）以支持缩回全景视图。
