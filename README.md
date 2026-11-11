# dsh-plugin-message-history

[![npm version](https://img.shields.io/npm/v/dsh-plugin-message-history.svg)](https://www.npmjs.com/package/dsh-plugin-message-history)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-blue.svg)](https://github.com/deepseek-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Shell-style **Up** and **Down** arrow key message history navigation for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI.

---

## Features

- **Terminal-Style Prompt Recall**: Press `ArrowUp` to cycle back through previously sent prompts, just like in Bash, Zsh, or PowerShell.
- **Natural Cursor Navigation**: When entering or editing text, arrow keys allow normal scrolling within your draft. Navigation only triggers when pressing `ArrowUp` at the very beginning (position 0) of your text.
- **Instant History Flipping**: Once browsing history, pressing `ArrowUp` or `ArrowDown` instantly changes between prompts with a single keystroke.
- **Zero-Risk Draft Preservation**: Any text you were typing before entering history is automatically saved. Pressing `Escape` or navigating back down immediately restores your in-progress draft.
- **Cross-Session Persistence**: Automatically imports and synchronizes past messages across all sessions, tabs, and workspace restarts.
- **Seamless Web UI Integration**: Designed natively for DeepSeek Harness's chat composer without modifying editor state or stealing focus.

---

## How to Use

- **`ArrowUp`**:
  - In an empty composer: immediately loads your most recent prompt.
  - While drafting text: moves the cursor up; if already at the top (character 0), saves your draft and enters history navigation.
  - While viewing history: loads the next older prompt.
- **`ArrowDown`**:
  - While viewing history: loads the newer prompt; navigating forward past the newest prompt restores your saved draft.
- **`Escape`**:
  - Cancels history browsing at any time and restores whatever draft you had typed.

---

## Installation

### In DeepSeek Harness UI (No Command Line Needed)
1. Open the DeepSeek Harness Web UI and navigate to **Settings** → **Plugins**.
2. Click the **"Add Plugin"** button.
3. Enter the plugin name:
   ```text
   dsh-plugin-message-history
   ```
4. Click **Install**. The plugin will be fetched and activated immediately.

### Via DeepSeek Harness CLI
Run the plugin install command in your terminal:
```bash
dsh plugin install dsh-plugin-message-history
```

### Via Profile Configuration (`cordis.patch.yml`)
Add the plugin to your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-plugin-message-history
      name: dsh-plugin-message-history
```

---

## License

[MIT](LICENSE) © 2026 Phillip Webber (Domush)
