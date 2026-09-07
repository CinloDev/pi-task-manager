import { TaskManager } from "./src/manager.js";
import {
  formatStatusSummary,
  formatTaskList,
  runInteractiveMenu,
  type UiContext,
} from "./src/ui.js";
import type { TaskStatus } from "./src/types.js";

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
        ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
        return res.message;
      }

      case "status": {
        if (!manager.exists()) {
          return "Task-Manager-Portable.html no existe en este proyecto. Ejecutá /task-manager init.";
        }
        return formatStatusSummary(manager.getState());
      }

      case "list": {
        if (!manager.exists()) {
          return "Task-Manager-Portable.html no existe en este proyecto. Ejecutá /task-manager init.";
        }
        return formatTaskList(manager.getState());
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
          return "Task-Manager-Portable.html no existe en este proyecto.";
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
    description: "Abrir, sincronizar y gestionar el dashboard Task-Manager-Portable.html (/task-manager [open|sync|init|status|list|add])",
    handler: commandHandler,
  });

  // Short alias /tm
  pi.registerCommand?.("tm", {
    description: "Alias rápido para /task-manager",
    handler: commandHandler,
  });

  // Shortcut alt+t to toggle task manager interactive menu
  pi.registerShortcut?.("alt+t", {
    description: "Abrir menú interactivo de Pi Task Manager",
    handler: async (ctx: UiContext) => {
      const manager = getManager(ctx);
      await runInteractiveMenu(manager, ctx);
    },
  });

  // Tools for Orchestrator and Subagents
  if (typeof pi.registerTool === "function") {
    pi.registerTool({
      name: "task_manager_read",
      description: "Read current tasks, phases, progress, and todos from the project's Task-Manager-Portable.html dashboard.",
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
                    message: "Task-Manager-Portable.html is not initialized in this workspace.",
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
      description: "Update the status, note, owner, or commit of a task in Task-Manager-Portable.html.",
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
      description: "Synchronize git commits, directory tree, and markdown tasks into Task-Manager-Portable.html.",
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
}
