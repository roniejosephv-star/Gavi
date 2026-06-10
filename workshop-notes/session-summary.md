# 📓 Ingress Summary — GAVI Core Design Session

## Topic: Geographical Visualisation Intelligence (GAVI)
**Date:** 2026-06-04
**Focus:** Modeling billboard visual fields and integrating GPS telemetry reports.

---

## Key Concepts Extracted

### 1. Viewability-Adjusted Impressions (VAI)
- Standard traffic counts count total vehicles passing a road.
- GAVI filters traffic count data based on line-of-sight, angle of incidence, and travel direction to only count drivers/passengers with actual visibility.

### 2. Snap-to-Roads Ingestion
- Raw GPS data is noisy and prone to drift.
- Using Google Maps API snapped coordinates, raw points snap onto valid road lanes, providing smooth direction vectors.

### 3. Vehicular Direction Constraint
- Vehicles travel in a fixed direction.
- A vehicle traveling south cannot see a north-facing billboard face. GAVI models this with a vector dot product threshold ($\le 0$ between vehicle heading and billboard view direction).

### 4. Pedestrian Omnidirectional Exposure
- Pedestrians walk slowly, turn, and stop.
- They are modeled with omnidirectional sight lines: any entry into the visibility cone counts as exposure.
