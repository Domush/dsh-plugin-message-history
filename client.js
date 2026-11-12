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

    function getHistoryItemText(item) {
      if (!item) return "";
      return typeof item === "string" ? item : (item.text || "");
    }

    function normalizeText(str) {
      if (!str) return "";
      return str.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+/g, "\n").trim();
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
        const explicit = target.closest('[data-composer-input="true"]');
        if (explicit) return explicit;
        const card = target.closest('[data-composer-card]') ||
                     target.closest('[data-slot-owner="conversation.input"]') ||
                     target.closest('.dsh-composer');
        if (card) {
          const inner = card.querySelector('[data-composer-input="true"]') ||
                        card.querySelector('[role="textbox"][contenteditable="true"]') ||
                        card.querySelector('textarea');
          if (inner) return inner;
          if (target.isContentEditable || target.tagName === "TEXTAREA") return target;
        }
      }
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
        if (typeof document.queryCommandSupported === "function" && document.queryCommandSupported("insertText")) {
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, text);
          return;
        }
      } catch (err) {}

      // 4. Safe InputEvent dispatch without wiping virtual DOM nodes
      try {
        el.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
          const evt = new InputEvent("beforeinput", {
            inputType: "insertText",
            data: text,
            bubbles: true,
            cancelable: true
          });
          el.dispatchEvent(evt);
        }
      } catch (err) {}
    }

    function MessageHistoryMount(props) {
      const sessionId = props.sessionId || window.__DSH_SESSION_ID__;
      const propsRef = useRef(props);
      propsRef.current = props;

      const [history, setHistory] = useState([]);
      const stateRef = useRef({
        state: STATE.IDLE,
        historyIndex: -1,
        draft: "",
        history: [],
        isModified: false
      });

      useEffect(() => {
        stateRef.current.history = history;
      }, [history]);

      // Reset navigation state when switching sessions
      useEffect(() => {
        const st = stateRef.current;
        st.state = STATE.IDLE;
        st.historyIndex = -1;
        st.draft = "";
        st.isModified = false;
      }, [sessionId]);

      useEffect(() => {
        let active = true;
        async function fetchHistory() {
          try {
            const url = sessionId
              ? `/api/message-history?sessionId=${encodeURIComponent(sessionId)}`
              : "/api/message-history";
            const res = await fetch(url);
            if (res.ok && active) {
              const data = await res.json();
              const items = Array.isArray(data.history) ? data.history : [];
              setHistory(items);
            }
          } catch (e) {}
        }
        fetchHistory();
        return () => { active = false; };
      }, [sessionId]);

      useEffect(() => {
        function onInput(e) {
          const composerEl = getComposerElement(e.target);
          if (!composerEl) return;
          const st = stateRef.current;
          if (st.state === STATE.NAVIGATING) {
            st.isModified = true;
          }
        }

        function onKeyDown(e) {
          const composerEl = getComposerElement(e.target);
          if (!composerEl) return;

          const st = stateRef.current;
          const hist = st.history;
          if (!hist || hist.length === 0) return;

          const key = e.key;
          const currentProps = propsRef.current || props;

          const handleAction = () => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === "function") {
              e.stopImmediatePropagation();
            }
          };

          if (key === "Escape") {
            if (st.state === STATE.NAVIGATING) {
              handleAction();
              st.state = STATE.IDLE;
              const restored = st.draft;
              st.draft = "";
              st.historyIndex = -1;
              st.isModified = false;
              setComposerText(currentProps, composerEl, restored);
            }
            return;
          }

          if (key === "ArrowUp") {
            const currentText = getElementText(composerEl);

            if (st.state === STATE.IDLE) {
              // Empty message box: immediate single-press trigger
              if (!currentText.trim()) {
                handleAction();
                st.state = STATE.NAVIGATING;
                st.draft = currentText;
                st.historyIndex = 0;
                st.isModified = false;
                setComposerText(currentProps, composerEl, getHistoryItemText(hist[0]));
                return;
              }

              // Text entered: only trigger when cursor is at position 0
              if (isCaretAtStart(composerEl)) {
                handleAction();
                st.state = STATE.NAVIGATING;
                st.draft = currentText;
                st.historyIndex = 0;
                st.isModified = false;
                setComposerText(currentProps, composerEl, getHistoryItemText(hist[0]));
                return;
              }

              // Cursor not at position 0: allow default behavior (scroll up / jump to 0)
              return;
            }

            if (st.state === STATE.NAVIGATING) {
              const expectedText = getHistoryItemText(hist[st.historyIndex]);
              const isUnmodified = !st.isModified || (normalizeText(currentText) === normalizeText(expectedText));

              // If unmodified, single press immediately changes to older history item
              // If modified, only navigate when cursor is at position 0
              if (isUnmodified || isCaretAtStart(composerEl)) {
                if (st.historyIndex < hist.length - 1) {
                  handleAction();
                  st.historyIndex++;
                  st.isModified = false;
                  setComposerText(currentProps, composerEl, getHistoryItemText(hist[st.historyIndex]));
                } else {
                  // Reached oldest history item
                  handleAction();
                }
                return;
              }

              // Modified and not at position 0: allow default scrolling
              return;
            }
          }

          if (key === "ArrowDown") {
            if (st.state === STATE.NAVIGATING) {
              const currentText = getElementText(composerEl);
              const expectedText = getHistoryItemText(hist[st.historyIndex]);
              const isUnmodified = !st.isModified || (normalizeText(currentText) === normalizeText(expectedText));

              // If unmodified, single press immediately changes to newer history item or draft
              // If modified, only navigate when cursor is at very last position
              if (isUnmodified || isCaretAtEnd(composerEl)) {
                handleAction();

                if (st.historyIndex > 0) {
                  st.historyIndex--;
                  st.isModified = false;
                  setComposerText(currentProps, composerEl, getHistoryItemText(hist[st.historyIndex]));
                } else if (st.historyIndex === 0) {
                  // Reached the draft
                  st.state = STATE.IDLE;
                  st.historyIndex = -1;
                  st.isModified = false;
                  const restored = st.draft;
                  st.draft = "";
                  setComposerText(currentProps, composerEl, restored);
                }
                return;
              }

              // Modified and not at end: allow default scrolling
              return;
            }
          }

          // Detect user editing in NAVIGATING mode
          if (st.state === STATE.NAVIGATING) {
            if (key === "Backspace" || key === "Delete" || key === "Enter" || (key.length === 1 && !e.ctrlKey && !e.metaKey)) {
              st.isModified = true;
            }
          }
        }

        window.addEventListener("input", onInput, true);
        window.addEventListener("keydown", onKeyDown, true);
        return () => {
          window.removeEventListener("input", onInput, true);
          window.removeEventListener("keydown", onKeyDown, true);
        };
      }, []);

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
