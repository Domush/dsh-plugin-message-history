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

test('HistoryNavigator - double press trigger when not empty', () => {
  const history = ['first prompt', 'second prompt'];
  const nav = new HistoryNavigator(() => history);

  const mockTextarea = { value: 'my draft', selectionStart: 0, selectionEnd: 0 };
  
  // First press: should not trigger
  let prevented = false;
  let res = nav.handleKeyDown({ key: 'ArrowUp', preventDefault() { prevented = true; } }, mockTextarea);
  assert.strictEqual(prevented, false);
  assert.strictEqual(nav.state, STATE.IDLE);
  assert.strictEqual(res, null);

  // Second press: triggers!
  res = nav.handleKeyDown({ key: 'ArrowUp', preventDefault() { prevented = true; } }, mockTextarea);
  assert.strictEqual(prevented, true);
  assert.strictEqual(nav.state, STATE.NAVIGATING);
  assert.deepStrictEqual(res, { action: 'set_text', text: 'first prompt' });
  assert.strictEqual(nav.draft, 'my draft');
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
