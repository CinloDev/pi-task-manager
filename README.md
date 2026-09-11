# Pi Task Manager (`pi-task-manager`)

> Cockpit visual, modal interactivo en terminal y extensión para Pi Coding Agent orientada al seguimiento de tareas, telemetría de tokens y gestión de fases SDD (Spec-Driven Development).  
> **Inspirado en el concepto original de dashboard portable de [Ramón (@RamonsDka)](https://github.com/RamonsDka/opencode-sdd-profile-manager), rediseñado y evolucionado para la arquitectura moderna de Pi.**

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)
![Pi Extension](https://img.shields.io/badge/Pi-Extension-purple.svg)
![Zero Repo Pollution](https://img.shields.io/badge/Workspace-100%25%20Clean%20JSON-brightgreen.svg)
![Theme](https://img.shields.io/badge/Theme-Dynamic%20Tokens-9333ea.svg)

---

## ⚡ En 30 Segundos: ¿Qué problema resuelve?

1. **Cero basura en tus repositorios**: Guarda todo el estado del proyecto en un archivo ligero `.pi/task-manager.json` (~3 KB). Se terminaron los archivos HTML gigantes de 7.000 líneas ensuciando tus commits o diffs de Git.
2. **Modal flotante en tu terminal (`alt+t` / `ctrl+shift+t`)**: Abrí una ventana interactiva en el centro de tu terminal para ver el progreso, tildar tareas con teclado o mouse, y cambiar estados sin salir de Pi.
3. **Visualizador web efímero (`/task-manager open`)**: Compila al vuelo el dashboard en memoria y lo abre en tu navegador sin crear archivos permanentes en tu proyecto.
4. **Telemetría real de tokens y costos**: Registra el consumo real de tokens (entrada, salida, caché, razonamiento) y costos en USD desglosados por modelo y agente.

---

## 📸 Vista Rápida del Dashboard Visual

| 1. Métricas Generales y HUD | 2. Telemetría de Tokens por Agente |
|:---:|:---:|
| ![HUD y Métricas Generales](public/1.png) | ![Telemetría de Tokens](public/2.png) |
| **3. Tablero Kanban por Estado** | **4. Fases SDD y Tareas Técnicas** |
| ![Tablero Kanban](public/3.png) | ![Fases SDD y Tareas](public/4.png) |

---

## 🚀 Instalación en Pi

Elegí la opción que mejor se adapte a tu forma de laburar:

### Opción 1: Instalación directa con Pi (Recomendada)
Instalalo con el gestor oficial de paquetes de Pi (sin clonar manualmente ni configurar rutas):

```bash
# Instalación global para todos tus proyectos en Pi
pi install https://github.com/CinloDev/pi-task-manager

# O si querés instalarlo únicamente en el proyecto actual:
pi install -l https://github.com/CinloDev/pi-task-manager
```

Luego, dentro de tu sesión de Pi, recargá las extensiones:
```text
/reload
```

---

### Opción 2: Clonado Local (Para desarrollo o contribución)
Si querés clonar el código para modificarlo o probarlo en vivo:

```bash
# 1. Clonar el repositorio
git clone https://github.com/CinloDev/pi-task-manager.git
cd pi-task-manager

# 2. Instalar dependencias
pnpm install

# 3. Enlazar la extensión localmente en tu Pi
ln -s "$(pwd)" ~/.pi/agent/extensions/pi-task-manager
```

Dentro de Pi ejecutá `/reload` y ya queda activo.

---

## 🎯 ¿Cómo se usa?

### 1. Atajo Rápido de Teclado
Presioná en cualquier momento dentro de Pi:
* **Linux / Windows**: <kbd>Alt + T</kbd> o <kbd>Ctrl + Shift + T</kbd>
* **macOS**: <kbd>Control + Shift + T</kbd> (o <kbd>⌥ Option + T</kbd>)

Se abrirá el **modal flotante interactivo** en el centro de tu terminal.

### 2. Navegación con Mouse y Teclado
* 🖱️ **Rueda del mouse**: Scrolleá arriba y abajo por las listas y menús.
* 👆 **Click izquierdo**: Click simple selecciona el elemento; doble click (o click en el ítem enfocado) ejecuta la acción o tilda la tarea.
* ⌨️ **Teclado**: Flechas (`↑`/`↓`) para moverte, <kbd>Enter</kbd> para accionar y <kbd>Esc</kbd> para volver o salir.

### 3. Comandos Principales en la CLI
Podés usar `/task-manager` o el alias corto `/tm`:

```bash
/task-manager           # Abre el modal interactivo en la terminal (alias: /tm)
/task-manager open      # Abre el dashboard visual en tu navegador predeterminado
/task-manager sync      # Sincroniza git commits, telemetría y tareas markdown
/task-manager status    # Muestra el resumen de métricas en la terminal
/task-manager list      # Lista completa de fases y tareas en la terminal
/task-manager add <txt> # Agrega una tarea rápida con prioridad auto-asignada
/task-manager export    # Exporta una copia estática de Task-Manager-Portable.html bajo demanda
```

---

## 🤖 Uso para Agentes de IA (Orquestador y Subagentes)

Cuando trabajás con agentes o flujos de SDD (Spec-Driven Development), Pi dispone de herramientas nativas automáticas:

* **`task_manager_read`**: El agente consulta fases, tareas, métricas y estado de Git sin que tengas que explicárselo en el prompt.
* **`task_manager_update_task`**: El agente actualiza el estado de la tarea (`in_progress`, `completed`, `blocked`), anota detalles técnicos y vincula el commit realizado.
* **`task_manager_sync`**: Reconcilia automáticamente las tareas definidas en archivos markdown (`tasks.md` o OpenSpec) con las ramas de Git.

---

## 🎨 Personalización Visual

* **Adopción Dinámica de Temas**: El modal en terminal adopta automáticamente los colores y tokens de tu tema activo en Pi (como `Cinlodev CUTE`, temas oscuros o claros).
* **Variables de Entorno Opcionales**: Podés anular manualmente los colores del modal configurando:
  * `PI_TASK_MANAGER_BG`: Secuencia ANSI de color de fondo (ej. `\x1b[48;2;20;10;40m`).
  * `PI_TASK_MANAGER_BORDER`: Secuencia ANSI para los bordes dobles (ej. `\x1b[38;2;168;85;247m`).

---

## 🛠️ Desarrollo y Tests

```bash
# Ejecutar suite de pruebas unitarias
pnpm test

# Verificación de tipos con TypeScript
pnpm typecheck

# Compilar plantilla HTML en memoria
pnpm run assemble
```

---

## 👥 Reconocimientos y Créditos

Este proyecto está basado e inspirado en la visión original del plugin y panel de control portable creado por **[Ramón (@RamonsDka)](https://github.com/RamonsDka/opencode-sdd-profile-manager)**.  
A partir de esa base, se rediseñó la arquitectura para desacoplar el estado en `.pi/task-manager.json`, eliminar la contaminación de archivos HTML en repositorios, incorporar el modal flotante TUI con soporte de mouse y sincronizar la telemetría operativa en tiempo real con el runtime de **Pi**.

---

## 📄 Licencia

Distribuido bajo la Licencia **MIT**. Consulta el archivo `LICENSE` para más detalles.
