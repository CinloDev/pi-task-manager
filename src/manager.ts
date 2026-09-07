import fs from "node:fs";
import path from "node:path";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TaskManagerOptions {
  workspaceRoot?: string;
  targetFilename?: string;
  templatePath?: string;
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
  readonly targetFilePath: string;
  readonly templatePath: string;

  constructor(options: TaskManagerOptions = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    const targetName = options.targetFilename || "Task-Manager-Portable.html";
    this.targetFilePath = path.join(this.workspaceRoot, targetName);

    this.templatePath =
      options.templatePath ||
      path.resolve(__dirname, "..", "Task-Manager-Portable.html");
  }

  /**
   * Checks if the Task-Manager-Portable.html exists in the target workspace.
   */
  exists(): boolean {
    return fs.existsSync(this.targetFilePath);
  }

  /**
   * Reads raw HTML and parses the #tm-state.
   */
  getState(): TaskManagerState {
    if (!this.exists()) {
      throw new Error(`Task Manager HTML not found at: ${this.targetFilePath}`);
    }
    const html = fs.readFileSync(this.targetFilePath, "utf-8");
    return parseIslandState(html);
  }

  /**
   * Validates and saves updated state atomically into the target HTML file.
   */
  saveState(state: TaskManagerState): { success: boolean; message: string } {
    const valid = validateState(state);
    if (!valid.ok) {
      return {
        success: false,
        message: `Invalid state: ${valid.errors.join(", ")}`,
      };
    }

    if (!this.exists()) {
      return {
        success: false,
        message: `Target file does not exist: ${this.targetFilePath}`,
      };
    }

    state.meta.lastUpdated = new Date().toISOString();

    const currentHtml = fs.readFileSync(this.targetFilePath, "utf-8");
    const updatedHtml = injectIslandState(currentHtml, state);

    // Atomic write via temp file
    const tempPath = `${this.targetFilePath}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tempPath, updatedHtml, "utf-8");
      fs.renameSync(tempPath, this.targetFilePath);
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
   * Initializes Task-Manager-Portable.html in workspace from template and current workspace scan.
   */
  init(options: { force?: boolean } = {}): { success: boolean; message: string } {
    if (this.exists() && !options.force) {
      return {
        success: true,
        message: `Task Manager already exists at: ${this.targetFilePath}`,
      };
    }

    let baseHtml = "";
    if (fs.existsSync(this.templatePath)) {
      baseHtml = fs.readFileSync(this.templatePath, "utf-8");
    } else {
      throw new Error(`Template not found at: ${this.templatePath}`);
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
    if (scan.meta.description) {
      initialState.meta.description = scan.meta.description;
    }
    if (scan.phases && scan.phases.length > 0) {
      initialState.phases = scan.phases;
    }

    const htmlWithState = injectIslandState(baseHtml, initialState);
    fs.writeFileSync(this.targetFilePath, htmlWithState, "utf-8");

    return {
      success: true,
      message: `Task Manager initialized at ${this.targetFilePath}`,
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

    if (scan.meta.projectName) state.meta.projectName = scan.meta.projectName;
    if (scan.meta.version) state.meta.version = scan.meta.version;

    if (options.syncTasksFromMarkdown && scan.phases && scan.phases.length > 0) {
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
   */
  addTodo(input: TodoCreateInput): { success: boolean; message: string; todo?: TodoItem } {
    const state = this.getState();
    const id = `td-${Date.now().toString(36)}`;
    const newTodo: TodoItem = {
      id,
      text: input.text,
      priority: input.priority || "P1",
      done: false,
    };
    state.todos.push(newTodo);
    const saveRes = this.saveState(state);
    return {
      success: saveRes.success,
      message: saveRes.success ? `Todo added: "${input.text}"` : saveRes.message,
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
   * Opens Task-Manager-Portable.html in default system web browser.
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

      const fileUrl = `file://${this.targetFilePath}`;
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
          const winPath = execSync(`wslpath -w "${this.targetFilePath}"`, {
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
                      message: `No se pudo abrir el navegador en Windows: ${psErr.message}. Podés abrir el archivo manualmente en: ${this.targetFilePath}`,
                    });
                  } else {
                    resolve({
                      success: true,
                      message: `Abierto en el navegador: ${this.targetFilePath}`,
                    });
                  }
                });
              } else {
                resolve({
                  success: true,
                  message: `Abierto en el navegador: ${this.targetFilePath}`,
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
              message: `Opened Task Manager in browser: ${this.targetFilePath}`,
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
              message: `Opened Task Manager in browser: ${this.targetFilePath}`,
            });
          }
        });
        return;
      }

      // Standard Linux fallback
      exec(`xdg-open "${fileUrl}" || sensible-browser "${this.targetFilePath}" || python3 -m webbrowser "${fileUrl}"`, (err) => {
        if (err) {
          resolve({
            success: false,
            message: `No se pudo abrir el navegador automáticamente: ${err.message}. Podés abrir ${this.targetFilePath} manualmente.`,
          });
        } else {
          resolve({
            success: true,
            message: `Abierto en el navegador: ${this.targetFilePath}`,
          });
        }
      });
    });
  }
}
