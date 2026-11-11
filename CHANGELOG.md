# Changelog

All notable changes to `dsh-plugin-message-history` will be documented in this file.

## [1.0.3] - 2026-11-10

### Fixed
- **Navigation UX**: Removed double-press requirement. Navigation now triggers on single press when at boundary or in empty composer.
- **Workflow**: Immediate history flipping for unmodified prompts (no need to scroll to top/bottom).
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
