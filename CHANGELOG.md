# Changelog

All notable changes to `dsh-plugin-message-history` will be documented in this file.

## [1.0.2] - 2026-11-10

### Fixed
- Fixed Cordis webserver route registration lifecycle with `ctx.effect` cleanup to prevent duplicate route collisions during hot-reloads.
- Fixed Cordis patch YAML sequence format for `- insert:`.
- Added dual endpoint fallback (`/api/message-history-v2` and `/api/message-history`) for high-availability hot reloading.

## [1.0.1] - 2026-11-10

### Added
- Auto-importing of message history from the current and previous sessions upon plugin activation (up to 100 messages) using DSH `sessionQuery` / `sessionPersistence`.
- Real-time `session/event` listener on the host to continuously populate the history buffer as messages are sent.
- React-compatible synthetic value setter (`setNativeValue`) in client textarea interception.
- Manual re-import endpoint (`POST /api/message-history/import`).

## [1.0.0] - 2026-11-10

### Added
- Initial implementation of `dsh-plugin-message-history`.
- Host-side persistent JSON store in `~/.dsh/message-history.json` for up to 100 messages.
- Double-press boundary detection logic for Up/Down arrow navigation.
- Draft preservation and restoration via Escape.
- Client-side DOM interception for textarea input fields.
