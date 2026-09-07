import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TaskManagerState } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");

export interface AssemblerOptions {
  modulesDir?: string;
  templateStatePath?: string;
}

export function escapeIslandJson(state: TaskManagerState | string): string {
  const json = typeof state === "string" ? state : JSON.stringify(state, null, 2);
  return json.replace(/<\/script>/gi, "\\u003c/script\\u003e");
}

export function escapeScriptContent(js: string): string {
  return js.replace(/<\/script>/gi, "<\\/script>");
}

export function getCombinedStyles(modulesDir: string): string {
  const stylesDir = path.join(modulesDir, "styles");
  const tokens = fs.readFileSync(path.join(stylesDir, "tokens.css"), "utf-8");
  const layout = fs.readFileSync(path.join(stylesDir, "layout.css"), "utf-8");
  const components = fs.readFileSync(path.join(stylesDir, "components.css"), "utf-8");
  return `<style>\n${tokens}\n\n${layout}\n\n${components}\n</style>`;
}

/**
 * Assembles the full portable HTML cockpit in-memory from modular source files.
 * Zero reliance on a committed 7,000-line HTML artifact in the repository.
 */
export function assembleHtml(
  customState?: TaskManagerState | null,
  options: AssemblerOptions = {}
): string {
  const modulesDir = options.modulesDir || path.join(defaultProjectRoot, "modules");
  const templateStatePath =
    options.templateStatePath ||
    path.join(defaultProjectRoot, "templates", "default-state.json");

  const skeletonPath = path.join(modulesDir, "01-skeleton.html");
  const corePath = path.join(modulesDir, "02-core.js");
  const hudPath = path.join(modulesDir, "03-header-hud.js");
  const phasesPath = path.join(modulesDir, "04-phases.js");
  const panelsPath = path.join(modulesDir, "05-panels.js");
  const todoHelpPath = path.join(modulesDir, "06-todo-help.js");

  const skeleton = fs.readFileSync(skeletonPath, "utf-8");
  const coreJs = escapeScriptContent(fs.readFileSync(corePath, "utf-8"));
  const hudJs = escapeScriptContent(fs.readFileSync(hudPath, "utf-8"));
  const phasesJs = escapeScriptContent(fs.readFileSync(phasesPath, "utf-8"));
  const panelsJs = escapeScriptContent(fs.readFileSync(panelsPath, "utf-8"));
  const todoHelpJs = escapeScriptContent(fs.readFileSync(todoHelpPath, "utf-8"));

  const state: TaskManagerState =
    customState || JSON.parse(fs.readFileSync(templateStatePath, "utf-8"));
  state.meta = state.meta || ({} as any);
  state.meta.lastUpdated = new Date().toISOString();

  const islandJson = escapeIslandJson(state);

  let html = skeleton;
  const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/;
  if (styleRegex.test(html)) {
    html = html.replace(styleRegex, () => getCombinedStyles(modulesDir));
  }

  const islandRegex = /<script[^>]*id="tm-state"[^>]*>[\s\S]*?<\/script>/;
  const newIsland = `<script type="application/json" id="tm-state">${islandJson}</script>`;
  html = html.replace(islandRegex, () => newIsland);

  const scriptsBlock = `
<!-- MODULES: classic scripts, no bundler, file:// compatible -->
<script>
// modules/02-core.js
${coreJs}
</script>
<script>
// modules/03-header-hud.js
${hudJs}
</script>
<script>
// modules/04-phases.js
${phasesJs}
</script>
<script>
// modules/05-panels.js
${panelsJs}
</script>
<script>
// modules/06-todo-help.js
${todoHelpJs}
</script>
<script>
// Bootstrap — single init on DOMContentLoaded, never white-screen
document.addEventListener('DOMContentLoaded', function() {
  try {
    var core = window.TMCore;
    var banner = document.getElementById('tm-error-banner');
    var result = null;
    try {
      result = core.getStateFromDocument(document);
    } catch (e) {
      result = { error: (e && e.message) ? e.message : String(e), validation: { ok: false, errors: [String(e)], warnings: [] } };
    }
    if (result && result.error) {
      if (banner) {
        banner.textContent = '⚠️ Error en JSON del Task Manager: ' + result.error + ' — Revisa el bloque #tm-state. El dashboard sigue visible.';
        banner.hidden = false;
        banner.style.display = 'block';
        banner.removeAttribute('hidden');
      }
      var state = result.state || null;
      if (state) {
        try {
          var metrics = core.deriveMetrics(state);
          if (window.TMHeaderHud) window.TMHeaderHud.renderAll(state, document);
          if (window.TMPhases) window.TMPhases.renderPhases(state, metrics, document);
          if (window.TMPanel) window.TMPanel.renderAllPanels(state, document);
          if (window.TMTodoHelp) window.TMTodoHelp.renderAllTodoHelp(state, document, result.validation);
        } catch (e2) { console.error('Render after error failed', e2); }
      }
      if (!state && window.TMTodoHelp) {
        try { window.TMTodoHelp.renderAllTodoHelp(null, document, result.validation); } catch (e3) { console.error('Help fallback render failed', e3); }
      }
      return;
    }
    if (banner) { banner.hidden = true; banner.style.display = 'none'; banner.setAttribute('hidden',''); }
    var state = result.state;
    var metrics = core.deriveMetrics(state);
    if (window.TMHeaderHud) window.TMHeaderHud.renderAll(state, document);
    if (window.TMPhases) window.TMPhases.renderPhases(state, metrics, document);
    if (window.TMPanel) window.TMPanel.renderAllPanels(state, document);
    if (window.TMTodoHelp) window.TMTodoHelp.renderAllTodoHelp(state, document, result.validation);
    window.__TM_STATE__ = state;
    window.__TM_METRICS__ = metrics;
  } catch (e) {
    console.error('Bootstrap failed', e);
    var b = document.getElementById('tm-error-banner');
    if (b) { b.textContent = 'Error crítico: ' + (e.message || String(e)); b.hidden = false; b.style.display = 'block'; b.removeAttribute('hidden'); }
  }
});
</script>
</body>`;

  if (html.includes("</body>")) {
    html = html.replace("</body>", () => scriptsBlock);
  } else {
    html += scriptsBlock + "\n</html>";
  }

  const headerComment = `<!--
  Task Manager Portable for Pi — Single-file, file:// compatible, zero runtime deps
  Generated dynamically on-demand from modular sources
  Island: script#tm-state (type=application/json) — AI edits ONLY this block
  Tokens: Obsidian Dark theme
-->
`;
  html = html.replace("<!DOCTYPE html>", () => "<!DOCTYPE html>\n" + headerComment);
  return html;
}
