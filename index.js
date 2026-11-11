import { HistoryStore } from './lib/store.js';
import { extractUserMessageText, autoImportSessionHistory } from './lib/importer.js';

export const name = 'dsh-plugin-message-history';
export const inject = ['webServer', 'connection'];

const MAX_BODY_BYTES = 64 * 1024; // 64 KB cap against DoS

export function apply(ctx) {
  const store = new HistoryStore();
  let inFlightImport = null;

  const triggerImport = () => {
    if (!inFlightImport) {
      inFlightImport = autoImportSessionHistory(ctx, store).finally(() => {
        inFlightImport = null;
      });
    }
    return inFlightImport;
  };

  // Best-effort initial auto-import of past messages
  triggerImport().catch(() => {});

  // Listen to live session events to continuously keep history populated across sessions
  ctx.on('session/event', (session, event) => {
    try {
      const text = extractUserMessageText(event);
      if (text) {
        store.add(text, session?.id || 'global');
      }
    } catch (e) {
      // Ignore
    }
  });

  // Handler for history API
  const handler = async (req, res) => {
    // Security fence: prevent CSRF
    if (ctx.connection?.requestRejection) {
      const rejection = ctx.connection.requestRejection(req);
      if (rejection) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: rejection }));
        return;
      }
    }

    const url = new URL(req.url, 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');

    // Manual re-import endpoint
    if ((url.pathname.endsWith('/import')) && req.method === 'POST') {
      const imported = await triggerImport();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, imported, total: store.history.length }));
      return;
    }

    if (req.method === 'GET') {
      const history = store.get(sessionId);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ history, total: store.history.length }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      let receivedBytes = 0;
      let aborted = false;

      req.on('data', chunk => {
        if (aborted) return;
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_BODY_BYTES) {
          aborted = true;
          res.statusCode = 413;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Payload too large' }));
          req.destroy();
          return;
        }
        body += chunk;
      });

      req.on('error', () => {
        if (!res.headersSent) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Request stream error' }));
        }
      });

      req.on('end', () => {
        if (aborted) return;
        try {
          const data = JSON.parse(body);
          if (data && typeof data.message === 'string' && data.message.trim()) {
            store.add(data.message, (typeof data.sessionId === 'string' ? data.sessionId : sessionId) || 'global');
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Method Not Allowed');
  };

  // Expose API for message history with lifecycle disposer
  if (ctx.webServer) {
    ctx.effect(() => {
      const disposers = [];
      try {
        disposers.push(ctx.webServer.register({
          kind: 'prefix',
          path: '/api/message-history-v2',
          handler
        }));
      } catch (e) {}

      try {
        disposers.push(ctx.webServer.register({
          kind: 'prefix',
          path: '/api/message-history',
          handler
        }));
      } catch (e) {}

      return () => {
        for (const dispose of disposers) {
          try { dispose(); } catch {}
        }
      };
    });
  }
}

