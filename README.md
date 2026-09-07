# Pi Task Manager (`pi-task-manager`)

> Standalone portable HTML dashboard and Pi coding agent extension for project task tracking and Spec-Driven Development (SDD) phase management.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)
![Pi Extension](https://img.shields.io/badge/Pi-Extension-purple.svg)
![Zero Deps](https://img.shields.io/badge/Runtime%20Deps-0-brightgreen.svg)

`pi-task-manager` provides an offline, zero-dependency visual cockpit (`Task-Manager-Portable.html`) integrated with **Pi**, enabling both human developers and autonomous coding agents to track tasks, SDD phases, git progress, and architecture graphs in real time.

---

## Key Features

1. **Standalone Portable HTML Cockpit (`Task-Manager-Portable.html`)**:
   - Single-file dashboard with Obsidian Dark aesthetic, running directly via `file://` in any browser.
   - Zero runtime dependencies: no Vite, Node, or local server required.
   - **The `#tm-state` Data Island**: All state lives in an embedded `<script id="tm-state" type="application/json">` block. The agent only modifies this JSON island while all rendering code stays immutable.
   - Includes: Kanban board, collapsible SDD phases, digital HUD clock with freshness indicator, directory tree explorer, recent git commit stream, and interactive SVG architecture codegraph.

2. **Native Pi Extension & CLI Commands**:
   - `/task-manager` (alias `/tm`): Interactive menu to open, sync, or view status.
   - `/task-manager open`: Instantly launches the portable cockpit in your default web browser (`xdg-open` / `open` / `start`).
   - `/task-manager sync`: Scans git commits, uncommitted changes, project metadata, and markdown tasks (`tasks.md` / OpenSpec) to keep the dashboard synchronized.
   - `/task-manager status` & `/task-manager list`: Displays formatted CLI summaries in the terminal.
   - `/task-manager add <text>`: Quickly appends priority todo items.
   - Shortcut **`alt+t`**: Opens the interactive task manager menu.

3. **Orchestrator & Subagent Tools**:
   - `task_manager_read`: Inspect current phase progress and tasks.
   - `task_manager_update_task`: Update task statuses (`pending`, `in_progress`, `completed`, `blocked`), technical notes, owners, and commits.
   - `task_manager_sync`: Trigger workspace and git state synchronization.

---

## Installation & Linking in Pi

### Local Linking (Recommended for development)
Link the extension directly into your Pi extensions directory:

```bash
ln -s /home/cinlodev/projects/experiments/pi-task-manager ~/.pi/agent/extensions/pi-task-manager
```

Reload Pi or restart your session:
```text
/reload
```

---

## Usage Guide

### 1. Interactive Menu
Press **`alt+t`** or run:
```text
/task-manager
```

### 2. Direct Commands
```bash
/task-manager open    # Open in default browser
/task-manager sync    # Sync git commits and workspace tasks
/task-manager status  # High-level HUD metrics in terminal
/task-manager list    # Full task checklist in terminal
/task-manager add "Review auth migration"  # Add quick todo
```

### 3. Assembling the Portable HTML
The single-file HTML is deterministically compiled from modular sources (`modules/`):
```bash
pnpm assemble
```

### 4. Running Tests
```bash
pnpm test
pnpm typecheck
```

---

## Architecture & Security

- **Safe Script Tag Escaping**: Serialized JSON in `#tm-state` strictly escapes `</script>` as `\u003c/script\u003e` to prevent XSS and premature tag closing.
- **Atomic File Writes**: Changes to `Task-Manager-Portable.html` are written to a temporary file first and atomically renamed, avoiding partial writes or file corruption.

---

## License

MIT © cinlodev
