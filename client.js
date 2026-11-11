window.__ModuleLoader__.load({
  id: "dsh-plugin-message-history",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    class HistoryNavigator {
      constructor(getHistory) {
        this.getHistory = getHistory;
        this.index = -1;
        this.isNavigating = false;
        this.originalDraft = '';
      }

      handleKeyDown(e, target) {
        const history = this.getHistory();
        if (!this.isNavigating && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          if (target.value.trim() === '') {
            this.isNavigating = true;
            this.originalDraft = target.value;
            this.index = 0;
            if (history.length > 0) {
              e.preventDefault();
              return { action: 'set_text', text: history[this.index].text };
            }
          }
        } else if (this.isNavigating) {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.index = Math.min(this.index + 1, history.length - 1);
            return { action: 'set_text', text: history[this.index].text };
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.index = Math.max(this.index - 1, -1);
            if (this.index === -1) {
              this.isNavigating = false;
              return { action: 'set_text', text: this.originalDraft };
            }
            return { action: 'set_text', text: history[this.index].text };
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.isNavigating = false;
            return { action: 'set_text', text: this.originalDraft };
          }
        }
        return null;
      }
    }

    function setNativeValue(element, value) {
      const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

      if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
      } else if (valueSetter) {
        valueSetter.call(element, value);
      } else {
        element.value = value;
      }
    }

    // React Component rendered in the composer UI
    function MessageHistoryMount() {
      const [history, setHistory] = useState([]);
      const navigatorRef = useRef(null);

      useEffect(() => {
        let active = true;
        const apiEndpoint = '/api/message-history-v2';

        async function fetchHistory() {
          try {
            let res = await fetch(apiEndpoint);
            if (!res.ok) {
              res = await fetch('/api/message-history');
            }
            if (res.ok && active) {
              const data = await res.json();
              setHistory(data.history || []);
            }
          } catch (e) {
            // Ignore fetch failure
          }
        }

        fetchHistory();
        return () => { active = false; };
      }, []);

      useEffect(() => {
        navigatorRef.current = new HistoryNavigator(() => history);
      }, [history]);

      useEffect(() => {
        function onKeyDown(e) {
          const target = e.target;
          if (!target || target.tagName !== 'TEXTAREA') return;

          if (navigatorRef.current) {
            const result = navigatorRef.current.handleKeyDown(e, target);
            if (result && result.action === 'set_text') {
              setNativeValue(target, result.text);
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.selectionStart = target.selectionEnd = target.value.length;
            }
          }
        }

        window.addEventListener('keydown', onKeyDown, true);
        return () => {
          window.removeEventListener('keydown', onKeyDown, true);
        };
      }, []);

      return null; // Headless component
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        // Inject into the composer to guarantee lifecycle instantiation
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
