import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MAX_HISTORY = 100;
const DEFAULT_STORAGE_PATH = path.join(os.homedir(), '.dsh', 'message-history.json');

export class HistoryStore {
  constructor(storagePath = DEFAULT_STORAGE_PATH) {
    this.storagePath = storagePath;
    this.history = [];
    this.ensureInitialized();
  }

  ensureInitialized() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        this.history = JSON.parse(raw);
        if (!Array.isArray(this.history)) {
          this.history = [];
        }
      }
    } catch (e) {
      this.history = [];
    }
  }

  save() {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.history, null, 2), 'utf8');
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
    if (this.history.length > 0 && this.history[0].text === trimmed) {
      return;
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
    const existing = new Set(this.history.map(item => item.text));

    for (const item of imported) {
      if (this.history.length >= MAX_HISTORY) break;
      if (!item.text || typeof item.text !== 'string' || !item.text.trim()) continue;
      const trimmed = item.text.trim();

      if (existing.has(trimmed)) continue;

      // Avoid consecutive duplicate in history list
      if (this.history.length > 0 && this.history[this.history.length - 1].text === trimmed) {
        continue;
      }

      this.history.push({
        text: trimmed,
        sessionId: item.sessionId || 'global',
        timestamp: item.timestamp || Date.now()
      });
      existing.add(trimmed);
      addedCount++;
    }

    this.save();
    return addedCount;
  }

  get(sessionId = null) {
    if (!sessionId) {
      return this.history.map(item => item.text);
    }

    // Return session items first, then fallback to others up to 100
    const sessionItems = [];
    const otherItems = [];
    const seen = new Set();

    for (const item of this.history) {
      if (item.sessionId === sessionId) {
        if (!seen.has(item.text)) {
          sessionItems.push(item.text);
          seen.add(item.text);
        }
      } else {
        if (!seen.has(item.text)) {
          otherItems.push(item.text);
          seen.add(item.text);
        }
      }
    }

    return [...sessionItems, ...otherItems].slice(0, MAX_HISTORY);
  }

  clear() {
    this.history = [];
    this.save();
  }
}
