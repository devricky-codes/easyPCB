```
 _____                ____   ____ ____  
| ____|__ _ ___ _   _|  _ \ / ___| __ ) 
|  _| / _` / __| | | | |_) | |   |  _ \ 
| |__| (_| \__ \ |_| |  __/| |___| |_) |
|_____\__,_|___/\__, |_|    \____|____/ 
                |___/                   
```

# EasyPCB

> **Bare PCBs. No fuss. Just holes, traces, and copper.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

EasyPCB is a **browser-based PCB layout tool** built around a single philosophy: *if your board only needs holes and traces, you shouldn't need a 200 MB EDA suite to design it.* Draw a board outline, drop some holes, connect them with traces, and export files your fab house accepts — all without installing anything.

---

## ✦ Three steps to a real PCB

```
  1. Draw outline          2. Place holes          3. Connect & export
  ┌────────────┐           ┌────────────┐           ┌────────────┐
  │  B  click  │    →      │  H  click  │    →      │  T  click  │
  │  vertices  │           │  anywhere  │           │  + Gerber  │
  └────────────┘           └────────────┘           └────────────┘
     any polygon            PTH pads, any size        straight or
     any shape              named & labelled           auto-routed
```

That's the entire workflow. No net-lists. No footprint libraries. No DRC rule wizards. Just geometry.

---

## Features

### ✦ Board Design
- **Any-polygon outline** — click vertices to build a board of any shape; close with Enter or click the first point
- **Plated through-holes** — place anywhere, set diameter in the sidebar, name them for assembly
- **Traces** — polylines with configurable width; snap to hole centres or T-junction onto an existing trace mid-wire
- **Chain tool** — lay a row of evenly-spaced pads in one gesture; right-click to commit

### ✦ Intelligent Wiring
- **Un-entangle** — select a trace → click **un-entangle** in the sidebar; the Theta\* any-angle router finds a clean path around every obstacle automatically
- **Gap control** — a live number input lets you specify how much clearance the router must maintain between the re-routed trace and everything else (pads, other traces)
- Right-click on a selected trace on the canvas triggers the same router instantly

### ✦ Constraint Solver
Powered by **FreeCAD's battle-tested planegcs engine** (compiled to WebAssembly — no server, no install):

| Constraint | Effect |
|---|---|
| `distance` | Lock hole-to-hole spacing to an exact mm value |
| `horizontal` / `vertical` | Force a trace segment to be perfectly level |
| `angle` | Set the degrees between two traces |
| `perpendicular` | Make two traces meet at exactly 90° |
| `equal` | Uniform pad pitch across a row |
| `fixed` | Pin a hole to an absolute coordinate |
| `coincident` | Snap a trace endpoint to a hole center |

Name a measurement once as a **parameter** (e.g. `pitch = 2.54`) and reference it in multiple constraints — change one value, the whole board updates.

### ✦ Labels & Annotations
- Drag a label chip off any hole or trace — it follows with a dashed leader line
- Edit the text in the sidebar; reset position with one click
- Construction / guide lines for visual alignment — never exported to Gerber

### ✦ Canvas
- **Cursor-anchored zoom** — the point under the cursor stays fixed while you scroll
- **Snap grid** — configurable step (0.1 / 0.25 / 0.5 / 1 / 2.54 / 5 / 10 mm)
- **64-step undo / redo** (Ctrl+Z / Ctrl+Y)
- Live cursor readout in mm + current zoom level
- Middle-drag or right-drag to pan

### ✦ Gerber Export
One click in the toolbar produces a **zip** containing:
- `board.gtl` — top copper (RS-274X)
- `board.gko` — board outline
- `board.drl` — Excellon drill file (all PTH holes)

Upload the zip directly to **JLCPCB**, **PCBWay**, **OSH Park**, or any fab house that accepts standard Gerber.

---

## Getting Started

```bash
git clone https://github.com/yourname/easypcb
cd easypcb
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — there is nothing else to install.

```bash
npm run build      # production bundle
npm run typecheck  # tsc --noEmit
```

---

## Keyboard Reference

| Key | Action |
|---|---|
| `V` | Select tool |
| `B` | Board outline tool |
| `H` | Hole tool |
| `T` | Trace tool |
| `C` | Chain pad tool |
| `M` | Measure tool |
| `Enter` | Finish draft (board / trace) |
| `Esc` | Cancel draft |
| `Delete` / `Backspace` | Delete selected entity |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |

---

## Tech Stack

| Layer | Library | Why |
|---|---|---|
| UI | React 18 + TypeScript 5.6 | Component model, strict types |
| Canvas | Konva 9 + react-konva | 2D canvas with first-class interaction |
| State | Zustand 5 | Flat, selector-based, no boilerplate |
| Constraint solver | @salusoft89/planegcs (WASM) | FreeCAD's solver — no custom math |
| Router | Theta\* (custom, any-angle A\*) | Smooth paths, no 45° staircase artefacts |
| Build | Vite 5 | Fast HMR, clean WASM asset handling |
| Styling | Tailwind 3.4 | Dark CAD-style UI with zero CSS files |
| Gerber | Custom RS-274X writer | Vendor-compatible zip in one click |

---

## Scope (by design)

EasyPCB is intentionally minimal. It covers the tools needed for **bare boards** — PCBs that carry through-hole components without a schematic:

- Custom breakout boards
- Adapter boards for non-standard connectors
- Test jigs and probe fixtures
- Prototype power distribution boards

It does **not** aim to be KiCad. No schematic capture, no component library, no BOM, no simulation.

---

## License

MIT
