export const STATE = {
  IDLE: 'IDLE',
  NAVIGATING: 'NAVIGATING'
};

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
    const value = textarea.value;
    const selectionStart = textarea.selectionStart;
    
    // If empty or cursor is at the very beginning
    if (selectionStart === 0) return true;
    
    // Check if cursor is on the first line
    const textBefore = value.substring(0, selectionStart);
    return !textBefore.includes('\n');
  }

  isAtBottomBoundary(textarea) {
    if (!textarea) return true;
    const value = textarea.value;
    const selectionEnd = textarea.selectionEnd;
    
    // Cursor at the very end
    if (selectionEnd === value.length) return true;
    
    // Check if cursor is on the last line
    const textAfter = value.substring(selectionEnd);
    return !textAfter.includes('\n');
  }

  handleKeyDown(event, textarea) {
    const key = event.key;
    const history = this.getHistory();

    if (history.length === 0) {
      return null;
    }

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
        if (!textarea.value) {
          event.preventDefault();
          this.state = STATE.NAVIGATING;
          this.draft = '';
          this.historyIndex = 0;
          return { action: 'set_text', text: history[0] };
        }

        if (atTop) {
          this.consecutiveUpPresses++;
          if (this.consecutiveUpPresses >= 2) {
            event.preventDefault();
            this.state = STATE.NAVIGATING;
            this.draft = textarea.value;
            this.historyIndex = 0;
            this.consecutiveUpPresses = 0;
            return { action: 'set_text', text: history[0] };
          }
        } else {
          this.consecutiveUpPresses = 0;
        }
      } else if (this.state === STATE.NAVIGATING) {
        event.preventDefault();
        if (this.historyIndex < history.length - 1) {
          this.historyIndex++;
          return { action: 'set_text', text: history[this.historyIndex] };
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
          return { action: 'set_text', text: history[this.historyIndex] };
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
    if (this.state === STATE.NAVIGATING && key !== 'Shift' && key !== 'Control' && key !== 'Alt') {
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
