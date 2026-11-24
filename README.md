# askme

ZCode 的内联交互表单插件：agent 需要向你提问时，在对话消息流里渲染一张 HTML 表单；你点选、填写或采纳推荐后提交，答案作为一条用户消息回到主会话，agent 继续下一轮。

为 grill-me / grilling 这类访谈式澄清流程设计，也适用于任何需要 agent 主动提问的场景。

## 能做什么

- 一张表单合并 1–8 个问题，一次提交
- 四种控件：单选、多选、短文本、长文本
- 单选/多选支持「其他」自定义输入
- 推荐项徽标 + 「采纳全部推荐」
- 必答标记；允许部分提交，未答项标记「（未回答）」
- 提交后卡片折叠为「已提交」，可展开只读回看
- 提交会打开宿主的可编辑确认框；点「发送」后作为一条**新的用户消息**回到主会话，开启下一轮
- 草稿自动持久化；深/浅色主题跟随宿主
- 卡片完全自包含：不加载外部字体、脚本、图片，不发网络请求

## 目录

```text
askme_UI/
├── marketplace.json              # 本地插件市场清单
├── SPEC.md                       # 需求与实现决策
└── askme/
    ├── .zcode-plugin/plugin.json # 插件 manifest（MCP server + skill）
    ├── dist/                     # 构建产物，安装时直接使用
    ├── src/server/main.mjs       # MCP server 源码
    ├── src/ui/card.html          # 自包含卡片源码
    ├── scripts/build.mjs         # esbuild 构建
    ├── skills/askme/SKILL.md     # 给 agent 的使用说明
    ├── tests/server.test.mjs     # MCP 协议测试
    └── tests/ui.test.mjs         # 卡片 UI 测试（Playwright）
```

## 安装

1. 打开 ZCode 的 **插件市场 → 添加 → 添加插件市场**。
2. 粘贴市场根目录（不是插件子目录）：

   ```text
   /Users/yulabu/Code/askme_UI
   ```

3. 在 **个人 → dev-askme-ui** 找到 **问我 / Ask Me**，点击安装。
4. **新建一个任务**再使用。插件安装、启用、禁用都只对新会话生效，当前会话不会加载新工具。

插件**不修改全局配置**：它通过自身的 `askme` skill、工具描述和 `/grill-me` 委托触发。需要 agent 全面优先时，再自行决定是否在 `~/.zcode/AGENTS.md` 加偏好。

## 使用

装好后有两种触发方式：

- **agent 自主调用**：直接说「用表单问我几个问题」或任何需要澄清的任务；agent 会调用 `askme_form`。
- **`/grill-me`**：grilling 技能里加了一行委托，检测到 `askme_form` 可用时会把每轮问题合并成一张表单，保留原来的问题、选项和推荐答案。

提交后，宿主会弹出可编辑的确认框；点「发送」后主会话出现类似下面的用户消息：

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

## 开发

```bash
cd /Users/yulabu/Code/askme_UI   # 仓库根
npm install
npm run build                    # 生成 askme/dist/server.mjs 和 askme/dist/ui/card.html
npm test                         # MCP 协议测试（12 项）
npm run test:ui                  # 卡片 UI 测试（24 项，Playwright）
```

- 开发依赖在仓库根，`askme/` 目录本身不含 `node_modules`；安装时只复制约 800KB 的插件源码与构建产物。
- UI 测试优先使用 Playwright 自带的 Chromium；没装时自动回退到系统 Microsoft Edge / Chrome。若要安装 Chromium：`npx playwright install chromium`。
- 本地预览卡片：直接用浏览器打开 `askme/dist/ui/card.html`。没有 `window.zcode` 时会进入预览模式，提交只输出到控制台。
- 构建产物已提交到仓库，安装时不需要 `node_modules`，也不需要构建。

## 设计约束

- **只做内联卡片**：ZCode 的 `ui.surfaces` 侧栏面板关闭了 `sendFollowUpMessage` / `updateModelContext` / `setWidgetState`，无法把答案发回主会话。
- **异步轮次**：工具立即返回，agent 结束本轮；用户提交产生一条 user 消息并开启下一轮。没有「工具阻塞等表单提交」的机制。
- **限制**：单张表单最多 8 题；widget state 16 KiB；HTML 资源单次读取 8 MiB；卡片不发外部请求。
- **优先级是软的**：宿主没有工具优先级机制，插件也无法覆盖内置 `AskUserQuestion`。目前靠工具描述、插件 skill 和 grilling 委托引导；**不修改全局 `~/.zcode/AGENTS.md`**。显式请求最稳；泛化提问偶发走内置属于预期降级。需要全面优先时，再单独加全局偏好或 `PermissionRequest` hook。
- **提交确认**：真正“提交=新用户消息”只能走 `sendFollowUpMessage`；宿主对 iframe 点击不记账，所以每次都会弹一次可编辑确认框。插件无法跳过，这是用户消息语义的代价。想要无弹窗，可切换到 tag `v0.2.2-tool-result` 的工具结果模式。

## 已知待实测

- 宿主确认框每次提交都会出现；已确认无法用插件绕过。想要无弹窗请用 tag `v0.2.2-tool-result`。
- 同一资源多次调用时，旧卡片是否会被新调用改写。
- 无全局 AGENTS 时的独立触发：显式请求或 `/grill-me` 应稳定；泛化提问可能走内置。
- 打字聚焦已在 0.2.2 修复（widget state 通知不再整卡重渲染），需实机复测。

实机 0.1.0 已经验证：不声明 `ui.surfaces` 时内联卡片能渲染。当时的问题是宿主的 tool input 通知晚于卡片启动，0.1.1 已改为「先订阅 + `toolOutput.form` 兜底 + 5 秒超时」，需要实机复测。

如果实机验证发现差异，优先改卡片与 manifest，不改需求。

## 更新

1. 修改源码后，同时提升 `package.json`、`askme/.zcode-plugin/plugin.json`、`marketplace.json` 的版本号；`npm run build` 会校验三者一致。
2. 插件市场 → 市场源 → 刷新 `dev-askme-ui` → 插件详情 → 更新。
3. 新建任务验证。源码编辑不是热重载，已安装的旧任务不会自动换代码。

## 回退

- **全局偏好**：本插件默认不写 `~/.zcode/AGENTS.md`；如果你后来手动加过，删除对应段落即可。
- **grilling 委托**：编辑 `~/.zcode/plugins/mattpocock-skills/skills/grilling/SKILL.md`，删除以 `If the askme_form tool is available` 开头的那一行。插件未启用时，这一行本来就是空操作。
- **卸载插件**：ZCode 设置 → 插件 → 卸载 `askme`。

## 安全

- 卡片不使用 `innerHTML` 渲染用户/agent 文本；所有文本走 `textContent`。
- 不使用 `eval` / wasm / 外部脚本；CSP 保持宿主默认。
- 不申请额外权限，不读取工作区文件。
