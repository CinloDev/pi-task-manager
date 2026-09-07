// scripts/assemble.mjs — Concatenate modules into single drop-in HTML (zero deps, file:// compatible)
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const skeletonPath = path.join(projectRoot, 'modules', '01-skeleton.html');
const corePath = path.join(projectRoot, 'modules', '02-core.js');
const hudPath = path.join(projectRoot, 'modules', '03-header-hud.js');
const phasesPath = path.join(projectRoot, 'modules', '04-phases.js');
const panelsPath = path.join(projectRoot, 'modules', '05-panels.js');
const todoHelpPath = path.join(projectRoot, 'modules', '06-todo-help.js');
const templateStatePath = path.join(projectRoot, 'templates', 'default-state.json');
const portablePath = path.join(projectRoot, 'Task-Manager-Portable.html');

export function escapeIslandJson(state) {
  const json = typeof state === 'string' ? state : JSON.stringify(state, null, 2);
  return json.replace(/<\/script>/gi, '\\u003c/script\\u003e');
}

export function escapeScriptContent(js) {
  return js.replace(/<\/script>/gi, '<\\/script>');
}

export function assembleHtml(customState = null) {
  const skeleton = readFileSync(skeletonPath, 'utf-8');
  const coreJs = escapeScriptContent(readFileSync(corePath, 'utf-8'));
  const hudJs = escapeScriptContent(readFileSync(hudPath, 'utf-8'));
  const phasesJs = escapeScriptContent(readFileSync(phasesPath, 'utf-8'));
  const panelsJs = escapeScriptContent(readFileSync(panelsPath, 'utf-8'));
  const todoHelpJs = escapeScriptContent(readFileSync(todoHelpPath, 'utf-8'));

  const state = customState || JSON.parse(readFileSync(templateStatePath, 'utf-8'));
  state.meta = state.meta || {};
  state.meta.lastUpdated = new Date().toISOString();

  const islandJson = escapeIslandJson(state);

  const islandRegex = /<script[^>]*id="tm-state"[^>]*>[\s\S]*?<\/script>/;
  const newIsland = `<script type="application/json" id="tm-state">${islandJson}</script>`;
  let html = skeleton.replace(islandRegex, () => newIsland);

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

  if (html.includes('</body>')) {
    html = html.replace('</body>', () => scriptsBlock);
  } else {
    html += scriptsBlock + '\n</html>';
  }

  const headerComment = `<!--
  Task Manager Portable for Pi — Single-file, file:// compatible, zero runtime deps
  Generated deterministically by scripts/assemble.mjs
  Island: script#tm-state (type=application/json) — AI edits ONLY this block
  Tokens: Obsidian Dark theme
-->
`;
  html = html.replace('<!DOCTYPE html>', () => '<!DOCTYPE html>\n' + headerComment);
  return html;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const assembled = assembleHtml();
  writeFileSync(portablePath, assembled, 'utf-8');
  const stats = statSync(portablePath);
  const sizeKB = (stats.size / 1024).toFixed(1);
  console.log(`✅ Assembled Task-Manager-Portable.html — ${stats.size} bytes (${sizeKB} KB)`);
}
