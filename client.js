import { HistoryNavigator } from './lib/navigator.js';

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

export default function apply(ctx) {
  let cachedHistory = [];
  let currentSessionId = 'global';

  function detectSessionId() {
    try {
      const match = window.location.pathname.match(/\/session\/([^\/]+)/) ||
                    window.location.hash.match(/session\/([^\/]+)/);
      if (match && match[1]) {
        currentSessionId = match[1];
      }
    } catch (e) {}
  }

  let apiEndpoint = '/api/message-history-v2';

  // Function to sync history from host
  async function refreshHistory() {
    detectSessionId();
    try {
      let res = await fetch(`${apiEndpoint}?sessionId=${encodeURIComponent(currentSessionId)}`);
      if (!res.ok && apiEndpoint === '/api/message-history-v2') {
        apiEndpoint = '/api/message-history';
        res = await fetch(`${apiEndpoint}?sessionId=${encodeURIComponent(currentSessionId)}`);
      }
      if (res.ok) {
        const data = await res.json();
        cachedHistory = data.history || [];
      }
    } catch (e) {
      // Ignore
    }
  }

  const navigator = new HistoryNavigator(() => cachedHistory);

  // Sync history when entering textarea
  window.addEventListener('focusin', (e) => {
    if (e.target && e.target.tagName === 'TEXTAREA') {
      refreshHistory();
    }
  }, true);

  // Intercept keyboard events globally on textareas
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'TEXTAREA') {
      return;
    }

    const result = navigator.handleKeyDown(e, target);
    if (result && result.action === 'set_text') {
      setNativeValue(target, result.text);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.selectionStart = target.selectionEnd = target.value.length;
    }
  }, true);

  // Monitor form/message submits to record history immediately
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'TEXTAREA') return;

    if (e.key === 'Enter' && !e.shiftKey) {
      const text = target.value;
      if (text && text.trim()) {
        detectSessionId();
        fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, sessionId: currentSessionId })
        }).then(() => refreshHistory()).catch(() => {});
      }
    }
  }, true);

  refreshHistory();
}
