import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec, execFile, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { TaskManagerState, TaskStatus, Task, TodoItem } from "./types.js";
import {
  parseIslandState,
  injectIslandState,
  createInitialState,
  validateState,
} from "./island.js";
import { scanWorkspace } from "./scanner.js";
import { assembleHtml } from "./assembler.js";
import { recordTokenUsage, type RecordTokenUsageParams } from "./telemetry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TaskManagerOptions {
  workspaceRoot?: string;
  targetFilename?: string;
  templatePath?: string;
  modulesDir?: string;
}

export interface TaskUpdateInput {
  status?: TaskStatus;
  note?: string;
  owner?: string;
  tag?: string;
  commit?: string;
  blockedReason?: string;
}

export interface TodoCreateInput {
  text: string;
  priority?: "P0" | "P1" | "P2" | "P3";
}

export class TaskManager {
  readonly workspaceRoot: string;
  readonly stateFilePath: string;
  readonly legacyHtmlPath: string;
  readonly templatePath: string;
  readonly modulesDir: string;

  constructor(options: TaskManagerOptions = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    const defaultStateRel = path.join(".pi", "task-manager.json");
    const targetName = options.targetFilename || defaultStateRel;

    this.stateFilePath = path.isAbsolute(targetName)
      ? targetName
      : path.join(this.workspaceRoot, targetName);

    this.legacyHtmlPath = path.join(this.workspaceRoot, "Task-Manager-Portable.html");

    this.templatePath =
      options.templatePath ||
      path.resolve(__dirname, "..", "Task-Manager-Portable.html");

    this.modulesDir =
      options.modulesDir ||
      path.resolve(__dirname, "..", "modules");
  }

  /**
   * Backwards compatible alias for the primary state file path.
   */
  get targetFilePath(): string {
    return this.stateFilePath;
  }

  /**
   * Checks if Task Manager state exists (either .pi/task-manager.json or legacy HTML).
   */
  exists(): boolean {
    return fs.existsSync(this.stateFilePath) || fs.existsSync(this.legacyHtmlPath);
  }

  /**
   * Reads state from .pi/task-manager.json, or falls back to legacy HTML if present.
   */
  getState(): TaskManagerState {
    if (fs.existsSync(this.stateFilePath)) {
      if (this.stateFilePath.endsWith(".html")) {
        const html = fs.readFileSync(this.stateFilePath, "utf-8");
        return parseIslandState(html);
      }
      const raw = fs.readFileSync(this.stateFilePath, "utf-8");
      return JSON.parse(raw);
    }

    if (fs.existsSync(this.legacyHtmlPath)) {
      const html = fs.readFileSync(this.legacyHtmlPath, "utf-8");
      return parseIslandState(html);
    }

    throw new Error(`Task Manager state not found at: ${this.stateFilePath}`);
  }

  /**
   * Validates and saves updated state atomically into the target state JSON file.
   */
  saveState(state: TaskManagerState): { success: boolean; message: string } {
    const valid = validateState(state);
    if (!valid.ok) {
      return {
        success: false,
        message: `Invalid state: ${valid.errors.join(", ")}`,
      };
    }

    state.meta.lastUpdated = new Date().toISOString();

    const parentDir = path.dirname(this.stateFilePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Atomic write via temp file
    const tempPath = `${this.stateFilePath}.${Date.now()}.tmp`;
    try {
      if (this.stateFilePath.endsWith(".html")) {
        const currentHtml = fs.existsSync(this.stateFilePath)
          ? fs.readFileSync(this.stateFilePath, "utf-8")
          : fs.readFileSync(this.templatePath, "utf-8");
        const updatedHtml = injectIslandState(currentHtml, state);
        fs.writeFileSync(tempPath, updatedHtml, "utf-8");
      } else {
        fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf-8");
      }
      fs.renameSync(tempPath, this.stateFilePath);

      // Keep legacy HTML synchronized if it exists in the workspace
      if (!this.stateFilePath.endsWith(".html") && fs.existsSync(this.legacyHtmlPath)) {
        try {
          const currentHtml = fs.readFileSync(this.legacyHtmlPath, "utf-8");
          const updatedHtml = injectIslandState(currentHtml, state);
          fs.writeFileSync(this.legacyHtmlPath, updatedHtml, "utf-8");
        } catch {}
      }

      return {
        success: true,
        message: "Task Manager state saved successfully.",
      };
    } catch (err: any) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
      return {
        success: false,
        message: `Failed to write file: ${err?.message || String(err)}`,
      };
    }
  }

  /**
   * Initializes Task Manager state (.pi/task-manager.json) from current workspace scan.
   * Does NOT clutter the workspace with 7,000-line HTML files.
   */
  init(options: { force?: boolean } = {}): { success: boolean; message: string } {
    if (this.exists() && !options.force) {
      return {
        success: true,
        message: `Task Manager already exists at: ${this.stateFilePath}`,
      };
    }

    // Scan workspace
    const scan = scanWorkspace(this.workspaceRoot);
    const initialState = createInitialState(
      scan.meta.projectName,
      scan.meta.version,
      scan.git.branch
    );

    // Populate scanned data
    initialState.git = scan.git;
    initialState.tree = scan.tree;
    initialState.codegraph = scan.codegraph;
    if (scan.meta.description) {
      initialState.meta.description = scan.meta.description;
    }
    if (scan.phases && scan.phases.length > 0) {
      initialState.phases = scan.phases;
    } else {
      // Personalize default phase titles to current project
      const projName = scan.meta.projectName || "Proyecto";
      initialState.phases = [
        {
          id: "phase-1",
          number: 1,
          title: `${projName} — Arquitectura & Setup`,
          status: "completed",
          target: "Fase 1",
          lead: "Orquestador",
          tasks: [
            {
              id: "T1-01",
              title: `Configurar entorno y base de ${projName}`,
              status: "completed",
              tag: "Setup",
              owner: "Pi",
            },
          ],
        },
        {
          id: "phase-2",
          number: 2,
          title: `${projName} — Desarrollo Core`,
          status: "in_progress",
          target: "Fase 2",
          lead: "sdd-apply",
          tasks: [
            {
              id: "T2-01",
              title: "Implementar funcionalidades prioritarias",
              status: "in_progress",
              tag: "Core",
              owner: "sdd-apply",
            },
          ],
        },
        {
          id: "phase-3",
          number: 3,
          title: `${projName} — Testing y Verificación`,
          status: "pending",
          target: "Fase 3",
          lead: "sdd-verify",
          tasks: [
            {
              id: "T3-01",
              title: "Verificar cobertura de pruebas y calidad",
              status: "pending",
              tag: "QA",
              owner: "sdd-verify",
            },
          ],
        },
      ];
    }

    const parentDir = path.dirname(this.stateFilePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (this.stateFilePath.endsWith(".html")) {
      const htmlWithState = assembleHtml(initialState, { modulesDir: this.modulesDir });
      fs.writeFileSync(this.stateFilePath, htmlWithState, "utf-8");
    } else {
      fs.writeFileSync(this.stateFilePath, JSON.stringify(initialState, null, 2), "utf-8");
    }

    return {
      success: true,
      message: `Task Manager initialized at ${this.stateFilePath}`,
    };
  }

  /**
   * Synchronizes git commits, branch, and workspace tree into #tm-state.
   */
  sync(options: { syncTasksFromMarkdown?: boolean } = {}): {
    success: boolean;
    message: string;
  } {
    if (!this.exists()) {
      return this.init();
    }

    const state = this.getState();
    const scan = scanWorkspace(this.workspaceRoot);

    state.git = scan.git;
    state.tree = scan.tree;
    state.codegraph = scan.codegraph;

    if (scan.meta.projectName) state.meta.projectName = scan.meta.projectName;
    if (scan.meta.version) state.meta.version = scan.meta.version;
    if (scan.meta.description) state.meta.description = scan.meta.description;

    const shouldSyncPhases = options.syncTasksFromMarkdown !== false;
    if (shouldSyncPhases && scan.phases && scan.phases.length > 0) {
      state.phases = scan.phases;
    }

    return this.saveState(state);
  }

  /**
   * Updates a specific task across all phases.
   */
  updateTask(
    taskId: string,
    updates: TaskUpdateInput
  ): { success: boolean; message: string; task?: Task } {
    const state = this.getState();
    let targetTask: Task | null = null;

    for (const phase of state.phases) {
      const found = phase.tasks.find((t) => t.id === taskId);
      if (found) {
        targetTask = found;
        if (updates.status !== undefined) found.status = updates.status;
        if (updates.note !== undefined) found.note = updates.note;
        if (updates.owner !== undefined) found.owner = updates.owner;
        if (updates.tag !== undefined) found.tag = updates.tag;
        if (updates.commit !== undefined) found.commit = updates.commit;
        if (updates.blockedReason !== undefined) found.blockedReason = updates.blockedReason;

        // Recalculate phase status
        const completed = phase.tasks.filter((t) => t.status === "completed").length;
        if (completed === phase.tasks.length) {
          phase.status = "completed";
        } else if (completed > 0 || phase.tasks.some((t) => t.status === "in_progress")) {
          phase.status = "in_progress";
        } else {
          phase.status = "pending";
        }
        break;
      }
    }

    if (!targetTask) {
      return {
        success: false,
        message: `Task "${taskId}" not found in any phase.`,
      };
    }

    const saveRes = this.saveState(state);
    return {
      success: saveRes.success,
      message: saveRes.success
        ? `Task ${taskId} updated to ${updates.status || targetTask.status}.`
        : saveRes.message,
      task: targetTask,
    };
  }

  /**
   * Adds a quick todo item.
   * If priority is not explicitly provided, auto-assigns the next available priority
   * (P0, P1, P2, P3) based on existing todos.
   */
  addTodo(input: TodoCreateInput): { success: boolean; message: string; todo?: TodoItem } {
    const state = this.getState();
    const id = `td-${Date.now().toString(36)}`;

    let assignedPriority: "P0" | "P1" | "P2" | "P3" = input.priority || "P1";
    if (!input.priority) {
      const existingPriorities = new Set(state.todos.map((t) => t.priority));
      const priorityOrder: ("P0" | "P1" | "P2" | "P3")[] = ["P0", "P1", "P2", "P3"];
      const nextAvailable = priorityOrder.find((p) => !existingPriorities.has(p));
      assignedPriority = nextAvailable || "P3";
    }

    const newTodo: TodoItem = {
      id,
      text: input.text,
      priority: assignedPriority,
      done: false,
    };
    state.todos.push(newTodo);
    const saveRes = this.saveState(state);
    return {
      success: saveRes.success,
      message: saveRes.success ? `Todo added [${assignedPriority}]: "${input.text}"` : saveRes.message,
      todo: newTodo,
    };
  }

  /**
   * Toggles completion status of a quick todo.
   */
  toggleTodo(todoId: string): { success: boolean; message: string } {
    const state = this.getState();
    const found = state.todos.find((t) => t.id === todoId);
    if (!found) {
      return { success: false, message: `Todo "${todoId}" not found.` };
    }
    found.done = !found.done;
    return this.saveState(state);
  }

  /**
   * Records operational token telemetry for an agent turn and persists to state.
   */
  recordTokenUsage(params: RecordTokenUsageParams): { success: boolean; message: string } {
    if (!this.exists()) {
      return { success: false, message: "Task Manager is not initialized." };
    }
    const state = this.getState();
    recordTokenUsage(state, params);
    return this.saveState(state);
  }

  /**
   * Opens Task Manager in default system web browser.
   * Renders the project's state into an ephemeral HTML in os.tmpdir() so that
   * the workspace stays clean and free of huge HTML files.
   * Supports macOS, Windows, Linux, and WSL2 environments seamlessly.
   */
  openInBrowser(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      if (!this.exists()) {
        const initRes = this.init();
        if (!initRes.success) {
          return resolve(initRes);
        }
      }

      let htmlToOpen = this.stateFilePath;
      if (!this.stateFilePath.endsWith(".html")) {
        let state: TaskManagerState;
        try {
          state = this.getState();
        } catch (err: any) {
          return resolve({
            success: false,
            message: `Error al leer estado: ${err?.message || String(err)}`,
          });
        }

        let updatedHtml = "";
        try {
          updatedHtml = assembleHtml(state, { modulesDir: this.modulesDir });
        } catch (err: any) {
          return resolve({
            success: false,
            message: `Error al ensamblar dashboard: ${err?.message || String(err)}`,
          });
        }

        const projName = (state.meta?.projectName || path.basename(this.workspaceRoot)).replace(
          /[^a-zA-Z0-9_-]/g,
          "_"
        );
        const tmpFilePath = path.join(os.tmpdir(), `pi-task-manager-${projName}.html`);
        try {
          fs.writeFileSync(tmpFilePath, updatedHtml, "utf-8");
          htmlToOpen = tmpFilePath;
        } catch (err: any) {
          return resolve({
            success: false,
            message: `No se pudo generar archivo temporal de visualización: ${err?.message || String(err)}`,
          });
        }
      }

      const fileUrl = `file://${htmlToOpen}`;
      const platform = process.platform;

      const isWsl = (): boolean => {
        if (platform !== "linux") return false;
        if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
        try {
          const v = fs.readFileSync("/proc/version", "utf-8");
          return /microsoft|wsl/i.test(v);
        } catch {
          return false;
        }
      };

      if (isWsl()) {
        try {
          const winPath = execSync(`wslpath -w "${htmlToOpen}"`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
          }).trim();

          // Script in PowerShell to specifically find the default web browser (https handler)
          // instead of opening the file in VS Code or code editors associated with .html
          const psScript = `
$filePath = "${winPath}";
$progId = (Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice" -ErrorAction SilentlyContinue).ProgId;
$raw = if ($progId) { (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\\$progId\\shell\\open\\command" -ErrorAction SilentlyContinue)."(default)" } else { $null };
$browser = $null;
if ($raw -and $raw.StartsWith([char]34)) {
    $browser = $raw.Split([char]34)[1];
} elseif ($raw) {
    $browser = $raw.Split(" ")[0];
}
if ($browser -and (Test-Path $browser)) {
    Start-Process -FilePath $browser -ArgumentList $filePath;
} else {
    try { Start-Process "chrome.exe" -ArgumentList $filePath } catch {
        try { Start-Process "msedge.exe" -ArgumentList $filePath } catch {
            Start-Process $filePath;
        }
    }
}
`;
          const encoded = Buffer.from(psScript, "utf16le").toString("base64");

          execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
            (psErr) => {
              if (psErr) {
                // Fallback to explorer or cmd.exe
                execFile("cmd.exe", ["/c", "start", "", winPath], (cmdErr) => {
                  if (cmdErr) {
                    resolve({
                      success: false,
                      message: `No se pudo abrir el navegador en Windows: ${psErr.message}. Podés abrir el archivo temporal en: ${htmlToOpen}`,
                    });
                  } else {
                    resolve({
                      success: true,
                      message: `Abierto en el navegador: ${htmlToOpen}`,
                    });
                  }
                });
              } else {
                resolve({
                  success: true,
                  message: `Abierto en el navegador: ${htmlToOpen}`,
                });
              }
            }
          );
          return;
        } catch (wslErr: any) {
          resolve({
            success: false,
            message: `Error al convertir la ruta de WSL: ${wslErr?.message || String(wslErr)}`,
          });
          return;
        }
      }

      if (platform === "darwin") {
        execFile("open", [fileUrl], (err) => {
          if (err) {
            resolve({
              success: false,
              message: `Could not launch browser: ${err.message}`,
            });
          } else {
            resolve({
              success: true,
              message: `Opened Task Manager in browser: ${htmlToOpen}`,
            });
          }
        });
        return;
      }

      if (platform === "win32") {
        execFile("cmd.exe", ["/c", "start", "", fileUrl], (err) => {
          if (err) {
            resolve({
              success: false,
              message: `Could not launch browser: ${err.message}`,
            });
          } else {
            resolve({
              success: true,
              message: `Opened Task Manager in browser: ${htmlToOpen}`,
            });
          }
        });
        return;
      }

      // Standard Linux fallback
      exec(`xdg-open "${fileUrl}" || sensible-browser "${htmlToOpen}" || python3 -m webbrowser "${fileUrl}"`, (err) => {
        if (err) {
          resolve({
            success: false,
            message: `No se pudo abrir el navegador automáticamente: ${err.message}. Podés abrir ${htmlToOpen} manualmente.`,
          });
        } else {
          resolve({
            success: true,
            message: `Abierto en el navegador: ${htmlToOpen}`,
          });
        }
      });
    });
  }

  /**
   * Explicitly exports a standalone Task-Manager-Portable.html into the workspace
   * or a custom destination for offline sharing or static publishing.
   */
  exportHtml(destinationPath?: string): { success: boolean; message: string; filePath?: string } {
    if (!this.exists()) {
      return {
        success: false,
        message: "No hay estado de Task Manager inicializado para exportar.",
      };
    }

    const state = this.getState();
    let updatedHtml = "";
    try {
      updatedHtml = assembleHtml(state, { modulesDir: this.modulesDir });
    } catch (err: any) {
      return {
        success: false,
        message: `Error al ensamblar HTML: ${err?.message || String(err)}`,
      };
    }

    const dest = destinationPath
      ? path.isAbsolute(destinationPath)
        ? destinationPath
        : path.join(this.workspaceRoot, destinationPath)
      : path.join(this.workspaceRoot, "Task-Manager-Portable.html");

    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    try {
      fs.writeFileSync(dest, updatedHtml, "utf-8");
      return {
        success: true,
        message: `Dashboard exportado exitosamente a: ${dest}`,
        filePath: dest,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Error al exportar HTML: ${err?.message || String(err)}`,
      };
    }
  }
}
