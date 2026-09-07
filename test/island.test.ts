import { describe, it, expect } from "vitest";
import {
  extractIslandJson,
  parseIslandState,
  serializeIslandState,
  injectIslandState,
  validateState,
  createInitialState,
} from "../src/island.js";
import type { TaskManagerState } from "../src/types.js";

describe("Task Manager Island Parser & Serializer", () => {
  const sampleState: TaskManagerState = {
    schemaVersion: "1.0",
    meta: {
      projectName: "Test Project",
      version: "1.0.0",
      branch: "main",
      commit: "abcdef1",
      syncStatus: "Sincronizado",
      harness: "Pi",
      harnessRole: "Coding Agent Harness",
      lastUpdated: "2026-09-07T00:00:00Z",
    },
    phases: [
      {
        id: "phase-1",
        number: 1,
        title: "Test Phase",
        status: "in_progress",
        tasks: [
          {
            id: "T1",
            title: "Test Task with </script> safe text",
            status: "pending",
          },
        ],
      },
    ],
    todos: [{ id: "td-1", text: "Test Todo", priority: "P1", done: false }],
    git: { branch: "main", commits: [], syncStatus: "Sincronizado" },
    tree: [],
    codegraph: { nodes: [], edges: [] },
  };

  const sampleHtml = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <div id="app"></div>
  <script type="application/json" id="tm-state">
  ${serializeIslandState(sampleState)}
  </script>
  <script>console.log("runner");</script>
</body>
</html>`;

  it("extracts raw JSON string from html island", () => {
    const raw = extractIslandJson(sampleHtml);
    expect(raw).toBeDefined();
    expect(raw).toContain('"Test Project"');
  });

  it("parses extracted json into typed TaskManagerState", () => {
    const state = parseIslandState(sampleHtml);
    expect(state.meta.projectName).toBe("Test Project");
    expect(state.phases.length).toBe(1);
    expect(state.phases[0].tasks[0].id).toBe("T1");
  });

  it("safely escapes </script> in serialized output to prevent XSS / broken markup", () => {
    const serialized = serializeIslandState(sampleState);
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script\\u003e");
  });

  it("replaces island block in html without touching other script tags", () => {
    const updatedState: TaskManagerState = {
      ...sampleState,
      meta: { ...sampleState.meta, projectName: "Updated Project" },
    };
    const newHtml = injectIslandState(sampleHtml, updatedState);
    expect(newHtml).toContain('"Updated Project"');
    expect(newHtml).toContain('<script>console.log("runner");</script>');

    const reParsed = parseIslandState(newHtml);
    expect(reParsed.meta.projectName).toBe("Updated Project");
  });

  it("validates state structure correctly", () => {
    const valid = validateState(sampleState);
    expect(valid.ok).toBe(true);

    const invalid = validateState({} as any);
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it("creates clean initial state with Pi defaults", () => {
    const initial = createInitialState("My Great App", "2.0.0");
    expect(initial.meta.projectName).toBe("My Great App");
    expect(initial.meta.version).toBe("2.0.0");
    expect(initial.meta.harness).toBe("Pi");
    expect(initial.phases.length).toBeGreaterThanOrEqual(1);
    expect(initial.schemaVersion).toBe("1.0");
  });

  it("can parse and round-trip dynamically assembled HTML cockpit", async () => {
    const { assembleHtml } = await import("../src/assembler.js");
    const html = assembleHtml();

    const state = parseIslandState(html);
    expect(state.schemaVersion).toBe("1.0");
    expect(state.meta.harness).toBe("Pi");
    expect(state.phases.length).toBeGreaterThan(0);

    // Test re-injecting
    const modified = injectIslandState(html, state);
    const roundTripState = parseIslandState(modified);
    expect(roundTripState.meta.projectName).toBe(state.meta.projectName);
  });
});
