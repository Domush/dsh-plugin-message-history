export const STATE = {
  IDLE: 'IDLE',
  NAVIGATING: 'NAVIGATING'
};

const DOUBLE_PRESS_TIMEOUT_MS = 1500;

function getHistoryText(item) {
  if (!item) return '';
  return typeof item === 'string' ? item : (item.text || '');
}

function getTargetText(target) {
  if (typeof target === 'string') return target;
  if (!target) return '';
  if (typeof target.value === 'string') return target.value;
  if (typeof target.innerText === 'string') return target.innerText.replace(/\r?\n$/, '');
  if (typeof target.textContent === 'string') return target.textContent;
  return '';
}

export function isCaretAtStart(el) {
  if (!el) return true;
  if (typeof el.selectionStart === 'number') {
    return el.selectionStart === 0 && (el.selectionEnd === 0 || el.selectionEnd == null);
  }
  if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
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
  return false;
}

export function isCaretAtEnd(el) {
  if (!el) return true;
  const value = getTargetText(el);
  if (typeof el.selectionEnd === 'number') {
    return el.selectionEnd === value.length && (el.selectionStart === value.length || el.selectionStart == null);
  }
  if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
      const range = sel.getRangeAt(0);
      if (el.contains && !el.contains(range.endContainer)) return false;

      const postRange = document.createRange();
      postRange.selectNodeContents(el);
      postRange.setStart(range.endContainer, range.endOffset);
      const textAfter = postRange.toString().replace(/\r?\n$/, '');
      return textAfter.length === 0;
    } catch (err) {
      return false;
    }
  }
  return false;
}

export class HistoryNavigator {
  constructor(getHistoryFn) {
    this.getHistory = getHistoryFn;
    this.state = STATE.IDLE;
    this.historyIndex = -1;
    this.draft = '';
    this.consecutiveUpPresses = 0;
    this.consecutiveDownPresses = 0;
    this.lastUpPressTime = 0;
    this.lastDownPressTime = 0;
  }

  isAtTopBoundary(textarea) {
    return isCaretAtStart(textarea);
  }

  isAtBottomBoundary(textarea) {
    return isCaretAtEnd(textarea);
  }

  handleKeyDown(event, textarea) {
    const key = event.key;
    const history = this.getHistory();

    if (!history || history.length === 0) {
      return null;
    }

    const currentText = getTargetText(textarea);

    if (key === 'Escape') {
      this.consecutiveUpPresses = 0;
      this.consecutiveDownPresses = 0;
      if (this.state === STATE.NAVIGATING) {
        event.preventDefault();
        this.state = STATE.IDLE;
        const restored = this.draft;
        this.draft = '';
        this.historyIndex = -1;
        return { action: 'set_text', text: restored };
      }
      return null;
    }

    if (key === 'ArrowUp') {
      this.consecutiveDownPresses = 0;

      // When message box is empty: immediate trigger on single press
      if (!currentText.trim()) {
        event.preventDefault();
        this.consecutiveUpPresses = 0;
        this.state = STATE.NAVIGATING;
        this.draft = currentText;
        this.historyIndex = 0;
        return { action: 'set_text', text: getHistoryText(history[0]) };
      }

      // When text exists: MUST be at position 0
      const atTop = this.isAtTopBoundary(textarea);
      if (!atTop) {
        this.consecutiveUpPresses = 0;
        // Allow default behavior (jump/scroll up towards position 0)
        return null;
      }

      // Cursor is at position 0: require double-press
      const now = Date.now();
      if (this.consecutiveUpPresses >= 1 && (now - this.lastUpPressTime) < DOUBLE_PRESS_TIMEOUT_MS) {
        this.consecutiveUpPresses = 0;
        event.preventDefault();

        if (this.state === STATE.IDLE) {
          this.state = STATE.NAVIGATING;
          this.draft = currentText;
          this.historyIndex = 0;
          return { action: 'set_text', text: getHistoryText(history[0]) };
        } else if (this.state === STATE.NAVIGATING) {
          if (this.historyIndex < history.length - 1) {
            this.historyIndex++;
            return { action: 'set_text', text: getHistoryText(history[this.historyIndex]) };
          }
        }
      } else {
        // First press at position 0
        this.consecutiveUpPresses = 1;
        this.lastUpPressTime = now;
        return null;
      }
      return null;
    }

    if (key === 'ArrowDown') {
      this.consecutiveUpPresses = 0;

      if (this.state === STATE.NAVIGATING) {
        const atBottom = this.isAtBottomBoundary(textarea);
        if (!atBottom) {
          this.consecutiveDownPresses = 0;
          // Allow default behavior (scroll down towards last position)
          return null;
        }

        // Cursor is at very last position: require double-press
        const now = Date.now();
        if (this.consecutiveDownPresses >= 1 && (now - this.lastDownPressTime) < DOUBLE_PRESS_TIMEOUT_MS) {
          this.consecutiveDownPresses = 0;
          event.preventDefault();

          if (this.historyIndex > 0) {
            this.historyIndex--;
            return { action: 'set_text', text: getHistoryText(history[this.historyIndex]) };
          } else if (this.historyIndex === 0) {
            // Reached the draft
            this.state = STATE.IDLE;
            this.historyIndex = -1;
            const restored = this.draft;
            this.draft = '';
            return { action: 'set_text', text: restored };
          }
        } else {
          // First press at very last position
          this.consecutiveDownPresses = 1;
          this.lastDownPressTime = now;
          return null;
        }
      } else {
        this.consecutiveDownPresses = 0;
      }
      return null;
    }

    // Any normal typing or modifier key resets double-press counters
    if (key !== 'ArrowUp' && key !== 'ArrowDown') {
      this.consecutiveUpPresses = 0;
      this.consecutiveDownPresses = 0;
    }

    // Any typing while in navigating mode exits navigating mode and accepts edit as new draft
    if (this.state === STATE.NAVIGATING && key !== 'Shift' && key !== 'Control' && key !== 'Alt' && key !== 'Meta' && key !== 'ArrowLeft' && key !== 'ArrowRight') {
      this.state = STATE.IDLE;
      this.historyIndex = -1;
      this.draft = '';
    }

    return null;
  }
}
