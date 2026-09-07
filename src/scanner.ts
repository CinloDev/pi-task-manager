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
  CodeGraph,
  CodeGraphNode,
  CodeGraphEdge,
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
 * Parses markdown tasks from tasks.md, OpenSpec PR units, or Backlog status documents.
 */
export function parseMarkdownTasks(markdown: string, defaultPhaseTitle?: string): Phase[] {
  const lines = markdown.split("\n");
  const phases: Phase[] = [];
  let currentPhase: Phase | null = null;
  let currentTask: Task | null = null;
  let phaseCounter = 0;
  let taskCounter = 0;

  const ensurePhase = (title?: string): Phase => {
    if (!currentPhase) {
      phaseCounter++;
      currentPhase = {
        id: `phase-${phaseCounter}`,
        number: phaseCounter,
        title: title || defaultPhaseTitle || `Fase ${phaseCounter}`,
        status: "pending",
        target: `Fase ${phaseCounter}`,
        tasks: [],
      };
      phases.push(currentPhase);
    }
    return currentPhase;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // 1. Match Headers as Phases (e.g. # 1. Title, ## Phase 2: Title, ## PR 1: Title, ### Tier S: Title)
    const headerMatch = line.match(/^#{1,3}\s+(?:Phase\s+|PR\s+|Fase\s+|Tier\s+|Hito\s+|Milestone\s+)?(\d+)?[:.]?\s*(.*)$/i);
    if (
      headerMatch &&
      !line.startsWith("### Task") &&
      !line.toLowerCase().includes("review workload forecast") &&
      !line.toLowerCase().includes("resumen ejecutivo")
    ) {
      const num = headerMatch[1] ? parseInt(headerMatch[1], 10) : ++phaseCounter;
      const rawTitle = headerMatch[2].trim() || `Fase ${num}`;
      // Clean up markdown formatting in title
      const title = rawTitle.replace(/\*\*/g, "").replace(/`/g, "").trim();

      if (title.length > 2) {
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
    }

    // 2. Match Standard Checkbox Tasks (- [x] or - [ ])
    const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/);
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

      const activePhase = ensurePhase();
      taskCounter++;

      let id = `T${activePhase.number}-${String(taskCounter).padStart(2, "0")}`;
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
        const ownerM = metaStr.match(/(?:owner|sdd-owner):\s*([^\s,;]+)/);
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
      activePhase.tasks.push(currentTask);
      continue;
    }

    // 3. Match Backlog items with status badges (e.g. 1. **WebP Converter** `[✅ COMPLETADO]` or `[⏳ EN PROGRESO]`)
    const backlogMatch = line.match(/^\s*(?:\d+\.|\*|-)\s+\*\*([^*]+)\*\*\s*(?:`?\[([^\]]+)\]`?)?(.*)$/);
    if (backlogMatch && !line.includes("|") && backlogMatch[1].length > 3) {
      const activePhase = ensurePhase();
      taskCounter++;

      const itemTitle = backlogMatch[1].trim();
      const statusBadge = (backlogMatch[2] || "").toLowerCase();
      const extraNote = backlogMatch[3]?.trim();

      let status: TaskStatus = "pending";
      if (statusBadge.includes("✅") || statusBadge.includes("completado") || statusBadge.includes("done")) {
        status = "completed";
      } else if (
        statusBadge.includes("⏳") ||
        statusBadge.includes("progreso") ||
        statusBadge.includes("planificación") ||
        statusBadge.includes("siguiente")
      ) {
        status = "in_progress";
      } else if (statusBadge.includes("❌") || statusBadge.includes("bloqueado")) {
        status = "blocked";
      }

      currentTask = {
        id: `T${activePhase.number}-${String(taskCounter).padStart(2, "0")}`,
        title: itemTitle,
        status,
        note: extraNote ? extraNote.replace(/^[-:]\s*/, "") : undefined,
        subtasks: [],
      };
      activePhase.tasks.push(currentTask);
    }
  }

  // Filter out phases that ended up with 0 tasks
  const nonEmptyPhases = phases.filter((p) => p.tasks.length > 0);

  // Derive phase statuses based on child tasks
  for (const phase of nonEmptyPhases) {
    const completed = phase.tasks.filter((t) => t.status === "completed").length;
    if (completed === phase.tasks.length) {
      phase.status = "completed";
    } else if (completed > 0 || phase.tasks.some((t) => t.status === "in_progress")) {
      phase.status = "in_progress";
    } else {
      phase.status = "pending";
    }
  }

  return nonEmptyPhases;
}

/**
 * Searches for task markdown files across standard paths, OpenSpec changes, and Backlog documents.
 */
export function findProjectTasks(workspaceRoot: string): Phase[] | null {
  // 1. Root standard task lists
  const rootCandidates = [
    path.join(workspaceRoot, "tasks.md"),
    path.join(workspaceRoot, "task.md"),
    path.join(workspaceRoot, "TODO.md"),
    path.join(workspaceRoot, "TASKS.md"),
    path.join(workspaceRoot, "openspec", "tasks.md"),
  ];

  for (const cPath of rootCandidates) {
    if (fs.existsSync(cPath)) {
      try {
        const content = fs.readFileSync(cPath, "utf-8");
        const phases = parseMarkdownTasks(content);
        if (phases.length > 0) return phases;
      } catch {}
    }
  }

  // 2. OpenSpec active changes (aggregate all active changes into phases)
  const changesDir = path.join(workspaceRoot, "openspec", "changes");
  if (fs.existsSync(changesDir)) {
    try {
      const changes = fs.readdirSync(changesDir, { withFileTypes: true });
      const aggregatedPhases: Phase[] = [];
      let phaseIndex = 0;

      for (const change of changes) {
        if (!change.isDirectory() || change.name === "archive") continue;

        const changeTasksPath = path.join(changesDir, change.name, "tasks.md");
        if (fs.existsSync(changeTasksPath)) {
          const content = fs.readFileSync(changeTasksPath, "utf-8");
          const changeTitle = change.name
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");

          const parsed = parseMarkdownTasks(content, changeTitle);
          if (parsed.length > 0) {
            for (const p of parsed) {
              phaseIndex++;
              aggregatedPhases.push({
                ...p,
                id: `phase-${phaseIndex}`,
                number: phaseIndex,
                title: `${changeTitle} — ${p.title}`,
              });
            }
          }
        }
      }

      if (aggregatedPhases.length > 0) {
        return aggregatedPhases;
      }
    } catch {}
  }

  // 3. Backlog & Roadmap documents (e.g. BACKLOG02.md, BACKLOG.md, docs/ROADMAP.md)
  const backlogCandidates = [
    path.join(workspaceRoot, "BACKLOG02.md"),
    path.join(workspaceRoot, "BACKLOG.md"),
    path.join(workspaceRoot, "docs", "ROADMAP.md"),
    path.join(workspaceRoot, "ROADMAP.md"),
    path.join(workspaceRoot, "IMPROVEMENTS.md"),
  ];

  for (const bPath of backlogCandidates) {
    if (fs.existsSync(bPath)) {
      try {
        const content = fs.readFileSync(bPath, "utf-8");
        const phases = parseMarkdownTasks(content);
        if (phases.length > 0) return phases;
      } catch {}
    }
  }

  return null;
}

/**
 * Dynamically generates an architecture CodeGraph tailored to the actual project's codebase.
 */
export function generateProjectCodegraph(workspaceRoot: string): CodeGraph {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];

  const addNode = (id: string, label: string, files: string[], details: string) => {
    nodes.push({ id, label, files, details });
  };

  const addEdge = (from: string, to: string, label?: string) => {
    edges.push({ from, to, label });
  };

  const srcDir = fs.existsSync(path.join(workspaceRoot, "src"))
    ? path.join(workspaceRoot, "src")
    : workspaceRoot;

  // 1. Discover Features / Modules
  const featuresDir = fs.existsSync(path.join(srcDir, "features"))
    ? path.join(srcDir, "features")
    : fs.existsSync(path.join(workspaceRoot, "features"))
    ? path.join(workspaceRoot, "features")
    : null;

  const featureNodeIds: string[] = [];

  if (featuresDir) {
    try {
      const items = fs.readdirSync(featuresDir, { withFileTypes: true });
      const featureDirs = items.filter((d) => d.isDirectory()).slice(0, 10);

      for (const feat of featureDirs) {
        const featId = `feat-${feat.name}`;
        const featLabel = feat.name
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

        const relPath = path.relative(workspaceRoot, path.join(featuresDir, feat.name));
        addNode(featId, featLabel, [relPath], `Módulo feature: ${feat.name}`);
        featureNodeIds.push(featId);
      }
    } catch {}
  }

  // 2. Discover Routing / Pages / App
  const pagesDir = fs.existsSync(path.join(srcDir, "pages"))
    ? path.join(srcDir, "pages")
    : fs.existsSync(path.join(srcDir, "app"))
    ? path.join(srcDir, "app")
    : fs.existsSync(path.join(workspaceRoot, "pages"))
    ? path.join(workspaceRoot, "pages")
    : fs.existsSync(path.join(workspaceRoot, "app"))
    ? path.join(workspaceRoot, "app")
    : null;

  if (pagesDir) {
    const relPath = path.relative(workspaceRoot, pagesDir);
    addNode("routing", "Páginas & Enrutamiento", [relPath], "Vistas, rutas y pantallas de la aplicación");

    // Connect routing to discovered features
    for (const fId of featureNodeIds) {
      addEdge("routing", fId, "renderiza");
    }
  }

  // 3. Discover Shared UI / Components
  const componentsDir = fs.existsSync(path.join(srcDir, "components"))
    ? path.join(srcDir, "components")
    : fs.existsSync(path.join(srcDir, "shared"))
    ? path.join(srcDir, "shared")
    : null;

  if (componentsDir) {
    const relPath = path.relative(workspaceRoot, componentsDir);
    addNode("ui-components", "Componentes UI & Shared", [relPath], "Design system, primitivas UI y componentes compartidos");

    for (const fId of featureNodeIds) {
      addEdge(fId, "ui-components", "usa");
    }
  }

  // 4. Discover Core / Lib / Services
  const coreDir = fs.existsSync(path.join(srcDir, "core"))
    ? path.join(srcDir, "core")
    : fs.existsSync(path.join(srcDir, "lib"))
    ? path.join(srcDir, "lib")
    : fs.existsSync(path.join(srcDir, "services"))
    ? path.join(srcDir, "services")
    : null;

  if (coreDir) {
    const relPath = path.relative(workspaceRoot, coreDir);
    addNode("core-logic", "Lógica Core & Servicios", [relPath], "Lógica de negocio, integración y almacenamiento");

    for (const fId of featureNodeIds) {
      addEdge(fId, "core-logic", "consume");
    }
  }

  // 5. Discover Test Suite
  const testDir = fs.existsSync(path.join(workspaceRoot, "test"))
    ? "test"
    : fs.existsSync(path.join(workspaceRoot, "tests"))
    ? "tests"
    : fs.existsSync(path.join(srcDir, "__tests__"))
    ? "src/__tests__"
    : null;

  if (testDir) {
    addNode("test-suite", "Suite de Pruebas", [testDir], "Pruebas automatizadas unitarias y de integración");
    if (featureNodeIds.length > 0) {
      addEdge("test-suite", featureNodeIds[0], "valida");
    } else if (nodes.length > 0) {
      addEdge("test-suite", nodes[0].id, "valida");
    }
  }

  // Fallback: If no structured src directories exist, scan top-level folders
  if (nodes.length < 2) {
    try {
      const rootDirs = fs
        .readdirSync(workspaceRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !DEFAULT_IGNORED_DIRS.has(d.name) && !d.name.startsWith("."))
        .slice(0, 6);

      for (const d of rootDirs) {
        addNode(`mod-${d.name}`, d.name.toUpperCase(), [d.name], `Directorio del proyecto: ${d.name}`);
      }

      for (let i = 0; i < nodes.length - 1; i++) {
        addEdge(nodes[i].id, nodes[i + 1].id, "conecta");
      }
    } catch {}
  }

  return { nodes, edges };
}

/**
 * Combines all scanner sources into one comprehensive payload.
 */
export function scanWorkspace(workspaceRoot: string): {
  meta: Partial<ProjectMeta>;
  git: GitState;
  tree: TreeItem[];
  phases?: Phase[];
  codegraph: CodeGraph;
} {
  const meta = detectProjectMeta(workspaceRoot);
  const git = scanGitState(workspaceRoot);
  const tree = scanDirectoryTree(workspaceRoot);
  const phases = findProjectTasks(workspaceRoot) || undefined;
  const codegraph = generateProjectCodegraph(workspaceRoot);

  return {
    meta,
    git,
    tree,
    phases,
    codegraph,
  };
}
