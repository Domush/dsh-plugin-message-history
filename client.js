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

    function getElementText(el) {
      if (!el) return "";
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        return el.value || "";
      }
      return (el.innerText || el.textContent || "").replace(/\r?\n$/, "");
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
        // Fallback to textContent if execCommand is not available
        el.textContent = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    // Shared reference to the active session props
    let activeSessionProps = null;

    function MessageHistoryMount(props) {
      activeSessionProps = props;

      const [history, setHistory] = useState([]);
      const stateRef = useRef({
        state: STATE.IDLE,
        historyIndex: -1,
        draft: "",
        history: []
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
            const currentText = getElementText(composerEl);

            if (st.state === STATE.IDLE) {
              // Trigger when the message box is empty
              if (!currentText.trim()) {
                e.preventDefault();
                e.stopPropagation();
                st.state = STATE.NAVIGATING;
                st.draft = currentText;
                st.historyIndex = 0;
                setComposerText(currentProps, composerEl, getHistoryItemText(hist[0]));
              }
            } else if (st.state === STATE.NAVIGATING) {
              e.preventDefault();
              e.stopPropagation();
              if (st.historyIndex < hist.length - 1) {
                st.historyIndex++;
                setComposerText(currentProps, composerEl, getHistoryItemText(hist[st.historyIndex]));
              }
            }
            return;
          }

          if (key === "ArrowDown") {
            if (st.state === STATE.NAVIGATING) {
              e.preventDefault();
              e.stopPropagation();
              if (st.historyIndex > 0) {
                st.historyIndex--;
                setComposerText(currentProps, composerEl, getHistoryItemText(hist[st.historyIndex]));
              } else if (st.historyIndex === 0) {
                st.state = STATE.IDLE;
                st.historyIndex = -1;
                const restored = st.draft;
                st.draft = "";
                setComposerText(currentProps, composerEl, restored);
              }
            }
            return;
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
