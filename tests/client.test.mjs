/**
 * dsh-prompt-dots — 客户端逻辑自测套件（无需真实浏览器/DSH）。
 *
 * 运行：node --test tests/client.test.mjs
 * 覆盖：
 *  1. apply() 注册 conversation.input.dock 槽位 + 中英文字典；
 *  2. 点位栏按会话快照渲染（user/steering 各一点，排除 assistant/hidden），几何正确；
 *  3. 悬停出预览、点击触发 scrollIntoView + 高亮。
 * 通过「提取 factory + 假 React/假 DOM」的方式在 Node 中执行真实插件代码。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

/** 提取 window.__ModuleLoader__.load 的 factory 函数体。 */
function extractFactoryBody(content) {
  const marker = "factory: (require) => {";
  const start = content.indexOf(marker);
  assert.notEqual(start, -1, "factory marker not found");
  const bodyStart = start + marker.length + 1;
  const bodyEnd = content.lastIndexOf("\n});");
  let body = content.slice(bodyStart, bodyEnd);
  body = body.slice(0, body.lastIndexOf("\n\t}"));
  return body;
}

/** 假 React：createElement 记录树；useState 跨渲染保持状态；effect 同步执行。 */
function makeFakeReact() {
  const store = [];
  let idx = 0;
  return {
    react: {
      createElement: (type, props, ...children) => ({ $$type: type, props: props ?? {}, children }),
      Fragment: "FRAGMENT",
      useState: (init) => {
        const i = idx++;
        if (store.length <= i) store[i] = typeof init === "function" ? init() : init;
        const setter = (v) => { store[i] = typeof v === "function" ? v(store[i]) : v; };
        return [store[i], setter];
      },
      useEffect: (fn) => { fn(); },
      useMemo: (fn) => fn()
    },
    reset: () => { idx = 0; },
    get: (i) => store[i]
  };
}

/** 假 DOM：一个可滚动视口 + 一条消息锚点行。 */
function installFakeDom() {
  const fakeScrollport = {
    parentElement: null,
    style: {},
    getBoundingClientRect: () => ({ right: 900, top: 0, height: 600 }),
    scrollIntoView() {}
  };
  const fakeRow = {
    parentElement: fakeScrollport,
    dataset: {},
    style: {},
    scrollIntoView: (opts) => { fakeRow.lastScroll = opts ?? true; }
  };
  const fakeDocument = {
    documentElement: { parentElement: null },
    querySelector: (sel) => (sel.includes("data-chat-anchor-key") ? fakeRow : null),
    querySelectorAll: () => [fakeRow]
  };
  const fakeWindow = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
    removeEventListener() {},
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    getComputedStyle: (el) => (el === fakeScrollport ? { overflowY: "auto" } : { overflowY: "visible" })
  };
  return { fakeScrollport, fakeRow, fakeDocument, fakeWindow };
}

/** 加载插件工厂，返回 cordis 插件导出对象。 */
function loadPlugin(fakeReact) {
  const body = extractFactoryBody(source);
  const factory = new Function("require", body);
  return factory((id) => {
    if (id === "react") return fakeReact.react;
    throw new Error("unexpected require: " + id);
  });
}

const DICT_ZH = { promptLabel: "Prompt #{n}", steeringTag: "steering", emptyText: "（空输入）", imagesText: "🖼 ×{n}", railHint: "hint" };

function fakeSnapshot() {
  return {
    chat: {
      order: ["u1", "s1", "a1", "u2", "h1"],
      nodes: new Map([
        ["u1", { key: "u1", kind: "user", visibility: "visible", data: { content: [{ type: "text", text: "你好，帮我写一个排序" }, { type: "image" }], time: 1700000000000 } }],
        ["s1", { key: "s1", kind: "steering", visibility: "visible", data: { content: [{ type: "text", text: "继续，不要停" }], time: 1700000010000 } }],
        ["a1", { key: "a1", kind: "assistant-step", visibility: "visible", data: {} }],
        ["u2", { key: "u2", kind: "user", visibility: "visible", data: { content: [{ type: "text", text: "第二条 prompt" }], time: 1700000020000 } }],
        ["h1", { key: "h1", kind: "user", visibility: "hidden", data: { content: [{ type: "text", text: "不该出现" }] } }]
      ])
    }
  };
}

const flatten = (xs) => xs.flatMap((x) => (Array.isArray(x) ? flatten(x) : [x]));

test("apply 注册 conversation.input.dock 槽位并注册中英文字典", () => {
  const fr = makeFakeReact();
  const plugin = loadPlugin(fr);
  assert.equal(plugin.name, "prompt-dots");
  assert.deepEqual(plugin.inject, ["slots", "locale"]);
  let registered = null;
  let dictionaries = null;
  plugin.apply({
    effect: (fn) => { fn(); },
    locale: { register: (ns, dicts) => { dictionaries = { ns, dicts }; } },
    slots: {
      inject: (slot, cb) => { cb(); },
      register: (opts, comp) => { registered = { opts, comp }; }
    }
  });
  assert.equal(registered.opts.name, "conversation.input.dock");
  assert.equal(registered.opts.id, "prompt-dots");
  assert.equal(registered.opts.order, 40);
  assert.equal(typeof registered.comp, "function");
  assert.equal(dictionaries.ns, "prompt-dots");
  assert.deepEqual(Object.keys(dictionaries.dicts).sort(), ["en", "zh"]);
});

test("点位栏按会话快照渲染：user/steering 各一点，排除 assistant 与 hidden", () => {
  const fr = makeFakeReact();
  const dom = installFakeDom();
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  globalThis.window = dom.fakeWindow;
  globalThis.document = dom.fakeDocument;
  try {
    const plugin = loadPlugin(fr);
    let comp = null;
    plugin.apply({
      effect: (fn) => { fn(); },
      locale: { register: () => {} },
      slots: { inject: (s, cb) => { cb(); }, register: (o, c) => { comp = c; } }
    });
    const render = () => { fr.reset(); return comp({ useSession: (sel) => sel(fakeSnapshot()), t: (k) => DICT_ZH[k] }); };
    render(); // 首帧：几何测量前返回 null
    const tree = render();
    const frag = flatten(tree.$$type === "FRAGMENT" ? tree.children : [tree]);
    const rail = frag.find((c) => c.props && c.props["data-prompt-dots-rail"] !== undefined);
    assert.ok(rail, "rail root rendered");
    const dots = flatten(rail.children).filter((c) => c.props && c.props["data-prompt-dot"] !== undefined);
    assert.equal(dots.length, 3, "one dot per user/steering prompt");
    assert.deepEqual(dots.map((d) => d.props["data-prompt-dot"]), ["1", "2", "3"]);
    assert.equal(rail.props.style.position, "fixed");
    assert.equal(rail.props.style.left, 900 - 14 - 7, "rail anchored to scrollport right edge");
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
  }
});

test("悬停显示预览（序号/时间/图片数），点击触发平滑滚动与高亮", () => {
  const fr = makeFakeReact();
  const dom = installFakeDom();
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  globalThis.window = dom.fakeWindow;
  globalThis.document = dom.fakeDocument;
  try {
    const plugin = loadPlugin(fr);
    let comp = null;
    plugin.apply({
      effect: (fn) => { fn(); },
      locale: { register: () => {} },
      slots: { inject: (s, cb) => { cb(); }, register: (o, c) => { comp = c; } }
    });
    const render = () => { fr.reset(); return comp({ useSession: (sel) => sel(fakeSnapshot()), t: (k) => DICT_ZH[k] }); };
    render();
    const tree = render();
    const frag = flatten(tree.$$type === "FRAGMENT" ? tree.children : [tree]);
    const rail = frag.find((c) => c.props && c.props["data-prompt-dots-rail"] !== undefined);
    const dots = flatten(rail.children).filter((c) => c.props && c.props["data-prompt-dot"] !== undefined);
    // 悬停第一个点
    dots[0].props.onMouseEnter();
    const hoverTree = render();
    const hoverFrag = flatten(hoverTree.$$type === "FRAGMENT" ? hoverTree.children : [hoverTree]);
    const tip = hoverFrag.find((c) => c.props && c.props.style && c.props.style.pointerEvents === "none");
    assert.ok(tip, "tooltip rendered on hover");
    const header = String(tip.children[0].children);
    assert.match(header, /Prompt #1 \/ 3/);
    assert.match(header, /steering|06:/, "steering tag or time appears in header of non-steering dot is fine");
    const body = String(tip.children[1].children);
    assert.match(body, /你好，帮我写一个排序/);
    assert.match(body, /🖼 ×1/);
    // 点击第三个点
    dots[2].props.onClick();
    assert.deepEqual(dom.fakeRow.lastScroll, { behavior: "smooth", block: "center" });
    assert.equal(dom.fakeRow.style.outline, "2px solid rgba(255,255,255,0.6)");
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
  }
});
