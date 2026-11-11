import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';

const MAX_HISTORY = 100;
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/**
 * Clean raw message text by stripping ACP tags, system reminders, and context metadata.
 */
export function cleanMessageText(text) {
  if (!text || typeof text !== 'string') return null;

  let clean = text.replace(/<acp\b[^>]*>[\s\S]*?<\/acp>\s*/gi, '').trim();
  clean = clean.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/gi, '').trim();

  if (!clean) return null;

  // Filter out system injections
  if (
    clean.startsWith('Current runtime context.') ||
    clean.startsWith('Instructions from:') ||
    clean.startsWith('A skill is a reusable set of task-specific instructions.') ||
    clean.startsWith('Time sampled while preparing turn') ||
    clean.startsWith('The user changed the approval policy')
  ) {
    return null;
  }

  return clean;
}

/**
 * Extract clean user message text from a SessionEvent.
 */
export function extractUserMessageText(event) {
  if (!event || event.type !== 'user/message') return null;

  const source = event.data?.source;
  // Ignore tool outputs and automated question-reply callbacks
  if (source && source.kind && source.kind !== 'user') {
    return null;
  }

  const content = event.data?.content || event.data?.message?.content;
  if (!Array.isArray(content)) return null;

  const textBlocks = content
    .filter(b => b && b.type === 'text' && typeof b.text === 'string')
    .map(b => cleanMessageText(b.text))
    .filter(Boolean);

  if (textBlocks.length === 0) return null;
  return textBlocks.join('\n');
}

/**
 * Decompress multi-frame zstd buffer produced by DSH append-only session streams.
 */
export function decompressMultiFrameZstd(buf) {
  if (!buf || buf.length < 4) return '';

  const offsets = [];
  let pos = 0;
  while (pos < buf.length) {
    const idx = buf.indexOf(ZSTD_MAGIC, pos);
    if (idx === -1) break;
    offsets.push(idx);
    pos = idx + 4;
  }
  offsets.push(buf.length);

  let output = '';
  for (let i = 0; i < offsets.length - 1; i++) {
    const frame = buf.subarray(offsets[i], offsets[i + 1]);
    try {
      output += zlib.zstdDecompressSync(frame).toString('utf8') + '\n';
    } catch (e) {
      // Continue with remaining frames
    }
  }
  return output;
}

/**
 * Automatically backfill message history from stored DSH sessions (newest first).
 */
export async function autoImportSessionHistory(ctx, store, customDir = null) {
  try {
    const collected = [];
    const seen = new Set(store.history.map(item => item.text));

    // Method 1: Mock or live sessionQuery if explicitly provided
    if (ctx && ctx.sessionQuery && typeof ctx.sessionQuery.listSessions === 'function') {
      const sessions = await ctx.sessionQuery.listSessions();
      if (Array.isArray(sessions)) {
        for (const session of sessions) {
          if (collected.length >= MAX_HISTORY) break;
          const sessionId = session.id || session.sessionId;
          if (!sessionId) continue;

          try {
            const data = await ctx.sessionQuery.readSession(sessionId);
            const events = data?.events || [];
            const userMessages = [];

            for (const ev of events) {
              const text = extractUserMessageText(ev);
              if (text) {
                userMessages.push(text);
              }
            }

            for (let i = userMessages.length - 1; i >= 0; i--) {
              const text = userMessages[i];
              if (!seen.has(text)) {
                seen.add(text);
                collected.push({
                  text,
                  sessionId,
                  timestamp: session.updatedAt || session.createdAt || Date.now()
                });
                if (collected.length >= MAX_HISTORY) break;
              }
            }
          } catch (e) {}
        }

        if (collected.length > 0) {
          return store.mergeHistoricalMessages(collected);
        }
      }
    }

    // Method 2: Fast multi-frame zstd directory scan
    const baseDir = customDir || path.join(os.homedir(), '.dsh', 'sessions');
    if (fs.existsSync(baseDir)) {
      const sessionFiles = [];

      function scanDir(dir) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              scanDir(fullPath);
            } else if (entry.name.endsWith('.jsonl.zstd')) {
              try {
                const stat = fs.statSync(fullPath);
                sessionFiles.push({ file: fullPath, mtime: stat.mtimeMs });
              } catch (e) {}
            }
          }
        } catch (e) {}
      }

      scanDir(baseDir);
      sessionFiles.sort((a, b) => b.mtime - a.mtime);

      for (const item of sessionFiles) {
        if (collected.length >= MAX_HISTORY) break;

        try {
          const buf = fs.readFileSync(item.file);
          const rawText = decompressMultiFrameZstd(buf);
          const lines = rawText.split('\n');

          const sessionMsgs = [];
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line);
              const text = extractUserMessageText(obj);
              if (text) {
                sessionMsgs.push(text);
              }
            } catch (e) {}
          }

          for (let i = sessionMsgs.length - 1; i >= 0; i--) {
            const text = sessionMsgs[i];
            if (!seen.has(text)) {
              seen.add(text);
              collected.push({
                text,
                sessionId: path.basename(path.dirname(item.file)),
                timestamp: item.mtime
              });
              if (collected.length >= MAX_HISTORY) break;
            }
          }
        } catch (e) {}
      }

      if (collected.length > 0) {
        return store.mergeHistoricalMessages(collected);
      }
    }

    return 0;
  } catch (err) {
    return 0;
  }
}
