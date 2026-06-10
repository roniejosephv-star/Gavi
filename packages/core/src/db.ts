import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let dbInstance: Database | null = null;

export async function getDatabase(dbPath?: string): Promise<Database> {
  if (dbInstance) return dbInstance;

  const targetPath = dbPath || path.join(process.cwd(), 'gavi.db');
  
  dbInstance = await open({
    filename: targetPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await dbInstance.run('PRAGMA foreign_keys = ON');

  // Initialize tables
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS sectors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      center_lat REAL NOT NULL,
      center_lng REAL NOT NULL,
      radius_meters REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billboards (
      id TEXT PRIMARY KEY,
      sector_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      height_agl REAL NOT NULL DEFAULT 6.0,
      face_width REAL NOT NULL DEFAULT 15.0,
      face_height REAL NOT NULL DEFAULT 5.0,
      orientation_degrees REAL NOT NULL,
      max_range_meters REAL NOT NULL,
      ad_image_path TEXT,
      last_validated_at TEXT,
      validation_status TEXT DEFAULT 'PENDING',
      observed_bearing REAL,
      observed_confidence REAL,
      FOREIGN KEY (sector_id) REFERENCES sectors(id)
    );

    CREATE TABLE IF NOT EXISTS streetview_cache (
      coordinate_hash TEXT PRIMARY KEY,
      billboard_id TEXT NOT NULL,
      is_visible INTEGER NOT NULL,
      confidence REAL,
      bounding_box TEXT,
      image_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (billboard_id) REFERENCES billboards(id)
    );

    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
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
  `);

  return dbInstance;
}
