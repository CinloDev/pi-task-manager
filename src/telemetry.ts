import type {
  TaskManagerState,
  TokenUsageState,
  AgentTokenUsage,
} from "./types.js";

export interface RecordTokenUsageParams {
  agent?: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  cost?: number;
}

/**
 * Updates or initializes the tokenUsage state object with measured turn telemetry.
 */
export function recordTokenUsage(
  state: TaskManagerState,
  params: RecordTokenUsageParams
): TaskManagerState {
  const agentName = (params.agent || "Pi").trim() || "Pi";
  const inp = Math.max(0, params.inputTokens || 0);
  const out = Math.max(0, params.outputTokens || 0);
  const cRd = Math.max(0, params.cacheReadTokens || 0);
  const cWr = Math.max(0, params.cacheWriteTokens || 0);
  const rea = Math.max(0, params.reasoningTokens || 0);
  const deltaTotal = inp + out + cRd + cWr;
  const cost = typeof params.cost === "number" && isFinite(params.cost) ? params.cost : 0;

  if (!state.tokenUsage || typeof state.tokenUsage !== "object") {
    state.tokenUsage = {
      hasData: true,
      schemaVersion: "1.0",
      updatedAt: new Date().toISOString(),
      source: "pi-runtime",
      scope: state.meta?.projectName || "",
      root: "",
      totals: {
        input: 0,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
        cost: 0,
      },
      byAgent: [],
    };
  }

  const tu = state.tokenUsage;
  tu.hasData = true;
  tu.source = "pi-runtime";
  tu.updatedAt = new Date().toISOString();

  // Accumulate totals
  tu.totals.input += inp;
  tu.totals.output += out;
  tu.totals.cacheRead += cRd;
  tu.totals.cacheWrite += cWr;
  tu.totals.reasoning += rea;
  tu.totals.total += deltaTotal;
  if (cost > 0) {
    tu.totals.cost = Number(((tu.totals.cost || 0) + cost).toFixed(6));
  }

  // Find or create agent telemetry item
  let agentItem = tu.byAgent.find((a) => a.agent === agentName);
  if (!agentItem) {
    agentItem = {
      agent: agentName,
      model: params.model,
      models: params.model ? [params.model] : [],
      total: 0,
      cost: 0,
      messages: 0,
      sessions: 1,
      evidence: "measured",
      confidence: 1.0,
      categories: {
        input: 0,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    };
    tu.byAgent.push(agentItem);
  }

  agentItem.messages = (agentItem.messages || 0) + 1;
  if (!agentItem.categories) {
    agentItem.categories = {
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    };
  }

  agentItem.categories.input += inp;
  agentItem.categories.output += out;
  agentItem.categories.cacheRead += cRd;
  agentItem.categories.cacheWrite += cWr;
  agentItem.categories.reasoning += rea;
  agentItem.categories.total += deltaTotal;
  agentItem.total += deltaTotal;

  if (cost > 0) {
    agentItem.cost = Number(((agentItem.cost || 0) + cost).toFixed(6));
  }

  if (params.model) {
    agentItem.models = agentItem.models || [];
    if (!agentItem.models.includes(params.model)) {
      agentItem.models.push(params.model);
    }
    agentItem.model = params.model;
  }

  // Sort byAgent descending by total tokens
  tu.byAgent.sort((a, b) => b.total - a.total);

  return state;
}

/**
 * Extracts cumulative token usage from Pi's SessionManager entries.
 */
export function extractSessionTelemetry(sessionManager: any): TokenUsageState | null {
  if (!sessionManager || typeof sessionManager.getEntries !== "function") {
    return null;
  }

  try {
    const entries = sessionManager.getEntries();
    if (!Array.isArray(entries) || entries.length === 0) return null;

    let totalIn = 0;
    let totalOut = 0;
    let totalCRd = 0;
    let totalCWr = 0;
    let totalRea = 0;
    let totalCost = 0;
    const agentMap: Record<string, AgentTokenUsage> = {};

    for (const entry of entries) {
      if (entry.type === "message" && entry.message) {
        const msg = entry.message;
        if (msg.role === "assistant" && msg.usage) {
          const u = msg.usage;
          const inp = Number(u.input || u.input_tokens || u.prompt_tokens || 0);
          const out = Number(u.output || u.output_tokens || u.completion_tokens || 0);
          const cRd = Number(u.cacheRead || u.cache_read_tokens || 0);
          const cWr = Number(u.cacheWrite || u.cache_write_tokens || 0);
          const rea = Number(u.reasoning || u.reasoning_tokens || 0);
          const delta = inp + out + cRd + cWr;
          const cost = typeof u.cost === "number" ? u.cost : u.cost?.total || 0;
          const model = msg.model || msg.provider;

          totalIn += inp;
          totalOut += out;
          totalCRd += cRd;
          totalCWr += cWr;
          totalRea += rea;
          totalCost += cost;

          const agentName = "Pi";
          if (!agentMap[agentName]) {
            agentMap[agentName] = {
              agent: agentName,
              model: model,
              models: model ? [model] : [],
              total: 0,
              cost: 0,
              messages: 0,
              sessions: 1,
              evidence: "measured",
              confidence: 1.0,
              categories: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            };
          }

          const ag = agentMap[agentName];
          ag.messages = (ag.messages || 0) + 1;
          ag.categories!.input += inp;
          ag.categories!.output += out;
          ag.categories!.cacheRead += cRd;
          ag.categories!.cacheWrite += cWr;
          ag.categories!.reasoning += rea;
          ag.categories!.total += delta;
          ag.total += delta;
          ag.cost = Number(((ag.cost || 0) + cost).toFixed(6));
        } else if (msg.role === "toolResult" && msg.usage) {
          // Nested work from subagent tool runs
          const u = msg.usage;
          const inp = Number(u.input || u.input_tokens || 0);
          const out = Number(u.output || u.output_tokens || 0);
          const cRd = Number(u.cacheRead || u.cache_read_tokens || 0);
          const cWr = Number(u.cacheWrite || u.cache_write_tokens || 0);
          const rea = Number(u.reasoning || 0);
          const delta = inp + out + cRd + cWr;
          const cost = typeof u.cost === "number" ? u.cost : 0;
          const agentName = msg.details?.agent || msg.toolName || "subagent";

          totalIn += inp;
          totalOut += out;
          totalCRd += cRd;
          totalCWr += cWr;
          totalRea += rea;
          totalCost += cost;

          if (!agentMap[agentName]) {
            agentMap[agentName] = {
              agent: agentName,
              total: 0,
              cost: 0,
              messages: 0,
              sessions: 1,
              evidence: "measured",
              confidence: 1.0,
              categories: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            };
          }

          const ag = agentMap[agentName];
          ag.messages = (ag.messages || 0) + 1;
          ag.categories!.input += inp;
          ag.categories!.output += out;
          ag.categories!.cacheRead += cRd;
          ag.categories!.cacheWrite += cWr;
          ag.categories!.reasoning += rea;
          ag.categories!.total += delta;
          ag.total += delta;
          ag.cost = Number(((ag.cost || 0) + cost).toFixed(6));
        }
      }
    }

    const byAgent = Object.values(agentMap).sort((a, b) => b.total - a.total);
    const grandTotal = totalIn + totalOut + totalCRd + totalCWr;

    if (grandTotal === 0 && byAgent.length === 0) return null;

    return {
      hasData: true,
      schemaVersion: "1.0",
      updatedAt: new Date().toISOString(),
      source: "pi-runtime",
      totals: {
        input: totalIn,
        output: totalOut,
        reasoning: totalRea,
        cacheRead: totalCRd,
        cacheWrite: totalCWr,
        total: grandTotal,
        cost: Number(totalCost.toFixed(6)),
      },
      byAgent,
    };
  } catch {
    return null;
  }
}
