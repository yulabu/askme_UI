# Changelog

All notable changes to this project are recorded here. Versions follow the plugin
manifest version in `askme/.zcode-plugin/plugin.json`.

## 0.3.1 — 2026-11-27 — grilling round sizing

- The form's 1-8 limit and the "one form per round / split larger rounds" wording
  made the model pre-trim grilling rounds to 4-5 questions. The tool description,
  the plugin skill, and the grilling delegation now require the entire frontier:
  one question per decision, up to 8; do not merge decisions or shrink to 4-5;
  split only when the frontier exceeds 8. Recommendations are not answers.

## 0.3.0 — 2026-11-24 — user-message mode

- Return to the original grill-me cadence: `askme_form` returns immediately, the
  agent ends its turn, and the card stays in the conversation.
- Submitting calls `window.zcode.sendFollowUpMessage`; after the host's editable
  confirmation dialog, the answers become a **new user message** and start the
  next turn.
- Removed `askme_wait` and `askme_submit`; the async model no longer needs a
  blocking app-only tool.
- Kept the 0.2.2 focus fix (widget-state notifications no longer re-render the
  whole card while typing), the late-tool-input fallback, theme handling, and
  the 16 KiB draft budget.
- No global `~/.zcode/AGENTS.md` preference is written; the plugin works through
  its own tool description, skill, and the `/grill-me` delegation.
- The host confirmation dialog is unavoidable for true user-message semantics;
  it is a host safety check, not a plugin bug.

## 0.2.2 — 2026-11-24 — no-dialog tool-result mode (tagged `v0.2.2-tool-result`)

- Kept the form + wait architecture but stopped re-rendering the whole card on
  widget-state saves, so typing keeps focus and content.
- Added a regression test that pauses longer than the draft-save debounce while
  typing.
- Preserved as the no-confirmation alternative; answers are tool results in the
  same turn, not user messages.

## 0.2.1 — 2026-11-24 — form + wait split

- Split form rendering from waiting: `askme_form` returns immediately with a
  `formId`, then `askme_wait` blocks until the card calls `askme_submit`.
- Fixed the "正在加载插件界面" deadlock caused by a self-blocking `askme_form`.
- Added a 10-minute MCP timeout and progress heartbeat for the wait.

## 0.2.0 — 2026-11-24 — blocking submission (experimental)

- Replaced `sendFollowUpMessage` with an app-only `askme_submit` and a blocking
  `askme_form`, to avoid the host confirmation dialog.
- This exposed the host's UI-loading order: the card is not loaded until the
  tool call returns, so a self-blocking form deadlocks.

## 0.1.1 — 2026-11-24 — late tool input fix

- Subscribe to host updates before reading `toolInput`; wait for the async
  `ui/notifications/tool-input` instead of failing immediately.
- Fall back to `toolOutput.form`; show an error only after a timeout.

## 0.1.0 — 2026-11-24 — initial release

- Inline MCP App form card with single choice, multi choice, short text and long
  text, "Other" input, recommended answers, accept-all, required hints, partial
  submission, read-only collapse, draft persistence, theme support.
- `sendFollowUpMessage` submission, formatting contract, local marketplace
  packaging, server protocol tests, and Playwright UI tests.
