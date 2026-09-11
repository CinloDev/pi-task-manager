// @ts-nocheck
// modules/06-todo-help.js — Todo scratchpad + Help tab & AI Console (PR6, classic script)
// Depends on TMCore. Classic script, no fetch.

(function (global) {
  'use strict';

  function getCore() {
    return (typeof window !== 'undefined' && window.TMCore) || (typeof globalThis !== 'undefined' && globalThis.TMCore) || (typeof global !== 'undefined' && global.TMCore) || null;
  }
  function esc(s) {
    var c = getCore();
    return c ? c.escapeHtml(s) : String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function label(key, state, fallback) {
    if (state && state.meta && state.meta.labels && state.meta.labels.es && typeof state.meta.labels.es[key] === 'string' && state.meta.labels.es[key]) {
      return state.meta.labels.es[key];
    }
    return fallback;
  }

  function priorityBadgeClass(priority) {
    if (priority === 'P0') return 'badge-blocked';
    if (priority === 'P1') return 'badge-completed';
    if (priority === 'P2') return 'badge-pending';
    return 'badge-tag';
  }
  function priorityLabel(priority) {
    if (priority === 'P0') return 'P0 Urgente';
    if (priority === 'P1') return 'P1 Alta';
    if (priority === 'P2') return 'P2 Normal';
    return priority || '—';
  }

  function readState(doc) {
    var island = doc && doc.getElementById('tm-state');
    var raw = island ? (island.textContent || '') : '';
    var core = getCore();
    var parsed = null;
    var validation = { ok: false, errors: [], warnings: [] };
    try {
      parsed = core && typeof core.parseIsland === 'function' ? core.parseIsland(raw) : JSON.parse(raw);
      validation = core && typeof core.validateState === 'function' ? core.validateState(parsed) : validation;
    } catch (e) {
      validation.errors.push(e && e.message ? e.message : String(e));
    }
    if (core && parsed && typeof core.deriveInsights === 'function') {
      var insights = core.deriveInsights(parsed, validation);
      validation.errors = insights.diagnostics.errors;
      validation.warnings = insights.diagnostics.warnings;
    }
    return { island: island, raw: raw, parsed: parsed, validation: validation };
  }

  function formatStateValue(source) {
    try { return JSON.stringify(source, null, 2); } catch (_) { return String(source == null ? '' : source); }
  }

  function projectFileName(state) {
    var name = state && state.meta && state.meta.projectName || 'drop-in-task-manager';
    name = String(name).trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    return (name || 'drop-in-task-manager') + '-state.json';
  }

  function setFeedback(root, selector, message, error) {
    var el = root && root.querySelector(selector);
    if (el) { el.textContent = message; el.setAttribute('data-state-feedback', error ? 'error' : 'ok'); }
  }

  function copyText(doc, text, done) {
    var win = doc && doc.defaultView || (typeof window !== 'undefined' ? window : global);
    var clipboard = win && win.navigator && win.navigator.clipboard;
    function fallback() {
      var ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('data-copy-fallback', '1');
      ta.setAttribute('aria-hidden', 'true');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (_) {}
      if (ta.parentNode) ta.parentNode.removeChild(ta);
      done(ok);
    }
    if (clipboard && typeof clipboard.writeText === 'function') {
      try { Promise.resolve(clipboard.writeText(text)).then(function () { done(true); }, fallback); } catch (_) { fallback(); }
    } else fallback();
  }

  function exportState(doc, state, text) {
    var win = doc && doc.defaultView || (typeof window !== 'undefined' ? window : global);
    var name = projectFileName(state);
    var url = '';
    var link = doc.createElement('a');
    try {
      if (win && typeof win.Blob === 'function' && win.URL && typeof win.URL.createObjectURL === 'function') {
        try { url = win.URL.createObjectURL(new win.Blob([text], { type: 'application/json' })); } catch (_) {}
      } else {
        url = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
      }
      if (!url) url = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
      link.href = url; link.download = name; link.style.display = 'none';
      doc.body.appendChild(link); link.click();
      if (link.parentNode) link.parentNode.removeChild(link);
      if (win && win.URL && typeof win.URL.revokeObjectURL === 'function' && url.indexOf('blob:') === 0) win.URL.revokeObjectURL(url);
      return true;
    } catch (_) { if (link.parentNode) link.parentNode.removeChild(link); return false; }
  }

  function renderStateTools(state, doc, validation, mountId) {
    var mount = doc.getElementById(mountId || 'state-inspection-mount');
    if (!mount) return;
    var snapshot = readState(doc);
    var info = validation || {};
    var errorList = (snapshot.validation.errors || []).concat(Array.isArray(info.errors) ? info.errors : []);
    var warningList = (snapshot.validation.warnings || []).concat(Array.isArray(info.warnings) ? info.warnings : []);
    var source = snapshot.parsed || snapshot.raw;
    var text = snapshot.parsed ? formatStateValue(source) : snapshot.raw;
    var errors = errorList.filter(function (item, index, list) { return list.indexOf(item) === index; });
    var warnings = warningList.filter(function (item, index, list) { return list.indexOf(item) === index; });
    var health = errors.length ? 'error' : warnings.length ? 'warning' : 'healthy';
    var title = errors.length ? 'Estado con errores' : warnings.length ? 'Estado utilizable con advertencias' : 'Estado saludable';
    var summary = errors.length ? 'La inspección avanzada se abrió para facilitar la recuperación.' : warnings.length ? 'El panel sigue disponible; revisa las advertencias cuando lo necesites.' : 'No se detectaron problemas en el estado actual.';
    var diagnosticsHtml = '<div id=\"tm-diagnostics\" role=\"status\">'
      + (errors.length ? '<strong>Errores</strong><ul>' + errors.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul>' : '')
      + (warnings.length ? '<strong>Advertencias</strong><ul>' + warnings.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul>' : '')
      + (!errors.length && !warnings.length ? '<p>Sin diagnósticos pendientes.</p>' : '')
      + '</div>';
    mount.innerHTML = '<section class=\"state-tools\" aria-label=\"Diagnóstico e inspección del estado\">'
      + '<div class=\"state-health-card\" data-health=\"' + health + '\"><span class=\"state-health-icon\">' + (errors.length ? '!' : warnings.length ? 'i' : '✓') + '</span><div><strong>' + title + '</strong><p>' + summary + '</p></div><div class=\"state-health-counts\"><span class=\"badge ' + (errors.length ? 'badge-blocked' : 'badge-completed') + '\">' + errors.length + ' errores</span><span class=\"badge ' + (warnings.length ? 'badge-pending' : 'badge-tag') + '\">' + warnings.length + (warnings.length === 1 ? ' advertencia' : ' advertencias') + '</span></div></div>'
      + '<details class=\"state-tools-advanced\"' + (errors.length ? ' open' : '') + '><summary>Inspección avanzada del JSON</summary><div class=\"state-tools-advanced-body\">'
      + diagnosticsHtml
      + '<pre id=\"tm-state-json\" aria-label=\"Read-only state JSON\">' + esc(text) + '</pre>'
      + '<div class=\"state-tools-actions\">'
      + '<button type=\"button\" class=\"btn btn-secondary btn-sm\" data-state-copy>Copy State JSON</button>'
      + '<button type=\"button\" class=\"btn btn-secondary btn-sm\" data-state-export>Export JSON</button>'
      + '<span data-state-copy-feedback aria-live=\"polite\"></span><span data-state-export-feedback aria-live=\"polite\"></span>'
      + '</div></div></details></section>';
    var copy = mount.querySelector('[data-state-copy]');
    var exportButton = mount.querySelector('[data-state-export]');
    if (copy) copy.addEventListener('click', function () { copyText(doc, text, function (ok) { setFeedback(mount, '[data-state-copy-feedback]', ok ? 'Copied' : 'Copy failed', !ok); }); });
    if (exportButton) exportButton.addEventListener('click', function () { var ok = exportState(doc, snapshot.parsed || state, text); setFeedback(mount, '[data-state-export-feedback]', ok ? 'Exported' : 'Export failed', !ok); });
  }

  function openTodoDetailDialog(todo, doc, triggerEl) {
    var dialog = doc.getElementById('todo-detail-dialog');
    if (!dialog || !todo) return;

    var priority = todo.priority || 'P2';
    var pClass = priorityBadgeClass(priority);
    var pLabel = priorityLabel(priority);
    var isDone = !!todo.done;

    var idEl = dialog.querySelector('#todo-detail-id');
    var pBadge = dialog.querySelector('#todo-detail-priority-badge');
    var sBadge = dialog.querySelector('#todo-detail-status-badge');
    var titleEl = dialog.querySelector('#todo-detail-title');
    var pLevelEl = dialog.querySelector('#todo-detail-p-level');
    var stateTextEl = dialog.querySelector('#todo-detail-state-text');
    var actionBox = dialog.querySelector('#todo-detail-action-guidance');

    if (idEl) idEl.textContent = todo.id || 'td';
    if (pBadge) {
      pBadge.className = 'badge ' + pClass;
      pBadge.textContent = pLabel;
    }
    if (sBadge) {
      sBadge.textContent = isDone ? 'Completada / Verificada' : 'Pendiente / Activa';
      sBadge.className = 'badge ' + (isDone ? 'badge-completed' : 'badge-pending');
    }
    if (titleEl) titleEl.textContent = todo.text || 'Señal de Atención';
    if (pLevelEl) {
      pLevelEl.textContent = priority === 'P0' ? 'P0 (Crítico / Bloqueante)' : priority === 'P1' ? 'P1 (Prioridad Alta)' : 'P2 (Prioridad Normal / Rutina)';
    }
    if (stateTextEl) {
      stateTextEl.textContent = isDone ? '✓ Verificada y cumplida en el estado del proyecto' : '⏳ Pendiente de cumplimiento / revisión requerida';
    }
    if (actionBox) {
      var advice = '';
      if (priority === 'P0') {
        advice = '🚨 Nivel Crítico: Esta señal representa un requisito indispensable de portabilidad o arquitectura. El orquestador debe resolverla antes de proceder a la siguiente fase.';
      } else if (priority === 'P1') {
        advice = '⚡ Prioridad Alta: Verificar funcionalidad clave e interactividad (reloj, filtros, sincronización) asegurando que no se rompan las pruebas.';
      } else {
        advice = '📌 Prioridad Normal: Mantener coherencia en el bloque JSON #tm-state y actualizar progresivamente según avances.';
      }
      actionBox.textContent = advice;
    }

    dialog._trigger = triggerEl;
    dialog.dataset.open = 'true';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    var closeBtn = dialog.querySelector('[data-todo-close]');
    if (closeBtn) closeBtn.focus();
  }

  function closeTodoDetailDialog(doc) {
    var dialog = doc && doc.getElementById('todo-detail-dialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    dialog.removeAttribute('open');
    dialog.dataset.open = 'false';
    if (dialog._trigger && typeof dialog._trigger.focus === 'function') dialog._trigger.focus();
  }

  function bindTodoDialogControls(doc) {
    var dialog = doc && doc.getElementById('todo-detail-dialog');
    if (!dialog || dialog.getAttribute('data-todo-dialog-bound') === '1') return;
    dialog.setAttribute('data-todo-dialog-bound', '1');

    dialog.querySelectorAll('[data-todo-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeTodoDetailDialog(doc); });
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeTodoDetailDialog(doc);
    });
    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeTodoDetailDialog(doc);
    });
    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || dialog.dataset.open !== 'true') return;
      var focusables = Array.prototype.slice.call(dialog.querySelectorAll('button, [href], [tabindex]')).filter(function (item) { return !item.hidden && !item.disabled && item.getAttribute('tabindex') !== '-1'; });
      if (!focusables.length) return;
      event.preventDefault();
      var index = focusables.indexOf(doc.activeElement);
      var next = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : (index === -1 || index === focusables.length - 1 ? 0 : index + 1);
      focusables[next].focus();
    });
  }

  function renderTodo(state, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    var container = doc.getElementById('todo-items-container') || doc.querySelector('.todo-list');
    if (!container) return;

    bindTodoDialogControls(doc);

    var todos = (state && Array.isArray(state.todos)) ? state.todos : [];

    // Update todo count badge in header if exists
    var countBadge = doc.getElementById('todo-count-badge');
    if (countBadge) {
      countBadge.textContent = todos.length + ' señales';
    }

    if (todos.length === 0) {
      container.innerHTML = '<div class=\"informational-empty\">Sin señales de atención registradas</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < todos.length; i++) {
      var td = todos[i] || {};
      var id = esc(td.id || ('td-' + (i+1)));
      var text = esc(td.text || '');
      var priority = td.priority || 'P2';
      var done = !!td.done;
      var badgeCls = priorityBadgeClass(priority);
      var pLabel = esc(priorityLabel(priority));

      html += '<div class=\"todo-item' + (done ? ' done' : '') + '\" role=\"button\" tabindex=\"0\" aria-haspopup=\"dialog\" data-id=\"' + id + '\" data-priority=\"' + priority + '\" data-done=\"' + (done ? '1' : '0') + '\" title=\"Clic para ver detalles y recomendaciones de esta señal\">'
        + '<div class=\"todo-left\">'
        + '<span class=\"todo-text\">' + text + '</span>'
        + '</div>'
        + '<div style=\"display:flex;gap:6px;align-items:center;\">'
        + '<span class=\"badge ' + badgeCls + '\">' + pLabel + '</span>'
        + '<span class=\"badge-tag\">Informativo</span>'
        + '</div>'
        + '</div>';
    }
    container.innerHTML = html;

    if (container.getAttribute('data-todo-bound') !== '1') {
      container.setAttribute('data-todo-bound', '1');
      container.addEventListener('click', function (event) {
        var item = event.target.closest('.todo-item');
        if (!item || !container.contains(item)) return;
        var id = item.getAttribute('data-id');
        var matched = todos.find(function (t) { return t && (t.id === id || String(t.id) === id); });
        if (matched) openTodoDetailDialog(matched, doc, item);
      });
      container.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          var item = event.target.closest('.todo-item');
          if (item && container.contains(item)) {
            event.preventDefault();
            var id = item.getAttribute('data-id');
            var matched = todos.find(function (t) { return t && (t.id === id || String(t.id) === id); });
            if (matched) openTodoDetailDialog(matched, doc, item);
          }
        }
      });
    }
  }

  function getMasterPrompt() {
    return 'Usa la skill task-manager.\\\\n\\\\n'
      + 'Eres Agent Task Manager, la autoridad responsable de mantener y sincronizar el estado técnico en .pi/task-manager.json con evidencia real del workspace (Git commits, PRs, OpenSpec y tareas).\\n\\n'
      + 'HERRAMIENTAS NATIVAS DE PI (Recomendado):\\\\n'
      + '1. task_manager_read: Inspecciona tareas, fases y progreso directamente.\\\\n'
      + '2. task_manager_update_task: Actualiza el estado de una tarea (taskId, status, note, commit, owner, blockedReason).\\\\n'
      + '3. task_manager_sync: Sincroniza git commits y tareas markdown automáticamente.\\\\n\\\\n'
      + 'REGLAS TÉCNICAS OBLIGATORIAS:\\\\n'
      + '1. El repositorio guarda ÚNICAMENTE el estado liviano en .pi/task-manager.json (~3 KB). Cero archivos HTML en el repo.\\\\n'
      + '2. Mantén schemaVersion: \\"1.0\\" intacto siempre.\\\\n'
      + '3. Usa exclusivamente los estados válidos: \\"pending\\", \\"in_progress\\", \\"completed\\", \\"blocked\\".\\\\n'
      + '4. Soporta subtareas estructuradas con: \\"subtasks\\": [{\\"id\\": \\"ST1\\", \\"title\\": \\"...\\", \\"status\\": \\"completed\\", \\"done\\": true}].\\\\n'
      + '5. Preserva IDs existentes, notas personalizadas del usuario, etiquetas y propietarios.\\\\n'
      + '6. Para abrir o compartir el dashboard visual, usa /task-manager open (efímero en navegador) o /task-manager export.\\\\n\\\\n'
      + 'Al finalizar, reporta un resumen conciso del estado de fases y tareas.';
  }

  function renderHelp(state, doc, validation) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    var panel = doc.getElementById('help-panel');
    if (!panel) return;

    // Respect features.help flag if present (default true)
    var core = getCore();
    if (core && state && state.meta && state.meta.features && state.meta.features.help === false) {
      panel.style.display = 'none';
      panel.setAttribute('hidden', '');
      return;
    }
    panel.style.display = '';
    panel.removeAttribute('hidden');

    var todoTitle = label('todoTitle', state, 'Tareas Rápidas');
    var helpTitle = label('helpTitle', state, 'Ayuda & Consola IA');
    var filterAll = label('filterAll', state, 'Todas');
    var filterActive = label('filterActive', state, 'Activas');

    var helpHtml = ''
      + '<h3 style=\"color:#fff;margin-bottom:8px;\">' + esc(helpTitle) + '</h3>'
      + '<p style=\"font-size:13.5px;color:#a0a0a0;margin-bottom:14px;line-height:1.5;\">Gestor técnico de tareas y fases SDD integrado con <strong>Pi</strong>. El estado se almacena de forma limpia y compacta en <code style=\"background:#12161d;padding:2px 6px;border-radius:4px;color:var(--accent-blue);\">.pi/task-manager.json</code> (~3 KB), manteniendo el repositorio libre de archivos HTML innecesarios.</p>'
      + '<div style=\"background:#12161d;border:1px solid #30363d;border-radius:8px;padding:14px;margin-bottom:12px;\">'
      + '<h4 style=\"color:#fff;font-size:14px;margin-bottom:8px;display:flex;align-items:center;gap:6px;\">🚀 Comandos Principales en Pi</h4>'
      + '<ul style=\"font-size:13px;color:#a0a0a0;padding-left:18px;display:flex;flex-direction:column;gap:6px;\">'
      + '<li><code style=\"background:#1c222b;padding:2px 6px;border-radius:4px;color:#fff;\">/task-manager</code> (atajos <kbd style=\"background:#1c222b;padding:1px 5px;border-radius:3px;font-family:var(--font-mono);\">alt+j</kbd> / <kbd style=\"background:#1c222b;padding:1px 5px;border-radius:3px;font-family:var(--font-mono);\">ctrl+shift+j</kbd>): Abre el modal flotante en la terminal.</li>'
      + '<li><code style=\"background:#1c222b;padding:2px 6px;border-radius:4px;color:#fff;\">/task-manager open</code>: Abre el dashboard interactivo en tu navegador predeterminado (renderizado al vuelo en temp sin ensuciar el repo).</li>'
      + '<li><code style=\"background:#1c222b;padding:2px 6px;border-radius:4px;color:#fff;\">/task-manager sync</code>: Sincroniza ramas git, árbol de archivos y tareas desde <code>tasks.md</code> o OpenSpec.</li>'
      + '<li><code style=\"background:#1c222b;padding:2px 6px;border-radius:4px;color:#fff;\">/task-manager status</code> y <code style=\"background:#1c222b;padding:2px 6px;border-radius:4px;color:#fff;\">/task-manager list</code>: Muestra resúmenes y checklists detallados en la terminal.</li>'
      + '<li><code style=\"background:#1c222b;padding:2px 6px;border-radius:4px;color:#fff;\">/task-manager export [ruta]</code>: Exporta una copia HTML portable bajo demanda para compartir o publicar estático.</li>'
      + '</ul>'
      + '</div>'

      + '<div style=\"background:#12161d;border:1px solid #30363d;border-radius:8px;padding:14px;margin-bottom:12px;\">'
      + '<h4 style=\"color:#fff;font-size:14px;margin-bottom:8px;display:flex;align-items:center;gap:6px;\">🤖 Cómo la IA actualiza el estado</h4>'
      + '<p style=\"font-size:13px;color:#a0a0a0;margin-bottom:8px;\">La IA orquestadora y los subagentes operan directamente mediante <strong>Tools Nativas de Pi</strong> o actualizando el JSON de estado:</p>'
      + '<ul style=\"font-size:13px;color:#a0a0a0;padding-left:18px;display:flex;flex-direction:column;gap:6px;\">'
      + '<li><code style=\"background:#1c222b;padding:2px 6px;border-radius:4px;color:#58a6ff;\">task_manager_read</code>: Lee fases, tareas, métricas y git en tiempo real.</li>'
      + '<li><code style=\"background:#1c222b;padding:2px 6px;border-radius:4px;color:#58a6ff;\">task_manager_update_task</code>: Cambia estado (<code>in_progress</code>, <code>completed</code>, <code>blocked</code>), agrega notas técnicas o vincula commits.</li>'
      + '<li><code style=\"background:#1c222b;padding:2px 6px;border-radius:4px;color:#58a6ff;\">task_manager_sync</code>: Reconcilia automáticamente las tareas con los archivos markdown del proyecto.</li>'
      + '</ul>'
      + '</div>'

      + '<div style=\"background:#12161d;border:1px solid #30363d;border-radius:8px;padding:14px;margin-bottom:12px;\">'
      + '<h4 style=\"color:#fff;font-size:14px;margin-bottom:8px;\">📐 Esquema (.pi/task-manager.json)</h4>'
      + '<pre style=\"font-family:var(--font-mono);font-size:11.5px;color:#a0a0a0;overflow-x:auto;background:#0b0e14;padding:10px;border-radius:6px;border:1px solid #30363d;\">{\\n'
      + '  &quot;schemaVersion&quot;: &quot;1.0&quot;,\\n'
      + '  &quot;meta&quot;: { &quot;projectName&quot;, &quot;version&quot;, &quot;branch&quot;, &quot;features&quot;: {&quot;git&quot;:true, &quot;tree&quot;:true, &quot;codegraph&quot;:true} },\\n'
      + '  &quot;phases&quot;: [{ &quot;id&quot;: &quot;phase-1&quot;, &quot;title&quot;: &quot;...&quot;, &quot;status&quot;: &quot;completed&quot;, &quot;tasks&quot;: [...] }],\\n'
      + '  &quot;todos&quot;: [{ &quot;id&quot;: &quot;td-1&quot;, &quot;text&quot;: &quot;...&quot;, &quot;priority&quot;: &quot;P1&quot;, &quot;done&quot;: false }],\\n'
      + '  &quot;git&quot;: { &quot;branch&quot;, &quot;commits&quot;, &quot;syncStatus&quot; },\\n'
      + '  &quot;tree&quot;: [...],\\n'
      + '  &quot;codegraph&quot;: { &quot;nodes&quot;: [...], &quot;edges&quot;: [...] }\\n'
      + '}</pre>'
      + '</div>'

      + '<div id=\"ai-instructions\" style=\"background:rgba(88,166,255,0.06);border:1px solid #58a6ff;border-radius:8px;padding:14px;\">'
      + '<h4 style=\"color:#58a6ff;font-size:14px;margin-bottom:8px;\">🧠 Instrucciones para IA Orquestadora & Subagentes</h4>'
      + '<ul style=\"font-size:12.5px;color:#a0a0a0;padding-left:18px;display:flex;flex-direction:column;gap:5px;\">'
      + '<li>Usa preferentemente las herramientas nativas de Pi (<code>task_manager_read</code>, <code>task_manager_update_task</code>).</li>'
      + '<li>Si editas directamente en disco, modifica únicamente <code>.pi/task-manager.json</code> — nunca crees archivos HTML en los repositorios.</li>'
      + '<li>Mantén <code>schemaVersion: &quot;1.0&quot;</code> siempre.</li>'
      + '<li>Usa exclusivamente los estados válidos: <code>pending</code>, <code>in_progress</code>, <code>completed</code>, <code>blocked</code>.</li>'
      + '<li>Preserva notas de usuario, sub-tareas y dependencias al actualizar fases.</li>'
      + '</ul>'
      + '</div>'

      + '<div id=\"prompt-inicial\" style=\"background:#12161d;border:1px solid #3fb950;border-radius:8px;padding:14px;margin-top:12px;\">'
      + '<h4 style=\"color:#3fb950;font-size:14px;margin-bottom:8px;display:flex;align-items:center;gap:6px;\">📋 Prompt para Agent Task Manager (Referencia / Manual)</h4>'
      + '<p style=\"font-size:12.5px;color:#8b949e;margin-bottom:8px;\">La sincronización opera automáticamente en segundo plano con las tools de Pi. Si necesitas darle instrucciones directas a un agente, puedes copiar este prompt:</p>'
      + '<pre id=\"initial-prompt-text\" data-help-prompt style=\"font-family:var(--font-mono);font-size:11px;color:#c9d1d9;background:#0b0e14;padding:10px;border-radius:6px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;border:1px solid #30363d;line-height:1.5;max-height:280px;overflow-y:auto;\">' + esc(getMasterPrompt()) + '</pre>'
      + '<button id=\"btn-copy-prompt\" data-copy-prompt type=\"button\" style=\"margin-top:8px;background:#238636;border:1px solid #3fb950;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px;display:inline-flex;align-items:center;gap:6px;\">📋 Copiar prompt</button>'
      + '<span id=\"copy-feedback\" data-copy-prompt-feedback role=\"status\" aria-live=\"polite\" style=\"margin-left:8px;font-size:12px;color:#3fb950;display:none;\"></span>'
      + '</div>'

      + '<aside class=\"help-portability-note\" aria-label=\"Portabilidad y documentación\"><span class=\"help-portability-icon\">i</span><div><strong>Arquitectura desacoplada</strong><p>Estado en <code>.pi/task-manager.json</code> · Dashboard servido efímeramente o exportable a HTML autónomo</p><div class=\"help-portability-tags\"><span>Estado limpio JSON</span><span>Tools de Pi</span><span>Cero dependencias</span></div></div></aside>';

    panel.innerHTML = helpHtml + '<div id=\"state-inspection-mount\"></div>';
    renderStateTools(state, doc, validation, 'state-inspection-mount');

    // Attach copy handler for prompt (file:// compatible, no inline script)
    (function(){
      var btn = panel.querySelector('#btn-copy-prompt');
      var pre = panel.querySelector('#initial-prompt-text');
      var fb = panel.querySelector('#copy-feedback');
      var win = doc.defaultView || global;
      if (!btn || !pre) return;
      btn.addEventListener('click', function(){
        var text = pre.textContent;
        function ok(){ if(fb){fb.textContent='¡Copiado!';fb.style.display='inline'; btn.textContent='✓ Copiado!'; setTimeout(function(){if(fb)fb.style.display='none'; btn.textContent='📋 Copiar prompt';},1800);} }
        function fallback(){
          var ta = doc.createElement('textarea');
          ta.value = text;
          ta.style.position='fixed';
          ta.style.opacity='0';
          doc.body.appendChild(ta);
          ta.select();
          var copied = false;
          try{ copied = doc.execCommand('copy'); }catch(e){}
          if(copied) ok(); else if(fb){fb.textContent='No se pudo copiar. Selecciona y copia el prompt manualmente.';fb.style.display='inline';}
          doc.body.removeChild(ta);
        }
        if(win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === 'function'){
          win.navigator.clipboard.writeText(text).then(ok).catch(fallback);
        } else {
          fallback();
        }
      });
    })();
  }

  function renderAllTodoHelp(state, doc, validation) {
    renderTodo(state, doc);
    renderHelp(state, doc, validation);
  }

  var TMTodoHelp = {
    renderTodo: renderTodo,
    renderHelp: renderHelp,
    renderAllTodoHelp: renderAllTodoHelp,
    renderStateTools: renderStateTools,
    copyText: copyText,
    exportState: exportState,
    getMasterPrompt: getMasterPrompt
  };

  try { if (typeof window !== 'undefined') window.TMTodoHelp = TMTodoHelp; } catch (_) {}
  try { if (typeof globalThis !== 'undefined') globalThis.TMTodoHelp = TMTodoHelp; } catch (_) {}
  try { if (typeof global !== 'undefined') global.TMTodoHelp = TMTodoHelp; } catch (_) {}
  try { if (typeof module !== 'undefined' && module.exports) module.exports = TMTodoHelp; } catch (_) {}

})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : this);
