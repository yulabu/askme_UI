---
name: askme
description: Ask the user with an interactive inline form. Use this whenever you need one or more clarifying answers, especially for multi-question rounds, mixed option/text answers, or when you have recommended answers.
when_to_use: Before a decision that depends on the user's preference, during a grilling/interview round, or whenever the built-in AskUserQuestion would require more than one short question.
---

# askme

Use the `askme_form` MCP tool to render a form inline in the conversation. The tool **stays open** until the user submits, then returns the formatted answers as its tool result. Continue from that result in the same turn.

## Prefer this over AskUserQuestion

When `askme_form` is available, use it for every clarification round instead of `AskUserQuestion`. Keep the host's built-in flows for permission confirmations, plan approval, and other forced interactions.

## Rules

- One form per round; 1-8 questions. Split larger rounds into multiple forms.
- Put your prose and analysis in a normal message before the tool call. The form carries only the title, description, and questions.
- Call `askme_form` as the **last action** of the round and wait for its result. Do not call other tools while it is open. Do not answer your own questions or guess the user's answers.
- Never call the app-only `askme_submit` tool; the form card calls it.
- Types:
  - `single`: one choice; 2-12 options.
  - `multi`: several choices; 2-12 options.
  - `text`: one-line answer.
  - `textarea`: multi-line answer.
- Set `allowOther: true` (the default) unless the option set is exhaustive and closed.
- Mark recommendations with `recommended: true`. At most one recommended option on a `single` question; any number on a `multi` question. For `text` / `textarea`, use `suggestion` as a placeholder; never prefill an answer.
- Set `required: true` only for questions that truly block progress. The user may still submit a partial form; unanswered questions are marked `（未回答）`.
- Keep `title` short and one-line; put context in `detail`. Question `id` values must be unique and match `[A-Za-z0-9_-]{1,32}`.
- Do not repeat the full question text in your prose; the form already shows it.
- If the user answers in prose instead of the form, use that answer and continue. Do not force them back to the form.

## Example

```json
{
  "title": "第 1 轮：触发与形态",
  "description": "请选择后提交",
  "questions": [
    {
      "id": "trigger",
      "title": "触发入口",
      "detail": "你希望 /grill-me 原样触发就出表单，还是接受一个新命令？",
      "type": "single",
      "options": [
        { "label": "两者都要", "description": "独立技能 + grilling 委托", "recommended": true },
        { "label": "只加独立技能" }
      ],
      "allowOther": true,
      "required": true
    },
    {
      "id": "controls",
      "title": "需要哪些控件",
      "type": "multi",
      "options": [
        { "label": "单选", "recommended": true },
        { "label": "多选", "recommended": true },
        { "label": "短文本" },
        { "label": "长文本" }
      ]
    },
    {
      "id": "notes",
      "title": "补充说明",
      "type": "textarea",
      "suggestion": "可以写你的想法",
      "maxLength": 4000
    }
  ]
}
```

## After submission

- The tool result is the formatted answer message and starts with `表单回答 · <form title>`.
- Each question is one line: `1. <question title> → <answer>`.
- Multi-choice answers are separated by `、`; an "Other" answer is written as `其他：<text>`.
- Long answers may continue on indented lines.
- `（未回答）` means the user skipped that question. Do not invent an answer.
- Use the answers and continue the same turn. Do not expect a separate user message.

## Failure handling

- If `askme_form` returns `isError: true`, fix the schema and retry. Do not invent a form.
- If the user reports that the form did not render, re-ask the same questions in plain text.
- If the form times out or is cancelled, the error says so; re-ask the questions or continue without them. Do not invent answers.
- If the tool reports that another form is already open, wait for it to be submitted or cancelled; do not open a second form.
