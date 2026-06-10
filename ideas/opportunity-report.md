# 💡 Opportunity Report — GAVI Core Features

This report evaluates and scores the core features of the **GAVI (Geographical Visualisation Intelligence)** MVP.

---

## Opportunity Evaluation Matrix

Each opportunity is scored from 1 (lowest) to 10 (highest) based on our evaluation framework:

| Feature Opportunity | Visual Demo | Technical Depth | Integration Ease | Venture Scale | Total Score |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1. Visual Cone Raycaster ($V_{poly}$)** | 10 | 8 | 9 | 8 | **35/40** |
| **2. Lane Snapping & Direction Constraints** | 8 | 9 | 8 | 9 | **34/40** |
| **3. Pedestrian Ambient Exposure Zone** | 9 | 7 | 9 | 7 | **32/40** |

---

## Feature Deep Dive

### 1. Visual Cone Raycaster ($V_{poly}$)
* **Description:** Generates a 2D visibility cone polygon projecting outwards from the billboard coordinates based on its physical width, height, and orientation.
* **Why it wins:** Creates an immediate visual artifact on the dashboard, making it obvious which regions are exposed.
* **Technical Depth:** Involves coordinate conversion, trigonometric boundaries, and distance limits.

### 2. Lane Snapping & Direction Constraints
* **Description:** snap trajectories using Google Maps Roads API and filters out vehicles driving away from the billboard face.
* **Why it wins:** Addresses the fatal flaw of traditional traffic counts (which count vehicles in both directions equally).
* **Technical Depth:** Snapping coordinates and calculating dot products between vehicle headings and billboard normals.

### 3. Pedestrian Ambient Exposure Zone
* **Description:** Identifies crosswalks and sidewalks intersecting the visibility cone and registers impressions for pedestrians without directional constraints.
* **Why it wins:** Unlocks street-level pedestrian ad metrics.
* **Technical Depth:** Distinct handling of transit modes (speed threshold filtering).
