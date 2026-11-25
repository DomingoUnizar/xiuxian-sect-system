# DeepSeek 文本投递箱（省额度本地自检流程）

1. 让 DeepSeek 产出纯 JSON 后，不要整段贴进 AI 对话框；直接把文件保存成 `.json` 放进本目录 `src/content/drops/`（例如 `mission_templates_ext.json`、`compendium_lore.json`、`action_reports_pool.json`、`return_openings.json`）。
2. 在工作树根目录运行本地 0 额度校验命令：
   ```powershell
   npm.cmd run validate:drops
   ```
   1 秒即可本地检出 JSON 语法错与公开字段禁用词泄露（消耗 **0** AI 额度）。
3. 等所需批次全部放进 `drops/` 并跑通 `validate:drops` 后，**开新对话或 `/compact` 压缩上下文**，只发一句「`drops` 里放好了，请并入游戏」，一次读入、接入并提交即可。
