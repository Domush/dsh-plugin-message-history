import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { HistoryStore } from '../lib/store.js';
import { extractUserMessageText, autoImportSessionHistory } from '../lib/importer.js';

test('extractUserMessageText - extracts clean user text and filters unwanted events', () => {
  // Valid user message
  const userEvent = {
    type: 'user/message',
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'Hello, world!' }]
    }
  };
  assert.strictEqual(extractUserMessageText(userEvent), 'Hello, world!');

  // Tool message (should be ignored)
  const toolEvent = {
    type: 'user/message',
    data: {
      source: { kind: 'tool' },
      content: [{ type: 'text', text: 'Tool output' }]
    }
  };
  assert.strictEqual(extractUserMessageText(toolEvent), null);

  // Runtime context message (should be ignored)
  const contextEvent = {
    type: 'user/message',
    data: {
      source: { kind: 'runtime-context' },
      content: [{ type: 'text', text: 'Current runtime context. Snapshot...' }]
    }
  };
  assert.strictEqual(extractUserMessageText(contextEvent), null);

  // Assistant message (should be ignored)
  const assistantEvent = {
    type: 'assistant/message',
    data: {
      content: [{ type: 'text', text: 'I am an AI' }]
    }
  };
  assert.strictEqual(extractUserMessageText(assistantEvent), null);
});

test('HistoryStore - mergeHistoricalMessages backfills up to 100 without duplicates', () => {
  const tmpPath = path.join(os.tmpdir(), `test-hist-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new HistoryStore(tmpPath);

  // Pre-seed with one message
  store.add('Latest manual prompt', 'session-1');
  assert.strictEqual(store.history.length, 1);

  const imported = [
    { text: 'Latest manual prompt', sessionId: 'session-1' }, // duplicate of existing
    { text: 'Older prompt 1', sessionId: 'session-1' },
    { text: 'Older prompt 2', sessionId: 'session-2' },
    { text: 'Older prompt 2', sessionId: 'session-2' }, // consecutive duplicate
    { text: 'Older prompt 3', sessionId: 'session-2' }
  ];

  const added = store.mergeHistoricalMessages(imported);
  assert.strictEqual(added, 3);
  assert.strictEqual(store.history.length, 4);

  // History order check: index 0 remains the latest prompt
  assert.strictEqual(store.history[0].text, 'Latest manual prompt');
  assert.strictEqual(store.history[1].text, 'Older prompt 1');
  assert.strictEqual(store.history[2].text, 'Older prompt 2');
  assert.strictEqual(store.history[3].text, 'Older prompt 3');

  // Clean up
  try { fs.unlinkSync(tmpPath); } catch {}
});

test('autoImportSessionHistory - reads sessions newest-first and populates history store up to 100', async () => {
  const tmpPath = path.join(os.tmpdir(), `test-import-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new HistoryStore(tmpPath);

  // Mock sessionQuery with two sessions
  const mockCtx = {
    sessionQuery: {
      async listSessions() {
        return [
          { id: 'sess-current', updatedAt: 2000 },
          { id: 'sess-previous', updatedAt: 1000 }
        ];
      },
      async readSession(id) {
        if (id === 'sess-current') {
          return {
            events: [
              {
                type: 'user/message',
                data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Current session msg 1' }] }
              },
              {
                type: 'user/message',
                data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Current session msg 2' }] }
              }
            ]
          };
        }
        if (id === 'sess-previous') {
          return {
            events: [
              {
                type: 'user/message',
                data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Prev session msg 1' }] }
              }
            ]
          };
        }
        return { events: [] };
      }
    }
  };

  const count = await autoImportSessionHistory(mockCtx, store);
  assert.strictEqual(count, 3);
  assert.strictEqual(store.history.length, 3);

  // Newest messages from current session should come first
  assert.strictEqual(store.history[0].text, 'Current session msg 2');
  assert.strictEqual(store.history[1].text, 'Current session msg 1');
  assert.strictEqual(store.history[2].text, 'Prev session msg 1');

  // Clean up
  try { fs.unlinkSync(tmpPath); } catch {}
});
