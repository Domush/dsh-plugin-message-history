import { HistoryNavigator } from './lib/navigator.js';

export default function apply(ctx) {
  let cachedHistory = [];
  let currentSessionId = 'global';

  // Function to sync history from host
  async function refreshHistory() {
    try {
      const res = await fetch(`/api/message-history?sessionId=${encodeURIComponent(currentSessionId)}`);
      if (res.ok) {
        const data = await res.json();
        cachedHistory = data.history || [];
      }
    } catch (e) {
      // Ignore
    }
  }

  // Intercept keyboard events globally on textareas
  const navigator = new HistoryNavigator(() => cachedHistory);

  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'TEXTAREA') {
      return;
    }

    const result = navigator.handleKeyDown(e, target);
    if (result && result.action === 'set_text') {
      target.value = result.text;
      // Trigger input event so React state updates
      target.dispatchEvent(new Event('input', { bubbles: true }));
      // Set cursor to end
      target.selectionStart = target.selectionEnd = target.value.length;
    }
  }, true);

  // Monitor form/message submits to record history
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'TEXTAREA') return;

    if (e.key === 'Enter' && !e.shiftKey) {
      const text = target.value;
      if (text && text.trim()) {
        fetch('/api/message-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, sessionId: currentSessionId })
        }).then(() => refreshHistory()).catch(() => {});
      }
    }
  }, true);

  refreshHistory();
}
