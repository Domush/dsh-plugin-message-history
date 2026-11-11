# dsh-plugin-message-history

[![npm version](https://img.shields.io/npm/v/dsh-plugin-message-history.svg)](https://www.npmjs.com/package/dsh-plugin-message-history)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-blue.svg)](https://github.com/deepseek-ai)
[![Node >= 20](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests Passing](https://img.shields.io/badge/Tests-8%2F8%20Passing-brightgreen.svg)](tests/)

A native [DeepSeek Harness (DSH)](https://github.com/deepseek-ai) plugin that provides shell-style message history navigation via the **Up** and **Down** arrow keys directly in the DSH chat composer.

---

## Why Message History?

In terminal shells (Bash, Zsh, PowerShell), pressing `ArrowUp` allows you to instantly cycle through past commands, modify previous inputs, or re-run complex directives. In standard AI chat web interfaces, this capability is typically missing or broken:
- Prompts previously sent are lost from the input buffer.
- Attempting to scroll up within a multi-line message can accidentally trigger unwanted navigation.
- In-progress drafts can be permanently lost if a keystroke navigates away before sending.

`dsh-plugin-message-history` brings native, boundary-aware, shell-grade prompt recall into the DeepSeek Harness Web UI with zero dependencies, local-first persistence, and seamless Lexical editor integration.

---

## Key Features

- **Intuitive Single-Press Navigation**:
  - **Empty Composer**: Pressing `ArrowUp` immediately pulls up your most recent prompt.
  - **While Drafting**: If you have entered single-line or multi-line text, pressing `ArrowUp` moves the caret upward naturally so you can scroll and edit. Only when the caret reaches **character 0** (the very top) does a single press of `ArrowUp` save your draft and enter history navigation.
  - **Seamless Flipping**: Once browsing history, pressing `ArrowUp` or `ArrowDown` flips instantly through history items on a single press. No need to scroll to the top or bottom of multi-line prompts to change items.
- **Draft Preservation & Cancellation**:
  - Automatically saves whatever you were typing before entering history navigation.
  - Pressing `Escape` or navigating back down past the most recent item instantly restores your exact draft.
- **Lexical & ContentEditable Native Binding**:
  - Designed specifically for DSH's Lexical-based chat composer (`div[data-composer-input="true"]`).
  - Directly drives DSH's native `props.inputActions.setDraft(text)` API to update state, clear Lexical blocks, and synchronize React input state without DOM desynchronization or focus loss.
- **High-Performance Zstd Backfill**:
  - Automatically scans stored session files (`session.v4.jsonl.zstd`) across all workspace sessions upon activation.
  - Implements a native, memory-safe reverse streaming scanner that reads concatenated Zstandard frames newest-first and exits as soon as 100 historical prompts are loaded.
- **Real-Time Live Event Sync**:
  - Subscribes to host `session/event` streams to capture newly submitted prompts in real time across any session, tab, or window.
- **Zero External Dependencies**:
  - Built strictly using Node.js core modules (`node:fs`, `node:path`, `node:os`, `node:zlib`) and standard web APIs.

---

## How It Works

### Navigation State Machine

```
                   [ User enters empty composer ]
                                 │
                                 ▼ (ArrowUp)
       ┌───────────────────► [ NAVIGATING ] ◄──────────────────┐
       │                       │       │                       │
(ArrowUp at pos 0)             │       │               (ArrowUp/ArrowDown)
       │                       │       │                       │
 [ DRAFTING (Text > 0) ]       │       ▼ (ArrowDown past 0)    ▼
       ▲                       │    [ Restores Draft ] ──► [ IDLE ]
       │                       │
  (Typing / Edits)             ▼ (Escape)
       └────────────────── [ Restores Draft ] ──────────► [ IDLE ]
```

### Caret & Boundary Rules

| State | Action | Caret Position | Result |
| :--- | :--- | :--- | :--- |
| **Empty Input** | `ArrowUp` | Anywhere | Immediately loads latest prompt (history index 0). |
| **Drafting Text** | `ArrowUp` | Not at position 0 | Default browser behavior (moves cursor up / scrolls). |
| **Drafting Text** | `ArrowUp` | At character 0 | Saves draft and loads latest history prompt. |
| **Viewing History** | `ArrowUp` | Anywhere (unmodified) | Immediately flips to next older history prompt. |
| **Viewing History** | `ArrowDown` | Anywhere (unmodified) | Immediately flips to newer history prompt (or restores draft). |
| **Viewing History** | `ArrowUp` | Modified text | Scrolls up; only flips to older history if caret reaches position 0. |
| **Viewing History** | `ArrowDown` | Modified text | Scrolls down; only flips newer/restores draft if caret reaches end. |
| **Any History State** | `Escape` | Anywhere | Cancels navigation and restores original draft. |

---

## Installation

### Method 1: DSH Plugin Market / Settings (Recommended)

1. Open DeepSeek Harness Web UI.
2. Navigate to **Settings** (`/settings`) -> **Plugins**.
3. Search for `dsh-plugin-message-history` and click **Enable** / **Install**.

### Method 2: Local Bundle Installation

If installing or linking directly from source:

```powershell
# Using the DSH plugin manager CLI or tool
plugin_manager action: "install_bundle" target: "path/to/dsh-plugin-message-history"
```

### Method 3: Cordis Profile Composition

Add to your `cordis.patch.yml` in your DSH profile (`~/.dsh/profiles/<profile>/cordis.patch.yml`):

```yaml
- insert:
    - id: dsh-plugin-message-history
      name: dsh-plugin-message-history
```

---

## HTTP REST Endpoints

The plugin exposes lightweight, CSRF-protected internal endpoints on DSH's internal webserver:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/message-history-v2` | Retrieves the prompt history array (`{ history: string[], total: number }`). |
| `POST` | `/api/message-history-v2` | Appends a prompt manually (`{ message: string, sessionId?: string }`). |
| `POST` | `/api/message-history/import` | Triggers a fresh backfill scan across existing session files. |

---

## File Structure

```
plugins/dsh-plugin-message-history/
├── client.js                   # Web UI Lexical composer mount & keydown capture
├── index.js                    # Cordis service entrypoint, API routes & event listeners
├── cordis.patch.yml            # DSH bundle patch manifest
├── package.json                # Plugin metadata, bundle exports & peer dependencies
├── icon.svg                    # Vector storefront tile icon
├── CONTRIBUTING.md             # Developer contribution guidelines
├── CHANGELOG.md                # Release version history
├── README.md                   # Authoritative documentation
├── locale/
│   ├── en.json                 # English localization metadata
│   └── zh.json                 # Chinese localization metadata
├── lib/
│   ├── importer.js             # Multi-frame zstd session scanner & prompt cleaner
│   ├── navigator.js            # Caret boundary math & navigation state machine
│   └── store.js                # Host-side JSON history file store & deduplication
└── tests/
    ├── test_importer.js        # Unit tests for session extraction & frame parsing
    └── test_navigator.js       # Unit tests for caret detection & state transitions
```

---

## Verification & Testing

The plugin includes automated tests with zero dependencies using Node.js's native test runner (`node:test`):

```bash
cd plugins/dsh-plugin-message-history
npm test
```

All 8 test suites verify:
- Clean extraction of human user messages, stripping automated continuation prefixes.
- Deduplication and cap enforcement up to 100 historical items.
- Correct boundary calculation for caret position 0 vs. mid-text offsets.
- Immediate single-press navigation across multi-line history prompts.
- Draft preservation and Escape cancellation.

---

## License

MIT © [Domush](https://github.com/Domush)
