import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { computeFormId } from "../src/server/main.mjs";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const serverPath = join(pluginRoot, "dist", "server.mjs");
const CARD_URI = "ui://askme/card.html";
const CARD_MIME = "text/html;profile=mcp-app";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let client;

before(async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    stderr: "pipe",
  });
  client = new Client(
    { name: "askme-tests", version: "0.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
});

after(async () => {
  await client?.close();
});

const validForm = {
  title: "第 1 轮：触发与形态",
  description: "请选择后提交",
  questions: [
    {
      id: "q1",
      title: "触发入口",
      detail: "你希望怎么触发？",
      type: "single",
      options: [
        { label: "两者都要", description: "独立技能 + grilling 委托", recommended: true },
        { label: "只加独立技能" },
      ],
      allowOther: true,
      required: true,
    },
    {
      id: "q2",
      title: "需要哪些控件",
      type: "multi",
      options: [
        { label: "单选", recommended: true },
        { label: "多选", recommended: true },
        { label: "短文本" },
        { label: "长文本" },
      ],
      allowOther: true,
    },
    {
      id: "q3",
      title: "补充说明",
      type: "textarea",
      suggestion: "可以写你的想法",
      maxLength: 4000,
    },
  ],
};

test("tools/list exposes the form, wait and app-only submit tools", async () => {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 3);

  const tool = tools.find((entry) => entry.name === "askme_form");
  assert.ok(tool);
  assert.match(tool.description, /AskUserQuestion/);
  assert.match(tool.description, /askme_wait/);
  assert.match(tool.description, /Do not end the turn/i);
  assert.equal(tool._meta?.ui?.resourceUri, CARD_URI);
  assert.equal(tool._meta?.ui?.preferredDisplayMode, "inline");
  assert.equal(tool._meta?.ui?.showInline, true);
  assert.ok(tool._meta?.ui?.visibility?.includes("model"));
  assert.equal(tool._meta?.["anthropic/alwaysLoad"], true);

  assert.equal(tool.inputSchema.type, "object");
  assert.deepEqual(tool.inputSchema.required, ["title", "questions"]);
  assert.equal(tool.inputSchema.properties.questions.minItems, 1);
  assert.equal(tool.inputSchema.properties.questions.maxItems, 8);

  const wait = tools.find((entry) => entry.name === "askme_wait");
  assert.ok(wait);
  assert.equal(wait._meta?.ui, undefined);
  assert.equal(wait._meta?.["anthropic/alwaysLoad"], true);
  assert.deepEqual(wait.inputSchema.required, ["formId"]);

  const submit = tools.find((entry) => entry.name === "askme_submit");
  assert.ok(submit);
  assert.deepEqual(submit._meta?.ui?.visibility, ["app"]);
  assert.deepEqual(submit.inputSchema.required, ["formId", "message"]);
});

test("manifest gives MCP calls a 10 minute timeout", async () => {
  const manifest = JSON.parse(
    await readFile(join(pluginRoot, ".zcode-plugin", "plugin.json"), "utf8"),
  );
  assert.ok(manifest.mcpServers.askme.timeoutMs >= 300000);
});

test("resources/list advertises the card as an MCP App HTML resource", async () => {
  const { resources } = await client.listResources();
  const card = resources.find((resource) => resource.uri === CARD_URI);
  assert.ok(card, "card resource is listed");
  assert.equal(card.mimeType, CARD_MIME);
});

test("resources/read returns self-contained HTML as text", async () => {
  const { contents } = await client.readResource({ uri: CARD_URI });
  assert.equal(contents.length, 1);
  const content = contents[0];
  assert.equal(content.uri, CARD_URI);
  assert.equal(content.mimeType, CARD_MIME);
  assert.equal(typeof content.text, "string");
  assert.ok(content.text.length > 1000, "card HTML is present");
  assert.match(content.text, /window\.zcode/);
  assert.match(content.text, /askme_submit/);
  assert.doesNotMatch(content.text, /sendFollowUpMessage/);
  assert.doesNotMatch(content.text, /https?:\/\//, "card must not reference external resources");
  assert.doesNotMatch(content.text, /\beval\s*\(/, "card must not call eval");
  assert.doesNotMatch(content.text, /\bnew Function\b/, "card must not build functions from strings");
});

test("askme_form returns a formId and askme_wait returns the submitted answers", async () => {
  const formResult = await client.callTool({ name: "askme_form", arguments: validForm });
  assert.notEqual(formResult.isError, true);
  assert.match(formResult.content[0].text, /askme_wait/);
  assert.match(formResult.content[0].text, /Do not end the turn/i);

  const formId = formResult.structuredContent.formId;
  assert.equal(formId, computeFormId(validForm));

  const waitPromise = client.callTool({
    name: "askme_wait",
    arguments: { formId },
  });
  await sleep(100);

  const message = "表单回答 · 第 1 轮：触发与形态\n\n1. 触发入口 → 两者都要";
  const submitResult = await client.callTool({
    name: "askme_submit",
    arguments: {
      formId,
      message,
      answers: { q1: { value: "两者都要" } },
    },
  });
  assert.notEqual(submitResult.isError, true);
  assert.match(submitResult.content[0].text, /Answers received/i);

  const waitResult = await waitPromise;
  assert.notEqual(waitResult.isError, true);
  assert.equal(waitResult.content[0].type, "text");
  assert.equal(waitResult.content[0].text, message);
  assert.equal(waitResult.structuredContent.formId, formId);
  assert.equal(waitResult.structuredContent.answers.q1.value, "两者都要");
});

test("askme_submit rejects a stale form id without closing the open form", async () => {
  const formResult = await client.callTool({ name: "askme_form", arguments: validForm });
  const formId = formResult.structuredContent.formId;
  const waitPromise = client.callTool({
    name: "askme_wait",
    arguments: { formId },
  });
  await sleep(100);

  const stale = await client.callTool({
    name: "askme_submit",
    arguments: { formId: "stale", message: "stale answer" },
  });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /no longer open/i);

  const ok = await client.callTool({
    name: "askme_submit",
    arguments: {
      formId,
      message: "表单回答 · OK\n\n1. 触发入口 → A",
    },
  });
  assert.notEqual(ok.isError, true);
  const result = await waitPromise;
  assert.notEqual(result.isError, true);
});

test("askme_wait and askme_submit reject an unknown form id", async () => {
  const wait = await client.callTool({
    name: "askme_wait",
    arguments: { formId: "missing" },
  });
  assert.equal(wait.isError, true);
  assert.match(wait.content[0].text, /no longer open/i);

  const submit = await client.callTool({
    name: "askme_submit",
    arguments: { formId: "missing", message: "y" },
  });
  assert.equal(submit.isError, true);
  assert.match(submit.content[0].text, /no longer open/i);
});

test("a new askme_form replaces the open form and rejects the old waiter", async () => {
  const first = await client.callTool({ name: "askme_form", arguments: validForm });
  const firstId = first.structuredContent.formId;
  const firstWait = client.callTool({
    name: "askme_wait",
    arguments: { formId: firstId },
  });
  await sleep(100);

  const secondForm = { ...validForm, title: "Second form" };
  const second = await client.callTool({ name: "askme_form", arguments: secondForm });
  assert.notEqual(second.isError, true);
  const secondId = second.structuredContent.formId;
  assert.notEqual(secondId, firstId);

  const firstResult = await firstWait;
  assert.equal(firstResult.isError, true);
  assert.match(firstResult.content[0].text, /replaced/i);

  const waitPromise = client.callTool({
    name: "askme_wait",
    arguments: { formId: secondId },
  });
  await sleep(100);
  await client.callTool({
    name: "askme_submit",
    arguments: {
      formId: secondId,
      message: "表单回答 · Second form\n\n1. 触发入口 → A",
    },
  });
  const result = await waitPromise;
  assert.notEqual(result.isError, true);
});

test("tools/call rejects more than 8 questions and asks the model to split", async () => {
  const questions = Array.from({ length: 9 }, (_, index) => ({
    id: `q${index + 1}`,
    title: `问题 ${index + 1}`,
    type: "text",
  }));
  const result = await client.callTool({
    name: "askme_form",
    arguments: { title: "Too many", questions },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /8/);
  assert.match(result.content[0].text, /split/i);
});

test("tools/call rejects duplicate question ids", async () => {
  const result = await client.callTool({
    name: "askme_form",
    arguments: {
      title: "Duplicate ids",
      questions: [
        { id: "same", title: "A", type: "text" },
        { id: "same", title: "B", type: "text" },
      ],
    },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /duplicate/i);
  assert.ok(Array.isArray(result.structuredContent?.errors));
  assert.ok(result.structuredContent.errors.some((error) => /duplicate/i.test(error)));
});

test("tools/call rejects reserved question ids", async () => {
  for (const id of ["__proto__", "constructor", "prototype"]) {
    const result = await client.callTool({
      name: "askme_form",
      arguments: {
        title: "Reserved id",
        questions: [{ id, title: "Question", type: "text" }],
      },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /reserved/i);
  }
});

test("tools/call rejects the reserved __other__ option label", async () => {
  const result = await client.callTool({
    name: "askme_form",
    arguments: {
      title: "Reserved label",
      questions: [
        {
          id: "q1",
          title: "Pick one",
          type: "single",
          options: [{ label: "__other__" }, { label: "B" }],
        },
      ],
    },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /__other__/);
});

test("tools/call rejects a choice question without options", async () => {
  const result = await client.callTool({
    name: "askme_form",
    arguments: {
      title: "Missing options",
      questions: [{ id: "q1", title: "Pick one", type: "single" }],
    },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /options/i);
});

test("tools/call rejects an unknown question type", async () => {
  const result = await client.callTool({
    name: "askme_form",
    arguments: {
      title: "Bad type",
      questions: [{ id: "q1", title: "Pick one", type: "slider" }],
    },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /type/i);
});

test("askme_form reports normalization notes before waiting", async () => {
  const form = {
    title: "Recommendations",
    questions: [
      {
        id: "q1",
        title: "Pick one",
        type: "single",
        options: [
          { label: "A", recommended: true },
          { label: "B", recommended: true },
        ],
      },
    ],
  };
  const result = await client.callTool({ name: "askme_form", arguments: form });
  assert.notEqual(result.isError, true);
  assert.match(result.content[0].text, /askme_wait/);
  assert.match(result.content[0].text, /recommended/i);
  assert.match(result.content[0].text, /first/i);
});

test("cancelling askme_wait leaves the form open for a later submit", async () => {
  const form = await client.callTool({ name: "askme_form", arguments: validForm });
  const formId = form.structuredContent.formId;

  const controller = new AbortController();
  const waitPromise = client.callTool(
    { name: "askme_wait", arguments: { formId } },
    undefined,
    { signal: controller.signal },
  );
  await sleep(100);
  controller.abort();
  await assert.rejects(waitPromise, /abort|cancel/i);

  const submit = await client.callTool({
    name: "askme_submit",
    arguments: {
      formId,
      message: "表单回答 · late\n\n1. 触发入口 → A",
    },
  });
  assert.notEqual(submit.isError, true);

  const lateWait = await client.callTool({
    name: "askme_wait",
    arguments: { formId },
  });
  assert.notEqual(lateWait.isError, true);
  assert.match(lateWait.content[0].text, /表单回答 · late/);
});

test("tools/call rejects an unknown tool", async () => {
  await assert.rejects(
    () => client.callTool({ name: "not_a_tool", arguments: {} }),
    /not found|unknown|method/i,
  );
});
