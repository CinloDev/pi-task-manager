import { TaskManager } from "./src/manager.js";
import {
  formatStatusSummary,
  formatTaskList,
  runInteractiveMenu,
  type UiContext,
} from "./src/ui.js";
import type { TaskStatus } from "./src/types.js";
import { extractSessionTelemetry } from "./src/telemetry.js";

export { TaskManager } from "./src/manager.js";
export * from "./src/types.js";
export * from "./src/island.js";
export * from "./src/scanner.js";
export * from "./src/ui.js";

export default function taskManagerExtension(pi: any): void {
  const getManager = (ctx?: any) => {
    const cwd = ctx?.cwd ?? process.cwd();
    return new TaskManager({ workspaceRoot: cwd });
  };

  const commandHandler = async (args: string, ctx: UiContext): Promise<string> => {
    const manager = getManager(ctx);
    const trimmed = (args || "").trim();

    if (!trimmed) {
      return runInteractiveMenu(manager, ctx);
    }

    const parts = trimmed.split(/\s+/);
    const sub = parts[0].toLowerCase();

    switch (sub) {
      case "open": {
        const res = await manager.openInBrowser();
        ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
        return res.message;
      }

      case "init": {
        const force = parts.includes("--force");
        const res = manager.init({ force });
        ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
        return res.message;
      }

      case "sync": {
        const res = manager.sync({ syncTasksFromMarkdown: true });
        if (ctx?.sessionManager) {
          const telemetry = extractSessionTelemetry(ctx.sessionManager);
          if (telemetry) {
            const state = manager.getState();
            state.tokenUsage = telemetry;
            manager.saveState(state);
          }
        }
        ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
        return res.message;
      }

      case "status": {
        if (!manager.exists()) {
          return "Task Manager no está inicializado en este proyecto. Ejecutá /task-manager init.";
        }
        return formatStatusSummary(manager.getState());
      }

      case "list": {
        if (!manager.exists()) {
          return "Task Manager no está inicializado en este proyecto. Ejecutá /task-manager init.";
        }
        return formatTaskList(manager.getState());
      }

      case "export": {
        const customPath = parts[1];
        const res = manager.exportHtml(customPath);
        ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
        return res.message;
      }

      case "add": {
        const text = parts.slice(1).join(" ").trim();
        if (!text) {
          ctx.ui?.notify?.("Uso: /task-manager add <descripción>", "warning");
          return "Uso: /task-manager add <descripción>";
        }
        if (!manager.exists()) manager.init();
        const res = manager.addTodo({ text });
        ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
        return res.message;
      }

      case "task": {
        const taskId = parts[1];
        const status = parts[2] as TaskStatus;
        if (!taskId || !status) {
          const msg = "Uso: /task-manager task <ID> <pending|in_progress|completed|blocked>";
          ctx.ui?.notify?.(msg, "warning");
          return msg;
        }
        if (!manager.exists()) {
          return "Task Manager no está inicializado en este proyecto.";
        }
        const res = manager.updateTask(taskId, { status });
        ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
        return res.message;
      }

      default: {
        return runInteractiveMenu(manager, ctx);
      }
    }
  };

  // Main /task-manager command
  pi.registerCommand?.("task-manager", {
    description: "Abrir, sincronizar y gestionar Pi Task Manager (/task-manager [open|sync|init|status|list|add|export])",
    handler: commandHandler,
  });

  // Short alias /tm
  pi.registerCommand?.("tm", {
    description: "Alias rápido para /task-manager",
    handler: commandHandler,
  });

  const openMenuHandler = async (ctx: UiContext) => {
    const manager = getManager(ctx);
    await runInteractiveMenu(manager, ctx);
  };

  // Shortcut alt+j to toggle task manager interactive menu
  pi.registerShortcut?.("alt+j", {
    description: "Abrir menú interactivo de Pi Task Manager",
    handler: openMenuHandler,
  });

  // Shortcut ctrl+shift+j (macOS / universal alternative)
  pi.registerShortcut?.("ctrl+shift+j", {
    description: "Abrir menú interactivo de Pi Task Manager (alternativa macOS/universal)",
    handler: openMenuHandler,
  });

  // Tools for Orchestrator and Subagents
  if (typeof pi.registerTool === "function") {
    pi.registerTool({
      name: "task_manager_read",
      description: "Read current tasks, phases, progress, and todos from the project's Pi Task Manager state (.pi/task-manager.json).",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (_toolCallId: string, _params: any, _signal: any, _onUpdate: any, ctx: any) => {
        const manager = getManager(ctx);
        if (!manager.exists()) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    exists: false,
                    message: "Task Manager is not initialized in this workspace (.pi/task-manager.json).",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
        const state = manager.getState();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  exists: true,
                  meta: state.meta,
                  phases: state.phases,
                  todos: state.todos,
                  git: state.git,
                },
                null,
                2
              ),
            },
          ],
        };
      },
    });

    pi.registerTool({
      name: "task_manager_update_task",
      description: "Update the status, note, owner, or commit of a task in Pi Task Manager (.pi/task-manager.json).",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "The unique identifier of the task (e.g. 'T1-01', 'T2-03').",
          },
          status: {
            type: "string",
            description: "Task status.",
            enum: ["pending", "in_progress", "completed", "blocked"],
          },
          note: {
            type: "string",
            description: "Optional notes or technical details about progress.",
          },
          owner: {
            type: "string",
            description: "Agent or user responsible (e.g. 'sdd-apply', 'Pi').",
          },
          commit: {
            type: "string",
            description: "Git commit hash associated with this completed task.",
          },
          blockedReason: {
            type: "string",
            description: "Explanation if task is marked blocked.",
          },
        },
        required: ["taskId"],
      },
      execute: async (
        _toolCallId: string,
        args: {
          taskId: string;
          status?: TaskStatus;
          note?: string;
          owner?: string;
          commit?: string;
          blockedReason?: string;
        },
        _signal: any,
        _onUpdate: any,
        ctx: any
      ) => {
        const manager = getManager(ctx);
        if (!manager.exists()) {
          manager.init();
        }
        const res = manager.updateTask(args.taskId, {
          status: args.status,
          note: args.note,
          owner: args.owner,
          commit: args.commit,
          blockedReason: args.blockedReason,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(res, null, 2),
            },
          ],
        };
      },
    });

    pi.registerTool({
      name: "task_manager_sync",
      description: "Synchronize git commits, directory tree, markdown tasks, and session token telemetry into Pi Task Manager.",
      parameters: {
        type: "object",
        properties: {
          syncTasksFromMarkdown: {
            type: "boolean",
            description: "Whether to scan tasks.md or OpenSpec tasks and sync them into phases.",
          },
        },
      },
      execute: async (
        _toolCallId: string,
        args: { syncTasksFromMarkdown?: boolean },
        _signal: any,
        _onUpdate: any,
        ctx: any
      ) => {
        const manager = getManager(ctx);
        const res = manager.sync({
          syncTasksFromMarkdown: args.syncTasksFromMarkdown ?? true,
        });
        if (ctx?.sessionManager) {
          const telemetry = extractSessionTelemetry(ctx.sessionManager);
          if (telemetry) {
            const state = manager.getState();
            state.tokenUsage = telemetry;
            manager.saveState(state);
          }
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(res, null, 2),
            },
          ],
        };
      },
    });
  }

  // Hook turn_end event to track real operational token telemetry continuously
  if (typeof pi.on === "function") {
    pi.on("turn_end", async (event: any, ctx: any) => {
      try {
        const usage = event?.message?.usage;
        if (!usage) return;
        const manager = getManager(ctx);
        if (!manager.exists()) return;

        // Attribute consumption to the active in-progress task owner if available, otherwise Pi
        let activeAgent = "Pi";
        const state = manager.getState();
        for (const phase of state.phases) {
          const activeTask = phase.tasks.find((t) => t.status === "in_progress" && t.owner);
          if (activeTask && activeTask.owner) {
            activeAgent = activeTask.owner;
            break;
          }
        }

        const model = event?.message?.model || ctx?.model?.id || ctx?.model;
        const inputTokens = Number(usage.input || usage.input_tokens || usage.prompt_tokens || 0);
        const outputTokens = Number(usage.output || usage.output_tokens || usage.completion_tokens || 0);
        const cacheReadTokens = Number(usage.cacheRead || usage.cache_read_tokens || 0);
        const cacheWriteTokens = Number(usage.cacheWrite || usage.cache_write_tokens || 0);
        const reasoningTokens = Number(usage.reasoning || usage.reasoning_tokens || 0);
        const cost = typeof usage.cost === "number" ? usage.cost : usage.cost?.total;

        manager.recordTokenUsage({
          agent: activeAgent,
          model: typeof model === "string" ? model : undefined,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          reasoningTokens,
          cost: typeof cost === "number" ? cost : undefined,
        });
      } catch {}
    });
  }
}
