import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { 
  getDatabase, 
  upsertSector, 
  upsertBillboard, 
  incrementDailyReport, 
  getDailyReports, 
  getBillboards,
  deleteBillboard 
} from '@gavi/core';
import { analyzeTrajectoryVisibility, snapCoordinatesToRoads, BillboardDimensions } from '@gavi/math';
import { 
  runBillboardVerification, 
  setApiKeys, 
  agentStats, 
  getMapsApiKey, 
  getGeminiApiKey, 
  discoverBillboardsAtLocation,
  lastApiError,
  clearLastApiError
} from './vision.js';

// Load .env variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Expose downloaded Street View cache directory statically
app.use('/storage', express.static(path.join(process.cwd(), 'storage')));

// Serve React Console static files in production if built
let consoleDistPath = path.join(process.cwd(), 'packages', 'console', 'dist');
if (!fs.existsSync(consoleDistPath)) {
  consoleDistPath = path.join(process.cwd(), '..', 'console', 'dist');
}
if (fs.existsSync(consoleDistPath)) {
  app.use(express.static(consoleDistPath));
}

// In-Memory Agent Logs & Statistics
const agentLogs: string[] = [`[${new Date().toTimeString().split(' ')[0]}] [System] GAVI Cloud Node initialized.`];
const agentConfig = {
  liveApiMode: process.env.GOOGLE_MAPS_API_KEY && process.env.GEMINI_API_KEY ? true : false,
  confidenceThreshold: 0.70
};

// Logging helper
function logAgent(msg: string) {
  const time = new Date().toTimeString().split(' ')[0];
  agentLogs.unshift(`[${time}] ${msg}`);
  if (agentLogs.length > 80) {
    agentLogs.pop();
  }
  console.log(`[Agent Engine] ${msg}`);
}

// Seed initial database records
async function seedDatabase() {
  try {
    await getDatabase();
    
    // Seed Manhattan Sector
    const defaultSector = {
      id: 'manhattan_west_side',
      name: 'Manhattan West Side & Times Square',
      center_lat: 40.7580,
      center_lng: -73.9855,
      radius_meters: 1000
    };
    await upsertSector(defaultSector);

    // Seed Bangalore Sector
    const bangaloreSector = {
      id: 'bangalore_marathahalli',
      name: 'Bangalore Marathahalli Bridge',
      center_lat: 12.9569,
      center_lng: 77.7015,
      radius_meters: 500
    };
    await upsertSector(bangaloreSector);

    // Seed default billboards from Bill sub-agent reference
    const billboards = [
      {
        id: 'bb_west_side_highway',
        sector_id: 'manhattan_west_side',
        lat: 40.7582,
        lng: -73.9856,
        height_agl: 8.0,
        face_width: 15.0,
        face_height: 5.0,
        orientation_degrees: 90.0,
        max_range_meters: 150.0,
        ad_image_path: 'storage/streetview/billboard_ref_pepsi.jpg',
        validation_status: 'PENDING' as const
      },
      {
        id: 'bb_broadway',
        sector_id: 'manhattan_west_side',
        lat: 40.7580,
        lng: -73.9850,
        height_agl: 6.5,
        face_width: 10.0,
        face_height: 4.5,
        orientation_degrees: 180.0,
        max_range_meters: 100.0,
        ad_image_path: 'storage/streetview/billboard_ref_tesla.jpg',
        validation_status: 'PENDING' as const
      },
      {
        id: 'bb_marathahalli_bridge',
        sector_id: 'bangalore_marathahalli',
        lat: 12.957088,
        lng: 77.701792,
        height_agl: 8.0,
        face_width: 15.0,
        face_height: 5.0,
        orientation_degrees: 243.5,
        max_range_meters: 120.0,
        ad_image_path: 'storage/streetview/american_eagle_ad_1781018565154.png',
        validation_status: 'PENDING' as const
      },
      {
        id: 'bb_marathahalli_bhima',
        sector_id: 'bangalore_marathahalli',
        lat: 12.957088,
        lng: 77.701792,
        height_agl: 8.0,
        face_width: 15.0,
        face_height: 5.0,
        orientation_degrees: 243.5,
        max_range_meters: 120.0,
        ad_image_path: 'storage/streetview/Billboard 2026-06-09 at 10.52.32 PM.png',
        validation_status: 'PENDING' as const
      }
    ];

    // Seed local reference image placeholders for GAVI to read
    const storageDir = path.join(process.cwd(), 'storage', 'streetview');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    const placeholderBuffer = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
    fs.writeFileSync(path.join(storageDir, 'billboard_ref_pepsi.jpg'), placeholderBuffer);
    fs.writeFileSync(path.join(storageDir, 'billboard_ref_tesla.jpg'), placeholderBuffer);
    // Copy custom reference design screenshot if present in the root workspace folder
    const rootPanoPath = path.join(process.cwd(), '..', '..', 'storage', 'streetview', 'Billboard 2026-06-09 at 10.52.32 PM.png');
    const localPanoPath = path.join(storageDir, 'Billboard 2026-06-09 at 10.52.32 PM.png');
    if (fs.existsSync(rootPanoPath)) {
      try {
        fs.copyFileSync(rootPanoPath, localPanoPath);
      } catch (err: any) {
        console.error('Failed copying custom Varthur Road screenshot:', err.message);
      }
    }

    for (const bb of billboards) {
      await upsertBillboard(bb);
    }
    logAgent('✓ Initial registry database seeded successfully.');
  } catch (err) {
    console.error('Seeding failed:', err);
  }
}

// 1. BILL Sub-Agent Ingestion Endpoint (Registers/Updates Billboard Specs)
app.post('/api/v1/billboards', async (req, res) => {
  const { id, sector_id, lat, lng, height_agl, face_width, face_height, orientation_degrees, max_range_meters, ad_image_base64 } = req.body;

  if (!id || !sector_id || !lat || !lng || !orientation_degrees) {
    return res.status(400).json({ error: 'Missing core specs in request payload.' });
  }

  logAgent(`[Bill Agent Inflow] Received specs update for billboard: [${id}]`);

  // Write base64 image if present
  let adImagePath = undefined;
  if (ad_image_base64) {
    const filename = `ad_${id}_${Date.now()}.jpg`;
    const dest = path.join(process.cwd(), 'storage', 'streetview', filename);
    fs.writeFileSync(dest, Buffer.from(ad_image_base64, 'base64'));
    adImagePath = `storage/streetview/${filename}`;
  }

  try {
    const bb = {
      id,
      sector_id,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      height_agl: parseFloat(height_agl || 6.0),
      face_width: parseFloat(face_width || 15.0),
      face_height: parseFloat(face_height || 5.0),
      orientation_degrees: parseFloat(orientation_degrees),
      max_range_meters: parseFloat(max_range_meters || 120.0),
      ad_image_path: adImagePath,
      validation_status: 'PENDING' as const
    };

    await upsertBillboard(bb);
    logAgent(`✓ [Bill Agent] Billboard [${id}] successfully upserted in registry.`);

    // Trigger visual analysis asynchronously to initialize the cache
    setTimeout(async () => {
      try {
        logAgent(`[Auto-Trigger] Spawning GAVI verification loop for [${id}]...`);
        
        // Calculate a camera offset position (35 meters in front of the billboard)
        // to avoid standing directly underneath it looking straight up.
        const dMeters = 35;
        const rad = (parseFloat(orientation_degrees) * Math.PI) / 180;
        const offsetLat = parseFloat(lat) + (dMeters * Math.cos(rad)) / 111111;
        const offsetLng = parseFloat(lng) + (dMeters * Math.sin(rad)) / (111111 * Math.cos(parseFloat(lat) * Math.PI / 180));
        
        await runBillboardVerification(id, offsetLat, offsetLng, (msg) => logAgent(`[GAVI] ${msg}`));
      } catch (err: any) {
        logAgent(`✗ Auto-trigger verification failed: ${err.message}`);
      }
    }, 500);

    res.json({ message: 'Billboard registered successfully.', billboard_id: id });
  } catch (err: any) {
    logAgent(`✗ Failed registering billboard: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/billboards/:id (Purges billboard record and all associated files/reports)
app.delete('/api/v1/billboards/:id', async (req, res) => {
  const { id } = req.params;
  logAgent(`[API DELETE] Received request to remove billboard: [${id}]`);

  try {
    const db = await getDatabase();
    
    // 1. Fetch billboard properties (specifically ad_image_path)
    const bb = await db.get('SELECT ad_image_path FROM billboards WHERE id = ?', [id]);
    
    // 2. Fetch all street view cache rows to delete files from disk
    const caches = await db.all('SELECT image_path FROM streetview_cache WHERE billboard_id = ?', [id]);

    const safeUnlink = (relativePath: string) => {
      if (!relativePath) return;
      const cleanPath = relativePath.startsWith('/') && !relativePath.startsWith('/Users')
        ? relativePath.substring(1)
        : relativePath;
      const fullPath = path.isAbsolute(cleanPath)
        ? cleanPath
        : path.join(process.cwd(), cleanPath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
          logAgent(`Cleaned up physical asset: ${path.basename(fullPath)}`);
        } catch (err: any) {
          console.error(`Failed to delete file ${fullPath}:`, err.message);
        }
      }
    };

    // Delete ad design reference photo if not a default seeded image
    if (bb && bb.ad_image_path) {
      if (!bb.ad_image_path.includes('billboard_ref_')) {
        safeUnlink(bb.ad_image_path);
      }
    }

    // Delete all associated Street View JPG frames from storage
    caches.forEach(c => {
      if (c.image_path) {
        safeUnlink(c.image_path);
      }
    });

    // 3. Delete from SQLite database (dependent daily_reports & streetview_cache are deleted first inside deleteBillboard)
    await deleteBillboard(id);

    logAgent(`✓ [Bill Agent] Billboard [${id}] and all associated visual data successfully purged.`);
    res.json({ message: 'Billboard removed successfully.', billboard_id: id });
  } catch (err: any) {
    logAgent(`✗ Database deletion failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 1.5. Autonomous Billboard Discovery Endpoint
app.post('/api/v1/billboards/discover', async (req, res) => {
  const { lat, lng } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Missing coordinates (lat, lng).' });
  }

  logAgent(`[Discovery Request] Scanning intersections around coordinates: ${lat}, ${lng}...`);

  try {
    const list = await discoverBillboardsAtLocation(
      parseFloat(lat), 
      parseFloat(lng), 
      (msg) => logAgent(`[GAVI] ${msg}`)
    );
    res.json({ message: `Scanned area. Discovered ${list.length} billboards.`, list });
  } catch (err: any) {
    logAgent(`✗ Discovery failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 2. WIZ Sub-Agent Ingestion Endpoint (Ingests trajectories & checks visibility)
app.post('/api/v1/exposure/analyze', async (req, res) => {
  const { sector_id, timestamp, trajectories } = req.body;

  if (!sector_id || !trajectories || !Array.isArray(trajectories)) {
    return res.status(400).json({ error: 'Missing sector_id or trajectories array.' });
  }

  logAgent(`[Wiz Agent Inflow] Ingested ${trajectories.length} trajectories. Processing...`);
  agentStats.trajectoriesProcessed += trajectories.length;

  try {
    const activeBillboards = await getBillboards(sector_id);
    const dateStr = timestamp ? timestamp.split('T')[0] : new Date().toISOString().split('T')[0];

    const results = [];
    let vehicleImpressions = 0;
    let pedestrianImpressions = 0;

    for (const traj of trajectories) {
      const mode = traj.mode || 'vehicle';
      let wasExposed = false;
      let maxVisibilityScore = 0;
      let matchedBillboardId = '';
      let exposureDuration = 0;

      // Snap coordinates using Google Roads API first
      logAgent(`Snapping trajectory [${traj.id}] coordinates to Google Roads graph...`);
      agentStats.roadsApiCalls++;
      const snappedPoints = await snapCoordinatesToRoads(traj.points, process.env.GOOGLE_MAPS_API_KEY || getMapsApiKey() || '');
      
      const mappedPoints = snappedPoints.map((pt: { lat: number; lng: number }, idx: number) => ({
        lat: pt.lat,
        lng: pt.lng,
        timestamp: traj.points[idx]?.timestamp || new Date().toISOString(),
        speed: traj.points[idx]?.speed || 10,
        heading: traj.points[idx]?.heading
      }));

      // Evaluate visibility polygon geometry first (Pre-filtering)
      for (const bb of activeBillboards) {
        const bbDim = {
          id: bb.id,
          lat: bb.lat,
          lng: bb.lng,
          height_agl: bb.height_agl,
          orientation_degrees: bb.observed_bearing ?? bb.orientation_degrees, // Use corrected orientation
          max_range_meters: bb.max_range_meters
        };

        const geomAnalysis = analyzeTrajectoryVisibility(mappedPoints, mode, bbDim);

        if (geomAnalysis.exposed) {
          // Geometry matched! Run the pixel-level vision check
          logAgent(`In-Cone geometry match. Executing Street View + Gemini VLM for [${bb.id}]...`);
          
          // Use the first point in the trajectory that is within visual range
          const firstExposedPoint = mappedPoints[0]; 
          
          try {
            const verification = await runBillboardVerification(
              bb.id, 
              firstExposedPoint.lat, 
              firstExposedPoint.lng,
              (msg) => logAgent(`[GAVI] ${msg}`)
            );

            if (verification.visible && verification.confidence >= agentConfig.confidenceThreshold) {
              wasExposed = true;
              const combinedScore = geomAnalysis.maxScore * verification.confidence;
              if (combinedScore > maxVisibilityScore) {
                maxVisibilityScore = combinedScore;
                matchedBillboardId = bb.id;
                exposureDuration = geomAnalysis.durationSec;
              }
            }
          } catch (vErr: any) {
            logAgent(`✗ Vision validation failed: ${vErr.message}. Bypassing.`);
          }
        }
      }

      // Record daily reports in database
      for (const bb of activeBillboards) {
        const isMatched = bb.id === matchedBillboardId;
        await incrementDailyReport(dateStr, sector_id, bb.id, {
          isVehicle: mode === 'vehicle',
          isExposed: isMatched,
          durationSec: isMatched ? exposureDuration : 0
        });
      }

      if (wasExposed) {
        if (mode === 'vehicle') vehicleImpressions++;
        else pedestrianImpressions++;

        results.push({
          trajectory_id: traj.id,
          mode,
          exposed: true,
          matched_billboard_id: matchedBillboardId,
          exposure_duration_sec: exposureDuration,
          visibility_score: parseFloat(maxVisibilityScore.toFixed(2))
        });
      } else {
        results.push({
          trajectory_id: traj.id,
          mode,
          exposed: false,
          reason: 'outside_visual_cone_or_occluded'
        });
      }
    }

    res.json({
      sector_id,
      processed_at: new Date().toISOString(),
      summary: {
        total_trajectories: trajectories.length,
        total_impressions: vehicleImpressions + pedestrianImpressions,
        vehicle_impressions: vehicleImpressions,
        pedestrian_impressions: pedestrianImpressions
      },
      results
    });
  } catch (err: any) {
    logAgent(`✗ Exposure analysis failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 3. GAVI Agent Status & Thought Logger Stream
app.get('/api/v1/agent/status', (req, res) => {
  const mask = (key: string) => key ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}` : 'NOT_CONFIGURED';
  const api_error = lastApiError;
  clearLastApiError();

  res.json({
    agent_id: 'gavi_spatial_node_01',
    status: 'ONLINE',
    config: {
      ...agentConfig,
      mapsKeyMasked: mask(getMapsApiKey()),
      geminiKeyMasked: mask(getGeminiApiKey())
    },
    stats: agentStats,
    logs: agentLogs,
    api_error
  });
});

// 4. GAVI Config Endpoint
app.post('/api/v1/agent/config', (req, res) => {
  const { liveApiMode, confidenceThreshold, mapsKey, geminiKey } = req.body;
  if (mapsKey !== undefined && geminiKey !== undefined) {
    let finalMapsKey = mapsKey;
    let finalGeminiKey = geminiKey;

    // Auto-detect swapped keys (Maps keys always start with AIzaSy, Gemini keys can start with gen-la or AQ)
    if (mapsKey && geminiKey) {
      const mapsIsGeminiFormat = mapsKey.startsWith('gen-la') || mapsKey.startsWith('AQ') || mapsKey.includes('studio');
      const geminiIsMapsFormat = geminiKey.startsWith('AIzaSy') && !geminiKey.includes('studio');

      if (mapsIsGeminiFormat && geminiIsMapsFormat) {
        logAgent(`[Self-Correction] ⚠ Detected swapped API keys (Gemini key entered in Maps field, and vice versa). Automatically swapping roles...`);
        finalMapsKey = geminiKey;
        finalGeminiKey = mapsKey;
      }
    }

    setApiKeys(finalMapsKey, finalGeminiKey);
    agentConfig.liveApiMode = !!(finalMapsKey && finalGeminiKey);
    logAgent(`API Credentials updated dynamically via Console.`);
  } else if (liveApiMode !== undefined) {
    agentConfig.liveApiMode = !!liveApiMode;
  }
  if (confidenceThreshold !== undefined) agentConfig.confidenceThreshold = parseFloat(confidenceThreshold);
  logAgent(`Agent configurations updated: Live Mode = ${agentConfig.liveApiMode}, Threshold = ${agentConfig.confidenceThreshold}`);
  res.json({ message: 'Configuration updated successfully.', config: agentConfig });
});

// 4.5. GAVI System Reset Endpoint (Wipes database, cache, and config)
app.post('/api/v1/agent/reset', async (req, res) => {
  logAgent(`[Reset System] Wiping SQLite database, cache, and resetting active API keys...`);
  
  try {
    const db = await getDatabase();
    
    // Disable foreign keys temporarily to avoid deletion order conflicts
    await db.run('PRAGMA foreign_keys = OFF');
    await db.run('DELETE FROM streetview_cache');
    await db.run('DELETE FROM daily_reports');
    await db.run('DELETE FROM billboards');
    await db.run('DELETE FROM sectors');
    await db.run('PRAGMA foreign_keys = ON');

    // Re-seed the initial sectors and default billboards
    await seedDatabase();

    // Clear Street View cached images on disk
    const storageDir = path.join(process.cwd(), 'storage', 'streetview');
    if (fs.existsSync(storageDir)) {
      const files = fs.readdirSync(storageDir);
      for (const file of files) {
        // Keep the default seeded placeholder ad images
        if (file !== 'billboard_ref_pepsi.jpg' && file !== 'billboard_ref_tesla.jpg') {
          try {
            fs.unlinkSync(path.join(storageDir, file));
          } catch (_) {}
        }
      }
    }

    // Reset API keys in memory
    setApiKeys('', '');
    clearLastApiError();
    agentConfig.liveApiMode = false;
    
    logAgent(`✓ System reset successfully completed.`);
    res.json({ message: 'System reset completed successfully.' });
  } catch (err: any) {
    logAgent(`✗ System reset failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 5. Query active billboards
app.get('/api/v1/billboards', async (req, res) => {
  try {
    const list = await getBillboards();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Query daily reports
app.get('/api/v1/reports/daily', async (req, res) => {
  const { sector_id } = req.query;
  try {
    const reports = await getDailyReports(sector_id as string | undefined);
    res.json(reports);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Wildcard fallback for React routing (single page app)
if (fs.existsSync(consoleDistPath)) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/storage')) {
      return next();
    }
    res.sendFile(path.join(consoleDistPath, 'index.html'));
  });
}

// Start API Server
app.listen(PORT, async () => {
  console.log(`===============================================`);
  console.log(`🚀 GAVI Ingestion Server listening on port ${PORT}`);
  console.log(`===============================================`);
  await seedDatabase();
});
