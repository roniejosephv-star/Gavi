# 🗣️ Founder Narrative & Venture Thesis — GAVI

This document outlines the strategic startup thesis and founder narrative for **GAVI (Geographical Visualisation Intelligence)**.

---

## 1. Why Now?

Out-of-Home (OOH) advertising is a $40B global market, yet it remains one of the last offline media channels relying on antiquated impression estimations. 
- Traditional metrics (e.g. Daily Effective Circulation or DEC) are calculated using primitive road sensors that simply count all passing vehicles, ignoring travel direction, lane coordinates, distance, angle of incidence, and speed.
- With the rise of high-resolution location networks and connected vehicles, precise spatial analytics are now possible. GAVI captures this inflection point, introducing **Viewability-Adjusted Impressions (VAI)** to bridge the gap between digital-level analytics and physical billboard placements.

---

## 2. Why Us?

We combine:
- Deep expertise in agent systems, spatial graph mathematics, and local-first databases.
- A Google-supported cohort position, leveraging high-fidelity Google Maps Roads and snap APIs to deliver lane-level accuracy.
- A highly aesthetic visual platform (GAVI Dashboard) that lets ad buyers visually trace their exposure metrics in real-time.

---

## 3. Product Solution & Wedge

GAVI solves the viewability gap. 
- We integrate with billboard operators to ingest precise 3D placement parameters (coordinates, facing angle, size, height).
- We ingest anonymous telemetry paths from third-party GPS providers.
- GAVI snaps these trajectories to roads, constructs 3D-aware visual cones, and calculates the exact duration and angle of view for passing drivers and pedestrians.
- **The Wedge:** Auditing existing billboard listings. By proving that 40% of standard traffic counts have no view of the billboard face (e.g., due to direction limits or building occlusions), GAVI helps operators reposition billboards and ad agencies optimize pricing.

---

## 4. The Defensibility Moat

1. **The Registry:** A proprietary database of verified 3D physical coordinates, orientations, and occlusion vectors for global billboards.
2. **Data Network Effects:** As more GPS aggregators stream logs to GAVI's analysis node, GAVI's historical baseline calibration curves become the industry gold standard for auditing OOH media value.
