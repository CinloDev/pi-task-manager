import { describe, it, expect } from "vitest";
import { recordTokenUsage, extractSessionTelemetry } from "../src/telemetry.js";
import { createInitialState } from "../src/island.js";

describe("Agent Token Telemetry Service", () => {
  it("initializes and accumulates measured token telemetry", () => {
    const state = createInitialState("Telemetry Test", "1.0.0");
    expect(state.tokenUsage).toBeUndefined();

    // Turn 1 by Pi
    recordTokenUsage(state, {
      agent: "Pi",
      model: "claude-3-7-sonnet",
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 500,
      cost: 0.005,
    });

    expect(state.tokenUsage).toBeDefined();
    expect(state.tokenUsage?.hasData).toBe(true);
    expect(state.tokenUsage?.source).toBe("pi-runtime");
    expect(state.tokenUsage?.totals.total).toBe(1700);
    expect(state.tokenUsage?.totals.input).toBe(1000);
    expect(state.tokenUsage?.totals.output).toBe(200);
    expect(state.tokenUsage?.totals.cacheRead).toBe(500);
    expect(state.tokenUsage?.totals.cost).toBe(0.005);
    expect(state.tokenUsage?.byAgent.length).toBe(1);
    expect(state.tokenUsage?.byAgent[0].agent).toBe("Pi");
    expect(state.tokenUsage?.byAgent[0].total).toBe(1700);

    // Turn 2 by subagent sdd-apply
    recordTokenUsage(state, {
      agent: "sdd-apply",
      model: "claude-3-7-sonnet",
      inputTokens: 3000,
      outputTokens: 800,
      cost: 0.015,
    });

    expect(state.tokenUsage?.totals.total).toBe(5500);
    expect(state.tokenUsage?.byAgent.length).toBe(2);

    // Sorted descending by total tokens
    expect(state.tokenUsage?.byAgent[0].agent).toBe("sdd-apply");
    expect(state.tokenUsage?.byAgent[0].total).toBe(3800);
    expect(state.tokenUsage?.byAgent[1].agent).toBe("Pi");
    expect(state.tokenUsage?.byAgent[1].total).toBe(1700);
  });

  it("extracts session telemetry from mock session manager", () => {
    const mockSessionManager = {
      getEntries: () => [
        {
          type: "message",
          message: {
            role: "assistant",
            model: "claude-3-7-sonnet",
            usage: {
              input: 2000,
              output: 400,
              cost: 0.01,
            },
          },
        },
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "subagent_run",
            details: { agent: "sdd-verify" },
            usage: {
              input: 1500,
              output: 300,
              cost: 0.008,
            },
          },
        },
      ],
    };

    const telemetry = extractSessionTelemetry(mockSessionManager);
    expect(telemetry).toBeDefined();
    expect(telemetry?.hasData).toBe(true);
    expect(telemetry?.totals.total).toBe(4200);
    expect(telemetry?.totals.cost).toBe(0.018);
    expect(telemetry?.byAgent.length).toBe(2);

    const piAgent = telemetry?.byAgent.find((a) => a.agent === "Pi");
    const sddAgent = telemetry?.byAgent.find((a) => a.agent === "sdd-verify");
    expect(piAgent?.total).toBe(2400);
    expect(sddAgent?.total).toBe(1800);
  });
});
