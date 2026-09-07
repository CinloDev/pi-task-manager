import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TaskManager } from "../src/manager.js";

describe("TaskManager Core Service", () => {
  let tempDir: string;
  let manager: TaskManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tm-test-"));
    // Write a mock package.json
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "temp-mock-project", version: "0.5.0" })
    );
    manager = new TaskManager({ workspaceRoot: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("checks if file exists before and after init", () => {
    expect(manager.exists()).toBe(false);
    const result = manager.init();
    expect(result.success).toBe(true);
    expect(manager.exists()).toBe(true);
  });

  it("reads initialized state with project metadata", () => {
    manager.init();
    const state = manager.getState();
    expect(state.meta.projectName).toBe("temp-mock-project");
    expect(state.meta.version).toBe("0.5.0");
    expect(state.meta.harness).toBe("Pi");
  });

  it("syncs workspace tree and updates lastUpdated", () => {
    manager.init();
    // Add a file in tempDir
    fs.writeFileSync(path.join(tempDir, "sample.ts"), "export const a = 1;");

    const syncRes = manager.sync();
    expect(syncRes.success).toBe(true);

    const updated = manager.getState();
    const hasSample = updated.tree.some((t) => t.name.includes("sample.ts"));
    expect(hasSample).toBe(true);
  });

  it("updates a task status and persists to disk", () => {
    manager.init();
    const updateRes = manager.updateTask("T1-01", {
      status: "in_progress",
      note: "Working on it with Pi",
    });
    expect(updateRes.success).toBe(true);

    const state = manager.getState();
    const task = state.phases[0].tasks.find((t) => t.id === "T1-01");
    expect(task?.status).toBe("in_progress");
    expect(task?.note).toBe("Working on it with Pi");
  });

  it("adds and toggles todos", () => {
    manager.init();
    const addRes = manager.addTodo({
      text: "Brand new test todo",
      priority: "P0",
    });
    expect(addRes.success).toBe(true);

    let state = manager.getState();
    const found = state.todos.find((td) => td.text === "Brand new test todo");
    expect(found).toBeDefined();
    expect(found?.done).toBe(false);

    // Toggle todo
    const toggleRes = manager.toggleTodo(found!.id);
    expect(toggleRes.success).toBe(true);
    state = manager.getState();
    const toggled = state.todos.find((td) => td.id === found!.id);
    expect(toggled?.done).toBe(true);
  });
});
