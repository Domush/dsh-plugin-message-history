import test from 'node:test';
import assert from 'node:assert';
import { HistoryNavigator, STATE } from '../lib/navigator.js';

test('HistoryNavigator - immediate trigger when empty', () => {
  const history = ['first prompt', 'second prompt'];
  const nav = new HistoryNavigator(() => history);

  const mockTextarea = { value: '', selectionStart: 0, selectionEnd: 0 };
  let prevented = false;
  const event = {
    key: 'ArrowUp',
    preventDefault() { prevented = true; }
  };

  const res = nav.handleKeyDown(event, mockTextarea);
  assert.strictEqual(prevented, true);
  assert.strictEqual(nav.state, STATE.NAVIGATING);
  assert.deepStrictEqual(res, { action: 'set_text', text: 'first prompt' });
});

test('HistoryNavigator - does NOT trigger if cursor is not at position 0 (e.g. char 50)', () => {
  const history = ['first prompt', 'second prompt'];
  const nav = new HistoryNavigator(() => history);

  const mockTextarea = { value: 'line 1\nline 2 with char 50', selectionStart: 15, selectionEnd: 15 };
  
  let prevented = false;
  const res = nav.handleKeyDown({ key: 'ArrowUp', preventDefault() { prevented = true; } }, mockTextarea);
  assert.strictEqual(prevented, false);
  assert.strictEqual(nav.state, STATE.IDLE);
  assert.strictEqual(res, null);
});

test('HistoryNavigator - double press trigger when cursor is at position 0', () => {
  const history = ['first prompt', 'second prompt'];
  const nav = new HistoryNavigator(() => history);

  const mockTextarea = { value: 'my draft', selectionStart: 0, selectionEnd: 0 };
  
  // First press at position 0: should not trigger
  let prevented = false;
  let res = nav.handleKeyDown({ key: 'ArrowUp', preventDefault() { prevented = true; } }, mockTextarea);
  assert.strictEqual(prevented, false);
  assert.strictEqual(nav.state, STATE.IDLE);
  assert.strictEqual(res, null);

  // Second press at position 0: triggers!
  res = nav.handleKeyDown({ key: 'ArrowUp', preventDefault() { prevented = true; } }, mockTextarea);
  assert.strictEqual(prevented, true);
  assert.strictEqual(nav.state, STATE.NAVIGATING);
  assert.deepStrictEqual(res, { action: 'set_text', text: 'first prompt' });
  assert.strictEqual(nav.draft, 'my draft');
});

test('HistoryNavigator - down arrow double press at very last position restores draft', () => {
  const history = ['history 1'];
  const nav = new HistoryNavigator(() => history);

  const mockTextarea = { value: 'my draft', selectionStart: 0, selectionEnd: 0 };
  // Trigger navigation
  nav.handleKeyDown({ key: 'ArrowUp', preventDefault() {} }, mockTextarea);
  nav.handleKeyDown({ key: 'ArrowUp', preventDefault() {} }, mockTextarea);
  assert.strictEqual(nav.state, STATE.NAVIGATING);

  // When viewing history 1, if cursor is not at end:
  const viewingMock = { value: 'history 1', selectionStart: 2, selectionEnd: 2 };
  let prevented = false;
  let res = nav.handleKeyDown({ key: 'ArrowDown', preventDefault() { prevented = true; } }, viewingMock);
  assert.strictEqual(prevented, false);
  assert.strictEqual(nav.state, STATE.NAVIGATING);

  // Cursor moves to very last position (char 9):
  viewingMock.selectionStart = 9;
  viewingMock.selectionEnd = 9;
  // First press at end:
  res = nav.handleKeyDown({ key: 'ArrowDown', preventDefault() { prevented = true; } }, viewingMock);
  assert.strictEqual(prevented, false);
  assert.strictEqual(nav.state, STATE.NAVIGATING);

  // Second press at end: restores draft!
  res = nav.handleKeyDown({ key: 'ArrowDown', preventDefault() { prevented = true; } }, viewingMock);
  assert.strictEqual(prevented, true);
  assert.strictEqual(nav.state, STATE.IDLE);
  assert.deepStrictEqual(res, { action: 'set_text', text: 'my draft' });
});

test('HistoryNavigator - escape cancels and restores draft', () => {
  const history = ['first prompt'];
  const nav = new HistoryNavigator(() => history);
  const mockTextarea = { value: 'initial text', selectionStart: 0, selectionEnd: 0 };

  nav.handleKeyDown({ key: 'ArrowUp', preventDefault() {} }, mockTextarea);
  nav.handleKeyDown({ key: 'ArrowUp', preventDefault() {} }, mockTextarea);
  assert.strictEqual(nav.state, STATE.NAVIGATING);

  // Press escape
  let prevented = false;
  const res = nav.handleKeyDown({ key: 'Escape', preventDefault() { prevented = true; } }, mockTextarea);
  assert.strictEqual(prevented, true);
  assert.strictEqual(nav.state, STATE.IDLE);
  assert.deepStrictEqual(res, { action: 'set_text', text: 'initial text' });
});
