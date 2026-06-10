import { getDatabase } from './db.js';

export { getDatabase };

export interface Sector {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
}

export interface Billboard {
  id: string;
  sector_id: string;
  lat: number;
  lng: number;
  height_agl: number;          // Elevation (Height Above Ground Level)
  face_width: number;          // Breadth/Width of ad panel
  face_height: number;         // Height/Thickness of ad panel
  orientation_degrees: number; // Normal vector bearing angle
  max_range_meters: number;
  ad_image_path?: string;      // Ad reference design path
  last_validated_at?: string;
  validation_status?: 'PENDING' | 'VERIFIED' | 'MISALIGNED' | 'OCCLUDED' | 'NOT_FOUND';
  observed_confidence?: number;
  observed_bearing?: number;
  streetview_image_path?: string;
  bounding_box?: string;
}

export interface StreetViewCache {
  coordinate_hash: string;
  billboard_id: string;
  is_visible: number; // 0 or 1
  confidence?: number;
  bounding_box?: string; // JSON string [ymin, xmin, ymax, xmax]
  image_path?: string;
  created_at: string;
}

export interface DailyReport {
  id?: number;
  date: string;
  sector_id: string;
  billboard_id: string;
  total_vehicle_trajectories: number;
  total_vehicle_impressions: number;
  total_pedestrian_trajectories: number;
  total_pedestrian_impressions: number;
  average_exposure_duration_sec: number;
}

export async function upsertSector(sector: Sector): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO sectors (id, name, center_lat, center_lng, radius_meters)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       center_lat = excluded.center_lat,
       center_lng = excluded.center_lng,
       radius_meters = excluded.radius_meters`,
    [sector.id, sector.name, sector.center_lat, sector.center_lng, sector.radius_meters]
  );
}

export async function upsertBillboard(bb: Billboard): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO billboards (
      id, sector_id, lat, lng, height_agl, face_width, face_height, 
      orientation_degrees, max_range_meters, ad_image_path, 
      last_validated_at, validation_status, observed_bearing, observed_confidence
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       sector_id = excluded.sector_id,
       lat = excluded.lat,
       lng = excluded.lng,
       height_agl = excluded.height_agl,
       face_width = excluded.face_width,
       face_height = excluded.face_height,
       orientation_degrees = excluded.orientation_degrees,
       max_range_meters = excluded.max_range_meters,
       ad_image_path = excluded.ad_image_path,
       last_validated_at = excluded.last_validated_at,
       validation_status = excluded.validation_status,
       observed_bearing = excluded.observed_bearing,
       observed_confidence = excluded.observed_confidence`,
    [
      bb.id, 
      bb.sector_id, 
      bb.lat, 
      bb.lng, 
      bb.height_agl ?? 6.0, 
      bb.face_width ?? 15.0, 
      bb.face_height ?? 5.0, 
      bb.orientation_degrees, 
      bb.max_range_meters, 
      bb.ad_image_path || null,
      bb.last_validated_at || null,
      bb.validation_status || 'PENDING',
      bb.observed_bearing !== undefined ? bb.observed_bearing : null,
      bb.observed_confidence !== undefined ? bb.observed_confidence : null
    ]
  );
}

export async function getSectors(): Promise<Sector[]> {
  const db = await getDatabase();
  return db.all<Sector[]>('SELECT * FROM sectors');
}

export async function getBillboards(sectorId?: string): Promise<Billboard[]> {
  const db = await getDatabase();
  const query = `
    SELECT b.*, c.image_path AS streetview_image_path, c.bounding_box
    FROM billboards b
    LEFT JOIN (
      SELECT billboard_id, image_path, bounding_box, MAX(created_at)
      FROM streetview_cache
      GROUP BY billboard_id
    ) c ON b.id = c.billboard_id
  `;
  if (sectorId) {
    return db.all<Billboard[]>(`${query} WHERE b.sector_id = ?`, [sectorId]);
  }
  return db.all<Billboard[]>(query);
}

export async function getStreetViewCache(hash: string): Promise<StreetViewCache | null> {
  const db = await getDatabase();
  const result = await db.get<StreetViewCache>('SELECT * FROM streetview_cache WHERE coordinate_hash = ?', [hash]);
  return result || null;
}

export async function writeStreetViewCache(cache: StreetViewCache): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO streetview_cache (coordinate_hash, billboard_id, is_visible, confidence, bounding_box, image_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(coordinate_hash) DO UPDATE SET
       is_visible = excluded.is_visible,
       confidence = excluded.confidence,
       bounding_box = excluded.bounding_box,
       image_path = excluded.image_path,
       created_at = excluded.created_at`,
    [
      cache.coordinate_hash,
      cache.billboard_id,
      cache.is_visible,
      cache.confidence !== undefined ? cache.confidence : null,
      cache.bounding_box || null,
      cache.image_path || null,
      cache.created_at
    ]
  );
}

export async function updateBillboardValidation(
  id: string,
  status: 'VERIFIED' | 'MISALIGNED' | 'OCCLUDED' | 'NOT_FOUND',
  observedBearing: number | null,
  confidence: number | null
): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `UPDATE billboards
     SET last_validated_at = ?,
         validation_status = ?,
         observed_bearing = ?,
         observed_confidence = ?
     WHERE id = ?`,
    [new Date().toISOString(), status, observedBearing, confidence, id]
  );
}

export async function incrementDailyReport(
  date: string,
  sectorId: string,
  billboardId: string,
  stats: { isVehicle: boolean; isExposed: boolean; durationSec: number }
): Promise<void> {
  const db = await getDatabase();
  
  // Insert row if not exists
  await db.run(
    `INSERT OR IGNORE INTO daily_reports 
     (date, sector_id, billboard_id, total_vehicle_trajectories, total_vehicle_impressions, total_pedestrian_trajectories, total_pedestrian_impressions, average_exposure_duration_sec)
     VALUES (?, ?, ?, 0, 0, 0, 0, 0.0)`,
    [date, sectorId, billboardId]
  );

  // Update metrics based on exposure and mode
  if (stats.isVehicle) {
    if (stats.isExposed) {
      await db.run(
        `UPDATE daily_reports 
         SET total_vehicle_trajectories = total_vehicle_trajectories + 1,
             total_vehicle_impressions = total_vehicle_impressions + 1,
             average_exposure_duration_sec = (average_exposure_duration_sec * (total_vehicle_impressions + total_pedestrian_impressions) + ?) / (total_vehicle_impressions + total_pedestrian_impressions + 1)
         WHERE date = ? AND sector_id = ? AND billboard_id = ?`,
        [stats.durationSec, date, sectorId, billboardId]
      );
    } else {
      await db.run(
        `UPDATE daily_reports 
         SET total_vehicle_trajectories = total_vehicle_trajectories + 1
         WHERE date = ? AND sector_id = ? AND billboard_id = ?`,
        [date, sectorId, billboardId]
      );
    }
  } else {
    // Pedestrian
    if (stats.isExposed) {
      await db.run(
        `UPDATE daily_reports 
         SET total_pedestrian_trajectories = total_pedestrian_trajectories + 1,
             total_pedestrian_impressions = total_pedestrian_impressions + 1,
             average_exposure_duration_sec = (average_exposure_duration_sec * (total_vehicle_impressions + total_pedestrian_impressions) + ?) / (total_vehicle_impressions + total_pedestrian_impressions + 1)
         WHERE date = ? AND sector_id = ? AND billboard_id = ?`,
        [stats.durationSec, date, sectorId, billboardId]
      );
    } else {
      await db.run(
        `UPDATE daily_reports 
         SET total_pedestrian_trajectories = total_pedestrian_trajectories + 1
         WHERE date = ? AND sector_id = ? AND billboard_id = ?`,
        [date, sectorId, billboardId]
      );
    }
  }
}

export async function getDailyReports(sectorId?: string): Promise<DailyReport[]> {
  const db = await getDatabase();
  if (sectorId) {
    return db.all<DailyReport[]>('SELECT * FROM daily_reports WHERE sector_id = ? ORDER BY date DESC', [sectorId]);
  }
  return db.all<DailyReport[]>('SELECT * FROM daily_reports ORDER BY date DESC');
}

export async function deleteBillboard(id: string): Promise<void> {
  const db = await getDatabase();
  // Delete related daily reports first to satisfy foreign key constraints
  await db.run('DELETE FROM daily_reports WHERE billboard_id = ?', [id]);
  // Delete related streetview cache
  await db.run('DELETE FROM streetview_cache WHERE billboard_id = ?', [id]);
  // Delete the billboard itself
  await db.run('DELETE FROM billboards WHERE id = ?', [id]);
}
