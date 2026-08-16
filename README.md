# dsh-prompt-dots

> DeepSeek Harness (DSH) Web 客户端插件：在**每个会话的聊天区右侧中间**显示一排竖直排列的**白色小点**，每个小点对应一次用户 Prompt 输入 —— 悬停预览该次 Prompt 内容，点击跳转到对话中对应的消息位置。

## ✨ 功能特性

- **一个点 = 一次 Prompt**：按时间顺序竖向排列在会话右侧中部，最新输入在最下方；
- **悬停预览**：鼠标放在白色小点上，浮出该次 Prompt 的内容预览（含序号、时间、图片数量标记，长文本自动截断）；
- **点击跳转**：点击小点平滑滚动到对话中对应的消息位置，并短暂高亮该消息；
- **steering 标记**：运行中发出的 steering 输入同样记为一个点，并在预览中标注 <code>steering</code>；
- **自动跟随会话**：切换会话时点位自动重建；打开右侧详情面板时点位栏自动避让；
- **双语**：界面文案随 DSH 语言设置自动切换（中文 / English）；
- **零依赖、零构建**：纯浏览器端 JavaScript，无需编译即可安装使用。

## 🧠 工作原理

插件使用 DSH 的**客户端插件协议**（<code>dsh.client</code>）：

1. 注册到会话级槽位 <code>conversation.input.dock</code>，随会话挂载/卸载；
2. 通过会话框架钩子 <code>useSession</code> 读取 <code>ConversationSnapshot</code> 的 <code>chat.order</code> + <code>chat.nodes</code>，过滤出 <code>kind === "user" | "steering"</code> 的节点，得到每次 Prompt 的文本、时间与节点 key；
3. 以 <code>position: fixed</code> 渲染点位栏，锚定聊天滚动区（scrollport）的右边缘并垂直居中；
4. 跳转复用产品自带的消息锚点 <code>div[data-chat-anchor-key]</code>，调用 <code>scrollIntoView</code> 平滑滚动并短暂描边高亮。

宿主侧（<code>lib/index.js</code>）是一个**空操作占位插件**：仅用于让包被 dsh 的 Cordis 加载器识别，真正功能全部在浏览器侧 <code>lib/client.js</code>。

## 📦 安装

### 方式一：dsh plugin 命令（推荐）

~~~bash
# 从 GitHub 安装
dsh plugin --profile web add github:Hua1Q1nG/dsh-prompt-dots

# 或从本地路径安装
dsh plugin --profile web add link:/path/to/dsh-prompt-dots
~~~

包声明了 <code>dsh.bundle.patch</code>，安装后会自动加入 profile 的 bundle 层并应用 <code>cordis.patch.yml</code> 中的 insert 条目，**无需手改配置**。

### 方式二：手动安装

1. 把本仓库（或解压后的插件目录）复制到 DSH 插件目录：

   ~~~powershell
   # Windows 示例（$DSH_HOME 即 harness 数据目录）
   Copy-Item -Recurse dsh-prompt-dots "$env:APPDATA\dsh-desktop\harness\profiles\node_modules\dsh-prompt-dots"
   ~~~

2. 在 <code>$DSH_HOME/profiles/web/cordis.patch.yml</code> 中追加：

   ~~~yaml
   - insert:
       - id: prompt-dots
         name: 'dsh-prompt-dots'
   ~~~

3. 重启 DSH（或刷新 Web GUI）即可看到效果。

## 🗑️ 卸载

~~~bash
dsh plugin --profile web remove dsh-prompt-dots
~~~

手动安装的，删除 <code>profiles/node_modules/dsh-prompt-dots</code> 目录并移除 <code>cordis.patch.yml</code> 中对应的 insert 条目后重启即可。

## 📂 目录结构

~~~text
dsh-prompt-dots/
├── package.json        # 包清单：dsh.bundle.patch（自动接线）+ dsh.client（浏览器半边声明）
├── cordis.patch.yml    # bundle 补丁：向 web profile 插入本插件
├── lib/
│   ├── index.js        # 宿主侧占位插件（no-op）
│   └── client.js       # 浏览器侧实现：点位栏 + 悬停预览 + 点击跳转
├── LICENSE             # MIT
└── README.md
~~~

## ⚠️ 兼容性说明

- 跳转依赖 DSH Web 界面内部的消息锚点属性 <code>data-chat-anchor-key</code>（DSH 自带的滚动定位也在使用同一锚点）。若未来 DSH 版本移除该属性，插件会自动退化为「不显示点位栏」，不会影响应用本身。
- 插件随会话渲染，多窗口/多会话均独立工作。
- 已按 DSH 客户端插件协议声明注入依赖（<code>dsh-client-runtime</code>、<code>dsh-client-locale</code>、<code>dsh-client-ui-settings</code>），与 <code>dsh-prompt-self-client</code> 等既有客户端插件可共存。

## 📄 License

[MIT](./LICENSE) © Hua1Q1nG
