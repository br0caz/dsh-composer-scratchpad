(() => {
  try {
    /* dsh-composer-scratchpad — client half.
     * 一行代码不动主输入框：只在 composer 工具栏插一个 📝 按钮，
     * 点开弹出一个 position:fixed 的面板，里面是一枚纯净 textarea。
     * 回车只产生换行（textarea 默认行为，且键盘事件在面板处就截断，
     * 不会冒泡到 Lexical 草稿编辑器），没有发送、没有插入、没有清空按钮。
     * 文本全局一份，键 dsh-memo-pad:v1，存 localStorage。
     * 尺寸：右下角把手可拖（左拖变宽、上拖变高，因为面板贴着工具栏往上弹），
     * 尺寸单独存 dsh-memo-pad:size:v1，双击把手恢复默认。 */
    window.__ModuleLoader__.load({
      id: "dsh-composer-scratchpad",
      factory: (require) => {
        const module = { exports: {} };
        const exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

        const react = require("react");

        const inject = ["slots"];

        const STORAGE_KEY = "dsh-composer-scratchpad:v1";
        const SIZE_KEY = "dsh-composer-scratchpad:size:v1";
        const HINT_KEY = "dsh-composer-scratchpad:hint:v1";
        /* 旧键名（插件还叫 dsh-memo-pad 的时候）。只读一次搬过来，之后不再碰。 */
        const LEGACY_KEYS = [
          ["dsh-memo-pad:v1", STORAGE_KEY],
          ["dsh-memo-pad:size:v1", SIZE_KEY],
          ["dsh-memo-pad:hint:v1", HINT_KEY]
        ];
        const CSS_ID = "dsh-composer-scratchpad-css";
        const PANEL_GAP = 10;
        const DEFAULT_WIDTH = 380;
        const DEFAULT_HEIGHT = 220;
        const MIN_WIDTH = 240;
        const MIN_HEIGHT = 120;
        const EDGE_PAD = 12;
        const SAVE_DEBOUNCE_MS = 200;
        const HINT_MS = 2400;
        const HINT_MAX = 3;

        const CSS = [
          ".dmp-root{display:inline-flex;align-items:center}",
          ".dmp-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;",
          "width:28px;height:28px;padding:0;border:0;border-radius:999px;background:transparent;",
          "color:inherit;opacity:.72;cursor:pointer;transition:background-color .15s ease,opacity .15s ease}",
          ".dmp-btn:hover{background:rgba(255,255,255,.09);opacity:1}",
          ".dmp-btn[data-open='1']{background:rgba(255,255,255,.12);opacity:1}",
          ".dmp-btn:focus-visible{outline:2px solid rgba(120,170,255,.75);outline-offset:1px}",
          ".dmp-dot{position:absolute;top:4px;right:3px;width:5px;height:5px;border-radius:50%;",
          "background:#f0a92f;box-shadow:0 0 0 1px rgba(0,0,0,.35);pointer-events:none}",
          ".dmp-panel{position:fixed;z-index:80;display:flex;flex-direction:column;box-sizing:border-box;",
          "padding:8px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:#2a2b2f;",
          "box-shadow:0 18px 44px rgba(0,0,0,.55);color-scheme:dark;animation:dmp-in .12s ease-out}",
          "@keyframes dmp-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}",
          ".dmp-text{flex:1 1 auto;width:100%;box-sizing:border-box;min-height:0;padding:8px 10px;",
          "border:0;border-radius:8px;background:rgba(0,0,0,.22);color:#e9e9ec;font-family:inherit;",
          "font-size:13px;line-height:1.6;resize:none;outline:none;scrollbar-width:thin}",
          ".dmp-text::placeholder{color:rgba(255,255,255,.34)}",
          ".dmp-text:focus{background:rgba(0,0,0,.3)}",
          /* 把手：原来 opacity .42 + 纯白，用户反馈"根本没注意到"。
           * 改成墨色透明度阶梯（secondary .48 太淡 → 用 body .72），底下垫一块
           * ink@.12 的发丝底板当"可拖区"提示；hover 提到 primary 1.0，按下再亮一档。
           * 旧值：opacity:.42;color:#e9e9ec;padding:2px;border-bottom-right-radius:12px */
          ".dmp-grip{position:absolute;right:4px;bottom:4px;width:16px;height:16px;cursor:nwse-resize;",
          "display:flex;align-items:flex-end;justify-content:flex-end;padding:3px;box-sizing:border-box;",
          "border-radius:4px;background:rgba(237,234,228,.12);color:rgba(237,234,228,.72)}",
          ".dmp-grip:hover{background:rgba(237,234,228,.2);color:rgba(237,234,228,1)}",
          ".dmp-grip:active{background:rgba(237,234,228,.28);color:rgba(237,234,228,1)}",
          /* 一次性提示：只在人生第一次打开面板时出现，2.4s 自己淡掉，之后永不再来。
           * 走墨色阶梯 + 深色底板保证压在正文上也读得清；pointer-events:none 保证
           * 它不抢输入。 */
          ".dmp-hint{position:absolute;right:8px;bottom:28px;padding:4px 8px;border-radius:4px;",
          "background:rgba(0,0,0,.42);color:rgba(237,234,228,.72);font-size:11px;line-height:16px;",
          "pointer-events:none;animation:dmp-hint 2.4s ease forwards}",
          "@keyframes dmp-hint{0%,72%{opacity:1}100%{opacity:0}}"
        ].join("\n");

        const ICON = react.createElement(
          "svg",
          {
            width: 16,
            height: 16,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.7,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
            focusable: "false"
          },
          react.createElement("path", { d: "M12 20h9" }),
          react.createElement("path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" })
        );

        /* 把手图形：右下角两道斜线。
         * 先用过「三个点」，但三角排布在业界是"拖动排序 / 更多操作"的手势语，
         * 不是"改大小"；改大小公认的符号是文本框右下角那两道 45° 斜线（Windows
         * 原生 textarea 就是它）。斜线比点更少像素、更少歧义。 */
        const GRIP_ICON = react.createElement(
          "svg",
          {
            width: 10,
            height: 10,
            viewBox: "0 0 10 10",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.2,
            strokeLinecap: "round",
            "aria-hidden": "true",
            focusable: "false"
          },
          react.createElement("path", { d: "M8.6 3.4 3.4 8.6" }),
          react.createElement("path", { d: "M8.6 6.6 6.6 8.6" })
        );

        function clamp(value, low, high) {
          if (!isFinite(value)) return low;
          return Math.min(Math.max(value, low), high);
        }

        /* 一次性迁移：老键名有值、新键名为空就搬过来。搬不动（隐私模式）就照常跑。 */
        function migrateLegacyKeys() {
          try {
            for (let i = 0; i < LEGACY_KEYS.length; i += 1) {
              const from = LEGACY_KEYS[i][0];
              const to = LEGACY_KEYS[i][1];
              if (window.localStorage.getItem(to) === null) {
                const value = window.localStorage.getItem(from);
                if (value !== null) window.localStorage.setItem(to, value);
              }
            }
          } catch {
            /* ignore */
          }
        }

        migrateLegacyKeys();

        function readDraft() {
          try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return "";
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed.text === "string" ? parsed.text : "";
          } catch {
            return "";
          }
        }

        function writeDraft(text) {
          try {
            window.localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ text: text, savedAt: Date.now() })
            );
          } catch {
            /* quota / private mode: 备忘录失效但不打扰输入 */
          }
        }

        function readSize() {
          try {
            const raw = window.localStorage.getItem(SIZE_KEY);
            if (!raw) return { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };
            const parsed = JSON.parse(raw);
            const w = Number(parsed && parsed.w);
            const h = Number(parsed && parsed.h);
            return {
              w: isFinite(w) && w > 0 ? w : DEFAULT_WIDTH,
              h: isFinite(h) && h > 0 ? h : DEFAULT_HEIGHT
            };
          } catch {
            return { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };
          }
        }

        function writeSize(size) {
          try {
            window.localStorage.setItem(
              SIZE_KEY,
              JSON.stringify({ w: Math.round(size.w), h: Math.round(size.h) })
            );
          } catch {
            /* 尺寸存不下就退回默认，不影响使用 */
          }
        }

        /* 一次性提示的判据不是"永远只显示一次"，而是"教会为止"：
         * ① 只要用户拖过一次（SIZE_KEY 已存在）就不再提示；
         * ② 没拖过的话最多提示 HINT_MAX 次，之后闭嘴；
         * ③ 次数存在 HINT_KEY 里，存不下就当没提示过 —— 宁可多说一句。 */
        function readHintCount() {
          try {
            const raw = Number(window.localStorage.getItem(HINT_KEY));
            return isFinite(raw) && raw > 0 ? raw : 0;
          } catch {
            return 0;
          }
        }

        function writeHintCount(count) {
          try {
            window.localStorage.setItem(HINT_KEY, String(count));
          } catch {
            /* ignore */
          }
        }

        function hasResized() {
          try {
            return window.localStorage.getItem(SIZE_KEY) !== null;
          } catch {
            return false;
          }
        }

        function MemoPad() {
          const openState = react.useState(false);
          const open = openState[0];
          const setOpen = openState[1];

          const textState = react.useState(readDraft);
          const text = textState[0];
          const setText = textState[1];

          const sizeState = react.useState(readSize);
          const size = sizeState[0];
          const setSize = sizeState[1];

          const anchorState = react.useState(null);
          const anchor = anchorState[0];
          const setAnchor = anchorState[1];

          const hintState = react.useState(false);
          const showHint = hintState[0];
          const setShowHint = hintState[1];

          const btnRef = react.useRef(null);
          const panelRef = react.useRef(null);
          const taRef = react.useRef(null);
          const textRef = react.useRef(text);
          const sizeRef = react.useRef(size);
          const timerRef = react.useRef(null);
          const dragRef = react.useRef(null);

          textRef.current = text;
          sizeRef.current = size;

          react.useEffect(() => {
            if (document.getElementById(CSS_ID)) return undefined;
            const styleEl = document.createElement("style");
            styleEl.id = CSS_ID;
            styleEl.textContent = CSS;
            document.head.appendChild(styleEl);
            return () => {
              const el = document.getElementById(CSS_ID);
              if (el) el.remove();
            };
          }, []);

          react.useEffect(() => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => {
              timerRef.current = null;
              writeDraft(text);
            }, SAVE_DEBOUNCE_MS);
            return () => {
              if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
              }
            };
          }, [text]);

          react.useEffect(() => {
            return () => {
              writeDraft(textRef.current);
              writeSize(sizeRef.current);
            };
          }, []);

          const place = react.useCallback(() => {
            const el = btnRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - EDGE_PAD * 2);
            const width = clamp(sizeRef.current.w, MIN_WIDTH, maxWidth);
            let left = rect.right - width;
            left = Math.max(EDGE_PAD, Math.min(left, window.innerWidth - width - EDGE_PAD));
            const bottom = Math.max(EDGE_PAD, window.innerHeight - rect.top + PANEL_GAP);
            const spaceAbove = Math.max(MIN_HEIGHT, rect.top - PANEL_GAP - EDGE_PAD);
            const height = clamp(sizeRef.current.h, MIN_HEIGHT, spaceAbove);
            setAnchor({ left: left, bottom: bottom, width: width, height: height });
          }, []);

          react.useEffect(() => {
            if (!open) {
              setAnchor(null);
              return undefined;
            }
            place();
            const onViewportChange = () => place();
            window.addEventListener("resize", onViewportChange);
            window.addEventListener("scroll", onViewportChange, true);
            return () => {
              window.removeEventListener("resize", onViewportChange);
              window.removeEventListener("scroll", onViewportChange, true);
            };
          }, [open, place]);

          react.useEffect(() => {
            if (!open) return undefined;
            const onPointerDown = (event) => {
              const target = event.target;
              if (panelRef.current && panelRef.current.contains(target)) return;
              if (btnRef.current && btnRef.current.contains(target)) return;
              setOpen(false);
            };
            document.addEventListener("mousedown", onPointerDown, true);
            return () => document.removeEventListener("mousedown", onPointerDown, true);
          }, [open]);

          react.useEffect(() => {
            if (!open) return;
            const ta = taRef.current;
            if (!ta) return;
            ta.focus();
            const end = ta.value.length;
            try {
              ta.setSelectionRange(end, end);
            } catch {
              /* 某些环境下 selectionRange 会抛，光标位置不重要 */
            }
          }, [open]);

          /* 一次性提示：第一次打开面板时浮一句「可拖动调整大小」，2.4s 淡掉。
           * 写标记的时机是"显示那一刻"，所以提前关面板也不会让它下次又来。 */
          react.useEffect(() => {
            if (!open) {
              setShowHint(false);
              return undefined;
            }
            const shown = readHintCount();
            if (shown >= HINT_MAX || hasResized()) return undefined;
            writeHintCount(shown + 1);
            setShowHint(true);
            const hintTimer = window.setTimeout(() => setShowHint(false), HINT_MS);
            return () => window.clearTimeout(hintTimer);
          }, [open]);

          const stopMouse = (event) => {
            event.stopPropagation();
          };

          const onButtonClick = (event) => {
            event.stopPropagation();
            setOpen((prev) => !prev);
          };

          const onPanelKeyDownCapture = (event) => {
            /* 键盘事件在面板内部终结，主编辑器的 Enter 提交链路碰不到它 */
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          };

          /* 拖动改尺寸：面板贴着工具栏往上弹，所以左边框、上边框在动 ——
           * 拖左 = 变宽，拖上 = 变高。过程只改 state，松手才落盘。 */
          const onGripMouseDown = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const panelEl = panelRef.current;
            if (!panelEl) return;
            const rect = panelEl.getBoundingClientRect();
            dragRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              startW: rect.width,
              startH: rect.height
            };
            if (document.body) {
              document.body.style.cursor = "nwse-resize";
              document.body.style.userSelect = "none";
            }

            const onMove = (moveEvent) => {
              const drag = dragRef.current;
              if (!drag) return;
              const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - EDGE_PAD * 2);
              const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 80);
              const next = {
                w: clamp(drag.startW + (drag.startX - moveEvent.clientX), MIN_WIDTH, maxWidth),
                h: clamp(drag.startH + (drag.startY - moveEvent.clientY), MIN_HEIGHT, maxHeight)
              };
              /* 先写 ref 再 place：place() 读的是 sizeRef，重渲染还没发生，
               * 不先写就会慢一帧（松手时位置差最后那一格）。 */
              sizeRef.current = next;
              setSize(next);
              place();
            };

            const onUp = () => {
              dragRef.current = null;
              if (document.body) {
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
              }
              document.removeEventListener("mousemove", onMove, true);
              document.removeEventListener("mouseup", onUp, true);
              writeSize(sizeRef.current);
            };

            document.addEventListener("mousemove", onMove, true);
            document.addEventListener("mouseup", onUp, true);
          };

          const onGripDoubleClick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const reset = { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };
            sizeRef.current = reset;
            setSize(reset);
            writeSize(reset);
            place();
          };

          const children = [
            react.createElement(
              "button",
              {
                key: "btn",
                ref: btnRef,
                type: "button",
                className: "dmp-btn",
                "data-plugin": "dsh-composer-scratchpad",
                "data-open": open ? "1" : "0",
                title: "备忘录",
                "aria-label": "备忘录",
                "aria-haspopup": "dialog",
                "aria-expanded": open ? "true" : "false",
                onMouseDown: stopMouse,
                onClick: onButtonClick
              },
              ICON,
              text.length > 0 ? react.createElement("span", { key: "dot", className: "dmp-dot" }) : null
            )
          ];

          if (open && anchor) {
            children.push(
              react.createElement(
                "div",
                {
                  key: "panel",
                  ref: panelRef,
                  className: "dmp-panel",
                  role: "dialog",
                  "aria-label": "备忘录",
                  "data-plugin": "dsh-composer-scratchpad",
                  style: {
                    left: anchor.left + "px",
                    bottom: anchor.bottom + "px",
                    width: anchor.width + "px",
                    height: anchor.height + "px"
                  },
                  onMouseDown: stopMouse,
                  onClick: stopMouse,
                  onKeyDownCapture: onPanelKeyDownCapture
                },
                react.createElement("textarea", {
                  ref: taRef,
                  className: "dmp-text",
                  value: text,
                  placeholder: "随手记一句，回车只换行",
                  spellCheck: false,
                  "aria-label": "备忘录",
                  "data-plugin": "dsh-composer-scratchpad",
                  onChange: (event) => setText(event.target.value),
                  onKeyDown: (event) => event.stopPropagation()
                }),
                showHint
                  ? react.createElement(
                      "div",
                      {
                        key: "hint",
                        className: "dmp-hint",
                        "data-plugin": "dsh-composer-scratchpad-hint"
                      },
                      "可拖动调整大小"
                    )
                  : null,
                react.createElement(
                  "div",
                  {
                    key: "grip",
                    className: "dmp-grip",
                    "data-plugin": "dsh-composer-scratchpad-grip",
                    title: "拖动改大小，双击恢复默认",
                    onMouseDown: onGripMouseDown,
                    onDoubleClick: onGripDoubleClick
                  },
                  GRIP_ICON
                )
              )
            );
          }

          return react.createElement("div", { className: "dmp-root" }, children);
        }

        function apply(ctx) {
          ctx.slots.inject("conversation.input.right", () =>
            ctx.slots.register(
              {
                name: "conversation.input.right",
                id: "dsh-composer-scratchpad:notepad",
                order: 20
              },
              MemoPad
            )
          );
        }

        exports.name = "dsh-composer-scratchpad";
        exports.inject = inject;
        exports.apply = apply;
        return module.exports;
      }
    });
  } catch (err) {
    console.warn("[dsh-composer-scratchpad] client runtime error:", err);
  }
})();
