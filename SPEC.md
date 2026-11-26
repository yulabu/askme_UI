# askme — 内联交互表单提问插件

状态：Implemented v0.3.1（用户消息模式，完整决策集，实机提交待验）
版本：0.1
日期：2026-11-24

## Problem Statement

用户在 ZCode 里使用 grill-me / grilling 这类访谈式澄清流程时，问题以纯文本输出，需要逐条打字回答。多题、长选项、推荐答案混在一起，输入成本高、容易漏答、答案格式不统一。

ZCode 内置的 `AskUserQuestion` 是宿主驱动的单次提问 UI，无法承载本场景需要的「多题合并、单选/多选/短文本/长文本混合、带推荐答案、一次提交」能力。ZCode 的插件机制虽然支持在消息流内渲染 HTML，但没有现成的、可被 agent 自主调用的表单工具。

核心诉求：agent 需要澄清时，自动在对话消息流里渲染一张交互表单；用户点选、填写或采纳推荐后提交，答案作为一条用户消息回到主会话，agent 继续下一轮。

## Solution

一个 ZCode 个人插件 `askme`，提供模型可见的 MCP 工具 `askme_form`：

- agent 传入声明式表单 schema，工具在消息流内联渲染一张 HTML 卡片。
- 卡片支持单选（含「其他」）、多选（含「其他」）、短文本、长文本、必答标记、推荐徽标、一键采纳推荐、部分提交、提交后只读折叠、深浅色主题、草稿持久化。
- 提交时通过 `window.zcode.sendFollowUpMessage` 把格式化 Markdown 答案作为用户消息发回主会话，开启下一轮。
- 插件自带 skill，声明「需要向用户提问时优先使用」；并在 grilling 技能中加一行委托，使 `/grill-me` 自动改用表单。
- 插件通过工具描述、插件 skill 和 grilling 委托独立工作；**不依赖也不修改全局 `~/.zcode/AGENTS.md`**。需要全面优先时，由用户自行选择加全局偏好。宿主强制的权限确认、plan 审批仍走内置流程。

## User Stories

### 触发与优先级

1. As the ZCode user, I want the agent to call the form tool whenever it needs to ask me clarifying questions, so that I don't have to type every answer manually.
2. As the ZCode user, I want `/grill-me` to automatically render each interview round as a form, so that my existing workflow keeps working without a new command.
3. As the ZCode user, I want the agent to choose the right control type per question (single, multi, short text, long text), so that the form fits the question instead of forcing everything into a text box.
4. As the ZCode user, I want the form to appear inline in the message stream, so that it stays attached to the conversation where the question was asked.
5. As the ZCode user, I want the agent's analysis and context to remain a normal chat message above the form, so that I can read and reference it while answering.
6. As the ZCode user, I want the agent to end its turn right after rendering the form, so that the session is ready to accept my submission.
7. As the ZCode user, I want the built-in question tool to be used only when the plugin is unavailable or when the host forces a confirmation flow, so that I get one consistent interaction pattern.
8. As the ZCode user, I want the plugin to work in every project and session once installed, so that I don't have to reconfigure it per workspace.

### 表单结构

9. As the ZCode user, I want a form title and optional one-line description, so that I know which round of questions I am answering.
10. As the ZCode user, I want each question to have a title and optional one-line detail, so that long context does not bloat the form.
11. As the ZCode user, I want to answer up to 8 questions in one form, so that a typical clarification round is a single submission.
12. As the ZCode user, I want the agent to split more than 8 questions into multiple forms, so that the form never becomes an endless page.
13. As the ZCode user, I want questions marked as required or optional, so that I know which ones matter most.
14. As the ZCode user, I want to submit a partially answered form, with unanswered questions clearly marked, so that I am never blocked by a question I cannot answer.
15. As the ZCode user, I want questions to keep their original order, so that the form matches the agent's reasoning.
16. As the ZCode user, I want each option to have an optional description, so that I can distinguish similar-sounding choices.
17. As the ZCode user, I want text answers to respect a maximum length, so that the returned message stays manageable.
18. As the ZCode user, I want stable question identifiers, so that the agent can map answers back to the right question.

### 控件

19. As the ZCode user, I want single-choice questions with an optional "Other" free-text option, so that I can answer when none of the listed options fit.
20. As the ZCode user, I want multi-choice questions with an optional "Other" free-text option, so that I can combine several answers and add my own.
21. As the ZCode user, I want short-text questions for concise answers, so that simple clarifications are fast to answer.
22. As the ZCode user, I want long-text questions for multi-line answers, so that I can explain complex reasoning without fighting a one-line input.
23. As the ZCode user, I want recommended options marked with a visible badge, so that I can see the agent's suggestion at a glance.
24. As the ZCode user, I want a one-click "accept all recommendations" action, so that I can answer a whole round in one click when I agree with the agent.
25. As the ZCode user, I want text suggestions shown as placeholders rather than prefilled text, so that I never accidentally submit a suggestion I did not read.
26. As the ZCode user, I want to override any recommendation before submitting, so that the agent's suggestion never traps me.

### 提交与回流

27. As the ZCode user, I want clicking submit to send my answers as a new user message in the main session, so that the agent continues in the same conversation.
28. As the ZCode user, I want the answer message to use a compact, stable Markdown format, so that both the agent and I can read it.
29. As the ZCode user, I want the submit button disabled while the message is being sent, so that I cannot create duplicate submissions.
30. As the ZCode user, I want the card to collapse into a "submitted" summary after success, so that the conversation stays readable.
31. As the ZCode user, I want to expand the collapsed card to review what I submitted, so that I can check my answers later.
32. As the ZCode user, I want submission errors shown inline with the form still editable, so that I can retry without re-answering.
33. As the ZCode user, I want a clear error when the session is busy, read-only, or disconnected, so that I know why the submission failed.
34. As the ZCode user, I want to cancel a host confirmation dialog without losing my answers, so that a misclick does not destroy the form.
35. As the ZCode user, I want the card to become read-only after submission, so that there is no ambiguity about which submission counts.

### 状态与体验

36. As the ZCode user, I want my draft answers restored if the card re-renders, so that I don't lose work.
37. As the ZCode user, I want the submitted state and formatted message persisted, so that the collapsed summary survives a re-render.
38. As the ZCode user, I want the form to follow ZCode's light and dark themes, so that it is readable in either mode.
39. As the ZCode user, I want the form to adapt to narrow windows, so that it remains usable when the chat pane is small.
40. As the ZCode user, I want keyboard navigation and visible focus states, so that I can answer without a mouse.
41. As the ZCode user, I want the card to make no external network requests, so that it works offline and does not leak data.
42. As the ZCode user, I want the card height to fit its content automatically, so that there is no nested scrolling for a typical 8-question form.
43. As the ZCode user, I want old or superseded forms to be clearly non-submittable, so that I cannot send stale answers.

### 集成与运维

44. As the ZCode user, I want to install the plugin through a local marketplace, so that installation uses ZCode's normal plugin flow.
45. As the ZCode user, I want the installed plugin to require no build step or `node_modules`, so that it keeps working after installation.
46. As the ZCode user, I want `/grill-me` to fall back to its current plain-text behavior when the plugin is disabled, so that the workflow never breaks.
47. As the ZCode user, I want the plugin to work without modifying my global AGENTS.md, so that installing it has no global side effects.
48. As the ZCode user, I want the plugin's skill to document when and how to use the tool, so that the agent generates valid schemas without guessing.
49. As the ZCode user, I want a README with install, development, and test steps, so that I can maintain the plugin later.
50. As the ZCode user, I want versioned installs and updates, so that I can tell which build is running.

## Implementation Decisions

### Architecture

- 个人自用插件，本地 marketplace 安装；不发布公共市场，不做多人分发。
- 形态固定为「一个 MCP server + 一个内联 HTML 资源 + 一个 skill」。
- 只做聊天内联卡片，不使用 `ui.surfaces` 侧栏面板。宿主对侧栏面板关闭了 `sendFollowUpMessage`、`updateModelContext`、`setWidgetState`，因此侧栏方案不可行。
- 不做图表、可视化、富媒体。

### Inline Rendering Contract

- 工具通过 `_meta.ui.resourceUri` 指向 HTML 资源，并设置 `preferredDisplayMode: "inline"` 与 `showInline: true`，确保卡片出现在消息流。
- 工具对模型可见（`visibility: ["model"]`）；不需要 app-only 工具。
- HTML 资源 MIME 为 `text/html;profile=mcp-app`，必须以 `text` 返回，不能是 blob；单次读取总量不超过宿主 8 MiB 限制。
- 卡片优先从 `window.zcode.toolInput` 读取表单 schema；若该通知晚到或缺失，回退到 `toolOutput.form`（服务端返回的 `structuredContent`）；答案不经过 server 中继，不维护服务端会话状态。

### Async Turn Model

- 工具调用立即返回，卡片渲染；agent 在本轮结束。
- 用户提交时，`sendFollowUpMessage` 插入一条 user 消息并开启新一轮。
- 宿主对 `sendFollowUpMessage` 强制检查 user gesture；iframe 点击不被宿主记账，因此每次提交都会弹一次可编辑确认框，插件无法跳过。0.3.0 接受这个确认框，以换取真正的用户消息语义。
- 0.2.2 的无弹窗工具结果模式保留在 tag `v0.2.2-tool-result`；它不是用户消息，agent 在同一轮继续。
- 不存在「工具阻塞等待 HTML 提交」的可行机制；0.2.0 的 `askme_form` 自阻塞会让卡片停在「正在加载插件界面」，已放弃。
- 同一时刻只允许一个 pending follow-up；卡片必须在提交期间禁用按钮并处理「已有 pending」错误。
- widget state 保存会触发宿主通知；卡片只在表单变化/取消时重渲染，避免打字时输入框被替换、焦点丢失（0.2.2）。

### Tool Contract

工具名 `askme_form`，输入类型形状：

```ts
type AskmeForm = {
  title: string                    // 1..200
  description?: string             // <= 500
  questions: Question[]            // 1..8
}

type Question = {
  id: string                       // 唯一，[A-Za-z0-9_-]{1,32}
  title: string                    // 1..200
  detail?: string                  // <= 500
  type: "single" | "multi" | "text" | "textarea"
  options?: Option[]               // single/multi 必填，2..12 项
  allowOther?: boolean             // 选择型默认 true
  required?: boolean               // 默认 false
  suggestion?: string              // 仅 text/textarea，占位提示，<= 500
  placeholder?: string             // <= 300
  maxLength?: number               // 1..20000；默认 text 500，textarea 4000
}

type Option = {
  label: string                    // 1..120，题内唯一
  description?: string             // <= 300
  recommended?: boolean
}
```

校验规则：

- 超过 8 题直接返回错误，提示 agent 拆成多张表单。
- `single` 最多一个 `recommended`；多个时服务端归一到第一个，并在结果中提示。
- `multi` 允许任意数量 `recommended`。
- 选择型没有有效选项、选项 label 重复、id 重复、类型非法时返回可读错误，不渲染卡片。
- 保留 id（`__proto__`、`constructor`、`prototype`）和保留选项 label（`__other__`）直接拒绝，避免对象键污染和哨兵值冲突。
- 未知字段忽略；缺失可选字段按默认值处理。

### Card Behavior

- 启动时序：先订阅宿主更新，再等待 `toolInput`；tool input 晚到时保持加载态并等待，不立即报错；5 秒内仍未收到且无 `toolOutput.form` 才显示错误。
- 控件：原生 radio/checkbox/input/textarea，使用 `fieldset` + `legend`，保留键盘操作与可见焦点。
- 「其他」在单选和多选中都是追加选项；选中后显示文本框；文本为空时记为「其他（未填写）」。
- 「采纳全部推荐」只作用于选择型：单选选中推荐项，多选在保留已选项的基础上勾选全部推荐项；文本型只保留 placeholder，不填值。
- 必答只做提示：提交前显示「还有 N 道必答题未回答」，但允许继续提交；答案消息中标记「（未回答）」。
- 卡片状态机：`idle → submitting → submitted`，失败回到 `idle` 并显示错误；`submitted` 只读、不可再次提交。
- 提交成功后原地折叠为「已提交 · 展开查看」；展开只读展示已提交内容。
- 所有用户/agent 提供的文本通过 `textContent` 渲染，禁止 `innerHTML`，避免注入。

### Answer Message Contract

提交内容为一条紧凑 Markdown 用户消息：

```text
表单回答 · <表单标题>

1. <题目标题> → <答案>
2. <题目标题> → A、C
3. <题目标题> → （未回答）
4. <题目标题> →
   多行文本的后续行缩进三个空格。
```

- 多选使用中文顿号分隔。
- 「其他」写成 `其他：<文本>`。
- 长文本保留换行，首行跟在 `→` 后，后续行缩进。
- 不在消息中附加 JSON、隐藏标记或表单 id。

### State & Limits

- 草稿写入 `setWidgetState` 的 `privateContent`，`modelContent` 保持 `null`；整体序列化不超过 16 KiB。
- 持久化内容：form id、各题答案、提交状态、已格式化的提交文本、折叠状态。
- 超过 16 KiB 时放弃持久化而不是报错；不存图片、密钥或大段无关内容。
- 卡片高度用 `ResizeObserver` + `notifyIntrinsicHeight` 上报；不使用 `position: fixed`、`100vh` 或内部滚动容器。

### Theme & Styling

- 读取宿主注入的 `data-theme` 与 `hostContext.styles.variables`，映射到本地 CSS 变量；提供 ZCode 浅色/深色 fallback。
- 使用系统字体栈，不加载外部字体、CDN、图片。
- 极简卡片：细边框、圆角、透明或宿主背景色；选中项用宿主强调色；不做动画堆叠。
- 视觉美观后置，v1 以可读、可用为准。

### Security & Compatibility

- 卡片不发起任何网络请求，不使用 `eval` / wasm / 外部脚本。
- 依赖宿主沙箱的 CSP 默认值即可，不申请额外 CSP 放宽或权限。
- 目标环境为 ZCode Desktop 4.0.0（macOS，Electron Node）；不承诺其他客户端。
- 卡片在宿主 `window.zcode` 不存在时进入 mock 模式，仅供本地预览，不用于生产。

### Trigger & Priority

- 工具描述明确写出：需要向用户提澄清问题时优先使用，替代内置 `AskUserQuestion`；调用后结束本轮。
- 插件 skill 自动触发，规定使用场景、schema 生成规则、一轮一表单、最后动作、失败降级。
- `grilling` 技能加一行委托：若 `askme_form` 可用，则把整轮问题合并为一次工具调用，保留原有问题、选项与推荐；正文仍写在普通消息里。
- grilling/访谈轮次必须保留完整决策集：一题一决策，最多 8 题；不得预缩到 4-5 题或合并决策；推荐项只是建议，不替代提问；只有超过 8 才拆。
- 全局偏好是可选增强，默认不写；插件不修改 `~/.zcode/AGENTS.md`。
- 默认按需使用：显式请求或 `/grill-me` 触发；泛化提问可能走内置。需要全面优先时，由用户自行加全局偏好。
- 宿主没有工具优先级机制，插件也无法用同名覆盖内置工具；默认优先级靠工具描述、插件 skill、grilling 委托。模型偶发仍选内置，视为可接受降级。
- 保证 MCP 工具常驻模型工具列表：server 配置 `alwaysLoad: true`，或工具 `_meta["anthropic/alwaysLoad"]: true`；本机 `toolSearchMode` 已是 `off`，默认不进入 deferred 流程。
- 可选硬化（不在 v1，需单独确认）：插件内提供 `PermissionRequest` hook，对 `AskUserQuestion` 返回 deny 并附「请改用 askme_form」的理由。这是唯一能硬性禁用内置提问的手段，但会影响所有会话的提问行为，默认不启用。

### Failure Handling

- 卡片未渲染或用户反馈看不到表单时，agent 依据工具结果中的文本摘要改用纯文本重新提问。
- 提交失败（会话忙、只读、断开、用户取消确认框）时，卡片保持可编辑并展示具体错误；用户可重试。
- 工具参数校验失败时，不渲染卡片，返回结构化错误信息，agent 修正 schema 后重试。
- 插件未启用时，`/grill-me` 维持现有纯文本行为。

### Packaging & Install

- server 打包为单文件 ESM，运行时无 `node_modules` 依赖；前端为单个自包含 HTML。
- 通过本地 marketplace 安装；插件启用、禁用、卸载均只对新会话生效，当前会话不会即时摘除已加载的 MCP 工具。
- 更新通过提升 manifest 版本、刷新市场、重新安装完成，不做热重载。
- 不修改宿主内置文件；唯一第三方改动是 `grilling` 技能中的一行委托，可回退。

## Testing Decisions

### Testing Seams

本项目有两个运行时边界，因此设两个自动化 seam + 两个人工验收 seam：

1. **MCP stdio 边界（自动化）**：启动构建后的 server，用真实 MCP 客户端完成握手并调用工具/读取资源。覆盖协议、schema 校验、`_meta`、资源 MIME 与内容。
2. **`window.zcode` 边界（自动化）**：在真实浏览器中加载构建后的卡片，注入 mock 宿主桥。覆盖渲染、交互、提交格式、状态机、错误处理、主题。
3. **ZCode 实机（人工验收）**：安装插件、新建会话、真实调用工具、提交表单并确认新一轮开始。
4. **grill-me 集成（人工验收）**：分别验证插件启用与禁用时 `/grill-me` 的行为。

选择理由：server 与卡片是两个独立运行时，各自只有一个外部边界；不为内部函数另建 seam。测试对象是构建产物，而不是源码内部实现。

### What Makes a Good Test

- 只测外部可观察行为与通信契约：JSON-RPC 响应、HTML 渲染结果、用户操作后的 `sendFollowUpMessage` 参数。
- 不测内部函数名、DOM 结构细节、具体 CSS 值。
- 测试必须能在没有 ZCode 宿主的情况下重复运行；实机验证单独列为人工清单。

### Server Tests

- `initialize` 返回 tools/resources 能力，协议版本可协商。
- `tools/list` 只暴露 `askme_form`，描述包含「优先于内置提问」「本轮最后动作」「entire frontier」「4-5」「up to 8」，`_meta.ui.resourceUri` 正确。
- `resources/list` 包含卡片资源，MIME 为 `text/html;profile=mcp-app`。
- `resources/read` 返回 HTML 文本（非 blob），大小在限制内，内容包含卡片脚本。
- `tools/call` 合法 schema 返回成功结果、内联渲染元数据及 `structuredContent.form`。
- 工具带 `readOnlyHint: true` 注解（不修改工作区），不影响交互语义。
- `tools/call` 非法 schema（>8 题、重复 id、保留 id、保留 label、选择型缺选项、非法类型）返回可读错误和结构化错误数据，且不渲染卡片。
- 未知方法/工具返回标准 JSON-RPC 错误。
- 卡片资源不包含外部 URL、`eval` 或 `new Function`。

### UI Tests

- 从 `toolInput` 渲染标题、说明、题目顺序与四种控件（含独立的短文本用例）；`toolInput` 晚到时等待，缺失时回退到 `toolOutput.form`。
- 单选/多选 + 「其他」输入：选中、输入、取消的取值正确；多选「其他」可勾选后再取消。
- 推荐徽标显示；「采纳全部推荐」正确选中单选/多选项、保留已有多选、且不改写文本输入。
- 必答未答时显示提示但允许提交；空「其他」视为未答；答案消息标记「（未回答）」或「其他（未填写）」。
- 提交调用 `sendFollowUpMessage`，参数与约定格式逐字符匹配。
- 提交中按钮禁用；成功后只读折叠；失败后保持可编辑并显示错误。
- 草稿写入 `widgetState` 并在重新挂载后恢复；超过 16 KiB 时不写入；提交状态和已发送消息持久化。
- 宿主注入的 `data-theme` 与 `hostContext.styles.variables` 正确应用。
- 单选键盘切换后焦点保留在对应输入上。
- 卡片不发起网络请求，不调用 `eval`。

### Manual Acceptance

- 新会话中 agent 主动调用 `askme_form`，卡片内联出现。
- 点击提交后，主会话出现格式化用户消息，agent 开始下一轮。
- 宿主若弹出确认框，取消后表单仍可编辑；确认后消息正确发送。
- `/grill-me` 在插件启用时出表单，禁用时保持纯文本。
- 8 题表单在窄窗口、深色模式下可读且无内部滚动。

### Prior Art

仓库为全新项目，无既有测试。server 测试以 MCP 官方客户端行为为准；UI 测试使用 Playwright 的浏览器上下文与注入脚本模式。

## Out of Scope

- 图表、可视化、富媒体、图片上传。
- 侧边栏、独立窗口、全屏应用。
- 评分、排序、日期、文件上传、滑块等额外控件。
- 公开市场发布、多人分发、权限/多租户。
- 替换宿主强制的权限确认、plan 审批、计划模式提问。
- 重做聊天界面或消息渲染。
- 多语言 UI（v1 中文文案；文案暂不集中管理，后续需要时再抽）。
- 服务端保存答案、分析、审计。
- 提交后就地编辑答案（用户可直接打字修正，或由 agent 重新发题）。
- 单张表单超过 8 题（拆分为多轮）。
- 开发期热重载。

## Further Notes

### 已核实的宿主约束

- ZCode Desktop 4.0.0 存在两套 HTML UI 机制：工具级内联 MCP App 卡片，以及插件 manifest 的 `ui.surfaces` 侧栏面板。
- 侧栏面板的宿主能力明确关闭了 `sendFollowUpMessage`、`updateModelContext`、`setWidgetState`，因此本方案只走内联卡片。
- 内联卡片的 `sendFollowUpMessage` 会插入 user 消息并启动一轮；Promise 在宿主接收后 resolve，不等待模型回复；同一时刻只允许一个 pending。
- `sendFollowUpMessage` 需要 5 秒内的 `mouseDown`/`keyDown` gesture；iframe 内的点击不被宿主记账，因此会弹「插件想以你的身份发送消息」确认框，且没有 skip 参数或设置。这是用户消息模式的固有代价。
- 宿主没有「工具阻塞等待 HTML 提交」的机制；MCP elicitation 是宿主原生表单，不满足自绘 HTML 需求。
- 卡片资源必须返回 `text`，不能是 blob；单次资源读取总量上限 8 MiB；widget state 上限 16 KiB；follow-up prompt 上限 64 KiB。
- 宿主沙箱 CSP 默认 `default-src 'none'`，外部 CDN/字体不可依赖；因此卡片必须自包含。
- 官方没有 UI 插件开发文档或模板，行为依据运行时实现与官方打包产物；实现需以实测为准。
- 内置 `AskUserQuestion` 是模型可见工具，与 MCP 工具同处一个注册表；支持 1..4 题、2..4 选项、自动提供 Other，答案以工具结果回灌，不产生 user 消息。
- 宿主没有工具优先级机制；MCP 工具名固定为 `mcp__<server>__<tool>` 形式，无法与内置名冲突或覆盖内置工具。
- 用户级指令只加载 `~/.zcode/AGENTS.md`；工作区级从 cwd 向上到 git 根查找同名文件。不存在 `CLAUDE.md` / `ZCODE.md` / `.zcode/rules` 的加载路径。
- Skill frontmatter 允许 `name`、`description`、`when_to_use`、`license`、`metadata`；`description` 对插件 skill 必填；隐式调用恒允许，没有关闭开关。

- 实机 0.1.0 已验证：不声明 `ui.surfaces` 时内联卡片能渲染；暴露的问题是 tool input 通知晚于卡片启动，0.1.1 通过「先订阅 + `toolOutput.form` 兜底 + 5 秒超时」修复。

### 待验证事项

- 提交点击是否被宿主视为 user gesture；若不算，每次提交会多一个确认框。
- 同一资源多次调用是否复用 widget 实例；若旧卡片被新调用改写，需要调整卡片实例隔离或降级策略。
- 插件 MCP server 在模型工具列表中的准确名称与 `alwaysLoad` 生效方式（安装后以实际列表为准）。
- `grilling` 技能一行委托的具体措辞，确保不破坏原有轮次格式。

### 风险与对策

- **无官方文档**：以构建产物 + 实机验证为准，预留 1–2 轮修正。
- **gesture 确认框**：宿主每次都会弹可编辑确认框；这是用户消息语义的代价，不是缺陷。取消不丢答案；无弹窗需求改用 tag `v0.2.2-tool-result`。
- **widget 复用**：卡片以 `toolInput` 为主、`toolOutput.form` 兜底，form id 隔离草稿；必要时改用独立 surface。
- **内置工具竞争**：工具描述 + 插件 skill + grilling 委托；不写全局 AGENTS；接受偶发降级。需要更强时由用户自行加全局偏好或评估 `PermissionRequest` hook。
- **安装/更新摩擦**：本地市场 + 版本号递增；README 记录步骤。

### Readiness Checklist

- [x] 需求冻结（场景、形态、控件、提交、触发、范围）
- [x] 技术路线选定（内联 MCP App 卡片）
- [x] 工具契约与答案格式确定
- [x] 失败降级与安全边界确定
- [x] 测试 seam 设计
- [x] 不修改全局 `~/.zcode/AGENTS.md`（按用户要求；插件独立工作）
- [x] 测试 seam 与用户确认
- [x] grilling 一行委托获批
- [x] 本地 marketplace 与安装步骤实测
- [x] 实机内联渲染（0.1.0 截图验证）
- [ ] 实机提交与 `/grill-me` 验收
- [x] server 协议测试（12/12）
- [x] 卡片 UI 测试（24/24）
- [x] ZCode Helper 启动验证
