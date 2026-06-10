# 📓 GAVI: Workshop Action Plan
## Stage 10 Action Plan — Google & Antler Immersion 2026

This document compiles the immediate, weekly, and long-term action plans for building **GAVI (Geographical Visualisation Intelligence)**.

---

## ⚡ 1. Immediate Actions (Today)
1. **Initialize Monorepo Structure:** 
   - Create directories: `packages/core`, `packages/math`, `packages/api`, and `packages/console`.
   - Initialize root `package.json` for npm workspaces.
2. **Verify Local Development Environment:**
   - Ensure Node.js and npm are configured properly.

---

## 🗓️ 2. Weekly Development Sprint (Milestone 1)

This sprint targets **Milestone 1: Ingestion API, Core Math Engine, and SQLite Database**:

* **Days 1–2: Monorepo & Core Database Setup (`@gavi/core`)**
  - Scaffold workspaces, write `tsconfig.json` scripts, and initialize root packages.
  - Setup SQLite connection and write code schema migrations to bootstrap tables.
* **Days 3–4: In-Cone & Trajectory Intersection Math (`@gavi/math`)**
  - Implement geometry utilities (dot product computations, UTM Snapping, angle decays).
  - Code vehicle heading filter and pedestrian omnidirectional intersection checks.
* **Days 5–6: Integration REST API (`@gavi/api`)**
  - Build Express server and code the `/api/v1/exposure/analyze` ingest routing.
  - Verify SQLite updates based on incoming trajectory payloads.
* **Day 7: Unit Testing & Verification**
  - Write Jest test suites for geometry and API routing.

---

## 🗓️ 3. Milestone 2: Cyberpunk Simulation Console (`@gavi/console`)
* Build the React visualizer canvas displaying the billboard, visibility cone (glowing yellow), vehicle snapping paths, and real-time dials.
* Integrate mock GPS telemetry generator representing vehicle/pedestrian flows.
