---
name: task-manager
description: "Manage, track, and sync tasks and SDD phases using the portable offline Task-Manager-Portable.html dashboard."
license: MIT
metadata:
  author: cinlodev
  version: "1.0"
---

# Task Manager Skill

This skill guides the agent, subagents, and orchestrator in managing, synchronizing, and visualizing project tasks and SDD phases using the portable offline cockpit `Task-Manager-Portable.html`.

## Registry Contract

```json
{
  "category": "workflow",
  "domains": [
    "task-manager",
    "tasks",
    "kanban",
    "dashboard",
    "sdd-tracking",
    "portable-cockpit"
  ],
  "triggers": {
    "paths": [
      "Task-Manager-Portable.html",
      "tasks.md",
      "openspec/changes/**/tasks.md"
    ],
    "keywords": [
      "task manager",
      "task-manager",
      "kanban",
      "portable task manager",
      "dashboard tareas",
      "sync tasks",
      "actualizar tareas"
    ]
  }
}
```

## Architecture & The `#tm-state` Island

The Task Manager is a self-contained, single-file technical cockpit that runs entirely client-side via `file://` with zero runtime dependencies.

### The Immutable Code Rule
All visual components (HUD, Kanban, collapsible phases, SVG codegraph, git stream, quick todos) are frozen. **Agents edit ONLY the embedded JSON island**:

```html
<script type="application/json" id="tm-state">
{
  "schemaVersion": "1.0",
  "meta": { ... },
  "phases": [ ... ],
  "todos": [ ... ],
  "git": { ... },
  "tree": [ ... ],
  "codegraph": { ... }
}
</script>
```

### Script Tag Escaping Invariant
When serializing or writing to the `#tm-state` block, any occurrence of `</script>` inside string properties MUST be safely escaped as `\u003c/script\u003e` to prevent terminating the HTML script tag prematurely.

## When to Update the Task Manager

1. **Phase or Task Transition**:
   - When starting work on a task: update status to `"in_progress"`.
   - When a task or subtask is completed: update status to `"completed"`, set `commit` hash if committed, and add a brief technical `note`.
   - If blocked by dependency or issue: set status to `"blocked"` and provide `blockedReason`.

2. **SDD Lifecycle Synchronization**:
   - After `/sdd-tasks` or writing `tasks.md`: run `/task-manager sync` or use tool `task_manager_sync` to import phases into the dashboard.

3. **Git and Tree Sync**:
   - Commits and directory tree can be automatically synced using `/task-manager sync`.

## Available Tools

- `task_manager_read`: Reads current tasks, phases, progress, and todos.
- `task_manager_update_task`: Programmatically updates task status, notes, owner, commit.
- `task_manager_sync`: Syncs git commits, directory tree, and markdown tasks.

## User Commands

- `/task-manager`: Open interactive cockpit menu.
- `/task-manager open`: Launch `Task-Manager-Portable.html` in default browser.
- `/task-manager sync`: Synchronize git and workspace state.
- `/task-manager status`: Show text summary of progress and phases.
- `/task-manager list`: Show full formatted checklist in terminal.
- `/task-manager add <text>`: Quick todo item addition.
- `alt+t`: Quick shortcut to open the interactive menu.
