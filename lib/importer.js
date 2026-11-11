const MAX_HISTORY = 100;

export function extractUserMessageText(event) {
  if (!event || event.type !== 'user/message') return null;

  const source = event.data?.source;
  // Ignore tool outputs, automated context snapshots, and question-reply callbacks
  if (source && source.kind && source.kind !== 'user') {
    return null;
  }

  const content = event.data?.content || event.data?.message?.content;
  if (!Array.isArray(content)) return null;

  const textBlocks = content
    .filter(b => b && b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text.trim())
    .filter(Boolean);

  if (textBlocks.length === 0) return null;
  const fullText = textBlocks.join('\n');

  // Filter out system injections if unflagged
  if (
    fullText.startsWith('Current runtime context.') ||
    fullText.startsWith('Instructions from:') ||
    fullText.startsWith('A skill is a reusable set of task-specific instructions.')
  ) {
    return null;
  }

  return fullText;
}

export async function autoImportSessionHistory(ctx, store) {
  const sessionQuery = ctx.sessionQuery || ctx.get?.('sessionQuery');
  const sessionPersistence = ctx.sessionPersistence || ctx.get?.('sessionPersistence');

  if (!sessionQuery && !sessionPersistence) {
    return 0;
  }

  try {
    let sessionList = [];

    if (sessionQuery && typeof sessionQuery.listSessions === 'function') {
      sessionList = await sessionQuery.listSessions();
    } else if (sessionPersistence && typeof sessionPersistence.list === 'function') {
      sessionList = await sessionPersistence.list();
    }

    if (!Array.isArray(sessionList) || sessionList.length === 0) {
      return 0;
    }

    // Sort newest sessions first based on updatedAt / createdAt / time
    const sortedSessions = [...sessionList].sort((a, b) => {
      const timeA = a.updatedAt || a.createdAt || a.time || 0;
      const timeB = b.updatedAt || b.createdAt || b.time || 0;
      return timeB - timeA;
    });

    const collected = [];
    const seenTexts = new Set(store.history.map(item => item.text));

    for (const sessionRecord of sortedSessions) {
      if (collected.length >= MAX_HISTORY) break;

      const sessionId = sessionRecord.id;
      if (!sessionId) continue;

      let events = [];

      try {
        if (sessionQuery && typeof sessionQuery.readSession === 'function') {
          const res = await sessionQuery.readSession(sessionId);
          events = res?.events || [];
        } else if (sessionPersistence && typeof sessionPersistence.open === 'function') {
          const reader = await sessionPersistence.open(sessionId, 'read');
          const res = await reader.read();
          events = res?.events || [];
          if (typeof reader.close === 'function') {
            await reader.close();
          }
        }
      } catch (e) {
        // Continue with other sessions if one fails
        continue;
      }

      if (!Array.isArray(events) || events.length === 0) continue;

      // Extract user messages from newest to oldest in this session
      const sessionMessages = [];
      for (const ev of events) {
        const text = extractUserMessageText(ev);
        if (text) {
          sessionMessages.push({
            text,
            sessionId,
            timestamp: ev.time || Date.now()
          });
        }
      }

      // Reverse so newest in this session comes first
      sessionMessages.reverse();

      for (const msg of sessionMessages) {
        if (seenTexts.has(msg.text)) continue;

        // Skip consecutive duplicates in collection
        if (collected.length > 0 && collected[collected.length - 1].text === msg.text) {
          continue;
        }

        collected.push(msg);
        seenTexts.add(msg.text);

        if (collected.length >= MAX_HISTORY) break;
      }
    }

    if (collected.length > 0) {
      return store.mergeHistoricalMessages(collected);
    }

    return 0;
  } catch (err) {
    return 0;
  }
}
