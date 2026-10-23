/*
 * dsh-composer-scratchpad 冒烟测试（不需要真浏览器）
 *
 * 目的：在没有 DSH 运行时的情况下，真跑一遍 client.js 里的组件代码，
 * 抓住"渲染即抛错 / 事件接不上 / 存储不落盘 / 位置算成 NaN"这一类问题。
 *
 * 它不是契约测试：插槽注册的真实语义靠 fujiang-armor 那条已跑通的路径背书。
 *
 * 跑法：node tests/smoke.cjs
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert");

/* ── 迷你 React：只实现这个组件用到的 4 个 hook ── */
let hookCursor = 0;
let hookStore = [];
let pendingEffects = [];
let stateQueue = [];

function createElement(type, props, ...children) {
  const merged = Object.assign({}, props || {});
  if (children.length > 0) merged.children = children;
  return { type, props: merged };
}

function useState(initial) {
  const index = hookCursor++;
  if (!(index in hookStore)) hookStore[index] = typeof initial === "function" ? initial() : initial;
  const setState = (next) => {
    const prev = hookStore[index];
    const value = typeof next === "function" ? next(prev) : next;
    if (value !== prev) stateQueue.push({ index, value });
  };
  return [hookStore[index], setState];
}

function useRef(initial) {
  const index = hookCursor++;
  if (!(index in hookStore)) hookStore[index] = { current: initial };
  return hookStore[index];
}

function useEffect(fn, deps) {
  const index = hookCursor++;
  const prev = hookStore[index];
  const changed =
    !prev ||
    !deps ||
    !prev.deps ||
    deps.length !== prev.deps.length ||
    deps.some((dep, i) => dep !== prev.deps[i]);
  hookStore[index] = { deps: deps, cleanup: prev && prev.cleanup };
  if (changed) pendingEffects.push({ index, fn });
}

function useCallback(fn, deps) {
  const index = hookCursor++;
  const prev = hookStore[index];
  if (prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((d, i) => d === prev.deps[i])) {
    return prev.fn;
  }
  hookStore[index] = { fn, deps };
  return fn;
}

const fakeReact = { createElement, useState, useRef, useEffect, useCallback };

/* ── 迷你 DOM ── */
const storedStyles = new Map();
const storage = new Map();
const listeners = [];

function makeNode(extra) {
  const node = Object.assign(
    {
      children: [],
      contains(target) {
        return target === node || node.children.indexOf(target) !== -1;
      },
      getBoundingClientRect() {
        return node.rect;
      },
      focus() {
        node.focused = true;
      },
      setSelectionRange() {},
      remove() {
        node.removed = true;
      }
    },
    extra
  );
  return node;
}

const document = {
  head: { appendChild(el) { storedStyles.set(el.id, el); } },
  body: makeNode({ style: {} }),
  createElement(tag) {
    return makeNode({ tagName: tag.toUpperCase(), id: "", textContent: "", removed: false });
  },
  getElementById(id) {
    const el = storedStyles.get(id);
    return el && !el.removed ? el : null;
  },
  addEventListener(type, fn) {
    listeners.push({ type, fn, target: "document" });
  },
  removeEventListener(type, fn) {
    const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
    if (i >= 0) listeners.splice(i, 1);
  }
};

const window = {
  innerWidth: 1440,
  innerHeight: 900,
  setTimeout: (...args) => setTimeout(...args),
  clearTimeout: (...args) => clearTimeout(...args),
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v))
  },
  addEventListener(type, fn) {
    listeners.push({ type, fn, target: "window" });
  },
  removeEventListener(type, fn) {
    const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
    if (i >= 0) listeners.splice(i, 1);
  }
};

let capturedModule = null;
window.__ModuleLoader__ = {
  load({ id, factory }) {
    capturedModule = { id, exports: factory((name) => {
      if (name === "react") return fakeReact;
      throw new Error("unexpected require: " + name);
    }) };
  }
};

global.window = window;
global.document = document;

/* ── 加载真实的 client.js ── */
const clientPath = path.join(__dirname, "..", "client.js");
vm.runInThisContext(fs.readFileSync(clientPath, "utf8"), { filename: clientPath });

assert.ok(capturedModule, "client.js 没有调用 window.__ModuleLoader__.load");
assert.strictEqual(capturedModule.id, "dsh-composer-scratchpad");
const api = capturedModule.exports;
assert.strictEqual(api.name, "dsh-composer-scratchpad");
assert.deepStrictEqual(Array.from(api.inject), ["slots"]);
assert.strictEqual(typeof api.apply, "function");

/* ── apply()：确认插槽坐标 ── */
let registration = null;
const fakeCtx = {
  slots: {
    inject(slotName, fn) {
      registration = { injected: slotName, entry: fn() };
    },
    register(spec, Component) {
      return { spec, Component };
    }
  }
};
api.apply(fakeCtx);
assert.strictEqual(registration.injected, "conversation.input.right");
assert.strictEqual(registration.entry.spec.name, "conversation.input.right");
assert.strictEqual(registration.entry.spec.id, "dsh-composer-scratchpad:notepad");
assert.strictEqual(registration.entry.spec.order, 20);
console.log("ok  apply() 注册到 conversation.input.right / order 20");

const MemoPad = registration.entry.Component;

/* ── 渲染循环（迷你 act）── */
function commit() {
  hookCursor = 0;
  pendingEffects = [];
  const tree = MemoPad({});
  attachRefs(tree);
  /* 与 React 一致：先跑上一轮同 hook 的 cleanup，再跑新 effect */
  for (const effect of pendingEffects) {
    const slot = hookStore[effect.index] || {};
    if (typeof slot.cleanup === "function") {
      try {
        slot.cleanup();
      } catch {
        /* cleanup 抛错不该影响下一轮 */
      }
    }
    const result = effect.fn();
    hookStore[effect.index] = {
      deps: slot.deps,
      cleanup: typeof result === "function" ? result : undefined
    };
  }
  return tree;
}

function settle() {
  let tree = commit();
  let guard = 0;
  while (stateQueue.length > 0) {
    if (++guard > 20) throw new Error("state 更新没有收敛，疑似无限重渲染");
    const updates = stateQueue.splice(0, stateQueue.length);
    for (const update of updates) hookStore[update.index] = update.value;
    tree = commit();
  }
  return tree;
}

function childrenOf(node) {
  return Array.isArray(node.props.children) ? node.props.children.flat(3) : [node.props.children].flat(3);
}

function walk(node, visit) {
  if (!node || typeof node !== "object" || !node.props) return;
  visit(node);
  for (const child of childrenOf(node)) walk(child, visit);
}

function find(tree, predicate) {
  let hit = null;
  walk(tree, (node) => {
    if (!hit && predicate(node)) hit = node;
  });
  return hit;
}

function attachRefs(tree) {
  const nodes = [];
  walk(tree, (node) => {
    if (typeof node.type !== "string") return;
    const ref = node.props.ref;
    if (ref === undefined) return;
    const isTextarea = node.type === "textarea";
    const isPanel = node.props.className === "dmp-panel";
    /* 面板要按真实尺寸报 rect，拖动改尺寸的起点取的就是它 */
    const rect = isPanel
      ? { right: 1100, top: 640, bottom: 860, left: 720, width: 380, height: 220 }
      : { right: 1100, top: 860, bottom: 888, left: 1072, width: 28, height: 28 };
    const fake = makeNode({
      tagName: node.type.toUpperCase(),
      rect: rect,
      value: isTextarea ? (node.props.value || "") : undefined
    });
    ref.current = fake;
    nodes.push(fake);
  });
  return nodes;
}

function fireDocument(type, event) {
  const targets = listeners.filter((l) => l.target === "document" && l.type === type);
  for (const target of targets) target.fn(event);
  return targets.length;
}

function findByClass(tree, className) {
  return find(tree, (n) => n.props && n.props.className === className);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── 1. 初始态：一个按钮，没有面板 ── */
let tree = settle();
const button = find(tree, (n) => n.type === "button");
assert.ok(button, "没渲染出按钮");
assert.strictEqual(button.props.title, "备忘录");
assert.strictEqual(button.props["data-open"], "0");
assert.strictEqual(find(tree, (n) => n.type === "textarea"), null);
assert.ok(storedStyles.get("dsh-composer-scratchpad-css"), "样式没注入");
console.log("ok  初始态只有 📝 按钮，无面板，CSS 已注入");

/* ── 2. 点开：面板 + textarea ── */
let propagationStopped = false;
button.props.onClick({ stopPropagation: () => { propagationStopped = true; } });
assert.ok(propagationStopped, "按钮点击没有阻断冒泡");
tree = settle();
const panel = find(tree, (n) => n.type === "div" && n.props.className === "dmp-panel");
assert.ok(panel, "点开后面板没渲染");
const textarea = find(tree, (n) => n.type === "textarea");
assert.ok(textarea, "点开后面板里没有 textarea");
assert.strictEqual(textarea.props.placeholder, "随手记一句，回车只换行");
const style = panel.props.style;
for (const key of ["left", "bottom", "width", "height"]) {
  assert.ok(typeof style[key] === "string" && /^-?\d+(\.\d+)?px$/.test(style[key]), key + " 不是有效像素值: " + style[key]);
}
assert.ok(parseFloat(style.bottom) > 0, "面板 bottom 应在按钮上方");
assert.ok(parseFloat(style.left) >= 12, "面板左边界越界: " + style.left);
assert.strictEqual(style.width, "380px", "默认宽度应为 380px");
assert.strictEqual(style.height, "220px", "默认高度应为 220px");
assert.ok(findByClass(tree, "dmp-hint"), "首次打开没有出现一次性提示");
assert.strictEqual(storage.get("dsh-composer-scratchpad:hint:v1"), "1", "首次提示后计数没落盘");
console.log("ok  点开得到面板 + textarea，位置 " + JSON.stringify(style) + "，并带一次性提示");

/* ── 3. 回车/键盘事件被截断且 Esc 收起 ── */
let panelStopped = false;
panel.props.onKeyDownCapture({ key: "Enter", stopPropagation: () => { panelStopped = true; }, preventDefault() {} });
assert.ok(panelStopped, "面板没有截断键盘冒泡（主编辑器可能收到 Enter）");
assert.strictEqual(storage.get("dsh-composer-scratchpad:v1") === undefined, true, "还没输入就写了存储");
panel.props.onKeyDownCapture({ key: "Escape", stopPropagation() {}, preventDefault() {} });
tree = settle();
assert.strictEqual(find(tree, (n) => n.type === "textarea"), null);
console.log("ok  Enter 被截断（不冒泡到主编辑器），Esc 收起面板");

/* ── 4. 打字 → debounce 落盘 → 重开回填 ── */
tree = settle();
const btn2 = find(tree, (n) => n.type === "button");
btn2.props.onClick({ stopPropagation() {} });
tree = settle();
const ta2 = find(tree, (n) => n.type === "textarea");
ta2.props.onChange({ target: { value: "第一行灵感\n第二行" } });
tree = settle();
assert.ok(storage.get("dsh-composer-scratchpad:v1") === undefined, "debounce 前就落盘了");
// 冲刷 debounce：等真实计时器
const deadline = Date.now() + 1500;
(function wait() {
  if (storage.get("dsh-composer-scratchpad:v1") !== undefined || Date.now() > deadline) return;
  setTimeout(wait, 25);
})();
setTimeout(async () => {
  const raw = storage.get("dsh-composer-scratchpad:v1");
  assert.ok(raw, "debounce 结束后没有落盘");
  const parsed = JSON.parse(raw);
  assert.strictEqual(parsed.text, "第一行灵感\n第二行");
  // 第二次渲染时 storage 里的文本会被 readDraft 读回
  const reopened = settle();
  void reopened;
  assert.ok(find(settle(), (n) => n.type === "textarea"), "面板内容丢失");
  console.log("ok  输入后 debounce 落盘，键 dsh-composer-scratchpad:v1 内容正确");

  /* ── 5. 拖动改尺寸：变宽变高 → 落盘 → 双击恢复默认 ── */
  const tree5 = settle();
  const grip = findByClass(tree5, "dmp-grip");
  assert.ok(grip, "面板右下角没有尺寸把手");
  const panel5 = findByClass(tree5, "dmp-panel");
  const startW = parseFloat(panel5.props.style.width);
  const startH = parseFloat(panel5.props.style.height);
  grip.props.onMouseDown({
    clientX: 1100,
    clientY: 860,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.ok(fireDocument("mousemove", { clientX: 1000, clientY: 800 }) > 0, "没挂上 mousemove 监听");
  const dragged = settle();
  const panelDragged = findByClass(dragged, "dmp-panel");
  assert.ok(parseFloat(panelDragged.props.style.width) > startW, "左拖没变宽: " + panelDragged.props.style.width);
  assert.ok(parseFloat(panelDragged.props.style.height) > startH, "上拖没变高: " + panelDragged.props.style.height);
  fireDocument("mouseup", {});
  assert.strictEqual(
    document.body.style.cursor === "" || document.body.style.cursor === undefined,
    true,
    "松手后 body 光标没还原"
  );
  const savedSize = JSON.parse(storage.get("dsh-composer-scratchpad:size:v1") || "null");
  assert.ok(savedSize, "松手后尺寸没落盘");
  assert.strictEqual(savedSize.w, Math.round(parseFloat(panelDragged.props.style.width)), "落盘宽度与显示不一致");
  assert.strictEqual(savedSize.h, Math.round(parseFloat(panelDragged.props.style.height)), "落盘高度与显示不一致");
  console.log("ok  拖动改尺寸：" + startW + "x" + startH + " -> " + panelDragged.props.style.width + " x " + panelDragged.props.style.height);

  const grip2 = findByClass(settle(), "dmp-grip");
  grip2.props.onDoubleClick({ preventDefault() {}, stopPropagation() {} });
  const panelReset = findByClass(settle(), "dmp-panel");
  assert.strictEqual(panelReset.props.style.width, "380px", "双击把手没恢复默认宽度");
  assert.strictEqual(panelReset.props.style.height, "220px", "双击把手没恢复默认高度");
  assert.strictEqual(storage.get("dsh-composer-scratchpad:size:v1"), JSON.stringify({ w: 380, h: 220 }));
  console.log("ok  双击把手恢复默认 380x220，并落盘");

  /* ── 7. 一次性提示的三条规矩 ──
   * ① 首次出现、2.4s 自己消失；② 没拖过就还会再提示（最多 3 次）；
   * ③ 一旦拖过（存在 SIZE_KEY）或次数用满，永远闭嘴。 */
  hookStore = [];
  stateQueue = [];
  storage.delete("dsh-composer-scratchpad:hint:v1");
  storage.delete("dsh-composer-scratchpad:size:v1");   // 清掉"已拖过"的证据，模拟真·新用户
  let tree7 = settle();
  findByClass(tree7, "dmp-btn").props.onClick({ stopPropagation() {} });
  tree7 = settle();
  assert.ok(findByClass(tree7, "dmp-hint"), "首次打开没出现提示");
  assert.strictEqual(storage.get("dsh-composer-scratchpad:hint:v1"), "1", "提示次数没落盘");
  await sleep(2700);
  tree7 = settle();
  assert.strictEqual(findByClass(tree7, "dmp-hint"), null, "提示没有自动消失（2.4s 后应消失）");

  // 没拖过 → 允许再来一次（教学优先），次数 +1
  findByClass(tree7, "dmp-panel").props.onKeyDownCapture({ key: "Escape", stopPropagation() {}, preventDefault() {} });
  tree7 = settle();
  findByClass(tree7, "dmp-btn").props.onClick({ stopPropagation() {} });
  tree7 = settle();
  assert.ok(findByClass(tree7, "dmp-hint"), "没拖过时第二次打开应该还能提示");
  assert.strictEqual(storage.get("dsh-composer-scratchpad:hint:v1"), "2", "第二次提示的次数没累加");

  // 拖一次 → 写出 SIZE_KEY → 从此不再提示
  const grip7 = findByClass(tree7, "dmp-grip");
  grip7.props.onMouseDown({ clientX: 1100, clientY: 860, preventDefault() {}, stopPropagation() {} });
  fireDocument("mousemove", { clientX: 1060, clientY: 830 });
  tree7 = settle();
  fireDocument("mouseup", {});
  assert.ok(storage.get("dsh-composer-scratchpad:size:v1"), "拖动后没有写出尺寸键");
  findByClass(tree7, "dmp-panel").props.onKeyDownCapture({ key: "Escape", stopPropagation() {}, preventDefault() {} });
  tree7 = settle();
  findByClass(tree7, "dmp-btn").props.onClick({ stopPropagation() {} });
  tree7 = settle();
  assert.strictEqual(findByClass(tree7, "dmp-hint"), null, "拖过之后不该再提示");

  // 次数用满 → 即便尺寸键被清掉也不再提示
  storage.delete("dsh-composer-scratchpad:size:v1");
  storage.set("dsh-composer-scratchpad:hint:v1", "3");
  findByClass(tree7, "dmp-panel").props.onKeyDownCapture({ key: "Escape", stopPropagation() {}, preventDefault() {} });
  tree7 = settle();
  findByClass(tree7, "dmp-btn").props.onClick({ stopPropagation() {} });
  tree7 = settle();
  assert.strictEqual(findByClass(tree7, "dmp-hint"), null, "次数用满后还在提示");
  console.log("ok  提示三条规矩：首次出现 → 2.4s 消失 → 没拖过最多 3 次 → 拖过或满 3 次即闭嘴");

  /* ── 6. 卸载冲刷 + 监听器清理 ── */
  const before = listeners.length;
  for (const slot of hookStore) {
    if (slot && typeof slot.cleanup === "function") slot.cleanup();
  }
  assert.ok(listeners.length <= before, "卸载后监听器没有清理");
  console.log("ok  卸载清理：监听器数 " + before + " -> " + listeners.length);

  console.log("\n全部通过：7 项冒烟断言");
}, 400);
