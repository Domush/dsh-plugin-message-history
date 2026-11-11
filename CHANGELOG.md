# Changelog

All notable changes to `dsh-plugin-message-history` will be documented in this file.

## [1.0.0] - 2026-11-10

### Added
- Initial implementation of `dsh-plugin-message-history`.
- Host-side persistent JSON store in `~/.dsh/message-history.json` for up to 100 messages.
- Double-press boundary detection logic for Up/Down arrow navigation.
- Draft preservation and restoration via Escape.
- Client-side DOM interception for textarea input fields.
