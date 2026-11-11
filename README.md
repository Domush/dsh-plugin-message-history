# dsh-plugin-message-history

[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-blue.svg)](https://github.com/deepseek-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A native DeepSeek Harness plugin that provides terminal-style message history navigation via the Up and Down arrow keys.

## Features

- **Auto-Import on Activation**: Automatically scans and imports input history from the current and previous sessions upon plugin activation (up to the 100 message limit), ordered newest to oldest.
- **Continuous Live Sync**: Real-time event listener tracks newly submitted prompts across all active sessions.
- **Double-Press Boundary Guard**: To avoid interfering with normal text editing, `ArrowUp` and `ArrowDown` only trigger when the input box is empty, or when double-pressed at the very top/bottom line of a multi-line message box.
- **Draft Preservation**: Automatically saves your unsent draft before navigating history, and restores it if you press `Escape` or navigate back down past the most recent message.
- **Persistent Storage**: Retains the last 100 sent messages on the host (`~/.dsh/message-history.json`), surviving browser tab reloads, restarts, and session switches.
- **Deduplication**: Automatically ignores consecutive duplicates and whitespace-only submissions.

## Installation

1. Open DeepSeek Harness Settings -> Plugins.
2. Search for `dsh-plugin-message-history` or install via local bundle.
