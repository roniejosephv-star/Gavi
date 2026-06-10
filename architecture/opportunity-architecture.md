# 🏛️ Opportunity Architecture — GAVI Core Engine

This document details the system design, API contracts, database schema, and mathematical definitions for the **GAVI MVP**.

---

## 1. System Schema (SQLite)

GAVI uses SQLite to store configurations and persist aggregated daily reports.

```sql
-- Sector Configuration Table
CREATE TABLE IF NOT EXISTS sectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  radius_meters REAL NOT NULL
);

-- Billboard Registry Table
CREATE TABLE IF NOT EXISTS billboards (
  id TEXT PRIMARY KEY,
  sector_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  height_meters REAL NOT NULL,
  width_meters REAL NOT NULL,
  orientation_degrees REAL NOT NULL, -- Facing angle (0 = North, 90 = East, etc.)
  max_range_meters REAL NOT NULL,
  FOREIGN KEY (sector_id) REFERENCES sectors(id)
);

-- Daily Aggregated Exposure Reports Table
CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, -- YYYY-MM-DD
  sector_id TEXT NOT NULL,
  billboard_id TEXT NOT NULL,
  total_vehicle_trajectories INTEGER DEFAULT 0,
  total_vehicle_impressions INTEGER DEFAULT 0,
  total_pedestrian_trajectories INTEGER DEFAULT 0,
  total_pedestrian_impressions INTEGER DEFAULT 0,
  average_exposure_duration_sec REAL DEFAULT 0.0,
  UNIQUE(date, sector_id, billboard_id),
  FOREIGN KEY (sector_id) REFERENCES sectors(id),
  FOREIGN KEY (billboard_id) REFERENCES billboards(id)
);
```

---

## 2. Spatial Mathematics (The Visibility Math)

To compute visibility, we perform coordinates projection from WGS84 $(lat, lng)$ to local Cartesian coordinates $(x, y)$ in meters (using a simplified flat-earth local Mercator projection or UTM Snapping):

Let:
- Billboard location $P_{bb} = (x_{bb}, y_{bb})$
- Billboard facing heading $\theta_{bb}$ (normal vector $\vec{N}_{bb} = (\sin\theta_{bb}, \cos\theta_{bb})$)
- User coordinate $P_{user} = (x_{user}, y_{user})$
- Distance $d = \|P_{user} - P_{bb}\|$
- View vector from billboard to user: $\vec{V} = \frac{P_{user} - P_{bb}}{\|P_{user} - P_{bb}\|}$

### 1. In-Cone Test
The user is inside the $120^\circ$ visibility cone if:
- Distance $d \le R_{max}$
- The dot product of the billboard normal $\vec{N}_{bb}$ and the vector pointing towards the user $\vec{V}$ is greater than $\cos(60^\circ) = 0.5$:
  $$\vec{N}_{bb} \cdot \vec{V} \ge 0.5$$

### 2. Vehicle Direction Test
For a vehicle at $P_{user}$ traveling with heading direction vector $\vec{H}_{veh} = (\sin\theta_{veh}, \cos\theta_{veh})$:
The vehicle is facing the billboard face if it is driving *towards* the front of the billboard. That is, the dot product between the vehicle's heading vector $\vec{H}_{veh}$ and the vector from the user to the billboard ($-\vec{V}$) is positive (meaning they are driving towards it):
$$\vec{H}_{veh} \cdot (-\vec{V}) \ge 0.0 \implies \vec{H}_{veh} \cdot \vec{V} \le 0.0$$

---

## 3. Integration Endpoints (Express REST API)

### Ingestion Interface (`POST /api/v1/exposure/analyze`)
* Ingests JSON arrays containing batch trajectory paths.
* Processes point logs: snap to road edges, computes visibility checks, updates the SQLite database.
* Returns detailed analytics of which trajectories registered impressions.

### Database Query Interface (`GET /api/v1/reports/daily`)
* Returns aggregated viewability reports by sector and billboard over time.
