export const STATE = {
  IDLE: 'IDLE',
  NAVIGATING: 'NAVIGATING'
};

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

export class HistoryNavigator {
  constructor(getHistoryFn) {
    this.getHistory = getHistoryFn;
    this.state = STATE.IDLE;
    this.historyIndex = -1;
    this.draft = '';
    this.consecutiveUpPresses = 0;
    this.consecutiveDownPresses = 0;
  }

  isAtTopBoundary(textarea) {
    if (!textarea) return true;
    const value = getTargetText(textarea);
    if (!value) return true;
    const selectionStart = textarea.selectionStart;
    if (typeof selectionStart === 'number') {
      if (selectionStart === 0) return true;
      const textBefore = value.substring(0, selectionStart);
      return !textBefore.includes('\n');
    }
    return true;
  }

  isAtBottomBoundary(textarea) {
    if (!textarea) return true;
    const value = getTargetText(textarea);
    if (!value) return true;
    const selectionEnd = textarea.selectionEnd;
    if (typeof selectionEnd === 'number') {
      if (selectionEnd === value.length) return true;
      const textAfter = value.substring(selectionEnd);
      return !textAfter.includes('\n');
    }
    return true;
  }

  handleKeyDown(event, textarea) {
    const key = event.key;
    const history = this.getHistory();

    if (!history || history.length === 0) {
      return null;
    }

    const currentText = getTargetText(textarea);

    if (key === 'Escape') {
      if (this.state === STATE.NAVIGATING) {
        event.preventDefault();
        this.state = STATE.IDLE;
        const restored = this.draft;
        this.draft = '';
        this.historyIndex = -1;
        this.consecutiveUpPresses = 0;
        this.consecutiveDownPresses = 0;
        return { action: 'set_text', text: restored };
      }
      return null;
    }

    if (key === 'ArrowUp') {
      const atTop = this.isAtTopBoundary(textarea);

      if (this.state === STATE.IDLE) {
        // If empty, immediate trigger; otherwise require double-press at boundary
        if (!currentText.trim()) {
          event.preventDefault();
          this.state = STATE.NAVIGATING;
          this.draft = currentText;
          this.historyIndex = 0;
          return { action: 'set_text', text: getHistoryText(history[0]) };
        }

        if (atTop) {
          this.consecutiveUpPresses++;
          if (this.consecutiveUpPresses >= 2) {
            event.preventDefault();
            this.state = STATE.NAVIGATING;
            this.draft = currentText;
            this.historyIndex = 0;
            this.consecutiveUpPresses = 0;
            return { action: 'set_text', text: getHistoryText(history[0]) };
          }
        } else {
          this.consecutiveUpPresses = 0;
        }
      } else if (this.state === STATE.NAVIGATING) {
        event.preventDefault();
        if (this.historyIndex < history.length - 1) {
          this.historyIndex++;
          return { action: 'set_text', text: getHistoryText(history[this.historyIndex]) };
        }
      }
      return null;
    }

    if (key === 'ArrowDown') {
      const atBottom = this.isAtBottomBoundary(textarea);

      if (this.state === STATE.NAVIGATING) {
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
        if (!atBottom) {
          this.consecutiveDownPresses = 0;
        }
      }
      return null;
    }

    // Any normal typing while in navigating mode exits navigating mode and accepts edit as draft
    if (this.state === STATE.NAVIGATING && key !== 'Shift' && key !== 'Control' && key !== 'Alt' && key !== 'Meta') {
      this.state = STATE.IDLE;
      this.historyIndex = -1;
      this.draft = '';
    }

    // Reset double press counters on any other key
    this.consecutiveUpPresses = 0;
    this.consecutiveDownPresses = 0;

    return null;
  }
}
