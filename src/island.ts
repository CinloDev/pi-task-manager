import type { TaskManagerState } from "./types.js";

const ISLAND_REGEX = /<script\b[^>]*\bid=["']tm-state["'][^>]*>([\s\S]*?)<\/script>/i;

/**
 * Extracts raw inner content of the #tm-state script island.
 */
export function extractIslandJson(html: string): string {
  const match = html.match(ISLAND_REGEX);
  if (!match || typeof match[1] !== "string") {
    throw new Error("Could not find <script id=\"tm-state\"> island in HTML document.");
  }
  return match[1].trim();
}

/**
 * Safely unescapes \\u003c/script\\u003e or similar sequences before parsing.
 */
export function cleanRawJson(raw: string): string {
  return raw
    .replace(/\\u003c\/script\\u003e/gi, "</script>")
    .replace(/<\\\/script>/gi, "</script>");
}

/**
 * Parses #tm-state JSON from an HTML document.
 */
export function parseIslandState(html: string): TaskManagerState {
  const raw = extractIslandJson(html);
  const unescaped = cleanRawJson(raw);
  try {
    return JSON.parse(unescaped) as TaskManagerState;
  } catch (err: any) {
    throw new Error(`Failed to parse #tm-state JSON: ${err?.message || String(err)}`);
  }
}

/**
 * Serializes state to JSON and securely escapes closing script tags
 * to avoid prematurely terminating the <script> block in browsers.
 */
export function serializeIslandState(state: TaskManagerState): string {
  const json = JSON.stringify(state, null, 2);
  return json.replace(/<\/script>/gi, "\\u003c/script\\u003e");
}

/**
 * Injects or replaces the #tm-state island in an HTML document.
 */
export function injectIslandState(html: string, state: TaskManagerState): string {
  const serialized = serializeIslandState(state);
  const replacement = `<script type="application/json" id="tm-state">\n${serialized}\n  </script>`;

  if (!ISLAND_REGEX.test(html)) {
    throw new Error("Target HTML has no <script id=\"tm-state\"> block to replace.");
  }

  return html.replace(ISLAND_REGEX, replacement);
}

/**
 * Validates minimal required structure of TaskManagerState.
 */
export function validateState(state: any): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!state || typeof state !== "object") {
    return { ok: false, errors: ["State must be an object"] };
  }

  if (!state.schemaVersion) {
    errors.push("Missing schemaVersion");
  }

  if (!state.meta || typeof state.meta !== "object") {
    errors.push("Missing or invalid meta block");
  } else {
    if (!state.meta.projectName) errors.push("meta.projectName is required");
  }

  if (!Array.isArray(state.phases)) {
    errors.push("phases must be an array");
  }

  if (!Array.isArray(state.todos)) {
    errors.push("todos must be an array");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Creates a clean default TaskManagerState tailored for Pi.
 */
export function createInitialState(
  projectName = "Pi Project",
  version = "1.0.0",
  branch = "main"
): TaskManagerState {
  return {
    schemaVersion: "1.0",
    meta: {
      projectName,
      version,
      branch,
      commit: "",
      syncStatus: "Sincronizado",
      harness: "Pi",
      harnessRole: "Coding Agent Harness",
      description: "Single-file offline project dashboard for Pi coding agent",
      lastUpdated: new Date().toISOString(),
      labels: {
        es: {
          overallProgress: "Progreso Global",
          filterAll: "Todas",
          filterActive: "Activas",
          todoTitle: "Tareas Rápidas",
          helpTitle: "Ayuda — Cómo usar este archivo",
          headerSubtitle: "Dashboard técnico portable — gestionado por Pi y SDD",
        },
      },
      features: {
        git: true,
        tree: true,
        codegraph: true,
        help: true,
      },
      history: [],
    },
    phases: [
      {
        id: "phase-1",
        number: 1,
        title: "Inicialización y Arquitectura",
        status: "in_progress",
        target: "Fase 1",
        lead: "Orquestador",
        tasks: [
          {
            id: "T1-01",
            title: "Configuración inicial del proyecto y dashboard",
            status: "completed",
            tag: "Setup",
            note: "Inicializado con Pi Task Manager",
            owner: "Pi",
            subtasks: [
              {
                id: "ST1-1",
                title: "Crear archivo Task-Manager-Portable.html",
                status: "completed",
                done: true,
              },
              {
                id: "ST1-2",
                title: "Sincronizar metadatos y git",
                status: "completed",
                done: true,
              },
            ],
          },
        ],
      },
    ],
    todos: [
      {
        id: "td-1",
        text: "Completar la especificación inicial con /sdd-init",
        priority: "P0",
        done: false,
      },
      {
        id: "td-2",
        text: "Sincronizar tareas con /task-manager sync",
        priority: "P1",
        done: false,
      },
    ],
    git: {
      branch,
      commits: [],
      syncStatus: "Sincronizado",
    },
    tree: [],
    codegraph: {
      nodes: [],
      edges: [],
    },
  };
}
