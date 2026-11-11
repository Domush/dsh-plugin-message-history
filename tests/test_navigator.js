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

test('HistoryNavigator - does NOT trigger if cursor is not at position 0 (e.g. char 15)', () => {
  const history = ['first prompt', 'second prompt'];
  const nav = new HistoryNavigator(() => history);

  const mockTextarea = { value: 'line 1\nline 2 with char 15', selectionStart: 15, selectionEnd: 15 };
  
  let prevented = false;
  const res = nav.handleKeyDown({ key: 'ArrowUp', preventDefault() { prevented = true; } }, mockTextarea);
  assert.strictEqual(prevented, false);
  assert.strictEqual(nav.state, STATE.IDLE);
  assert.strictEqual(res, null);
});

test('HistoryNavigator - single press trigger when cursor is at position 0', () => {
  const history = ['first prompt', 'second prompt'];
  const nav = new HistoryNavigator(() => history);

  const mockTextarea = { value: 'my draft', selectionStart: 0, selectionEnd: 0 };
  
  // Single press at position 0 immediately triggers
  let prevented = false;
  const res = nav.handleKeyDown({ key: 'ArrowUp', preventDefault() { prevented = true; } }, mockTextarea);
  assert.strictEqual(prevented, true);
  assert.strictEqual(nav.state, STATE.NAVIGATING);
  assert.deepStrictEqual(res, { action: 'set_text', text: 'first prompt' });
  assert.strictEqual(nav.draft, 'my draft');
});

test('HistoryNavigator - unmodified multi-line history item changes immediately without scrolling to top', () => {
  const history = ['first prompt line 1\nline 2\nline 3', 'second prompt'];
  const nav = new HistoryNavigator(() => history);

  // Trigger into first prompt
  const mockTextarea = { value: '', selectionStart: 0, selectionEnd: 0 };
  nav.handleKeyDown({ key: 'ArrowUp', preventDefault() {} }, mockTextarea);
  assert.strictEqual(nav.state, STATE.NAVIGATING);
  assert.strictEqual(nav.historyIndex, 0);

  // Even if cursor is at the end of the 3-line prompt (e.g. char 25):
  const multiLineMock = {
    value: 'first prompt line 1\nline 2\nline 3',
    selectionStart: 25,
    selectionEnd: 25
  };

  // Up Arrow immediately advances to next history item without moving cursor to top!
  let prevented = false;
  const res = nav.handleKeyDown({ key: 'ArrowUp', preventDefault() { prevented = true; } }, multiLineMock);
  assert.strictEqual(prevented, true);
  assert.strictEqual(nav.historyIndex, 1);
  assert.deepStrictEqual(res, { action: 'set_text', text: 'second prompt' });

  // Down Arrow immediately goes back down without moving cursor to bottom!
  const secondMock = { value: 'second prompt', selectionStart: 5, selectionEnd: 5 };
  prevented = false;
  const downRes = nav.handleKeyDown({ key: 'ArrowDown', preventDefault() { prevented = true; } }, secondMock);
  assert.strictEqual(prevented, true);
  assert.strictEqual(nav.historyIndex, 0);
  assert.deepStrictEqual(downRes, { action: 'set_text', text: 'first prompt line 1\nline 2\nline 3' });
});

test('HistoryNavigator - escape cancels and restores draft', () => {
  const history = ['first prompt'];
  const nav = new HistoryNavigator(() => history);
  const mockTextarea = { value: 'initial text', selectionStart: 0, selectionEnd: 0 };

  nav.handleKeyDown({ key: 'ArrowUp', preventDefault() {} }, mockTextarea);
  assert.strictEqual(nav.state, STATE.NAVIGATING);

  // Press escape
  let prevented = false;
  const res = nav.handleKeyDown({ key: 'Escape', preventDefault() { prevented = true; } }, mockTextarea);
  assert.strictEqual(prevented, true);
  assert.strictEqual(nav.state, STATE.IDLE);
  assert.deepStrictEqual(res, { action: 'set_text', text: 'initial text' });
});
