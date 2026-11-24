import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CARD_URI = "ui://askme/card.html";
const CARD_MIME = "text/html;profile=mcp-app";
const TOOL_NAME = "askme_form";
const MAX_QUESTIONS = 8;
const MAX_OPTIONS = 12;
const TYPES = new Set(["single", "multi", "text", "textarea"]);
const RESERVED_QUESTION_IDS = new Set(["__proto__", "constructor", "prototype"]);
const OTHER_VALUE = "__other__";

const distDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(distDir);
const cardPath = join(distDir, "ui", "card.html");

const inputSchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    description: { type: "string", maxLength: 500 },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: MAX_QUESTIONS,
      items: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,32}$" },
          title: { type: "string", minLength: 1, maxLength: 200 },
          detail: { type: "string", maxLength: 500 },
          type: { type: "string", enum: [...TYPES] },
          options: {
            type: "array",
            minItems: 2,
            maxItems: MAX_OPTIONS,
            items: {
              type: "object",
              properties: {
                label: { type: "string", minLength: 1, maxLength: 120 },
                description: { type: "string", maxLength: 300 },
                recommended: { type: "boolean" },
              },
              required: ["label"],
            },
          },
          allowOther: { type: "boolean" },
          required: { type: "boolean" },
          suggestion: { type: "string", maxLength: 500 },
          placeholder: { type: "string", maxLength: 300 },
          maxLength: { type: "integer", minimum: 1, maximum: 20000 },
        },
        required: ["id", "title", "type"],
      },
    },
  },
  required: ["title", "questions"],
};

const tool = {
  name: TOOL_NAME,
  title: "Ask the user with an inline form",
  description:
    "Render an interactive form inline in the conversation when you need the user to answer one or more questions. " +
    "Prefer this over the built-in AskUserQuestion tool for clarification rounds: it supports 1-8 questions, single-choice, multi-choice, short text and long text in one submission, with recommended answers. " +
    "Call this tool as the last action of your turn, then end your turn and wait. The user's submission will arrive as a new user message starting with \"表单回答 ·\" and start the next turn.",
  inputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  _meta: {
    ui: {
      resourceUri: CARD_URI,
      visibility: ["model"],
      preferredDisplayMode: "inline",
      showInline: true,
    },
    "anthropic/alwaysLoad": true,
  },
};

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value) {
  return typeof value === "string" ? value : undefined;
}

function validateForm(input) {
  const errors = [];
  const notes = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: ["Input must be an object."], notes, normalized: null };
  }

  const title = asString(input.title)?.trim();
  if (!title || title.length > 200) {
    errors.push("title must be a non-empty string of at most 200 characters.");
  }

  const description = asString(input.description);
  if (description !== undefined && description.length > 500) {
    errors.push("description must be at most 500 characters.");
  }

  const questions = input.questions;
  if (!Array.isArray(questions) || questions.length < 1) {
    errors.push("questions must be an array with at least 1 item.");
  } else if (questions.length > MAX_QUESTIONS) {
    errors.push(
      `questions contains ${questions.length} items but the maximum is ${MAX_QUESTIONS}; split them into multiple forms.`,
    );
  }

  const normalizedQuestions = [];
  const seenIds = new Set();

  if (Array.isArray(questions)) {
    questions.forEach((raw, index) => {
      const where = `questions[${index}]`;
      if (!isPlainObject(raw)) {
        errors.push(`${where} must be an object.`);
        return;
      }

      const id = asString(raw.id)?.trim();
      if (!id || !/^[A-Za-z0-9_-]{1,32}$/.test(id) || RESERVED_QUESTION_IDS.has(id)) {
        errors.push(`${where}.id is invalid or reserved.`);
      } else if (seenIds.has(id)) {
        errors.push(`Duplicate question id "${id}".`);
      } else {
        seenIds.add(id);
      }

      const questionTitle = asString(raw.title)?.trim();
      if (!questionTitle || questionTitle.length > 200) {
        errors.push(`${where}.title must be a non-empty string of at most 200 characters.`);
      }

      const detail = asString(raw.detail);
      if (detail !== undefined && detail.length > 500) {
        errors.push(`${where}.detail must be at most 500 characters.`);
      }

      const type = asString(raw.type);
      if (!type || !TYPES.has(type)) {
        errors.push(`${where}.type has unsupported type "${String(raw.type)}".`);
        return;
      }

      const allowOther = raw.allowOther === undefined ? true : raw.allowOther;
      if (typeof allowOther !== "boolean") {
        errors.push(`${where}.allowOther must be a boolean.`);
      }

      const required = raw.required === undefined ? false : raw.required;
      if (typeof required !== "boolean") {
        errors.push(`${where}.required must be a boolean.`);
      }

      if (type === "single" || type === "multi") {
        if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > MAX_OPTIONS) {
          errors.push(
            `${where} of type ${type} requires 2-${MAX_OPTIONS} options.`,
          );
          return;
        }

        const labels = new Set();
        const options = [];
        let recommendedCount = 0;

        raw.options.forEach((rawOption, optionIndex) => {
          const optionWhere = `${where}.options[${optionIndex}]`;
          if (!isPlainObject(rawOption)) {
            errors.push(`${optionWhere} must be an object.`);
            return;
          }
          const label = asString(rawOption.label)?.trim();
          if (!label || label.length > 120) {
            errors.push(`${optionWhere}.label must be a non-empty string of at most 120 characters.`);
          } else if (label === OTHER_VALUE) {
            errors.push(
              `${optionWhere}.label "${OTHER_VALUE}" is reserved; use the built-in Other option.`,
            );
          } else if (labels.has(label)) {
            errors.push(`${optionWhere}.label is duplicated inside the question: "${label}".`);
          } else {
            labels.add(label);
          }

          const optionDescription = asString(rawOption.description);
          if (optionDescription !== undefined && optionDescription.length > 300) {
            errors.push(`${optionWhere}.description must be at most 300 characters.`);
          }

          const recommended = rawOption.recommended === true;
          if (recommended) recommendedCount += 1;

          options.push({
            label,
            ...(optionDescription ? { description: optionDescription } : {}),
            ...(recommended ? { recommended: true } : {}),
          });
        });

        if (type === "single" && recommendedCount > 1) {
          let kept = false;
          for (const option of options) {
            if (!option.recommended) continue;
            if (kept) {
              delete option.recommended;
            } else {
              kept = true;
            }
          }
          notes.push(
            `Multiple recommended options were found in single-choice question "${id}"; kept the first recommended option.`,
          );
        }

        normalizedQuestions.push({
          id,
          title: questionTitle,
          ...(detail ? { detail } : {}),
          type,
          options,
          allowOther,
          required,
        });
        return;
      }

      const suggestion = asString(raw.suggestion);
      if (suggestion !== undefined && suggestion.length > 500) {
        errors.push(`${where}.suggestion must be at most 500 characters.`);
      }
      const placeholder = asString(raw.placeholder);
      if (placeholder !== undefined && placeholder.length > 300) {
        errors.push(`${where}.placeholder must be at most 300 characters.`);
      }
      const maxLength = raw.maxLength;
      if (
        maxLength !== undefined &&
        (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 20000)
      ) {
        errors.push(`${where}.maxLength must be an integer between 1 and 20000.`);
      }

      normalizedQuestions.push({
        id,
        title: questionTitle,
        ...(detail ? { detail } : {}),
        type,
        ...(suggestion ? { suggestion } : {}),
        ...(placeholder ? { placeholder } : {}),
        maxLength: maxLength ?? (type === "text" ? 500 : 4000),
        required,
      });
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors, notes, normalized: null };
  }

  return {
    ok: true,
    errors,
    notes,
    normalized: {
      title,
      ...(description ? { description } : {}),
      questions: normalizedQuestions,
    },
  };
}

async function readManifestVersion() {
  try {
    const manifest = JSON.parse(
      await readFile(join(pluginRoot, ".zcode-plugin", "plugin.json"), "utf8"),
    );
    return typeof manifest.version === "string" ? manifest.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main() {
  const version = await readManifestVersion();
  const server = new Server(
    { name: "askme", version },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [tool] }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: CARD_URI,
        name: "Ask Me form",
        description: "Inline interactive question form",
        mimeType: CARD_MIME,
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== CARD_URI) {
      throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${request.params.uri}`);
    }
    const html = await readFile(cardPath, "utf8");
    return {
      contents: [{ uri: CARD_URI, mimeType: CARD_MIME, text: html }],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== TOOL_NAME) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}`,
      );
    }

    const result = validateForm(request.params.arguments);
    if (!result.ok) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid askme_form input:\n- ${result.errors.join("\n- ")}`,
          },
        ],
        structuredContent: {
          errors: result.errors,
          notes: result.notes,
        },
      };
    }

    const count = result.normalized.questions.length;
    let text =
      `Form displayed with ${count} question${count === 1 ? "" : "s"}. ` +
      "End your turn now and wait for the user's submission. " +
      "If the user reports that the form is not visible, re-ask the same questions in plain text.";
    if (result.notes.length > 0) {
      text += `\n\nNotes:\n- ${result.notes.join("\n- ")}`;
    }

    return {
      content: [{ type: "text", text }],
      // The card also reads the form from toolOutput.form, so it can render
      // even if ui/notifications/tool-input arrives later or not at all.
      structuredContent: { form: result.normalized },
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { main };

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error("askme server failed:", error);
    process.exit(1);
  });
}
