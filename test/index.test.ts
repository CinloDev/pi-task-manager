import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import taskManagerExtension from "../index.js";

describe("Pi Task Manager Extension Registration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tm-ext-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("registers commands, shortcuts, and tools with Pi context", () => {
    const registeredCommands: Record<string, any> = {};
    const registeredShortcuts: Record<string, any> = {};
    const registeredTools: Record<string, any> = {};

    const mockPi = {
      registerCommand: vi.fn((name, def) => {
        registeredCommands[name] = def;
      }),
      registerShortcut: vi.fn((key, def) => {
        registeredShortcuts[key] = def;
      }),
      registerTool: vi.fn((def) => {
        registeredTools[def.name] = def;
      }),
    };

    taskManagerExtension(mockPi);

    expect(mockPi.registerCommand).toHaveBeenCalledWith("task-manager", expect.any(Object));
    expect(mockPi.registerCommand).toHaveBeenCalledWith("tm", expect.any(Object));
    expect(mockPi.registerShortcut).toHaveBeenCalledWith("alt+t", expect.any(Object));
    expect(mockPi.registerShortcut).toHaveBeenCalledWith("ctrl+shift+t", expect.any(Object));

    expect(registeredTools["task_manager_read"]).toBeDefined();
    expect(registeredTools["task_manager_update_task"]).toBeDefined();
    expect(registeredTools["task_manager_sync"]).toBeDefined();
  });

  it("executes CLI command /task-manager init and status", async () => {
    let commandHandler: any;
    const mockPi = {
      registerCommand: vi.fn((name, def) => {
        if (name === "task-manager") commandHandler = def.handler;
      }),
      registerShortcut: vi.fn(),
      registerTool: vi.fn(),
    };

    taskManagerExtension(mockPi);

    const mockCtx = {
      cwd: tempDir,
      ui: {
        notify: vi.fn(),
      },
    };

    // Run init
    const initOutput = await commandHandler("init", mockCtx);
    expect(initOutput).toContain("Task Manager initialized");
    // Verifies the workspace only holds .pi/task-manager.json and NOT the 7k-line HTML
    expect(fs.existsSync(path.join(tempDir, ".pi", "task-manager.json"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "Task-Manager-Portable.html"))).toBe(false);

    // Run status
    const statusOutput = await commandHandler("status", mockCtx);
    expect(statusOutput).toContain("Task Manager:");

    // Run export on-demand
    const exportOutput = await commandHandler("export", mockCtx);
    expect(exportOutput).toContain("Dashboard exportado exitosamente");
    expect(fs.existsSync(path.join(tempDir, "Task-Manager-Portable.html"))).toBe(true);
  });

  it("executes task_manager_read tool", async () => {
    let readTool: any;
    const mockPi = {
      registerCommand: vi.fn(),
      registerShortcut: vi.fn(),
      registerTool: vi.fn((def) => {
        if (def.name === "task_manager_read") readTool = def;
      }),
    };

    taskManagerExtension(mockPi);

    const mockCtx = { cwd: tempDir };
    // Before init
    const res1 = await readTool.execute("call-1", {}, null, null, mockCtx);
    expect(res1.content[0].text).toContain('"exists": false');

    // Init file
    const manager = new (await import("../src/manager.js")).TaskManager({
      workspaceRoot: tempDir,
    });
    manager.init();

    // After init
    const res2 = await readTool.execute("call-2", {}, null, null, mockCtx);
    expect(res2.content[0].text).toContain('"exists": true');
  });
});
