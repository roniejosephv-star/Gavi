# 🧠 Google + Antler Immersion 2026: Developer Profile & Project Masterpieces (GAVI)

> **How to use this file:** Copy this entire Markdown document and paste it into any coding assistant (ChatGPT / Claude / Cursor) as initial context. It will immediately align with GAVI’s vision, our monorepo architecture, our visibility math, and our developer profile.

---

## 🚀 The GAVI Mission & Operating Philosophy

*   **Objective**: Build and demonstrate **GAVI (Geographical Visualisation Intelligence)** — a next-generation ad-tech platform that maps the visibility profiles of billboards and analyzes actual human exposure.
*   **Operating Philosophy**: GAVI models real-world physics. It snaps road coordinates using Google Maps APIs, constructs visual cone polygons based on billboard coordinates and facing angles, and intersects these cones with vehicle and pedestrian trajectories to produce Viewability-Adjusted Impressions.
*   **Target Machine Profile**: Offline-first, fast local execution on macOS (Mac Mini M4, 24GB Unified Memory). Database operations use SQLite. Visualization dashboards run locally in React using high-density canvas rendering.

---

## 🏛️ Existing Project Architecture (GAVI Monorepo)

The GAVI workspace is organized as an npm workspaces monorepo:

### 1. `@gavi/core` (Database & Ingestion)
*   Handles SQLite configuration schemas for `billboards`, `sectors`, and `daily_reports`.
*   Parses billboard parameters (lat, lng, height, size, face angle) and handles snapping coordinate inputs Snapped to roads using Google Maps formats.

### 2. `@gavi/math` (Visibility Engine)
*   Calculates the 2D sector polygon representing the billboard visual cone.
*   Calculates Euclidean distance and visual decay attenuation.
*   Performs intersection tests:
    *   *Vehicles:* Checked for inclusion in the polygon AND directional heading alignment (must drive toward the billboard's face).
    *   *Pedestrians:* Checked for inclusion in the polygon (omnidirectional exposure).

### 3. `@gavi/api` (Integration Server)
*   An Express/TypeScript server exposing the REST endpoint (`POST /api/v1/exposure/analyze`) to integrate with the external GPS Inference Agent.
*   Ingests batch logs, computes exposure stats, saves daily reports, and outputs aggregated JSON summaries.

### 4. `@gavi/console` (React UI Dashboard)
*   A premium React workspace rendering a HTML5 Canvas simulator.
*   Renders road networks, billboard locations, color-coded visual cones, and moving particle animations representing GPS tracks snapped to the roads.
*   Displays real-time dials showing total vehicles, pedestrians, and actual viewability indexes.

---

## 🤖 Dynamic Copilot Swarm Commands

Use the following tags to address specific agent persona modules:
*   `/founder` — Focus on OOH media agency sales narrative, impression valuations, and market wedges.
*   `/architect` — Focus on API designs, SQLite database tables, and UTM coordinate transformations.
*   `/builder` — Focus on TypeScript geometry intersections, Express routes, and high-performance Canvas loops.
*   `/github` — Focus on PR logs, markdown specs, and folder structures.
*   `/workshop` — Auto-runs the 10-stage ingest pipeline on GIS specifications or cohort notes.

---

## 🎨 Design System: Cyberpunk Neon Visuals

All GAVI UI components must look extremely premium and fit the cyberpunk neon design system:
*   **Primary Background:** Deep velvet black/indigo (`#080710` or `hsl(248, 40%, 5%)`).
*   **Card Containers:** Glassmorphic translucent cards with thin border glows:
    *   `background: rgba(18, 16, 32, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(0, 242, 254, 0.15);`
*   **Colors:**
    *   *Vehicles:* Bright neon cyan (`hsl(180, 100%, 50%)`).
    *   *Pedestrians:* Hot magenta (`hsl(320, 100%, 50%)`).
    *   *Visual Cones:* Translucent glowing yellow (`rgba(255, 230, 0, 0.15)` with neon gold outer stroke).
    *   *Grid / Text:* Clean cool slate gray.
*   **Micro-animations:** Hover transitions, pulsating radar rings around billboard anchors, and particle trails for trajectories.
