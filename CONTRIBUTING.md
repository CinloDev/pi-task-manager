# Guía de Contribución para `pi-task-manager`

¡Gracias por tu interés en contribuir a **Pi Task Manager**! 🎉  
Este proyecto busca ofrecer un gestor de tareas y fases SDD liviano, estético y profesional para el ecosistema de agentes de codificación **Pi**.

---

## 🏛️ Filosofía de Arquitectura (Principios Inmutables)

Antes de enviar un Pull Request o proponer cambios, ten en cuenta las siguientes reglas de diseño:

1. **Cero Contaminación de Repositorios (Zero Repo Pollution)**:
   - Los repositorios donde trabaja el usuario **solo deben almacenar `.pi/task-manager.json`** (~3 KB).
   - **NUNCA** generes archivos HTML de 7.000 líneas en los proyectos de trabajo. La visualización en el navegador debe ser efímera (`os.tmpdir()`) a menos que el usuario use explícitamente `/task-manager export`.

2. **Single Source of Truth en `modules/`**:
   - Todo el código visual vive en `modules/styles/`, `modules/01-skeleton.html` y los scripts modulares `modules/*.js`.
   - `Task-Manager-Portable.html` es un artefacto compilado que **no debe commitearse en Git** (está ignorado en `.gitignore`).

3. **Compatibilidad Offline Estricta en el Dashboard**:
   - El visualizador debe funcionar sobre `file://` con **cero dependencias externas en runtime**: nada de llamadas a CDNs, imports de red ni fuentes externas que requieran conexión a internet.

4. **Experiencia TUI en Terminal Completa**:
   - Todo el flujo del menú interactivo (`alt+t`) debe ocurrir dentro del componente flotante `TaskManagerModalOverlay`, sin expulsar al usuario a inputs secundarios ni cerrar la ventana inesperadamente.

---

## 🛠️ Flujo de Desarrollo Local

### 1. Requisitos Previos
* **Node.js**: v20.0.0 o superior (recomendado v22+).
* **pnpm**: v9.0.0 o superior.
* **Pi Coding Agent**: instalado y configurado.

### 2. Instalación de Dependencias
```bash
git clone https://github.com/tu-usuario/pi-task-manager.git
cd pi-task-manager
pnpm install
```

### 3. Enlazar la Extensión en Pi
Para probar tus cambios en tiempo real en tus proyectos:
```bash
ln -s "$(pwd)" ~/.pi/agent/extensions/pi-task-manager
```
Luego dentro de Pi, ejecuta `/reload` para recargar los cambios.

### 4. Ejecución de Pruebas y Tipos
Antes de realizar cualquier commit, asegúrate de que toda la suite de tests y el typechecker pasen en verde:

```bash
# Ejecutar suite de pruebas de Vitest
pnpm test

# Verificación estricta de tipos de TypeScript
pnpm typecheck
```

---

## 📋 Estilo de Código y Commits

* **TypeScript Estricto**: Todo el código de `src/` debe compilar sin advertencias en `tsc --noEmit`.
* **Commits Semánticos (Conventional Commits)**:
  * `feat:` Nuevas funcionalidades o herramientas para agentes.
  * `fix:` Correcciones de bugs o desalineaciones visuales.
  * `style:` Ajustes de estilos CSS, tokens o formato visual.
  * `refactor:` Mejoras de arquitectura interna sin alterar comportamiento externo.
  * `test:` Nuevas pruebas unitarias o de integración.
  * `docs:` Cambios o mejoras en la documentación.

---

## 👥 Reconocimientos

Este proyecto toma como base e inspiración el trabajo original de **[Ramón (@RamonsDka)](https://github.com/RamonsDka/opencode-sdd-profile-manager)** en el diseño de paneles técnicos portables. Si tus aportes modifican o enriquecen la integración con dicho ecosistema, menciónalo adecuadamente en la documentación.
