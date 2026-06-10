# 🧠 WORKSHOP_INGEST_PROTOCOL.md

## Purpose

This protocol transforms raw workshop sessions, geospatial APIs, and ad-tech documentation into working GAVI prototype outputs.

Learning without execution is considered incomplete. Every session must produce documentation, database models, mathematical formulas, API endpoints, or visual interface modules.

---

## The 10-Stage Ingestion Pipeline

### Stage 1: Knowledge Extraction
* **Goal:** Extract concepts, tools, and APIs from cohort presentations or technical documentation.
* **Output:** `/workshop-notes/session-summary.md`

### Stage 2: Concept Mapping
* **Goal:** Map how new geospatial data or APIs integrate with GAVI's core modules (e.g. snapping roads, coordinate translations, visual decay models).
* **Output:** `/research/concept-map.md`

### Stage 3: Opportunity Discovery
* **Goal:** Core feature mapping. Scores ideas on visual value, mathematical depth, and integration ease.
* **Output:** `/ideas/opportunity-report.md`

### Stage 4: Architecture Discovery
* **Goal:** Spec out the exact component APIs, math logic, and database schemas.
* **Output:** `/architecture/opportunity-architecture.md`

### Stage 5: Repository Generation
* **Goal:** Structure workspace packages, file links, and define implementation milestones.
* **Output:** `/repositories/repo-roadmap.md`

### Stage 6: Task Breakdown
* **Goal:** Convert epics into step-by-step tasks with clear deliverables.
* **Output:** `/implementation/task-plan.md`

### Stage 7: GitHub Issue Generation
* **Goal:** Build execution-ready GitHub issues with detailed acceptance criteria.
* **Output:** `/implementation/github-issues.md`

### Stage 8: Demo Generation
* **Goal:** Map out user scripts, dashboard layout designs, and walk-through scenarios.
* **Output:** `/demos/demo-plan.md`

### Stage 9: Founder Narrative Generation
* **Goal:** Refine the OOH pitch deck outline, detailing why GAVI is superior to old sensor count systems.
* **Output:** `/pitches/founder-narrative.md`

### Stage 10: Workshop Action Plan
* **Goal:** Generate immediate daily and weekly task schedules.
* **Output:** `/daily-logs/action-plan.md`

---

## Session Review Template

For every session logged, record:
1. **Session Metadata:** Date, Topic, Speakers.
2. **Core Summary:** The key takeaway.
3. **Product & Math Opportunities:** Visibility formulas or UI components unlocked.
4. **Immediate Actions:** What is being coded in the monorepo today.

---

## Ingest Priority Rules

Always prioritize:
1. **Interactive Demos:** The console visualizer must look alive and reactive.
2. **Correct Physics:** Angle and distance decays must reflect physical optics.
3. **Clean APIs:** Seamless JSON contracts with the external GPS Inference Agent.
