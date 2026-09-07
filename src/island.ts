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

  return html.replace(ISLAND_REGEX, () => replacement);
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
      history: [
        {
          timestamp: new Date().toISOString(),
          completed: 2,
          total: 8,
        },
      ],
    },
    phases: [
      {
        id: "phase-1",
        number: 1,
        title: "Inicialización y Arquitectura",
        status: "completed",
        target: "Fase 1",
        lead: "Orquestador",
        tasks: [
          {
            id: "T1-01",
            title: "Configuración del proyecto y entorno",
            status: "completed",
            tag: "Setup",
            note: "Estructura inicial del repositorio y dependencias",
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
          {
            id: "T1-02",
            title: "Definir contratos de arquitectura y tipos",
            status: "completed",
            tag: "Arch",
            note: "Definición de modelos de datos e interfaces principales",
            owner: "sdd-spec",
          },
        ],
      },
      {
        id: "phase-2",
        number: 2,
        title: "Desarrollo y Lógica Core",
        status: "in_progress",
        target: "Fase 2",
        lead: "sdd-apply",
        tasks: [
          {
            id: "T2-01",
            title: "Implementar módulos de lógica principal",
            status: "in_progress",
            tag: "Core",
            note: "En desarrollo con subagente sdd-apply",
            owner: "sdd-apply",
          },
          {
            id: "T2-02",
            title: "Construir adaptadores e interfaces de usuario",
            status: "pending",
            tag: "UI",
            note: "Componentes y flujos de interacción",
            owner: "sdd-apply",
          },
        ],
      },
      {
        id: "phase-3",
        number: 3,
        title: "Testing y Verificación (TDD)",
        status: "pending",
        target: "Fase 3",
        lead: "sdd-verify",
        tasks: [
          {
            id: "T3-01",
            title: "Suite de pruebas unitarias y de integración",
            status: "pending",
            tag: "QA",
            note: "Cobertura de casos borde y validación estricta",
            owner: "sdd-verify",
          },
          {
            id: "T3-02",
            title: "Verificación de tipos y linting estricto",
            status: "pending",
            tag: "QA",
            owner: "sdd-verify",
          },
        ],
      },
      {
        id: "phase-4",
        number: 4,
        title: "Revisión RDD y Despliegue",
        status: "pending",
        target: "Fase 4",
        lead: "sdd-archive",
        tasks: [
          {
            id: "T4-01",
            title: "Auditoría de revisión de código (RDD)",
            status: "pending",
            tag: "Review",
            note: "Revisión con Gentle AI",
            owner: "sdd-review",
          },
          {
            id: "T4-02",
            title: "Documentación final y release",
            status: "pending",
            tag: "Docs",
            owner: "Orquestador",
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
      {
        id: "td-3",
        text: "Revisar cobertura de tests con vitest",
        priority: "P2",
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
      nodes: [
        {
          id: "entry",
          label: "Entrypoint",
          files: ["index.ts"],
          details: "Punto de entrada y registro de comandos / extensiones",
        },
        {
          id: "core",
          label: "Core Logic",
          files: ["src/manager.ts", "src/island.ts"],
          details: "Lógica de negocio, serialización y estado",
        },
        {
          id: "ui",
          label: "Dashboard UI",
          files: ["Task-Manager-Portable.html"],
          details: "Dashboard visual portable para navegador",
        },
        {
          id: "tests",
          label: "Test Suite",
          files: ["test/"],
          details: "Pruebas automatizadas con Vitest",
        },
      ],
      edges: [
        { from: "entry", to: "core", label: "usa" },
        { from: "core", to: "ui", label: "sincroniza" },
        { from: "tests", to: "core", label: "valida" },
      ],
    },
  };
}
