# Changelog

All notable changes to `dsh-plugin-message-history` will be documented in this file.

## [1.0.5] - 2026-11-10

### Security
- **DoS Protection**: Enforced 64 KB payload size cap on HTTP POST endpoints to prevent memory exhaustion and denial of service.
- **Decompression Bounds**: Implemented memory limits and size ceilings on Zstd multi-frame decompression in session importer to guard against decompression bombs.
- **File Permissions**: Set restricted file permissions (`0600` for file, `0700` for directory) on history store to protect sensitive prompts.
- **Safe Directory Traversal**: Bounded session search depth to 3 and excluded symbolic links to prevent infinite traversal loops.

### Fixed
- **Atomic Persistence**: Switched to write-to-temp and atomic rename in `HistoryStore` to prevent data corruption during abrupt crashes, and added corrupted backup recovery.
- **Input Scope Isolation**: Restricted composer element lookup in `client.js` to avoid intercepting keydowns on unrelated textareas, search inputs, or modal forms.
- **Multi-Session State**: Reset navigation state machine when `sessionId` changes, and eliminated global singleton state leak across simultaneous sessions.
- **Event Listener Duplication**: Added `stopImmediatePropagation` to prevent double-advancing history items when multiple mount points exist.
- **Rich Editor Safety**: Replaced destructive DOM fallback with safe `InputEvent` dispatching to preserve Lexical virtual DOM trees.
- **CI/CD Publish Race**: Removed redundant `release` trigger in GitHub Actions workflow to prevent version conflicts when publishing on tag pushes, and enabled `--provenance`.

### Changed
- **Node Engine Requirement**: Declared `"engines": { "node": ">=22.0.0" }` in `package.json` for native Zstd decompression support.
- **Service Injections**: Removed unused `sessionPersistence` injection from plugin definition.

## [1.0.4] - 2026-11-10

### Fixed
- **Multi-line Navigation**: Fixed bug where scrolling through multi-line history items required cursor to be at boundaries; now flips immediately for unmodified prompts.
- **Normalization**: Added robust text normalization to handle Lexical paragraph DOM formatting differences during string comparison.
- **Modification State**: Introduced explicit `isModified` tracking to decouple history flipping from cursor position.

## [1.0.3] - 2026-11-10

### Fixed
- **Navigation UX**: Removed double-press requirement. Navigation now triggers on single press when at boundary or in empty composer.
- **Workflow**: Immediate history flipping for unmodified prompts.
- **Lexical/Composer**: Robust detection and interaction with Lexical `contenteditable` chat composers via DSH `inputActions.setDraft` API.

## [1.0.2] - 2026-11-10

### Fixed
- Fixed Cordis webserver route registration lifecycle with `ctx.effect` cleanup.
- Added dual endpoint fallback for high-availability hot reloading.

## [1.0.1] - 2026-11-10

### Added
- Auto-importing of message history from stored session files.
- Real-time `session/event` listener on the host.

## [1.0.0] - 2026-11-10

### Added
- Initial implementation of `dsh-plugin-message-history`.
- Persistent storage in `~/.dsh/message-history.json`.
- Draft preservation and restoration.
