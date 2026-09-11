import path from "node:path";
import type { TaskManagerState, TaskStatus, Phase, Task, TodoItem } from "./types.js";
import type { TaskManager } from "./manager.js";

export interface UiContext {
  ui?: {
    select?: (title: string, options: string[]) => Promise<string | undefined>;
    input?: (prompt: string, placeholder?: string) => Promise<string | undefined>;
    notify?: (message: string, type: "info" | "warning" | "error") => void;
    confirm?: (title: string, message: string) => Promise<boolean>;
    setStatus?: (id: string, text?: string) => void;
    custom?: <T = any>(
      factory: (tui: any, theme: any, keybindings: any, done: (result: T) => void) => any,
      options?: any
    ) => Promise<T>;
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

const segmenter = new (Intl as any).Segmenter("en", { granularity: "grapheme" });
const rgiEmoji = new RegExp("\\p{RGI_Emoji}", "v");

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1B\([a-zA-Z]/g, "");
}

function getGraphemeWidth(segment: string): number {
  if (!segment) return 0;
  if (/^[\u200B-\u200D\uFE0E\uFE0F]/.test(segment)) return 0;
  if (rgiEmoji.test(segment)) return 2;
  const cp = segment.codePointAt(0) || 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff01 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
}

export function getVisibleWidth(str: string): number {
  const clean = stripAnsi(str);
  let w = 0;
  for (const { segment } of segmenter.segment(clean)) {
    w += getGraphemeWidth(segment);
  }
  return w;
}

export function padEndVisible(str: string, targetWidth: number): string {
  const vis = getVisibleWidth(str);
  if (vis === targetWidth) return str;
  if (vis < targetWidth) return str + " ".repeat(targetWidth - vis);

  let res = "";
  let curW = 0;
  const parts = str.split(/(\x1B\[[0-9;]*[a-zA-Z])/g);
  for (const part of parts) {
    if (/^\x1B\[[0-9;]*[a-zA-Z]$/.test(part)) {
      res += part;
      continue;
    }
    for (const { segment } of segmenter.segment(part)) {
      const gw = getGraphemeWidth(segment);
      if (curW + gw > targetWidth - 1) {
        res += "…";
        curW += 1;
        break;
      }
      res += segment;
      curW += gw;
    }
    if (curW >= targetWidth - 1) break;
  }
  if (curW < targetWidth) {
    res += " ".repeat(targetWidth - curW);
  }
  return res + "\x1b[0m";
}

export function normalizeModalKey(data: string): string {
  // Enter (standard CR/LF, numpad keypad SS3)
  if (data === "\r" || data === "\n" || data === "\u001bOM") return "enter";

  // Escape / Cancel / Abort
  if (data === "\x1b" || data === "\u001b" || data === "\x03") return "esc";

  // Arrow Up (CSI standard, SS3 application mode, xterm modified, linux console, Vim k)
  if (
    data === "\x1b[A" ||
    data === "\u001b[A" ||
    data === "\x1bOA" ||
    data === "\u001bOA" ||
    data === "\x1b[1;1A" ||
    data === "\x1b[a" ||
    data === "k" ||
    data === "K"
  ) {
    return "up";
  }

  // Arrow Down (CSI standard, SS3 application mode, xterm modified, linux console, Vim j)
  if (
    data === "\x1b[B" ||
    data === "\u001b[B" ||
    data === "\x1bOB" ||
    data === "\u001bOB" ||
    data === "\x1b[1;1B" ||
    data === "\x1b[b" ||
    data === "j" ||
    data === "J"
  ) {
    return "down";
  }

  // Arrow Right / Left
  if (data === "\x1b[C" || data === "\u001b[C" || data === "\x1bOC" || data === "\u001bOC") return "right";
  if (data === "\x1b[D" || data === "\u001b[D" || data === "\x1bOD" || data === "\u001bOD") return "left";

  // Page Up / Down
  if (data === "\x1b[5~" || data === "\u001b[5~") return "pageup";
  if (data === "\x1b[6~" || data === "\u001b[6~") return "pagedown";

  // Home / End
  if (data === "\x1b[H" || data === "\u001b[H" || data === "\x1bOH" || data === "\u001bOH" || data === "\x1b[1~") return "home";
  if (data === "\x1b[F" || data === "\u001b[F" || data === "\x1bOF" || data === "\u001bOF" || data === "\x1b[4~") return "end";

  // Tab
  if (data === "\t") return "tab";

  // Backspace / Delete
  if (data === "\x7f" || data === "\b" || data === "\x1b[3~" || data === "\u001b[3~") return "backspace";

  // Space
  if (data === " ") return "space";

  return data;
}

export class TaskManagerModalOverlay {
  private title: string;
  private manager: TaskManager | null = null;
  private state: TaskManagerState | null = null;
  private theme: any;
  private tui: any;
  private done: (result: string | undefined) => void;

  // View state machine
  private view: "menu" | "list" | "add_todo" | "select_task" | "select_status" | "confirm_export" = "menu";
  private selectedMenuIndex = 0;
  private banner: { text: string; type: "info" | "success" | "warning" } | null = null;

  // Confirm export view state
  private selectedExportChoice = 0;

  // List view state: select and toggle
  private listSelectionIndex = 0; // 0..items.length-1
  private allListItems: ({ type: "task"; task: Task; phase: Phase } | { type: "todo"; todo: TodoItem })[] = [];

  // Add todo view state
  private todoInput = "";
  private todoPriorityIndex = 0;
  private readonly todoPriorityOptions: ("Auto" | "P0" | "P1" | "P2" | "P3")[] = ["Auto", "P0", "P1", "P2", "P3"];

  // Select task / status view state
  private allTasks: { task: Task; phase: Phase }[] = [];
  private selectedTaskIndex = 0;
  private chosenTask: Task | null = null;
  private selectedStatusIndex = 0;

  private customOptions: string[] | null = null;

  private readonly statusOptions: { status: TaskStatus; label: string }[] = [
    { status: "pending", label: "⏳ Pendiente" },
    { status: "in_progress", label: "🔄 En progreso" },
    { status: "completed", label: "✅ Completada" },
    { status: "blocked", label: "⛔ Bloqueada" },
  ];

  constructor(
    title: string,
    managerOrOptions: TaskManager | string[],
    state: TaskManagerState | null,
    theme: any,
    tui: any,
    done: (result: string | undefined) => void
  ) {
    this.title = title;
    if (Array.isArray(managerOrOptions)) {
      this.customOptions = managerOrOptions;
    } else {
      this.manager = managerOrOptions;
    }
    this.state = state;
    this.theme = theme;
    this.tui = tui;
    this.done = done;
    this.refreshTasks();
  }

  private refreshTasks(): void {
    if (!this.state || !Array.isArray(this.state.phases)) {
      this.allTasks = [];
      this.allListItems = [];
      return;
    }
    const list: { task: Task; phase: Phase }[] = [];
    const interactiveList: ({ type: "task"; task: Task; phase: Phase } | { type: "todo"; todo: TodoItem })[] = [];
    for (const phase of this.state.phases) {
      if (Array.isArray(phase.tasks)) {
        for (const task of phase.tasks) {
          list.push({ task, phase });
          interactiveList.push({ type: "task", task, phase });
        }
      }
    }
    this.allTasks = list;
    if (this.state.todos && Array.isArray(this.state.todos)) {
      for (const todo of this.state.todos) {
        interactiveList.push({ type: "todo", todo });
      }
    }
    this.allListItems = interactiveList;
  }

  private getMenuItems(): string[] {
    if (this.customOptions) {
      return this.customOptions;
    }
    if (!this.state) {
      return [
        "🚀 Inicializar Task Manager (.pi/task-manager.json)",
        "🌐 Inicializar y abrir directamente en el navegador",
        "🚪 Salir",
      ];
    }
    return [
      "🌐 Abrir dashboard en el navegador (visualizador)",
      "🔄 Sincronizar git y tareas ahora",
      "📋 Ver tareas y fases en esta ventana",
      "➕ Agregar tarea rápida (Todo)",
      "✏️ Actualizar estado de una tarea",
      "📦 Exportar dashboard como HTML portable",
      "🚪 Salir",
    ];
  }

  handleInput(data: string): void {
    switch (this.view) {
      case "menu":
        this.handleMenuInput(data);
        break;
      case "list":
        this.handleListInput(data);
        break;
      case "add_todo":
        this.handleAddTodoInput(data);
        break;
      case "select_task":
        this.handleSelectTaskInput(data);
        break;
      case "select_status":
        this.handleSelectStatusInput(data);
        break;
      case "confirm_export":
        this.handleConfirmExportInput(data);
        break;
    }
  }

  private handleMenuInput(data: string): void {
    const key = normalizeModalKey(data);
    const items = this.getMenuItems();

    if (key === "esc") {
      this.done(undefined);
      return;
    }

    if (key === "up") {
      this.selectedMenuIndex = (this.selectedMenuIndex - 1 + items.length) % items.length;
      this.tui?.requestRender?.();
      return;
    }

    if (key === "down") {
      this.selectedMenuIndex = (this.selectedMenuIndex + 1) % items.length;
      this.tui?.requestRender?.();
      return;
    }

    if (key === "home") {
      this.selectedMenuIndex = 0;
      this.tui?.requestRender?.();
      return;
    }

    if (key === "end") {
      this.selectedMenuIndex = items.length - 1;
      this.tui?.requestRender?.();
      return;
    }

    // Direct number selection 1-7
    const num = parseInt(data, 10);
    if (!isNaN(num) && num >= 1 && num <= items.length) {
      this.selectedMenuIndex = num - 1;
      this.executeMenuItem(items[this.selectedMenuIndex]);
      return;
    }

    if (key === "enter") {
      this.executeMenuItem(items[this.selectedMenuIndex]);
      return;
    }
  }

  private executeMenuItem(item: string): void {
    if (this.customOptions) {
      this.done(item);
      return;
    }

    if (item.includes("Salir")) {
      this.done(undefined);
      return;
    }

    if (!this.manager) {
      this.done(item);
      return;
    }

    if (item.includes("Inicializar")) {
      const res = this.manager.init();
      this.state = this.manager.getState();
      this.refreshTasks();
      this.banner = { text: res.message, type: res.success ? "success" : "warning" };
      if (item.includes("navegador")) {
        this.manager.openInBrowser().then((bRes) => {
          this.banner = { text: bRes.message, type: bRes.success ? "success" : "warning" };
          this.tui?.requestRender?.();
        });
      }
      this.tui?.requestRender?.();
      return;
    }

    if (item.includes("Abrir dashboard")) {
      this.banner = { text: "⏳ Abriendo dashboard en el navegador...", type: "info" };
      this.tui?.requestRender?.();
      this.manager.openInBrowser().then((res) => {
        this.banner = { text: res.message, type: res.success ? "success" : "warning" };
        this.tui?.requestRender?.();
      });
      return;
    }

    if (item.includes("Sincronizar git")) {
      const res = this.manager.sync({ syncTasksFromMarkdown: true });
      this.state = this.manager.getState();
      this.refreshTasks();
      this.banner = { text: res.message, type: res.success ? "success" : "warning" };
      this.tui?.requestRender?.();
      return;
    }

    if (item.includes("Ver tareas")) {
      this.refreshTasks();
      this.view = "list";
      this.listSelectionIndex = 0;
      this.tui?.requestRender?.();
      return;
    }

    if (item.includes("Agregar tarea rápida")) {
      this.view = "add_todo";
      this.todoInput = "";
      this.tui?.requestRender?.();
      return;
    }

    if (item.includes("Actualizar estado")) {
      this.refreshTasks();
      if (this.allTasks.length === 0) {
        this.banner = { text: "⚠️ No hay tareas registradas para actualizar.", type: "warning" };
        this.tui?.requestRender?.();
        return;
      }
      this.view = "select_task";
      this.selectedTaskIndex = 0;
      this.tui?.requestRender?.();
      return;
    }

    if (item.includes("Exportar dashboard")) {
      this.view = "confirm_export";
      this.selectedExportChoice = 0;
      this.tui?.requestRender?.();
      return;
    }
  }

  private handleListInput(data: string): void {
    const key = normalizeModalKey(data);

    if (key === "esc" || data === "q" || data === "Q") {
      this.view = "menu";
      this.tui?.requestRender?.();
      return;
    }

    if (key === "up") {
      if (this.allListItems.length > 0) {
        this.listSelectionIndex = (this.listSelectionIndex - 1 + this.allListItems.length) % this.allListItems.length;
      }
      this.tui?.requestRender?.();
      return;
    }

    if (key === "down") {
      if (this.allListItems.length > 0) {
        this.listSelectionIndex = (this.listSelectionIndex + 1) % this.allListItems.length;
      }
      this.tui?.requestRender?.();
      return;
    }

    if (key === "pageup") {
      if (this.allListItems.length > 0) {
        this.listSelectionIndex = Math.max(0, this.listSelectionIndex - 6);
      }
      this.tui?.requestRender?.();
      return;
    }

    if (key === "pagedown") {
      if (this.allListItems.length > 0) {
        this.listSelectionIndex = Math.min(this.allListItems.length - 1, this.listSelectionIndex + 6);
      }
      this.tui?.requestRender?.();
      return;
    }

    if (key === "home") {
      this.listSelectionIndex = 0;
      this.tui?.requestRender?.();
      return;
    }

    if (key === "end") {
      this.listSelectionIndex = Math.max(0, this.allListItems.length - 1);
      this.tui?.requestRender?.();
      return;
    }

    // Toggle todo or advance/open task on Enter or Space
    if (key === "enter" || key === "space") {
      const item = this.allListItems[this.listSelectionIndex];
      if (!item) return;

      if (item.type === "todo") {
        if (this.manager) {
          const res = this.manager.toggleTodo(item.todo.id);
          this.state = this.manager.getState();
          this.refreshTasks();
          this.banner = {
            text: res.message,
            type: res.success ? "success" : "warning",
          };
        }
        this.tui?.requestRender?.();
        return;
      }

      if (item.type === "task") {
        this.chosenTask = item.task;
        this.view = "select_status";
        const currIndex = this.statusOptions.findIndex((s) => s.status === this.chosenTask?.status);
        this.selectedStatusIndex = currIndex >= 0 ? currIndex : 0;
        this.tui?.requestRender?.();
        return;
      }
    }
  }

  private handleAddTodoInput(data: string): void {
    const key = normalizeModalKey(data);

    if (key === "esc") {
      this.view = "menu";
      this.tui?.requestRender?.();
      return;
    }

    if (key === "tab") {
      this.todoPriorityIndex = (this.todoPriorityIndex + 1) % this.todoPriorityOptions.length;
      this.tui?.requestRender?.();
      return;
    }

    if (key === "enter") {
      const text = this.todoInput.trim();
      if (!text) {
        this.view = "menu";
        this.tui?.requestRender?.();
        return;
      }
      if (this.manager) {
        const prioOpt = this.todoPriorityOptions[this.todoPriorityIndex];
        const priority = prioOpt === "Auto" ? undefined : prioOpt;
        const res = this.manager.addTodo({ text, priority });
        this.state = this.manager.getState();
        this.banner = { text: res.message, type: res.success ? "success" : "warning" };
      }
      this.view = "menu";
      this.tui?.requestRender?.();
      return;
    }

    if (key === "backspace") {
      if (this.todoInput.length > 0) {
        this.todoInput = this.todoInput.slice(0, -1);
        this.tui?.requestRender?.();
      }
      return;
    }

    // Printable characters
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.todoInput += data;
      this.tui?.requestRender?.();
    }
  }

  private handleSelectTaskInput(data: string): void {
    const key = normalizeModalKey(data);

    if (key === "esc" || data === "b" || data === "B" || data === "q") {
      this.view = "menu";
      this.tui?.requestRender?.();
      return;
    }

    if (key === "up") {
      this.selectedTaskIndex = (this.selectedTaskIndex - 1 + this.allTasks.length) % this.allTasks.length;
      this.tui?.requestRender?.();
      return;
    }

    if (key === "down") {
      this.selectedTaskIndex = (this.selectedTaskIndex + 1) % this.allTasks.length;
      this.tui?.requestRender?.();
      return;
    }

    if (key === "pageup") {
      this.selectedTaskIndex = Math.max(0, this.selectedTaskIndex - 5);
      this.tui?.requestRender?.();
      return;
    }

    if (key === "pagedown") {
      this.selectedTaskIndex = Math.min(this.allTasks.length - 1, this.selectedTaskIndex + 5);
      this.tui?.requestRender?.();
      return;
    }

    if (key === "home") {
      this.selectedTaskIndex = 0;
      this.tui?.requestRender?.();
      return;
    }

    if (key === "end") {
      this.selectedTaskIndex = Math.max(0, this.allTasks.length - 1);
      this.tui?.requestRender?.();
      return;
    }

    if (key === "enter") {
      this.chosenTask = this.allTasks[this.selectedTaskIndex]?.task || null;
      if (this.chosenTask) {
        this.view = "select_status";
        const currIndex = this.statusOptions.findIndex((s) => s.status === this.chosenTask?.status);
        this.selectedStatusIndex = currIndex >= 0 ? currIndex : 0;
      }
      this.tui?.requestRender?.();
      return;
    }
  }

  private handleSelectStatusInput(data: string): void {
    const key = normalizeModalKey(data);

    if (key === "esc" || data === "b" || data === "B") {
      this.view = "select_task";
      this.tui?.requestRender?.();
      return;
    }

    if (key === "up") {
      this.selectedStatusIndex = (this.selectedStatusIndex - 1 + this.statusOptions.length) % this.statusOptions.length;
      this.tui?.requestRender?.();
      return;
    }

    if (key === "down") {
      this.selectedStatusIndex = (this.selectedStatusIndex + 1) % this.statusOptions.length;
      this.tui?.requestRender?.();
      return;
    }

    const num = parseInt(data, 10);
    if (!isNaN(num) && num >= 1 && num <= this.statusOptions.length) {
      this.selectedStatusIndex = num - 1;
      this.applyStatusChange();
      return;
    }

    if (key === "enter") {
      this.applyStatusChange();
      return;
    }
  }

  private applyStatusChange(): void {
    if (!this.chosenTask || !this.manager) return;
    const newStatus = this.statusOptions[this.selectedStatusIndex].status;
    const res = this.manager.updateTask(this.chosenTask.id, { status: newStatus });
    this.state = this.manager.getState();
    this.refreshTasks();
    this.banner = {
      text: `✏️ ${this.chosenTask.id} actualizada a "${newStatus}"`,
      type: res.success ? "success" : "warning",
    };
    this.view = "menu";
    this.tui?.requestRender?.();
  }

  private handleConfirmExportInput(data: string): void {
    const key = normalizeModalKey(data);

    if (key === "esc" || data === "b" || data === "B" || data === "q") {
      this.view = "menu";
      this.tui?.requestRender?.();
      return;
    }

    if (key === "up" || key === "down") {
      this.selectedExportChoice = this.selectedExportChoice === 0 ? 1 : 0;
      this.tui?.requestRender?.();
      return;
    }

    if (data === "1") {
      this.selectedExportChoice = 0;
      this.executeExport();
      return;
    }

    if (data === "2") {
      this.view = "menu";
      this.tui?.requestRender?.();
      return;
    }

    if (key === "enter") {
      if (this.selectedExportChoice === 0) {
        this.executeExport();
      } else {
        this.view = "menu";
        this.tui?.requestRender?.();
      }
    }
  }

  private executeExport(): void {
    if (!this.manager) return;
    const res = this.manager.exportHtml();
    this.banner = { text: res.message, type: res.success ? "success" : "warning" };
    this.view = "menu";
    this.tui?.requestRender?.();
  }

  invalidate(): void {}
  dispose(): void {}

  private getPalette(): {
    bgAnsi: string;
    borderFgAnsi: string;
    accent: (t: string) => string;
    highlight: (t: string) => string;
    heading: (t: string) => string;
    text: (t: string) => string;
    muted: (t: string) => string;
    dim: (t: string) => string;
    success: (t: string) => string;
    function: (t: string) => string;
    warning: (t: string) => string;
    error: (t: string) => string;
    bold: (t: string) => string;
  } {
    const theme = this.theme;

    const safeFg = (color: string, text: string, fallback = "text"): string => {
      if (!theme?.fg) return text;
      try {
        return theme.fg(color, text);
      } catch {
        try {
          return theme.fg(fallback, text);
        } catch {
          return text;
        }
      }
    };

    // Determine solid background ANSI sequence for the modal:
    // Support environment variable override, then theme tokens, then deep violet fallback
    let bgAnsi = process.env.PI_TASK_MANAGER_BG || "";
    if (!bgAnsi && theme?.getBgAnsi) {
      try {
        bgAnsi =
          theme.getBgAnsi("customMessageBg") ||
          theme.getBgAnsi("toolSuccessBg") ||
          theme.getBgAnsi("toolPendingBg") ||
          "";
      } catch {
        bgAnsi = "";
      }
    }
    if (!bgAnsi) {
      bgAnsi = "\x1b[48;2;20;10;40m"; // Pure Obsidian deep violet #140a28 fallback
    }

    // Determine border foreground ANSI sequence:
    // Support environment variable override, then theme tokens, then bright violet fallback
    let borderFgAnsi = process.env.PI_TASK_MANAGER_BORDER || "";
    if (!borderFgAnsi && theme?.getFgAnsi) {
      try {
        borderFgAnsi = theme.getFgAnsi("border") || theme.getFgAnsi("borderAccent") || "";
      } catch {
        borderFgAnsi = "";
      }
    }
    if (!borderFgAnsi) {
      borderFgAnsi = "\x1b[38;2;168;85;247m"; // Bright purple border #a855f7 fallback
    }

    const bold = (t: string) => (theme?.bold ? theme.bold(t) : `\x1b[1m${t}\x1b[22m`);

    // When no theme is supplied, return rich Obsidian palette preserving ANSI codes
    if (!theme) {
      return {
        bgAnsi,
        borderFgAnsi,
        accent: (t) => `\x1b[38;2;216;180;254m${t}\x1b[0m`,
        highlight: (t) => `\x1b[38;2;250;204;21m${t}\x1b[0m`,
        heading: (t) => `\x1b[38;2;240;225;255m\x1b[1m${t}\x1b[0m`,
        text: (t) => `\x1b[38;2;255;255;255m${t}\x1b[0m`,
        muted: (t) => `\x1b[38;2;167;139;250m${t}\x1b[0m`,
        dim: (t) => `\x1b[38;2;118;97;107m${t}\x1b[0m`,
        success: (t) => `\x1b[38;2;74;222;128m${t}\x1b[0m`,
        function: (t) => `\x1b[38;2;96;165;250m${t}\x1b[0m`,
        warning: (t) => `\x1b[38;2;251;191;36m${t}\x1b[0m`,
        error: (t) => `\x1b[38;2;248;113;113m${t}\x1b[0m`,
        bold,
      };
    }

    return {
      bgAnsi,
      borderFgAnsi,
      accent: (t) => safeFg("accent", t, "text"),
      highlight: (t) => safeFg("borderAccent", t, "accent"),
      heading: (t) => safeFg("mdHeading", t, "accent"),
      text: (t) => safeFg("text", t, "text"),
      muted: (t) => safeFg("muted", t, "text"),
      dim: (t) => safeFg("dim", t, "muted"),
      success: (t) => safeFg("success", t, "text"),
      function: (t) => safeFg("syntaxFunction", t, "accent"),
      warning: (t) => safeFg("warning", t, "accent"),
      error: (t) => safeFg("error", t, "accent"),
      bold,
    };
  }

  render(termWidth: number): string[] {
    // Generous width so lines and task titles do not truncate prematurely
    const boxWidth = Math.max(60, Math.min(86, termWidth - 4));
    const innerW = boxWidth - 2;

    const palette = this.getPalette();
    const RESET = "\x1b[0m";

    const topDouble = (titleStr: string) => {
      const vis = getVisibleWidth(titleStr);
      const leftW = Math.max(2, Math.floor((innerW - vis) / 2));
      const rightW = Math.max(2, innerW - vis - leftW);
      const solidTitle = titleStr.replace(/\x1b\[0m/g, "\x1b[0m" + palette.bgAnsi);
      return (
        palette.bgAnsi +
        palette.borderFgAnsi +
        "╔" +
        "═".repeat(leftW) +
        RESET +
        palette.bgAnsi +
        solidTitle +
        RESET +
        palette.bgAnsi +
        palette.borderFgAnsi +
        "═".repeat(rightW) +
        "╗" +
        RESET
      );
    };

    const midDouble = () =>
      palette.bgAnsi + palette.borderFgAnsi + "╠" + "═".repeat(innerW) + "╣" + RESET;
    const botDouble = () =>
      palette.bgAnsi + palette.borderFgAnsi + "╚" + "═".repeat(innerW) + "╝" + RESET;

    // Keep solid theme background across all text segments without letting \x1b[0m punch transparent holes
    const row = (content: string) => {
      const solidContent = content.replace(/\x1b\[0m/g, "\x1b[0m" + palette.bgAnsi);
      return (
        palette.bgAnsi +
        palette.borderFgAnsi +
        "║" +
        RESET +
        palette.bgAnsi +
        padEndVisible(" " + solidContent, innerW) +
        RESET +
        palette.bgAnsi +
        palette.borderFgAnsi +
        "║" +
        RESET
      );
    };

    const emptyRow = () => row("");

    const lines: string[] = [];

    // Header with double borders and theme background
    const titleBar = ` ${palette.heading(palette.bold(`🗂️  ${this.title}`))} `;
    lines.push(topDouble(titleBar));
    lines.push(emptyRow());

    // Project progress subhead
    if (this.state) {
      const meta = this.state.meta;
      const totalTasks = this.state.phases.reduce((acc, p) => acc + p.tasks.length, 0);
      const completed = this.state.phases.reduce(
        (acc, p) => acc + p.tasks.filter((t) => t.status === "completed").length,
        0
      );
      const inProg = this.state.phases.reduce(
        (acc, p) => acc + p.tasks.filter((t) => t.status === "in_progress").length,
        0
      );
      const pct = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;
      const branch = meta.branch || this.state.git.branch || "main";

      const barLen = 14;
      const filledLen = Math.round((pct / 100) * barLen);
      const bar = "█".repeat(filledLen) + "░".repeat(barLen - filledLen);

      lines.push(
        row(
          `  ${palette.text(palette.bold(meta.projectName))} ${palette.muted(
            `(v${meta.version || "1.0.0"}) · 🌿 ${branch}`
          )}`
        )
      );
      lines.push(
        row(
          `  ${palette.success(bar)} ${palette.text(`${pct}%`)} ${palette.muted(
            `(${completed}/${totalTasks} completadas · ${inProg} en progreso)`
          )}`
        )
      );
      lines.push(midDouble());
    }

    // Status / Notification Banner if active
    if (this.banner) {
      const icon =
        this.banner.type === "success"
          ? `${palette.success("✔")}`
          : this.banner.type === "warning"
          ? `${palette.warning("▲")}`
          : `${palette.function("ℹ")}`;
      lines.push(emptyRow());
      lines.push(row(` ${icon} ${palette.text(this.banner.text)}`));
      lines.push(emptyRow());
      lines.push(midDouble());
    }

    // Switch view content
    switch (this.view) {
      case "menu":
        lines.push(...this.renderMenuView(row, emptyRow, palette));
        break;
      case "list":
        lines.push(...this.renderListView(row, emptyRow, innerW, palette));
        break;
      case "add_todo":
        lines.push(...this.renderAddTodoView(row, emptyRow, palette));
        break;
      case "select_task":
        lines.push(...this.renderSelectTaskView(row, emptyRow, palette));
        break;
      case "select_status":
        lines.push(...this.renderSelectStatusView(row, emptyRow, palette));
        break;
      case "confirm_export":
        lines.push(...this.renderConfirmExportView(row, emptyRow, palette));
        break;
    }

    lines.push(midDouble());

    // Footer helper row
    let helper = " ↑/↓: Navegar · 1-7: Elegir · Enter: Aceptar · Esc: Salir";
    if (this.view === "list") helper = " ↑/↓/j/k: Scrollear · Esc/Enter: Volver al menú principal";
    if (this.view === "add_todo") helper = " Escribí el texto de la tarea · Enter: Guardar · Esc: Cancelar";
    if (this.view === "select_task") helper = " ↑/↓: Elegir tarea · Enter: Cambiar estado · Esc: Volver";
    if (this.view === "select_status") helper = " ↑/↓/1-4: Seleccionar estado · Enter: Confirmar · Esc: Atrás";
    if (this.view === "confirm_export") helper = " ↑/↓/1-2: Seleccionar · Enter: Confirmar · Esc: Cancelar y volver";

    lines.push(row(` ${palette.muted(helper)}`));
    lines.push(botDouble());

    return lines;
  }

  private renderMenuView(
    row: (s: string) => string,
    emptyRow: () => string,
    palette: ReturnType<typeof this.getPalette>
  ): string[] {
    const lines: string[] = [emptyRow()];
    const items = this.getMenuItems();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isSel = i === this.selectedMenuIndex;
      const prefix = `[${i + 1}] `;

      if (isSel) {
        lines.push(row(` ${palette.highlight("❯")} ${palette.accent(palette.bold(`${prefix}${item}`))}`));
      } else {
        lines.push(row(`   ${palette.muted(prefix)}${palette.text(item)}`));
      }
    }

    lines.push(emptyRow());
    return lines;
  }

  private renderListView(
    row: (s: string) => string,
    emptyRow: () => string,
    _innerW: number,
    palette: ReturnType<typeof this.getPalette>
  ): string[] {
    const lines: string[] = [emptyRow()];
    lines.push(row(` ${palette.heading(palette.bold("📋 Lista Interactiva de Fases, Tareas y Todos"))}`));
    lines.push(row(`   ${palette.muted("Enter / Espacio: cambiar estado de tarea o marcar/desmarcar Todo")}`));
    lines.push(emptyRow());

    if (!this.state || !this.allListItems.length) {
      lines.push(row(`   ${palette.muted("Sin elementos registrados todavía.")}`));
      lines.push(emptyRow());
      return lines;
    }

    const windowSize = 9;
    const maxIndex = this.allListItems.length - 1;
    this.listSelectionIndex = Math.max(0, Math.min(this.listSelectionIndex, maxIndex));

    let startIndex = Math.max(0, this.listSelectionIndex - Math.floor(windowSize / 2));
    if (startIndex + windowSize > this.allListItems.length) {
      startIndex = Math.max(0, this.allListItems.length - windowSize);
    }
    const visibleItems = this.allListItems.slice(startIndex, startIndex + windowSize);

    let lastPhaseId = "";

    for (let i = 0; i < visibleItems.length; i++) {
      const idx = startIndex + i;
      const isSelected = idx === this.listSelectionIndex;
      const item = visibleItems[i];

      if (item.type === "task") {
        if (item.phase.id !== lastPhaseId) {
          lastPhaseId = item.phase.id;
          const doneCount = item.phase.tasks.filter((t) => t.status === "completed").length;
          lines.push(
            row(
              ` ${palette.muted(
                palette.bold(`🔹 Fase ${item.phase.number}: ${item.phase.title} [${doneCount}/${item.phase.tasks.length}]`)
              )}`
            )
          );
        }

        const t = item.task;
        const isDone = t.status === "completed";
        const icon = isDone
          ? palette.success("✔")
          : t.status === "in_progress"
          ? palette.function("🔄")
          : t.status === "blocked"
          ? palette.error("⛔")
          : palette.warning("⏳");
        const tag = t.tag ? ` ${palette.muted(`(${t.tag})`)}` : "";
        const owner = t.owner ? ` ${palette.muted(`@${t.owner}`)}` : "";

        if (isSelected) {
          lines.push(
            row(
              ` ${palette.highlight("❯")} [${t.id}] ${icon} ${palette.accent(palette.bold(t.title))}${tag}${owner} ${palette.warning(
                "↵ editar"
              )}`
            )
          );
        } else {
          lines.push(row(`   [${t.id}] ${icon} ${palette.text(t.title)}${tag}${owner}`));
        }
      } else {
        const td = item.todo;
        const check = td.done ? palette.success("[✔] HECHO") : palette.warning("[ ] PENDIENTE");
        if (isSelected) {
          lines.push(
            row(
              ` ${palette.highlight("❯")} 📌 [${td.priority}] ${check} ${palette.accent(palette.bold(td.text))} ${palette.warning(
                "↵ tildar"
              )}`
            )
          );
        } else {
          lines.push(row(`   📌 ${palette.muted(`[${td.priority}]`)} ${check} ${palette.text(td.text)}`));
        }
      }
    }

    if (this.allListItems.length > windowSize) {
      const pos = `${this.listSelectionIndex + 1}/${this.allListItems.length}`;
      lines.push(emptyRow());
      lines.push(row(`  ${palette.muted(`--- Elemento ${pos} (↑/↓ para moverte · Enter para accionar) ---`)}`));
    } else {
      lines.push(emptyRow());
    }

    return lines;
  }

  private renderAddTodoView(
    row: (s: string) => string,
    emptyRow: () => string,
    palette: ReturnType<typeof this.getPalette>
  ): string[] {
    const lines: string[] = [emptyRow()];
    lines.push(row(` ${palette.heading(palette.bold("➕ Agregar Nueva Tarea Rápida (Todo)"))}`));
    lines.push(emptyRow());
    lines.push(row(`   ${palette.muted("Escribí la descripción de la tarea:")}`));
    lines.push(emptyRow());
    lines.push(row(`   ${palette.success("❯")} ${palette.text(`\x1b[4m${this.todoInput || " "}\x1b[0m`)}${palette.accent("█")}`));
    lines.push(emptyRow());

    // Priority selector preview
    const prioOptions = this.todoPriorityOptions
      .map((opt, i) => {
        const isSel = i === this.todoPriorityIndex;
        return isSel ? palette.warning(palette.bold(`[${opt}]`)) : palette.muted(opt);
      })
      .join(" · ");

    lines.push(row(`   ${palette.muted(`Prioridad asignada: ${prioOptions} (Tab: cambiar)`)}`));
    lines.push(emptyRow());
    lines.push(row(`   ${palette.muted("Presioná Enter para guardar o Escape para cancelar.")}`));
    lines.push(emptyRow());
    return lines;
  }

  private renderSelectTaskView(
    row: (s: string) => string,
    emptyRow: () => string,
    palette: ReturnType<typeof this.getPalette>
  ): string[] {
    const lines: string[] = [emptyRow()];
    lines.push(row(` ${palette.heading(palette.bold("✏️ Seleccionar Tarea para Actualizar Estado"))}`));
    lines.push(emptyRow());

    const windowSize = 8;
    const scroll = Math.max(
      0,
      Math.min(this.selectedTaskIndex - Math.floor(windowSize / 2), this.allTasks.length - windowSize)
    );
    const visibleTasks = this.allTasks.slice(scroll, scroll + windowSize);

    for (let i = 0; i < visibleTasks.length; i++) {
      const idx = scroll + i;
      const isSel = idx === this.selectedTaskIndex;
      const { task } = visibleTasks[i];
      const stColor =
        task.status === "completed"
          ? palette.success
          : task.status === "in_progress"
          ? palette.function
          : task.status === "blocked"
          ? palette.error
          : palette.warning;
      const stBadge = `[${task.status}]`;

      if (isSel) {
        lines.push(
          row(
            ` ${palette.highlight("❯")} [${task.id}] ${palette.accent(palette.bold(task.title.slice(0, 34)))} ${stColor(
              stBadge
            )}`
          )
        );
      } else {
        lines.push(row(`   [${task.id}] ${palette.text(task.title.slice(0, 34))} ${stColor(stBadge)}`));
      }
    }

    lines.push(emptyRow());
    return lines;
  }

  private renderSelectStatusView(
    row: (s: string) => string,
    emptyRow: () => string,
    palette: ReturnType<typeof this.getPalette>
  ): string[] {
    const lines: string[] = [emptyRow()];
    if (!this.chosenTask) return lines;

    lines.push(
      row(
        ` ${palette.heading(
          palette.bold(`✏️ Cambiar Estado: [${this.chosenTask.id}] ${this.chosenTask.title.slice(0, 32)}`)
        )}`
      )
    );
    lines.push(row(`   ${palette.muted(`Estado actual: ${this.chosenTask.status}`)}`));
    lines.push(emptyRow());

    for (let i = 0; i < this.statusOptions.length; i++) {
      const opt = this.statusOptions[i];
      const isSel = i === this.selectedStatusIndex;
      const numPrefix = `[${i + 1}] `;

      if (isSel) {
        lines.push(
          row(` ${palette.highlight("❯")} ${palette.accent(palette.bold(`${numPrefix}${opt.label} (${opt.status})`))}`)
        );
      } else {
        lines.push(row(`   ${palette.muted(numPrefix)}${palette.text(`${opt.label} (${opt.status})`)}`));
      }
    }

    lines.push(emptyRow());
    return lines;
  }

  private renderConfirmExportView(
    row: (s: string) => string,
    emptyRow: () => string,
    palette: ReturnType<typeof this.getPalette>
  ): string[] {
    const lines: string[] = [emptyRow()];
    lines.push(row(` ${palette.heading(palette.bold("📦 Exportar Dashboard como HTML Autónomo"))}`));
    lines.push(emptyRow());
    lines.push(
      row(
        `   ${palette.warning("⚠️  Atención:")} ${palette.text(
          "Esto generará un archivo HTML completo (~320 KB) en:"
        )}`
      )
    );
    lines.push(row(`   ${palette.warning("./Task-Manager-Portable.html")}`));
    lines.push(emptyRow());
    lines.push(row(`   ${palette.muted("Úsalo solo si necesitas compartir o publicar el dashboard estático.")}`));
    lines.push(row(`   ${palette.muted("Para uso local en Pi, el visualizador efímero no ensucia tu repo.")}`));
    lines.push(emptyRow());

    const choices = [
      "Sí, exportar archivo HTML a la raíz del proyecto",
      "Cancelar y volver al menú principal",
    ];

    for (let i = 0; i < choices.length; i++) {
      const isSel = i === this.selectedExportChoice;
      const prefix = `[${i + 1}] `;
      if (isSel) {
        const choiceColor = i === 0 ? palette.success : palette.warning;
        lines.push(row(` ${palette.highlight("❯")} ${choiceColor(palette.bold(`${prefix}${choices[i]}`))}`));
      } else {
        lines.push(row(`   ${palette.muted(prefix)}${palette.text(choices[i])}`));
      }
    }

    lines.push(emptyRow());
    return lines;
  }
}

export async function runInteractiveMenu(manager: TaskManager, ctx: UiContext): Promise<string> {
  const exists = manager.exists();
  const state = exists ? manager.getState() : null;
  const title = `Pi Task Manager (${path.basename(manager.workspaceRoot)})`;

  // Render full interactive cockpit app as floating modal overlay when custom UI is available
  if (typeof ctx.ui?.custom === "function") {
    await ctx.ui.custom<string | undefined>(
      (tui, theme, _keybindings, done) =>
        new TaskManagerModalOverlay(title, manager, state, theme, tui, done),
      {
        overlay: true,
        overlayOptions: {
          anchor: "center",
          width: 86,
          maxHeight: 26,
        },
      }
    );
    return "Menú cerrado.";
  }

  // Fallback for non-interactive / simple text environments
  if (ctx.ui?.select) {
    const options = exists
      ? [
          "🌐 Abrir dashboard en el navegador (visualizador)",
          "🔄 Sincronizar git y tareas ahora",
          "📋 Ver resumen y lista completa en terminal",
          "➕ Agregar tarea rápida (Todo)",
          "✏️ Actualizar estado de una tarea",
          "📦 Exportar dashboard como HTML portable",
        ]
      : [
          "🚀 Inicializar Task Manager (.pi/task-manager.json)",
          "🌐 Inicializar y abrir directamente en el navegador",
        ];

    const selected = await ctx.ui.select(`🗂️ ${title}`, options);
    if (!selected) return "Operación cancelada.";

    if (selected.includes("Inicializar")) {
      const res = manager.init();
      ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
      if (selected.includes("navegador")) {
        await manager.openInBrowser();
      }
      return res.message;
    }

    if (selected.includes("Exportar dashboard")) {
      const res = manager.exportHtml();
      ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
      return res.message;
    }

    if (selected.includes("navegador")) {
      const res = await manager.openInBrowser();
      ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
      return res.message;
    }

    if (selected.includes("Sincronizar")) {
      const res = manager.sync({ syncTasksFromMarkdown: true });
      ctx.ui?.notify?.(res.message, res.success ? "info" : "error");
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
  }

  if (!manager.exists()) {
    manager.init();
  }
  return formatStatusSummary(manager.getState());
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
