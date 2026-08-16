# dsh-prompt-dots 更新检测与升级指南

> 本文档是给 DSH Agent 执行的操作手册。用户每次更新 DSH 桌面版后，会把本文档交给 Agent；
> Agent 必须**逐节执行**下面的检测与修复，最后向用户报告结论，并在必要时同步 GitHub 仓库。
> 全局入口见 `$DSH_HOME/GLOBAL-UPDATE-GUIDE.md`（「更新全局插件」触发词，会自动逐个插件执行）。

## 0. 基线信息（当前已验证兼容的版本）

- DSH Desktop：0.1.9（曾验证 0.1.7）
- 核心依赖（全部 `@deepseek-ai/*`）：0.1.0-rc.6；cordis 4.0.1
- 插件版本：dsh-prompt-dots 0.1.0
- GitHub 仓库：https://github.com/Hua1Q1nG/dsh-prompt-dots（分支 main）
- 本机 DSH 家目录 `<DSH_HOME>`：`C:\Users\15458\AppData\Roaming\dsh-desktop\harness`

## 1. 检测更新（第 1 步：判断发生了什么变化）

1. 读取桌面应用版本：`<安装目录>\resources\app\package.json` 的 `version`（安装目录通常是 `E:\program(E)\DSH\DSH Desktop`，以实际为准）。
2. 读取 DSH 核心版本：`<安装目录>\resources\app\node_modules\@deepseek-ai\dsh\package.json` 的 `version`。
3. 结论判定：
   - 仅桌面壳版本号变化、核心依赖不变（仍是 rc.6 系列）→ 大概率兼容，执行第 2 节的快速体检；
   - 核心依赖版本变化（rc.6 → rc.7 等）→ 必须执行第 3 节的完整体检，重点核对第 4 节的 API 面。

## 2. 快速体检（每次更新后必做）

逐项确认以下路径存在且内容完整（用文件工具读取，不要假设）：

| # | 检查项 | 路径（相对 `<DSH_HOME>`） |
|---|---|---|
| 1 | 插件宿主占位 | `profiles\node_modules\dsh-prompt-dots\lib\index.js` |
| 2 | 插件客户端主体 | `profiles\node_modules\dsh-prompt-dots\lib\client.js` |
| 3 | 插件包清单 | `profiles\node_modules\dsh-prompt-dots\package.json`（`dsh.client` 段：platform web + 3 个 inject） |
| 4 | web profile 补丁行 | `profiles\web\cordis.patch.yml` 中应含 `prompt-dots` 条目（id: prompt-dots / name: 'dsh-prompt-dots'） |
| 5 | 启动图谱 | 首页 HTML 的 `window.__DSH_BOOT__` 图谱中应含 `dsh-prompt-dots` 条目，inject 与 package.json 一致 |
| 6 | 客户端 bundle | `GET http://127.0.0.1:<当前端口>/plugins/dsh-prompt-dots/client.js` 应返回 200 且内容为本插件代码（非错误页） |
| 7 | 环境副作用 | `settings.yaml` 的 `agent-presets.default` 必须仍是 `code-prompt-self`（DSH 升级曾把它重置回 `code`，会影响 prompt-self 引擎；发现异常立即改回并提示重启） |

当前端口从 `%APPDATA%\dsh-desktop\logs\harness.log` 末尾的 `dsh web: http://...` 读取。

运行中应用的自检（可选但推荐）：在会话里应能看到右侧白色小点栏；悬停任意小点出现该次 Prompt 预览；
点击小点平滑滚动到对应消息并短暂高亮。

## 3. 完整体检（核心依赖版本变化时必做）

1. 自测套件（纯 Node，无需浏览器/LLM）：
   ```
   node --test tests\client.test.mjs
   ```
   期望：3 个用例全部通过（槽位注册、点位渲染、悬停/点击交互）。任一失败 → 对照第 4 节排查 API 变化，修复 `lib/client.js`。
2. 修复后再跑一次第 2 节的第 5、6 项（启动图谱 + bundle 200）。

## 4. 插件依赖的 API 面清单（版本变化时逐项 grep 核对）

插件（`lib/client.js`）依赖以下 DSH API。升级核心依赖后，用 grep 在
`<安装目录>\resources\app\node_modules\@deepseek-ai\<包>\lib\*.js` 核对每个符号仍存在：

| 包 | 依赖符号/机制 |
|---|---|
| @deepseek-ai/dsh-client-modules | `window.__ModuleLoader__.load({id, factory})`；bundle 内静态模块含 `react`（createElement/Fragment/useState/useEffect/useMemo） |
| @deepseek-ai/dsh-client-runtime / dsh-client-ui-slots | 客户端服务 `slots`：`ctx.slots.inject(key, cb)` / `ctx.slots.register(spec, render)`；会话级槽位注册协议（id/order/label/locale） |
| @deepseek-ai/dsh-client-ui-conversation | 槽位键 `conversation.input.dock`（list/session 契约）；标准 props `useSession`（selector 读 `s.chat.order` / `s.chat.nodes`，节点含 `key/kind/visibility/data.content/data.time`）；消息行 DOM 锚点 `div[data-chat-anchor-key]` |
| @deepseek-ai/dsh-client-locale | 客户端服务 `locale`：`ctx.locale.register(ns, {zh, en})`；注册项 `locale` 字段注入 `t` |
| @deepseek-ai/dsh-web-frontend | 前端 dist 内静态模块表（react、dsh-client-ui-primitives 等） |

若某个符号消失或签名变化：修改 `lib/client.js` 适配新版本，重跑第 3 节测试，通过后进入第 5 节同步仓库。

## 5. 同步 GitHub 仓库（插件或文档有改动时）

本机到 github.com 主站可能被网络阻断（git push / 设备码不可达），但 `api.github.com` 可达。
同步方式（与 dsh-prompt-self 指南一致）：

1. 向用户索要一个有 `repo` 权限的短期 Personal Access Token（用完请用户撤销）。
2. 先尝试普通 git push（曾成功过）；失败则通过 Git Data API 单提交上传（不落盘令牌）：
   - 校验：`GET /user`（Authorization: token <令牌>）
   - 取 HEAD：`GET /repos/Hua1Q1nG/dsh-prompt-dots/branches/main` → commit.sha →
     `GET /repos/Hua1Q1nG/dsh-prompt-dots/git/commits/<sha>` → tree.sha
   - 每个文件：`POST /repos/Hua1Q1nG/dsh-prompt-dots/git/blobs`
     {content: base64(utf8), encoding: "base64"}
   - 建树：`POST .../git/trees` {base_tree: <旧tree.sha>, tree: [{path, mode:"100644", type:"blob", sha}]}
   - 提交：`POST .../git/commits` {message, tree, parents: [<HEAD>]}
   - 更新引用：`PATCH .../git/refs/heads/main` {sha: <新commit>, force: false}
3. 完成后提示用户撤销令牌，并报告仓库 URL。

仓库结构（改动需同步到仓库的对应路径）：
```
lib/ + package.json + cordis.patch.yml
                        ← <DSH_HOME>/profiles/node_modules/dsh-prompt-dots/ 的源
tests/client.test.mjs   ← 客户端自测套件
install/GLOBAL-UPDATE-GUIDE.md ← 全局总纲镜像（规范源在 dsh-prompt-self 仓库）
UPDATE-GUIDE.md（本文件）← 每次更新后请同步最新版
README.md
```
说明：共享的全局文档（`AGENTS.md`、`GLOBAL-UPDATE-GUIDE.md`）的规范源在
`Hua1Q1nG/dsh-prompt-self` 仓库的 `install/` 目录，本仓库不重复维护。

## 6. 报告模板（Agent 向用户汇报用）

```
更新检测完成（dsh-prompt-dots）：
- 桌面版本：X → Y；核心依赖：Z（变化/不变）
- 快速体检：N/N 通过；异常项与修复：…
- 完整体检（如执行）：测试 3/3，运行态自检：图谱条目/ bundle 200 …
- 需要用户操作：重启应用 / 提供令牌 / 无
- GitHub 同步：已同步 / 无需同步 / 已请求令牌
```
