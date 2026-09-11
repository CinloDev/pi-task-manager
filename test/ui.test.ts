import { describe, it, expect } from "vitest";
import { TaskManagerModalOverlay } from "../src/ui.js";
import { createInitialState } from "../src/island.js";

describe("TaskManagerModalOverlay TUI Component", () => {
  it("renders a bordered modal box with options and header summary", () => {
    const state = createInitialState("Modal Test Project", "1.2.0");
    const options = ["Option 1", "Option 2", "Option 3"];
    let closedWith: string | undefined = "unset";

    const overlay = new TaskManagerModalOverlay(
      "Test Project",
      options,
      state,
      null, // default theme
      null, // default tui
      (res) => {
        closedWith = res;
      }
    );

    const lines = overlay.render(70);
    expect(lines.length).toBeGreaterThan(5);

    const renderedText = lines.join("\n");
    expect(renderedText).toContain("Test Project");
    expect(renderedText).toContain("Modal Test Project");
    expect(renderedText).toContain("Option 1");
    expect(renderedText).toContain("Option 2");
    expect(renderedText).toContain("Option 3");

    // Test keyboard navigation
    overlay.handleInput("\x1b[B"); // Arrow down -> option 2
    overlay.handleInput("\r"); // Enter
    expect(closedWith).toBe("Option 2");
  });

  it("handles cancel via Escape or Ctrl+C", () => {
    let closedWith: string | undefined = "unset";
    const overlay = new TaskManagerModalOverlay(
      "Test Project",
      ["A", "B"],
      null,
      null,
      null,
      (res) => {
        closedWith = res;
      }
    );

    overlay.handleInput("\x1b"); // Escape
    expect(closedWith).toBeUndefined();
  });

  it("renders double-line side borders and solid deep violet background", async () => {
    const state = createInitialState("Theme Test", "1.0.0");
    const overlay = new TaskManagerModalOverlay(
      "Theme Test",
      ["Opt 1"],
      state,
      null,
      null,
      () => {}
    );

    const lines = overlay.render(68);
    const text = lines.join("\n");

    // Double-line border box characters
    expect(text).toContain("╔");
    expect(text).toContain("║");
    expect(text).toContain("╚");

    // Solid dark violet background ANSI sequence
    expect(text).toContain("\x1b[48;2;20;10;40m");

    // Check that every single line has the exact same visible width (no jagged edges)
    const { getVisibleWidth } = await import("../src/ui.js");
    const widths = lines.map((l) => getVisibleWidth(l));
    const firstWidth = widths[0];
    for (let i = 0; i < widths.length; i++) {
      expect(widths[i]).toBe(firstWidth);
    }
  });

  it("navigates into full task list view and returns without closing modal", () => {
    const state = createInitialState("Flow Test", "1.0.0");
    const mockManager = {
      getState: () => state,
      openInBrowser: async () => ({ success: true, message: "ok" }),
      sync: () => ({ success: true, message: "synced" }),
      init: () => ({ success: true, message: "init" }),
      addTodo: () => ({ success: true, message: "todo added" }),
      updateTask: () => ({ success: true, message: "task updated" }),
      exportHtml: () => ({ success: true, message: "exported" }),
    };
    let closed = false;
    const overlay = new TaskManagerModalOverlay(
      "Flow Test",
      mockManager as any,
      state,
      null,
      { requestRender: () => {} },
      () => {
        closed = true;
      }
    );

    // Press 3 -> switch to list view ("📋 Ver tareas y fases en esta ventana")
    overlay.handleInput("3");
    expect(closed).toBe(false);

    let lines = overlay.render(70);
    expect(lines.join("\n")).toContain("Lista Interactiva de Fases, Tareas y Todos");

    // Press Escape -> returns to menu view without closing modal
    overlay.handleInput("\x1b");
    expect(closed).toBe(false);

    lines = overlay.render(70);
    expect(lines.join("\n")).toContain("Abrir dashboard");
  });

  it("normalizes terminal navigation keys across SS3, Kitty, and xterm protocols", async () => {
    const { normalizeModalKey } = await import("../src/ui.js");

    // Standard vs SS3 arrows
    expect(normalizeModalKey("\x1b[A")).toBe("up");
    expect(normalizeModalKey("\x1bOA")).toBe("up");
    expect(normalizeModalKey("\x1b[1;1A")).toBe("up");
    expect(normalizeModalKey("k")).toBe("up");

    expect(normalizeModalKey("\x1b[B")).toBe("down");
    expect(normalizeModalKey("\x1bOB")).toBe("down");
    expect(normalizeModalKey("\x1b[1;1B")).toBe("down");
    expect(normalizeModalKey("j")).toBe("down");

    // Enter & Keypad Enter
    expect(normalizeModalKey("\r")).toBe("enter");
    expect(normalizeModalKey("\n")).toBe("enter");
    expect(normalizeModalKey("\x1bOM")).toBe("enter");

    // Navigation & paging
    expect(normalizeModalKey("\x1b[5~")).toBe("pageup");
    expect(normalizeModalKey("\x1b[6~")).toBe("pagedown");
    expect(normalizeModalKey("\x1b[H")).toBe("home");
    expect(normalizeModalKey("\x1bOH")).toBe("home");
    expect(normalizeModalKey("\x1b[F")).toBe("end");
    expect(normalizeModalKey("\x1bOF")).toBe("end");
  });

  it("adopts dynamic theme tokens from Pi theme environment when available", () => {
    const state = createInitialState("Themed Project", "2.0.0");
    const mockTheme = {
      fg: vi.fn((color: string, text: string) => `[fg:${color}]${text}[/fg]`),
      bg: vi.fn((color: string, text: string) => `[bg:${color}]${text}[/bg]`),
      getFgAnsi: vi.fn((_color: string) => `\x1b[38;2;142;68;173m`), // Custom purple border
      getBgAnsi: vi.fn((_color: string) => `\x1b[48;2;26;18;24m`), // Custom theme bg
      bold: vi.fn((text: string) => `[bold]${text}[/bold]`),
    };

    const overlay = new TaskManagerModalOverlay(
      "Themed Project",
      ["Menu Item 1"],
      state,
      mockTheme as any,
      null,
      () => {}
    );

    const lines = overlay.render(75);
    const rendered = lines.join("\n");

    // Must adopt theme background ANSI sequence
    expect(rendered).toContain("\x1b[48;2;26;18;24m");
    // Must adopt theme border ANSI sequence
    expect(rendered).toContain("\x1b[38;2;142;68;173m");
    // Theme methods must have been called
    expect(mockTheme.getBgAnsi).toHaveBeenCalledWith("customMessageBg");
    expect(mockTheme.getFgAnsi).toHaveBeenCalledWith("border");
    expect(mockTheme.fg).toHaveBeenCalledWith("accent", expect.any(String));
    expect(mockTheme.bold).toHaveBeenCalled();
  });

  it("respects environment variables PI_TASK_MANAGER_BG and PI_TASK_MANAGER_BORDER", () => {
    const origBg = process.env.PI_TASK_MANAGER_BG;
    const origBorder = process.env.PI_TASK_MANAGER_BORDER;

    try {
      process.env.PI_TASK_MANAGER_BG = "\x1b[48;2;30;20;50m";
      process.env.PI_TASK_MANAGER_BORDER = "\x1b[38;2;200;100;250m";

      const state = createInitialState("Env Var Project", "1.0.0");
      const overlay = new TaskManagerModalOverlay(
        "Env Var Project",
        ["Item 1"],
        state,
        null,
        null,
        () => {}
      );

      const lines = overlay.render(70);
      const rendered = lines.join("\n");

      expect(rendered).toContain("\x1b[48;2;30;20;50m");
      expect(rendered).toContain("\x1b[38;2;200;100;250m");
    } finally {
      if (origBg === undefined) delete process.env.PI_TASK_MANAGER_BG;
      else process.env.PI_TASK_MANAGER_BG = origBg;

      if (origBorder === undefined) delete process.env.PI_TASK_MANAGER_BORDER;
      else process.env.PI_TASK_MANAGER_BORDER = origBorder;
    }
  });
});
