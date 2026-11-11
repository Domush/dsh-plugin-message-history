export const STATE = {
  IDLE: 'IDLE',
  NAVIGATING: 'NAVIGATING'
};

function getHistoryText(item) {
  if (!item) return '';
  return typeof item === 'string' ? item : (item.text || '');
}

export function normalizeText(str) {
  if (!str) return '';
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+/g, '\n').trim();
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
    this.isModified = false;
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
      if (this.state === STATE.NAVIGATING) {
        event.preventDefault();
        this.state = STATE.IDLE;
        const restored = this.draft;
        this.draft = '';
        this.historyIndex = -1;
        this.isModified = false;
        return { action: 'set_text', text: restored };
      }
      return null;
    }

    if (key === 'ArrowUp') {
      if (this.state === STATE.IDLE) {
        // If message box is empty, immediate single-press trigger
        if (!currentText.trim()) {
          event.preventDefault();
          this.state = STATE.NAVIGATING;
          this.draft = currentText;
          this.historyIndex = 0;
          this.isModified = false;
          return { action: 'set_text', text: getHistoryText(history[0]) };
        }

        // When text entered: only trigger when cursor is at position 0
        if (isCaretAtStart(textarea)) {
          event.preventDefault();
          this.state = STATE.NAVIGATING;
          this.draft = currentText;
          this.historyIndex = 0;
          this.isModified = false;
          return { action: 'set_text', text: getHistoryText(history[0]) };
        }

        // Cursor not at position 0: allow default behavior (scroll up / jump to 0)
        return null;
      }

      if (this.state === STATE.NAVIGATING) {
        const expectedText = getHistoryText(history[this.historyIndex]);
        const isUnmodified = !this.isModified || (normalizeText(currentText) === normalizeText(expectedText));

        // If prompt is unmodified, single press immediately changes to older history item
        // If modified, only navigate if cursor is at position 0
        if (isUnmodified || isCaretAtStart(textarea)) {
          event.preventDefault();
          if (this.historyIndex < history.length - 1) {
            this.historyIndex++;
            this.isModified = false;
            return { action: 'set_text', text: getHistoryText(history[this.historyIndex]) };
          }
          return null;
        }

        // Modified and not at position 0: allow default scrolling
        return null;
      }
    }

    if (key === 'ArrowDown') {
      if (this.state === STATE.NAVIGATING) {
        const expectedText = getHistoryText(history[this.historyIndex]);
        const isUnmodified = !this.isModified || (normalizeText(currentText) === normalizeText(expectedText));

        // If prompt is unmodified, single press immediately changes to newer history item or restores draft
        // If modified, only navigate if cursor is at very last position
        if (isUnmodified || isCaretAtEnd(textarea)) {
          event.preventDefault();
          if (this.historyIndex > 0) {
            this.historyIndex--;
            this.isModified = false;
            return { action: 'set_text', text: getHistoryText(history[this.historyIndex]) };
          } else if (this.historyIndex === 0) {
            // Return to draft
            this.state = STATE.IDLE;
            this.historyIndex = -1;
            this.isModified = false;
            const restored = this.draft;
            this.draft = '';
            return { action: 'set_text', text: restored };
          }
        }

        // Modified and not at end: allow default scrolling
        return null;
      }

      return null;
    }

    // Detect user editing in NAVIGATING mode
    if (this.state === STATE.NAVIGATING) {
      if (key === 'Backspace' || key === 'Delete' || key === 'Enter' || (key.length === 1 && !event.ctrlKey && !event.metaKey)) {
        this.isModified = true;
      }
    }

    return null;
  }
}
