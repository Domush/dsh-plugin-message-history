import { HistoryStore } from './lib/store.js';
import { extractUserMessageText, autoImportSessionHistory } from './lib/importer.js';

export const name = 'dsh-plugin-message-history';
export const inject = ['webServer', 'connection', 'sessionQuery'];

export function apply(ctx) {
  const store = new HistoryStore();

  // Auto-import historical messages from current and previous sessions upon activation
  autoImportSessionHistory(ctx, store).catch(() => {});

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

  // Expose API for message history
  ctx.webServer.register({
    kind: 'prefix',
    path: '/api/message-history',
    async handler(req, res) {
      // Security fence: prevent CSRF
      if (ctx.connection?.requestRejection) {
        const rejection = ctx.connection.requestRejection(req);
        if (rejection) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: rejection }));
          return;
        }
      }

      const url = new URL(req.url, 'http://localhost');
      const sessionId = url.searchParams.get('sessionId');

      // Manual re-import endpoint
      if (url.pathname === '/api/message-history/import' && req.method === 'POST') {
        const imported = await autoImportSessionHistory(ctx, store);
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
        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.message) {
              store.add(data.message, data.sessionId || sessionId || 'global');
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      res.statusCode = 405;
      res.end('Method Not Allowed');
    }
  });
}
