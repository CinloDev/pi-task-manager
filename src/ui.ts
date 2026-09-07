import path from "node:path";
import type { TaskManagerState, TaskStatus, Phase, Task } from "./types.js";
import type { TaskManager } from "./manager.js";

export interface UiContext {
  ui?: {
    select?: (title: string, options: string[]) => Promise<string | undefined>;
    input?: (prompt: string, placeholder?: string) => Promise<string | undefined>;
    notify?: (message: string, type: "info" | "warning" | "error") => void;
    confirm?: (title: string, message: string) => Promise<boolean>;
    setStatus?: (id: string, text?: string) => void;
  };
  cwd?: string;
  [key: string]: unknown;
}

export function getStatusBadge(status: TaskStatus): string {
  switch (status) {
    case "completed":
      return "✅ Completada";
    case "in_progress":
      return "🔄 En progreso";
    case "blocked":
      return "⛔ Bloqueada";
    case "pending":
    default:
      return "⏳ Pendiente";
  }
}

export function formatStatusSummary(state: TaskManagerState): string {
  const meta = state.meta;
  const totalTasks = state.phases.reduce((acc, p) => acc + p.tasks.length, 0);
  const completedTasks = state.phases.reduce(
    (acc, p) => acc + p.tasks.filter((t) => t.status === "completed").length,
    0
  );
  const inProgressTasks = state.phases.reduce(
    (acc, p) => acc + p.tasks.filter((t) => t.status === "in_progress").length,
    0
  );
  const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const totalTodos = state.todos.length;
  const doneTodos = state.todos.filter((t) => t.done).length;

  const lines = [
    `📊 Task Manager: ${meta.projectName} (v${meta.version})`,
    `   Harness: ${meta.harness || "Pi"} · Rama: ${meta.branch || state.git.branch || "main"}`,
    `   Progreso general: ${completedTasks}/${totalTasks} tareas (${percentage}%)`,
    `   En progreso: ${inProgressTasks} · Fases: ${state.phases.length} · Tareas rápidas: ${doneTodos}/${totalTodos}`,
    `   Sincronización: ${state.git.syncStatus || meta.syncStatus || "Al día"}`,
  ];

  return lines.join("\n");
}

export function formatTaskList(state: TaskManagerState): string {
  const lines: string[] = [formatStatusSummary(state), ""];

  for (const phase of state.phases) {
    const phaseDone = phase.tasks.filter((t) => t.status === "completed").length;
    lines.push(
      `🔹 Fase ${phase.number}: ${phase.title} [${phaseDone}/${phase.tasks.length} - ${getStatusBadge(phase.status)}]`
    );

    for (const task of phase.tasks) {
      const check = task.status === "completed" ? "[x]" : "[ ]";
      const tag = task.tag ? ` (${task.tag})` : "";
      const owner = task.owner ? ` @${task.owner}` : "";
      lines.push(`   ${check} ${task.id}: ${task.title}${tag}${owner} · ${getStatusBadge(task.status)}`);

      if (task.subtasks && task.subtasks.length > 0) {
        for (const st of task.subtasks) {
          const stCheck = st.done ? "✓" : "○";
          lines.push(`      ${stCheck} ${st.title}`);
        }
      }
    }
    lines.push("");
  }

  if (state.todos.length > 0) {
    lines.push("📌 Tareas Rápidas (Todos):");
    for (const todo of state.todos) {
      const check = todo.done ? "[x]" : "[ ]";
      lines.push(`   ${check} [${todo.priority}] ${todo.text}`);
    }
  }

  return lines.join("\n");
}

export async function runInteractiveMenu(manager: TaskManager, ctx: UiContext): Promise<string> {
  if (!ctx.ui?.select) {
    if (!manager.exists()) {
      manager.init();
    }
    return formatStatusSummary(manager.getState());
  }

  const exists = manager.exists();
  const options = exists
    ? [
        "🌐 Abrir dashboard en el navegador (file://)",
        "🔄 Sincronizar git y tareas ahora",
        "📋 Ver resumen y lista completa en terminal",
        "➕ Agregar tarea rápida (Todo)",
        "✏️ Actualizar estado de una tarea",
      ]
    : [
        "🚀 Inicializar Task-Manager-Portable.html aquí",
        "🌐 Inicializar y abrir directamente en el navegador",
      ];

  const selected = await ctx.ui.select(
    `🗂️ Pi Task Manager (${path.basename(manager.workspaceRoot)})`,
    options
  );

  if (!selected) return "Operación cancelada.";

  if (selected.includes("Inicializar")) {
    const res = manager.init();
    ctx.ui.notify?.(res.message, res.success ? "info" : "error");
    if (selected.includes("navegador")) {
      await manager.openInBrowser();
    }
    return res.message;
  }

  if (selected.includes("navegador")) {
    const res = await manager.openInBrowser();
    ctx.ui.notify?.(res.message, res.success ? "info" : "error");
    return res.message;
  }

  if (selected.includes("Sincronizar")) {
    const res = manager.sync({ syncTasksFromMarkdown: true });
    ctx.ui.notify?.(res.message, res.success ? "info" : "error");
    return res.message;
  }

  if (selected.includes("resumen")) {
    return formatTaskList(manager.getState());
  }

  if (selected.includes("Agregar tarea rápida")) {
    return runInteractiveAddTodo(manager, ctx);
  }

  if (selected.includes("Actualizar estado")) {
    return runInteractiveUpdateTask(manager, ctx);
  }

  return "Listo.";
}

export async function runInteractiveAddTodo(manager: TaskManager, ctx: UiContext): Promise<string> {
  if (!ctx.ui?.input) return "UI input no disponible.";

  const text = await ctx.ui.input("Descripción de la tarea rápida:");
  if (!text || !text.trim()) return "Operación cancelada.";

  let priority: "P0" | "P1" | "P2" | "P3" = "P1";
  if (ctx.ui.select) {
    const prio = await ctx.ui.select("Prioridad:", ["P0 (Urgente / Crítico)", "P1 (Alta)", "P2 (Media)", "P3 (Baja)"]);
    if (prio?.startsWith("P0")) priority = "P0";
    if (prio?.startsWith("P1")) priority = "P1";
    if (prio?.startsWith("P2")) priority = "P2";
    if (prio?.startsWith("P3")) priority = "P3";
  }

  const res = manager.addTodo({ text: text.trim(), priority });
  ctx.ui.notify?.(res.message, res.success ? "info" : "error");
  return res.message;
}

export async function runInteractiveUpdateTask(manager: TaskManager, ctx: UiContext): Promise<string> {
  if (!ctx.ui?.select) return "UI select no disponible.";

  const state = manager.getState();
  const allTasks: Array<{ task: Task; phase: Phase }> = [];
  for (const phase of state.phases) {
    for (const task of phase.tasks) {
      allTasks.push({ task, phase });
    }
  }

  if (allTasks.length === 0) {
    return "No hay tareas registradas.";
  }

  const taskOptions = allTasks.map(
    (item) => `${item.task.id}: ${item.task.title} [${item.task.status}]`
  );

  const selectedOption = await ctx.ui.select("Seleccioná la tarea a actualizar:", taskOptions);
  if (!selectedOption) return "Operación cancelada.";

  const taskId = selectedOption.split(":")[0].trim();
  const statusOptions = [
    "✅ completed (Completada)",
    "🔄 in_progress (En progreso)",
    "⏳ pending (Pendiente)",
    "⛔ blocked (Bloqueada)",
  ];

  const selectedStatusOption = await ctx.ui.select(`Nuevo estado para ${taskId}:`, statusOptions);
  if (!selectedStatusOption) return "Operación cancelada.";

  let newStatus: TaskStatus = "pending";
  if (selectedStatusOption.startsWith("✅ completed")) newStatus = "completed";
  else if (selectedStatusOption.startsWith("🔄 in_progress")) newStatus = "in_progress";
  else if (selectedStatusOption.startsWith("⛔ blocked")) newStatus = "blocked";

  const res = manager.updateTask(taskId, { status: newStatus });
  ctx.ui.notify?.(res.message, res.success ? "info" : "error");
  return res.message;
}
