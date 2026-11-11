window.__ModuleLoader__.load({
  id: "dsh-plugin-message-history",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    const STATE = {
      IDLE: "IDLE",
      NAVIGATING: "NAVIGATING"
    };

    const DOUBLE_PRESS_TIMEOUT_MS = 1500;

    function getHistoryItemText(item) {
      if (!item) return "";
      return typeof item === "string" ? item : (item.text || "");
    }

    function getElementText(el) {
      if (!el) return "";
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        return el.value || "";
      }
      return (el.innerText || el.textContent || "").replace(/\r?\n$/, "");
    }

    function isCaretAtStart(el) {
      if (!el) return true;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        return el.selectionStart === 0 && (el.selectionEnd === 0 || el.selectionEnd == null);
      }
      try {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
        const range = sel.getRangeAt(0);
        if (el.contains && !el.contains(range.startContainer)) return false;

        const preRange = document.createRange();
        preRange.selectNodeContents(el);
        preRange.setEnd(range.startContainer, range.startOffset);
        return preRange.toString().length === 0;
      } catch (err) {
        return false;
      }
    }

    function isCaretAtEnd(el) {
      if (!el) return true;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const val = el.value || "";
        return el.selectionEnd === val.length && (el.selectionStart === val.length || el.selectionStart == null);
      }
      try {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
        const range = sel.getRangeAt(0);
        if (el.contains && !el.contains(range.endContainer)) return false;

        const postRange = document.createRange();
        postRange.selectNodeContents(el);
        postRange.setStart(range.endContainer, range.endOffset);
        const textAfter = postRange.toString().replace(/\r?\n$/, "");
        return textAfter.length === 0;
      } catch (err) {
        return false;
      }
    }

    function getComposerElement(target) {
      if (!target) return null;
      if (target.getAttribute && target.getAttribute("data-composer-input") === "true") return target;
      if (target.closest) {
        const found = target.closest('[data-composer-input="true"]') ||
                      target.closest('[role="textbox"][contenteditable="true"]');
        if (found) return found;
        const card = target.closest('[data-composer-card]');
        if (card) {
          const inner = card.querySelector('[data-composer-input="true"]');
          if (inner) return inner;
        }
      }
      if (target.isContentEditable || target.tagName === "TEXTAREA") return target;
      return null;
    }

    function setComposerText(props, el, text) {
      // 1. Official DSH InputActions API
      if (props && props.inputActions && typeof props.inputActions.setDraft === "function") {
        props.inputActions.setDraft(text);
        return;
      }
      // 2. Textarea fallback
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const setter = Object.getOwnPropertyDescriptor(el, "value")?.set
          || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
        if (setter) {
          setter.call(el, text);
        } else {
          el.value = text;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      // 3. Contenteditable Lexical DOM fallback via document.execCommand
      try {
        el.focus();
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, text);
      } catch (err) {
        el.textContent = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    let activeSessionProps = null;

    function MessageHistoryMount(props) {
      activeSessionProps = props;

      const [history, setHistory] = useState([]);
      const stateRef = useRef({
        state: STATE.IDLE,
        historyIndex: -1,
        draft: "",
        history: [],
        upPressCount: 0,
        lastUpPressTime: 0,
        downPressCount: 0,
        lastDownPressTime: 0
      });

      useEffect(() => {
        stateRef.current.history = history;
      }, [history]);

      useEffect(() => {
        let active = true;
        async function fetchHistory() {
          try {
            let res = await fetch("/api/message-history-v2");
            if (!res.ok) {
              res = await fetch("/api/message-history");
            }
            if (res.ok && active) {
              const data = await res.json();
              const items = Array.isArray(data.history) ? data.history : [];
              setHistory(items);
            }
          } catch (e) {}
        }
        fetchHistory();
        return () => { active = false; };
      }, [props.sessionId]);

      useEffect(() => {
        function onKeyDown(e) {
          const composerEl = getComposerElement(e.target);
          if (!composerEl) return;

          const st = stateRef.current;
          const hist = st.history;
          if (!hist || hist.length === 0) return;

          const key = e.key;
          const currentProps = activeSessionProps || props;

          if (key === "Escape") {
            st.upPressCount = 0;
            st.downPressCount = 0;
            if (st.state === STATE.NAVIGATING) {
              e.preventDefault();
              e.stopPropagation();
              st.state = STATE.IDLE;
              const restored = st.draft;
              st.draft = "";
              st.historyIndex = -1;
              setComposerText(currentProps, composerEl, restored);
            }
            return;
          }

          if (key === "ArrowUp") {
            st.downPressCount = 0;
            const currentText = getElementText(composerEl);

            // Empty message box: immediate trigger on single press
            if (!currentText.trim()) {
              e.preventDefault();
              e.stopPropagation();
              st.upPressCount = 0;
              st.state = STATE.NAVIGATING;
              st.draft = currentText;
              st.historyIndex = 0;
              setComposerText(currentProps, composerEl, getHistoryItemText(hist[0]));
              return;
            }

            // Text is present: MUST be at position 0
            if (!isCaretAtStart(composerEl)) {
              st.upPressCount = 0;
              // Allow default browser/Lexical behavior (scroll up or jump to position 0)
              return;
            }

            // Cursor is at position 0: require double-press within threshold
            const now = Date.now();
            if (st.upPressCount >= 1 && (now - st.lastUpPressTime) < DOUBLE_PRESS_TIMEOUT_MS) {
              st.upPressCount = 0;
              e.preventDefault();
              e.stopPropagation();

              if (st.state === STATE.IDLE) {
                st.state = STATE.NAVIGATING;
                st.draft = currentText;
                st.historyIndex = 0;
                setComposerText(currentProps, composerEl, getHistoryItemText(hist[0]));
              } else if (st.state === STATE.NAVIGATING) {
                if (st.historyIndex < hist.length - 1) {
                  st.historyIndex++;
                  setComposerText(currentProps, composerEl, getHistoryItemText(hist[st.historyIndex]));
                }
              }
            } else {
              // First press at position 0
              st.upPressCount = 1;
              st.lastUpPressTime = now;
              // Do NOT preventDefault, let default action occur
              return;
            }
            return;
          }

          if (key === "ArrowDown") {
            st.upPressCount = 0;

            if (st.state === STATE.NAVIGATING) {
              // Must be at the very last position
              if (!isCaretAtEnd(composerEl)) {
                st.downPressCount = 0;
                // Allow default browser/Lexical behavior (scroll down towards end)
                return;
              }

              // Cursor is at very last position: require double-press
              const now = Date.now();
              if (st.downPressCount >= 1 && (now - st.lastDownPressTime) < DOUBLE_PRESS_TIMEOUT_MS) {
                st.downPressCount = 0;
                e.preventDefault();
                e.stopPropagation();

                if (st.historyIndex > 0) {
                  st.historyIndex--;
                  setComposerText(currentProps, composerEl, getHistoryItemText(hist[st.historyIndex]));
                } else if (st.historyIndex === 0) {
                  // Reached the draft
                  st.state = STATE.IDLE;
                  st.historyIndex = -1;
                  const restored = st.draft;
                  st.draft = "";
                  setComposerText(currentProps, composerEl, restored);
                }
              } else {
                // First press at very last position
                st.downPressCount = 1;
                st.lastDownPressTime = now;
                return;
              }
            } else {
              st.downPressCount = 0;
            }
            return;
          }

          // Reset double-press counters on any other key
          if (key !== "ArrowUp" && key !== "ArrowDown") {
            st.upPressCount = 0;
            st.downPressCount = 0;
          }

          // User typing or modifying text cancels navigation mode
          if (st.state === STATE.NAVIGATING && key !== "Shift" && key !== "Control" && key !== "Alt" && key !== "Meta" && key !== "ArrowLeft" && key !== "ArrowRight") {
            st.state = STATE.IDLE;
            st.historyIndex = -1;
            st.draft = "";
          }
        }

        window.addEventListener("keydown", onKeyDown, true);
        return () => {
          window.removeEventListener("keydown", onKeyDown, true);
        };
      }, [props]);

      return null;
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        ctx.slots.inject("conversation.input.left", () =>
          ctx.slots.register(
            {
              name: "conversation.input.left",
              id: "message-history-mount",
              order: 99
            },
            MessageHistoryMount
          )
        );
      }
    };
  }
});
