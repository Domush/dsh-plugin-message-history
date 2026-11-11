import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';

const MAX_HISTORY = 100;
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

export function cleanMessageText(text) {
  if (!text || typeof text !== 'string') return null;
  let clean = text.replace(/<acp\b[^>]*>[\s\S]*?<\/acp>\s*/gi, '').trim();
  clean = clean.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/gi, '').trim();
  if (!clean) return null;
  if (clean.startsWith('Current runtime context.') || clean.startsWith('Instructions from:') || clean.startsWith('A skill is a reusable set of task-specific instructions.') || clean.startsWith('Time sampled while preparing turn') || clean.startsWith('The user changed the approval policy')) return null;
  return clean;
}

export function extractUserMessageText(event) {
  if (!event || event.type !== 'user/message') return null;
  const source = event.data?.source;
  if (source && source.kind && source.kind !== 'user') return null;
  const content = event.data?.content || event.data?.message?.content;
  if (!Array.isArray(content)) return null;
  const textBlocks = content.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => cleanMessageText(b.text)).filter(Boolean);
  if (textBlocks.length === 0) return null;
  return textBlocks.join('\n');
}

export function decompressMultiFrameZstd(buf) {
  if (!buf || buf.length < 4) return '';
  if (typeof zlib.zstdDecompressSync !== 'function') return '';
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
    if (frame.length > 5 * 1024 * 1024) continue; // Skip suspicious huge frame
    try {
      const decompressed = zlib.zstdDecompressSync(frame);
      if (decompressed.length <= 10 * 1024 * 1024) { // 10 MB ceiling against decompression bombs
        output += decompressed.toString('utf8') + '\n';
      }
    } catch (e) {}
  }
  return output;
}

export async function autoImportSessionHistory(ctx, store, customDir = null) {
  try {
    const collected = [];
    const seen = new Set(store.history.map(item => (typeof item === 'string' ? item : item?.text)).filter(Boolean));
    
    // Method 1: Mock or live sessionQuery
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
              if (text) userMessages.push(text);
            }
            for (let i = userMessages.length - 1; i >= 0; i--) {
              const text = userMessages[i];
              if (!seen.has(text)) {
                seen.add(text);
                collected.push({ text, sessionId, timestamp: session.updatedAt || session.createdAt || Date.now() });
                if (collected.length >= MAX_HISTORY) break;
              }
            }
          } catch (e) {}
        }
      }
    }

    // Method 2: Fallback scan only if not method 1 populated, or if customDir provided
    if (collected.length === 0 || customDir) {
        const baseDir = customDir || (process.env.DSH_HOME ? path.join(process.env.DSH_HOME, 'sessions') : path.join(os.homedir(), '.dsh', 'sessions'));
        if (fs.existsSync(baseDir)) {
          const sessionFiles = [];
          const visited = new Set();

          function scanDir(dir, depth = 0) {
            if (depth > 3) return; // Prevent excessive deep traversal
            try {
              const real = fs.realpathSync(dir);
              if (visited.has(real)) return;
              visited.add(real);

              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isSymbolicLink()) continue; // Skip symlinks to avoid loops
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  scanDir(fullPath, depth + 1);
                } else if (entry.name.endsWith('.jsonl.zstd')) {
                  try {
                    const stat = fs.statSync(fullPath);
                    if (stat.size <= 20 * 1024 * 1024) { // Cap at 20 MB per session file
                      sessionFiles.push({ file: fullPath, mtime: stat.mtimeMs });
                    }
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
              const text = decompressMultiFrameZstd(buf);
              if (!text) continue;
              const lines = text.trim().split('\n');
              for (let j = lines.length - 1; j >= 0; j--) {
                if (collected.length >= MAX_HISTORY) break;
                const line = lines[j].trim();
                if (!line) continue;
                try {
                  const obj = JSON.parse(line);
                  const userText = extractUserMessageText(obj);
                  if (userText && !seen.has(userText)) {
                    seen.add(userText);
                    collected.push({ text, sessionId: path.basename(path.dirname(item.file)), timestamp: item.mtime });
                  }
                } catch (e) {}
              }
            } catch (e) {}
          }
        }
    }

    if (collected.length > 0) return store.mergeHistoricalMessages(collected);
    return 0;
  } catch (err) { return 0; }
}

