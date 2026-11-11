import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MAX_HISTORY = 100;

export function getDefaultStoragePath() {
  const baseDir = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(baseDir, 'message-history.json');
}

export class HistoryStore {
  constructor(storagePath = null) {
    this.storagePath = storagePath || getDefaultStoragePath();
    this.history = [];
    this.ensureInitialized();
  }

  ensureInitialized() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.history = parsed.filter(item => item && typeof (typeof item === 'string' ? item : item.text) === 'string');
          } else {
            this.history = [];
          }
        } catch (parseErr) {
          // Backup corrupted file to prevent silent permanent loss
          try {
            fs.copyFileSync(this.storagePath, `${this.storagePath}.corrupted-${Date.now()}`);
          } catch {}
          this.history = [];
        }
      }
    } catch (e) {
      this.history = [];
    }
  }

  save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      // Atomic write pattern: write to secure unique temp file, then renameSync
      const tempPath = path.join(dir, `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      fs.writeFileSync(tempPath, JSON.stringify(this.history, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tempPath, this.storagePath);
    } catch (e) {
      // Best-effort write
    }
  }

  add(message, sessionId = 'global') {
    if (!message || typeof message !== 'string' || !message.trim()) {
      return;
    }

    const trimmed = message.trim();

    // Deduplication: Ignore consecutive duplicate
    if (this.history.length > 0) {
      const first = this.history[0];
      const firstText = typeof first === 'string' ? first : first?.text;
      if (firstText === trimmed) {
        return;
      }
    }

    this.history.unshift({
      text: trimmed,
      sessionId,
      timestamp: Date.now()
    });

    if (this.history.length > MAX_HISTORY) {
      this.history.length = MAX_HISTORY;
    }

    this.save();
  }

  mergeHistoricalMessages(imported) {
    if (!Array.isArray(imported) || imported.length === 0) return 0;

    let addedCount = 0;
    const existing = new Set(this.history.map(item => (typeof item === 'string' ? item : item?.text)).filter(Boolean));

    for (const item of imported) {
      if (this.history.length >= MAX_HISTORY) break;
      if (!item) continue;
      const rawText = typeof item === 'string' ? item : item.text;
      if (!rawText || typeof rawText !== 'string' || !rawText.trim()) continue;
      const trimmed = rawText.trim();

      if (existing.has(trimmed)) continue;

      // Avoid consecutive duplicate in history list
      if (this.history.length > 0) {
        const last = this.history[this.history.length - 1];
        const lastText = typeof last === 'string' ? last : last?.text;
        if (lastText === trimmed) {
          continue;
        }
      }

      this.history.push({
        text: trimmed,
        sessionId: (typeof item === 'object' && item.sessionId) ? item.sessionId : 'global',
        timestamp: (typeof item === 'object' && item.timestamp) ? item.timestamp : Date.now()
      });
      existing.add(trimmed);
      addedCount++;
    }

    this.save();
    return addedCount;
  }

  get(sessionId = null) {
    if (!sessionId) {
      return this.history.map(item => (typeof item === 'string' ? item : item?.text || '')).filter(Boolean);
    }

    // Return session items first, then fallback to others up to MAX_HISTORY
    const sessionItems = [];
    const otherItems = [];
    const seen = new Set();

    for (const item of this.history) {
      if (!item) continue;
      const text = typeof item === 'string' ? item : item.text;
      if (!text || seen.has(text)) continue;

      const itemSession = typeof item === 'object' ? item.sessionId : null;
      if (itemSession === sessionId) {
        sessionItems.push(text);
        seen.add(text);
      } else {
        otherItems.push(text);
        seen.add(text);
      }
    }

    return [...sessionItems, ...otherItems].slice(0, MAX_HISTORY);
  }

  clear() {
    this.history = [];
    this.save();
  }
}

