import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cardUrl = pathToFileURL(join(pluginRoot, "dist", "ui", "card.html")).href;

const sampleForm = {
  title: "测试表单",
  description: "请选择后提交",
  questions: [
    {
      id: "q1",
      title: "触发入口",
      detail: "你希望怎么触发？",
      type: "single",
      options: [
        { label: "A 选项", description: "推荐的原因", recommended: true },
        { label: "B 选项" },
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

let browser;

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    try {
      return await chromium.launch({ headless: true, channel: "msedge" });
    } catch {
      return await chromium.launch({ headless: true, channel: "chrome" });
    }
  }
}

before(async () => {
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
});

async function openCard(options = {}) {
  const {
    form = sampleForm,
    state = null,
    theme = "light",
    reject = false,
  } = options;

  const context = await browser.newContext({ colorScheme: theme });
  const page = await context.newPage();
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.addInitScript(
    ({ form, state, theme, reject }) => {
      window.__mock = { state, sent: [], reject, rejectMessage: "Session is not ready to accept input" };
      window.zcode = {
        ready: Promise.resolve(),
        toolInput: form,
        toolOutput: null,
        toolCancelled: false,
        theme,
        hostContext: { theme, styles: { variables: {} }, displayMode: "inline" },
        get widgetState() {
          return window.__mock.state;
        },
        setWidgetState: async (next) => {
          window.__mock.state = next;
        },
        sendFollowUpMessage: async ({ prompt }) => {
          if (window.__mock.reject) throw new Error(window.__mock.rejectMessage);
          window.__mock.sent.push(prompt);
        },
        notifyIntrinsicHeight: () => {},
        subscribe: () => () => {},
      };
    },
    { form, state, theme, reject },
  );

  await page.goto(cardUrl);
  await page.waitForSelector('[data-testid="askme-card"]');
  return { context, page, requests };
}

async function submit(page) {
  await page.locator('[data-testid="submit"]').click();
}

async function sentMessages(page) {
  await page.waitForFunction(() => window.__mock.sent.length > 0);
  return page.evaluate(() => window.__mock.sent);
}

test("renders title, description, questions, options and recommendation badges", async () => {
  const { context, page } = await openCard();
  try {
    assert.equal(await page.textContent('[data-testid="askme-title"]'), "测试表单");
    assert.equal(await page.textContent('[data-testid="askme-description"]'), "请选择后提交");
    assert.equal(await page.locator('[data-testid="question"]').count(), 3);
    assert.equal(await page.locator('[data-testid="recommended-badge"]').count(), 3);
    assert.ok(await page.locator('[data-testid="accept-all"]').isVisible());
    assert.equal(await page.textContent('[data-question-id="q1"] [data-testid="question-title"]'), "触发入口");
  } finally {
    await context.close();
  }
});

test("submits a formatted Markdown message for single, multi and long text", async () => {
  const { context, page } = await openCard();
  try {
    await page.locator('[data-testid="option-q1-0"]').click();
    await page.locator('[data-testid="option-q2-0"]').click();
    await page.locator('[data-testid="option-q2-2"]').click();
    await page.fill('[data-testid="text-q3"]', "第一行\n第二行");
    await submit(page);

    const [message] = await sentMessages(page);
    assert.equal(
      message,
      [
        "表单回答 · 测试表单",
        "",
        "1. 触发入口 → A 选项",
        "2. 需要哪些控件 → 单选、短文本",
        "3. 补充说明 → 第一行",
        "   第二行",
      ].join("\n"),
    );
  } finally {
    await context.close();
  }
});

test("accept-all recommendations selects recommended options but leaves text empty", async () => {
  const { context, page } = await openCard();
  try {
    await page.locator('[data-testid="accept-all"]').click();
    assert.equal(await page.locator('[data-testid="option-q1-0"] input').isChecked(), true);
    assert.equal(await page.locator('[data-testid="option-q2-0"] input').isChecked(), true);
    assert.equal(await page.locator('[data-testid="option-q2-1"] input').isChecked(), true);
    assert.equal(await page.locator('[data-testid="option-q2-2"] input').isChecked(), false);
    assert.equal(await page.inputValue('[data-testid="text-q3"]'), "");
  } finally {
    await context.close();
  }
});

test("supports the Other free-text option for single choice", async () => {
  const { context, page } = await openCard();
  try {
    await page.locator('[data-testid="option-q1-2"]').click();
    await page.fill('[data-testid="other-input-q1"]', "自定义答案");
    await submit(page);

    const [message] = await sentMessages(page);
    assert.match(message, /1\. 触发入口 → 其他：自定义答案/);
  } finally {
    await context.close();
  }
});

test("marks required but unanswered questions without blocking submission", async () => {
  const { context, page } = await openCard();
  try {
    assert.match(await page.textContent('[data-testid="unanswered-hint"]'), /必答/);
    await submit(page);

    const [message] = await sentMessages(page);
    assert.match(message, /1\. 触发入口 → （未回答）/);
    assert.match(message, /2\. 需要哪些控件 → （未回答）/);
    assert.match(message, /3\. 补充说明 → （未回答）/);
  } finally {
    await context.close();
  }
});

test("collapses after submission, becomes read-only, and can be expanded", async () => {
  const { context, page } = await openCard();
  try {
    await page.locator('[data-testid="option-q1-1"]').click();
    await page.fill('[data-testid="text-q3"]', "已提交内容");
    await submit(page);

    await page.waitForSelector('[data-testid="submitted"]');
    assert.ok(await page.locator('[data-testid="submitted"]').isVisible());
    assert.equal(await page.locator('[data-testid="form-body"]').isVisible(), false);
    assert.equal(await page.locator('[data-testid="submit"]').count(), 0);

    await page.locator('[data-testid="expand"]').click();
    assert.ok(await page.locator('[data-testid="form-body"]').isVisible());
    assert.equal(await page.locator('[data-testid="option-q1-1"] input').isDisabled(), true);
    assert.equal(await page.locator('[data-testid="text-q3"]').isDisabled(), true);
    assert.equal(await page.locator('[data-testid="submit"]').count(), 0);
  } finally {
    await context.close();
  }
});

test("keeps the form editable and shows the error when submission fails", async () => {
  const { context, page } = await openCard({ reject: true });
  try {
    await page.locator('[data-testid="option-q1-0"]').click();
    await submit(page);

    await page.waitForSelector('[data-testid="error"]');
    assert.match(await page.textContent('[data-testid="error"]'), /Session is not ready/);
    assert.equal(await page.locator('[data-testid="form-body"]').isVisible(), true);
    assert.equal(await page.locator('[data-testid="submit"]').isEnabled(), true);
    assert.equal(await page.locator('[data-testid="option-q1-0"] input').isChecked(), true);
  } finally {
    await context.close();
  }
});

test("restores draft answers from widget state", async () => {
  const first = await openCard();
  let state;
  try {
    await first.page.locator('[data-testid="option-q1-1"]').click();
    await first.page.locator('[data-testid="option-q2-1"]').click();
    await first.page.fill('[data-testid="text-q3"]', "草稿内容");
    await first.page.waitForFunction(() => Boolean(window.__mock.state?.privateContent?.answers));
    state = await first.page.evaluate(() => window.__mock.state);
  } finally {
    await first.context.close();
  }

  const second = await openCard({ state });
  try {
    assert.equal(await second.page.locator('[data-testid="option-q1-1"] input').isChecked(), true);
    assert.equal(await second.page.locator('[data-testid="option-q2-1"] input').isChecked(), true);
    assert.equal(await second.page.inputValue('[data-testid="text-q3"]'), "草稿内容");
  } finally {
    await second.context.close();
  }
});

test("follows the host theme and sets data-theme", async () => {
  const { context, page } = await openCard({ theme: "dark" });
  try {
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  } finally {
    await context.close();
  }
});

test("makes no external network requests", async () => {
  const { context, page, requests } = await openCard();
  try {
    const external = requests.filter(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
    );
    assert.deepEqual(external, []);
  } finally {
    await context.close();
  }
});
