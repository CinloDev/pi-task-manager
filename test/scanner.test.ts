import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  detectProjectMeta,
  scanDirectoryTree,
  parseMarkdownTasks,
  scanWorkspace,
} from "../src/scanner.js";

describe("Workspace Scanner", () => {
  const fixtureRoot = path.resolve(__dirname, "..");

  it("detects project metadata from package.json", () => {
    const meta = detectProjectMeta(fixtureRoot);
    expect(meta.projectName).toBe("pi-task-manager");
    expect(meta.version).toBe("1.0.0");
    expect(meta.harness).toBe("Pi");
  });

  it("scans directory tree excluding ignored directories", () => {
    const tree = scanDirectoryTree(fixtureRoot, 2);
    expect(tree.length).toBeGreaterThan(0);
    // Ensure node_modules and .git are ignored
    const hasNodeModules = tree.some((item) => item.name.includes("node_modules"));
    const hasGit = tree.some((item) => item.name === ".git" || item.name.startsWith(".git/"));
    expect(hasNodeModules).toBe(false);
    expect(hasGit).toBe(false);
  });

  it("parses markdown task lists into structured tasks", () => {
    const md = `
# 1. Foundation
- [x] Set up repository <!-- id: T1-01 -->
- [ ] Implement core logic <!-- id: T1-02, tag: Core, owner: Pi -->
  - [x] Parse JSON
  - [ ] Inject HTML

# 2. Integration
- [ ] Connect with Pi CLI <!-- id: T2-01 -->
`;
    const phases = parseMarkdownTasks(md);
    expect(phases.length).toBe(2);
    expect(phases[0].title).toContain("Foundation");
    expect(phases[0].tasks.length).toBe(2);
    expect(phases[0].tasks[0].status).toBe("completed");
    expect(phases[0].tasks[1].status).toBe("pending");
    expect(phases[0].tasks[1].subtasks?.length).toBe(2);
    expect(phases[0].tasks[1].subtasks?.[0].done).toBe(true);
    expect(phases[0].tasks[1].subtasks?.[1].done).toBe(false);
    expect(phases[1].tasks.length).toBe(1);
  });

  it("scans workspace to return combined scan data", () => {
    const data = scanWorkspace(fixtureRoot);
    expect(data.meta.projectName).toBe("pi-task-manager");
    expect(data.tree.length).toBeGreaterThan(0);
    expect(data.git).toBeDefined();
  });
});
