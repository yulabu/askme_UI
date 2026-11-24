# askme

ZCode 的内联交互表单插件：agent 需要向你提问时，在对话消息流里渲染一张 HTML 表单；你点选、填写或采纳推荐后提交，答案作为一条**新的用户消息**回到主会话，agent 继续下一轮。

为 `grill-me` / `grilling` 这类访谈式澄清流程设计，也适用于任何需要 agent 主动提问的场景。

- 版本：`0.3.0`（用户消息模式）
- 协议：MIT
- 仓库：https://github.com/yulabu/askme_UI
- 状态：个人自用，功能冻结；不做公开市场发布

## 为什么需要它

grill-me 的每一轮输出都包含多个问题、长选项和推荐答案。纯文本形式需要逐条打字回答，容易漏答、格式不统一，也没法一次提交。ZCode 内置的 `AskUserQuestion` 是单次、选项式的宿主 UI，承载不了「多题合并 + 单选/多选/文本混合 + 推荐答案 + 一次提交」。

askme 把这些内容变成一张内联表单：agent 输出完问题后，卡片留在消息流里；你填完提交，就相当于发了一条新的用户消息，grill-me 从下一轮继续。

## 特性

- 一张表单合并 1–8 个问题，一次提交
- 四种控件：单选、多选、短文本、长文本
- 单选/多选支持「其他」自定义输入
- 推荐项徽标 + 「采纳全部推荐」；多选采纳时保留已选项
- 必答提示；允许部分提交，未答项标记「（未回答）」
- 提交后卡片折叠为「已提交」，可展开只读回看
- 草稿自动持久化；深/浅色主题跟随宿主
- 键盘可操作；单选切换后焦点保留
- 卡片完全自包含：不加载外部字体、脚本、图片，不发网络请求

## 工作原理

```text
agent 输出本轮正文
  └─ 调用 askme_form(schema)        立即返回
       └─ 消息流内联卡片             agent 结束本轮

用户填写 → 点「提交」
  └─ window.zcode.sendFollowUpMessage
       └─ 宿主弹出可编辑确认框
            └─ 点「发送」
                 └─ 新用户消息：表单回答 · ...
                      └─ agent 开始下一轮
```

两个关键设计：

1. **工具立即返回**。ZCode 只有在工具调用返回后才加载内联卡片；如果 `askme_form` 自己阻塞等提交，会卡在「正在加载插件界面」。所以表单渲染和等待回答必须是分开的。
2. **提交走用户消息**。`sendFollowUpMessage` 会把答案作为一条真正的用户消息插回主会话，这正是 grill-me 需要的「回答完再继续」节奏。

### 关于宿主的确认框

真正“提交 = 新用户消息”只能走 `sendFollowUpMessage`。宿主对这个调用强制检查 user gesture；iframe 内的点击不被宿主记账，所以**每次提交都会弹出一次可编辑确认框**，插件无法跳过，也没有相关设置。这是用户消息语义的代价，不是插件缺陷。取消确认框不会丢失草稿。

如果你更想要“无弹窗、但答案只是工具结果”的模式，见 tag [`v0.2.2-tool-result`](https://github.com/yulabu/askme_UI/tree/v0.2.2-tool-result)。当前 `main` 是用户消息模式 `v0.3.0-message`。

## 安装

1. 打开 ZCode 的 **插件市场 → 添加 → 添加插件市场**。
2. 粘贴市场根目录（不是插件子目录），替换成你的仓库路径：

   ```text
   /Users/yulabu/Code/askme_UI
   ```

3. 在 **个人 → dev-askme-ui** 找到 **问我 / Ask Me**，点击安装。
4. **新建一个任务**再使用。插件安装、启用、禁用都只对新会话生效，当前会话不会加载新工具。

插件**不修改全局配置**：它通过自身的 `askme` skill、工具描述和 `/grill-me` 委托触发。需要 agent 全面优先时，再自行决定是否在 `~/.zcode/AGENTS.md` 加偏好。

## 使用

装好后有三种触发方式：

- **显式请求**：直接说「用 askme 插件/表单问我几个问题」。
- **`/grill-me`**：grilling 技能里有一行委托，检测到 `askme_form` 可用时会把每轮问题合并成一张表单，保留原来的问题、选项和推荐答案。
- **agent 自主调用**：在需要澄清的任务里，agent 可能根据工具描述和 skill 选择表单。

提交后，宿主会弹出可编辑确认框；点「发送」后主会话出现类似下面的用户消息：

```text
表单回答 · 第 1 轮：触发与形态

1. 触发入口 → 两者都要
2. 需要哪些控件 → 单选、多选、长文本
3. 补充说明 → （未回答）
```

## 验收

新建任务，发送：

```text
用 askme_form 问我 4 个问题：一个单选、一个多选、一个短文本、一个长文本。
单选和多选各带一个推荐项，最后提交给我看。
```

预期：

1. 对话流里出现一张表单卡片，包含 4 个问题。
2. 点「采纳全部推荐」后，单选/多选的推荐项被选中，文本框保持为空。
3. 点「提交」后，卡片折叠成「已提交 · 4 题」；宿主弹出可编辑确认框，点「发送」。
4. 主会话出现一条以 `表单回答 ·` 开头的用户消息，agent 开始下一轮。
5. 展开卡片可以看到刚才的答案，且输入框不可编辑。

## 与内置提问的关系

- 插件自己的工具描述会声明「需要澄清时优先用 `askme_form`」；插件 skill 也会自动列出。
- `/grill-me` 的一行委托让访谈流程优先走表单。
- **默认不修改全局 `~/.zcode/AGENTS.md`**。没有全局偏好时，泛化提问仍可能被内置 `AskUserQuestion` 抢走，这是预期；显式请求或 `/grill-me` 最稳。
- 需要「全面优先」时，可以自己加全局偏好；插件的 `PermissionRequest` hook 硬化没有启用（会硬性禁用内置提问）。

## 架构与限制

- **只做内联卡片**：ZCode 的 `ui.surfaces` 侧栏面板关闭了 `sendFollowUpMessage`、`updateModelContext`、`setWidgetState`，无法把答案作为用户消息发回主会话。
- **异步轮次**：工具立即返回，agent 结束本轮；提交产生一条 user 消息并开启下一轮。
- **工具契约**：`askme_form` 接收 `{ title, description?, questions[] }`；问题类型为 `single` / `multi` / `text` / `textarea`；选择型 2–12 个选项；最多 8 题。
- **答案格式**：每题一行 `n. 标题 → 答案`；多选用 `、`；其他写 `其他：...`；未答写 `（未回答）`；长文本缩进续行。
- **限制**：单张表单最多 8 题；widget state 16 KiB；HTML 资源单次读取 8 MiB；follow-up prompt 64 KiB；卡片不发外部请求。
- **安全**：卡片不使用 `innerHTML` 渲染用户/agent 文本；不使用 `eval` / wasm / 外部脚本；CSP 保持宿主默认。
- **兼容性**：ZCode Desktop 4.0.0（macOS，Electron Node）；开发用 Node 22。

## 开发

```bash
cd /Users/yulabu/Code/askme_UI   # 仓库根
npm install
npm run build                    # 生成 askme/dist/server.mjs 和 askme/dist/ui/card.html
npm test                         # MCP 协议测试（12 项）
npm run test:ui                  # 卡片 UI 测试（24 项，Playwright）
```

- 开发依赖在仓库根，`askme/` 目录本身不含 `node_modules`；安装时只复制约 740KB 的插件源码与构建产物。
- UI 测试优先使用 Playwright 自带的 Chromium；没装时自动回退到系统 Microsoft Edge / Chrome。若要安装 Chromium：`npx playwright install chromium`。
- 本地预览卡片：直接用浏览器打开 `askme/dist/ui/card.html`。没有 `window.zcode` 时会进入预览模式，提交只输出到控制台。
- 构建产物已提交到仓库，安装时不需要 `node_modules`，也不需要构建。
- 版本校验：`npm run build` 会检查 `package.json`、`askme/.zcode-plugin/plugin.json`、`marketplace.json` 三处版本一致。

## 版本与更新

- 当前：`0.3.0`（用户消息模式，tag `v0.3.0-message`）
- 无弹窗备选：`0.2.2`（工具结果模式，tag `v0.2.2-tool-result`）
- 变更记录见 [CHANGELOG.md](./CHANGELOG.md)。

更新步骤：

1. 修改源码后，同时提升 `package.json`、`askme/.zcode-plugin/plugin.json`、`marketplace.json` 的版本号。
2. 插件市场 → 市场源 → 刷新 `dev-askme-ui` → 插件详情 → 更新。
3. 新建任务验证。源码编辑不是热重载，已安装的旧任务不会自动换代码。

## 已知问题

- 宿主确认框每次提交都会出现；插件无法绕过。想要无弹窗请用 tag `v0.2.2-tool-result`。
- 同一资源多次调用时，旧卡片是否会被新调用改写，仍需实机观察。
- 无全局 AGENTS 时，显式请求或 `/grill-me` 稳定；泛化提问可能走内置。
- 打字聚焦已在 0.2.2 修复（widget state 通知不再整卡重渲染），仍建议实机复测。
- 如果后续确认框的交互体验需要优化，可以考虑在卡片按钮上直接标注「提交并确认」，但这不改变宿主行为。

## 回退

- **grilling 委托**：编辑 `~/.zcode/plugins/mattpocock-skills/skills/grilling/SKILL.md`，删除以 `If the askme_form tool is available` 开头的那一段。插件未启用时，这一行本来就是空操作。
- **全局偏好**：本插件默认不写 `~/.zcode/AGENTS.md`；如果你后来手动加过，删除对应段落即可。
- **卸载插件**：ZCode 设置 → 插件 → 卸载 `askme`。

## 目录

```text
askme_UI/
├── LICENSE                       # MIT
├── CHANGELOG.md                  # 版本记录
├── README.md                     # 本文件
├── SPEC.md                       # 需求与实现决策
├── marketplace.json              # 本地插件市场清单
└── askme/
    ├── .zcode-plugin/plugin.json # 插件 manifest（MCP server + skill）
    ├── LICENSE                   # MIT（随插件分发）
    ├── dist/                     # 构建产物，安装时直接使用
    ├── src/server/main.mjs       # MCP server 源码
    ├── src/ui/card.html          # 自包含卡片源码
    ├── scripts/build.mjs         # esbuild 构建 + 版本校验
    ├── skills/askme/SKILL.md     # 给 agent 的使用说明
    ├── tests/server.test.mjs     # MCP 协议测试
    └── tests/ui.test.mjs         # 卡片 UI 测试（Playwright）
```

## 贡献

个人项目，欢迎 issue / PR。改动前建议先跑：

```bash
npm run test:all
```

约束：卡片保持单文件自包含、不引入外部资源；不要修改全局 `~/.zcode/AGENTS.md`；提交前同步三处版本号并重新构建 `dist/`。

## License

[MIT](./LICENSE) © 2026 yulabu
