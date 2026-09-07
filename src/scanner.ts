import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type {
  Phase,
  Task,
  Subtask,
  TreeItem,
  GitState,
  GitCommit,
  ProjectMeta,
  TaskStatus,
} from "./types.js";

const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".cache",
  ".next",
  ".turbo",
  "coverage",
  ".pi",
]);

/**
 * Detects project metadata from package.json or workspace root.
 */
export function detectProjectMeta(workspaceRoot: string): Partial<ProjectMeta> {
  const pkgPath = path.join(workspaceRoot, "package.json");
  let name = path.basename(workspaceRoot);
  let version = "1.0.0";
  let description = "Project managed with Pi";

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.name) name = pkg.name;
      if (pkg.version) version = pkg.version;
      if (pkg.description) description = pkg.description;
    } catch {}
  }

  return {
    projectName: name,
    version,
    description,
    harness: "Pi",
    harnessRole: "Coding Agent Harness",
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Scans git branch and recent commits in workspace.
 */
export function scanGitState(workspaceRoot: string, commitCount = 10): GitState {
  let branch = "main";
  const commits: GitCommit[] = [];
  let syncStatus = "Sincronizado";

  try {
    const branchOutput = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: workspaceRoot,
      stdio: ["pipe", "pipe", "ignore"],
      encoding: "utf-8",
    }).trim();
    if (branchOutput) branch = branchOutput;
  } catch {}

  try {
    const logOutput = execSync(
      `git log -n ${commitCount} --pretty=format:"%h%x09%s%x09%an%x09%ad" --date=short`,
      {
        cwd: workspaceRoot,
        stdio: ["pipe", "pipe", "ignore"],
        encoding: "utf-8",
      }
    ).trim();

    if (logOutput) {
      const lines = logOutput.split("\n");
      for (const line of lines) {
        const parts = line.split("\t");
        if (parts[0]) {
          commits.push({
            hash: parts[0],
            message: parts[1] || "",
            author: parts[2] || "",
            date: parts[3] || "",
          });
        }
      }
    }
  } catch {}

  try {
    const statusOutput = execSync("git status --porcelain", {
      cwd: workspaceRoot,
      stdio: ["pipe", "pipe", "ignore"],
      encoding: "utf-8",
    }).trim();
    if (statusOutput) {
      syncStatus = "Cambios locales pendientes";
    }
  } catch {}

  return {
    branch,
    commits,
    syncStatus,
  };
}

/**
 * Scans the workspace directory tree up to maxDepth.
 */
export function scanDirectoryTree(
  workspaceRoot: string,
  maxDepth = 2,
  currentDepth = 0,
  relativeDir = ""
): TreeItem[] {
  const result: TreeItem[] = [];
  const currentPath = path.join(workspaceRoot, relativeDir);

  if (!fs.existsSync(currentPath)) return result;

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(currentPath, { withFileTypes: true });
  } catch {
    return result;
  }

  // Sort directories first, then files alphabetically
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".gitignore") continue;

    const isDir = entry.isDirectory();
    const displayName = isDir ? `${entry.name}/` : entry.name;

    result.push({
      name: displayName,
      depth: currentDepth,
      type: isDir ? "dir" : "file",
    });

    if (isDir && currentDepth < maxDepth) {
      const subItems = scanDirectoryTree(
        workspaceRoot,
        maxDepth,
        currentDepth + 1,
        path.join(relativeDir, entry.name)
      );
      result.push(...subItems);
    }
  }

  return result;
}

/**
 * Parses markdown tasks (e.g. from tasks.md or SDD specs) into structured Phase[]
 */
export function parseMarkdownTasks(markdown: string): Phase[] {
  const lines = markdown.split("\n");
  const phases: Phase[] = [];
  let currentPhase: Phase | null = null;
  let currentTask: Task | null = null;
  let phaseCounter = 0;
  let taskCounter = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Match Header as Phase (# 1. Title or ## Phase 1: Title)
    const headerMatch = line.match(/^#{1,3}\s+(?:Phase\s+)?(\d+)?[:.]?\s*(.*)$/i);
    if (headerMatch && !line.startsWith("### Task") && !line.startsWith("####")) {
      const num = headerMatch[1] ? parseInt(headerMatch[1], 10) : ++phaseCounter;
      const title = headerMatch[2].trim() || `Fase ${num}`;

      currentPhase = {
        id: `phase-${num}`,
        number: num,
        title,
        status: "pending",
        target: `Fase ${num}`,
        tasks: [],
      };
      phases.push(currentPhase);
      currentTask = null;
      continue;
    }

    // Match Task (- [x] or - [ ])
    const taskMatch = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch) {
      const indent = taskMatch[1].length;
      const isDone = taskMatch[2].toLowerCase() === "x";
      const rawText = taskMatch[3].trim();

      // Check if subtask (indented 2+ spaces or under an active task)
      if (indent >= 2 && currentTask) {
        currentTask.subtasks = currentTask.subtasks || [];
        const subId = `ST${currentTask.id}-${currentTask.subtasks.length + 1}`;
        currentTask.subtasks.push({
          id: subId,
          title: rawText,
          status: isDone ? "completed" : "pending",
          done: isDone,
        });
        continue;
      }

      // Top-level task
      if (!currentPhase) {
        currentPhase = {
          id: `phase-${++phaseCounter}`,
          number: phaseCounter,
          title: "Tareas Principales",
          status: "pending",
          tasks: [],
        };
        phases.push(currentPhase);
      }

      taskCounter++;
      // Parse optional comment metadata: <!-- id: T1, tag: Core, owner: Pi -->
      let id = `T${currentPhase.number}-${String(taskCounter).padStart(2, "0")}`;
      let tag: string | undefined;
      let owner: string | undefined;
      let cleanedTitle = rawText;

      const commentMatch = rawText.match(/<!--([\s\S]*?)-->/);
      if (commentMatch) {
        cleanedTitle = rawText.replace(/<!--[\s\S]*?-->/, "").trim();
        const metaStr = commentMatch[1];
        const idM = metaStr.match(/id:\s*([^\s,;]+)/);
        if (idM) id = idM[1];
        const tagM = metaStr.match(/tag:\s*([^\s,;]+)/);
        if (tagM) tag = tagM[1];
        const ownerM = metaStr.match(/owner:\s*([^\s,;]+)/);
        if (ownerM) owner = ownerM[1];
      }

      const status: TaskStatus = isDone ? "completed" : "pending";
      currentTask = {
        id,
        title: cleanedTitle,
        status,
        tag,
        owner,
        subtasks: [],
      };
      currentPhase.tasks.push(currentTask);
    }
  }

  // Derive phase statuses based on child tasks
  for (const phase of phases) {
    if (phase.tasks.length === 0) continue;
    const completed = phase.tasks.filter((t) => t.status === "completed").length;
    if (completed === phase.tasks.length) {
      phase.status = "completed";
    } else if (completed > 0 || phase.tasks.some((t) => t.status === "in_progress")) {
      phase.status = "in_progress";
    } else {
      phase.status = "pending";
    }
  }

  return phases;
}

/**
 * Searches for any task markdown file (tasks.md, openspec tasks, etc.)
 */
export function findProjectTasks(workspaceRoot: string): Phase[] | null {
  const candidatePaths = [
    path.join(workspaceRoot, "tasks.md"),
    path.join(workspaceRoot, "task.md"),
    path.join(workspaceRoot, "TODO.md"),
    path.join(workspaceRoot, "openspec", "tasks.md"),
  ];

  for (const cPath of candidatePaths) {
    if (fs.existsSync(cPath)) {
      try {
        const content = fs.readFileSync(cPath, "utf-8");
        const phases = parseMarkdownTasks(content);
        if (phases.length > 0) return phases;
      } catch {}
    }
  }

  // Check openspec/changes/*/tasks.md
  const changesDir = path.join(workspaceRoot, "openspec", "changes");
  if (fs.existsSync(changesDir)) {
    try {
      const changes = fs.readdirSync(changesDir, { withFileTypes: true });
      for (const change of changes) {
        if (change.isDirectory()) {
          const changeTasksPath = path.join(changesDir, change.name, "tasks.md");
          if (fs.existsSync(changeTasksPath)) {
            const content = fs.readFileSync(changeTasksPath, "utf-8");
            const phases = parseMarkdownTasks(content);
            if (phases.length > 0) return phases;
          }
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Combines all scanner sources into one payload.
 */
export function scanWorkspace(workspaceRoot: string): {
  meta: Partial<ProjectMeta>;
  git: GitState;
  tree: TreeItem[];
  phases?: Phase[];
} {
  const meta = detectProjectMeta(workspaceRoot);
  const git = scanGitState(workspaceRoot);
  const tree = scanDirectoryTree(workspaceRoot);
  const phases = findProjectTasks(workspaceRoot) || undefined;

  return {
    meta,
    git,
    tree,
    phases,
  };
}
