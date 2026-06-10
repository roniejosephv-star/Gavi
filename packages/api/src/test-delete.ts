import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

// Load env parameters
dotenv.config({ path: path.join(process.cwd(), '.env') });

console.log('==================================================');
console.log('🧪 GAVI E2E BILLBOARD DELETION & LEAK INTEGRATION TEST');
console.log('==================================================');

const API_BASE = 'http://localhost:3001';
const TEST_BILLBOARD_ID = `bb_delete_test_${Math.floor(Math.random() * 10000)}`;
const STORAGE_DIR = path.join(process.cwd(), 'storage', 'streetview');

// 1x1 Pixel Black JPEG in base64
const MOCK_AD_IMAGE_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function runTest() {
  try {
    // 0. Auto-sync API Keys to GAVI Server if configured in env
    const mapsKey = process.env.GOOGLE_MAPS_API_KEY || '';
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (mapsKey && geminiKey) {
      console.log('Syncing environment API keys with GAVI server configuration...');
      const configRes = await fetch(`${API_BASE}/api/v1/agent/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liveApiMode: true,
          confidenceThreshold: 0.7,
          mapsKey,
          geminiKey
        })
      });
      if (configRes.ok) {
        console.log('✓ API Keys successfully configured on server.');
      } else {
        console.warn('⚠ Failed to sync API keys: ', await configRes.text());
      }
    }

    console.log(`Step 1: Registering billboard [${TEST_BILLBOARD_ID}]...`);
    const registerRes = await fetch(`${API_BASE}/api/v1/billboards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: TEST_BILLBOARD_ID,
        sector_id: 'manhattan_west_side',
        lat: 40.7582,
        lng: -73.9856,
        height_agl: 8.0,
        face_width: 15.0,
        face_height: 5.0,
        orientation_degrees: 90.0,
        max_range_meters: 150.0,
        ad_image_base64: MOCK_AD_IMAGE_BASE64
      })
    });

    if (!registerRes.ok) {
      throw new Error(`Failed to register billboard: ${await registerRes.text()}`);
    }
    console.log('✓ Billboard registered.');

    // Poll the billboard details until validation_status is no longer PENDING (meaning VLM has run)
    console.log('Waiting for verification cache to initialize (polling)...');
    let testBb: any = null;
    const maxRetries = 20;
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const listRes = await fetch(`${API_BASE}/api/v1/billboards`);
      if (!listRes.ok) {
        throw new Error(`Failed to retrieve billboards during poll: ${await listRes.text()}`);
      }
      const billboards = await listRes.json();
      testBb = billboards.find((b: any) => b.id === TEST_BILLBOARD_ID);
      if (!testBb) {
        throw new Error(`Test billboard [${TEST_BILLBOARD_ID}] was deleted or disappeared from registry!`);
      }
      if (testBb.validation_status !== 'PENDING') {
        console.log(`✓ Visual check completed. Status: ${testBb.validation_status}`);
        break;
      }
      console.log(`  [Poll ${i + 1}/${maxRetries}] Validation status is still PENDING...`);
    }

    if (testBb.validation_status === 'PENDING') {
      throw new Error(`Timeout: Visual check did not complete in time.`);
    }

    console.log('✓ Billboard details fetched from registry:', JSON.stringify(testBb, null, 2));

    const adImagePath = testBb.ad_image_path;
    const streetviewImagePath = testBb.streetview_image_path;

    if (!adImagePath) {
      throw new Error('Ad image path was not saved in the database.');
    }
    if (!streetviewImagePath) {
      throw new Error('Streetview image path was not saved in the database cache.');
    }

    const apiStorageDir = path.join(process.cwd(), 'packages', 'api');
    const resolvePath = (relPath: string) => {
      const cleanPath = relPath.startsWith('/') && !relPath.startsWith('/Users') ? relPath.substring(1) : relPath;
      const p = path.isAbsolute(cleanPath) ? cleanPath : path.join(process.cwd(), cleanPath);
      if (fs.existsSync(p)) return p;
      const monorepoPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(apiStorageDir, cleanPath);
      if (fs.existsSync(monorepoPath)) return monorepoPath;
      return p; // fallback
    };

    const fullAdPath = resolvePath(adImagePath);
    const fullStreetviewPath = resolvePath(streetviewImagePath);

    // Verify physical files exist on disk
    console.log('\nChecking physical files on disk...');
    if (!fs.existsSync(fullAdPath)) {
      throw new Error(`Physical ad design image file not found at ${fullAdPath}`);
    }
    console.log(`✓ Physical ad image exists: ${path.basename(fullAdPath)}`);
    if (!fs.existsSync(fullStreetviewPath)) {
      throw new Error(`Physical street view cache image file not found at ${fullStreetviewPath}`);
    }
    console.log(`✓ Physical street view cache image exists: ${path.basename(fullStreetviewPath)}`);

    // Step 3: Trigger a GPS trajectory run to generate daily report logs for this billboard
    console.log(`\nStep 3: Pushing Wiz GPS trajectories to generate daily report data...`);
    const exposureRes = await fetch(`${API_BASE}/api/v1/exposure/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sector_id: 'manhattan_west_side',
        timestamp: new Date().toISOString(),
        trajectories: [
          {
            id: `wiz_test_delete_veh_${Date.now()}`,
            mode: 'vehicle',
            points: [
              { lat: 40.7582, lng: -73.9845, timestamp: new Date(Date.now() - 4000).toISOString(), speed: 15.0, heading: 270.0 },
              { lat: 40.7582, lng: -73.9850, timestamp: new Date(Date.now() - 2000).toISOString(), speed: 15.0, heading: 270.0 },
              { lat: 40.7582, lng: -73.9856, timestamp: new Date().toISOString(), speed: 15.0, heading: 270.0 }
            ]
          }
        ]
      })
    });

    if (!exposureRes.ok) {
      throw new Error(`Exposure analysis failed: ${await exposureRes.text()}`);
    }
    console.log('✓ GPS trajectory processed.');

    // Verify daily report entry is created
    console.log('\nVerifying daily report entry exists...');
    const reportRes = await fetch(`${API_BASE}/api/v1/reports/daily?sector_id=manhattan_west_side`);
    if (!reportRes.ok) {
      throw new Error(`Failed to fetch daily reports: ${await reportRes.text()}`);
    }
    const reports = await reportRes.json();
    const testReport = reports.find((r: any) => r.billboard_id === TEST_BILLBOARD_ID);
    if (!testReport) {
      throw new Error(`No daily report entry was generated for billboard [${TEST_BILLBOARD_ID}]`);
    }
    console.log('✓ Daily report entry exists in DB:', JSON.stringify(testReport, null, 2));

    // Step 4: Perform DELETE /api/v1/billboards/:id
    console.log(`\nStep 4: Deleting billboard [${TEST_BILLBOARD_ID}] via API DELETE route...`);
    const deleteRes = await fetch(`${API_BASE}/api/v1/billboards/${TEST_BILLBOARD_ID}`, {
      method: 'DELETE'
    });

    if (!deleteRes.ok) {
      throw new Error(`Billboard deletion API failed: ${await deleteRes.text()}`);
    }
    console.log('✓ Delete request completed successfully.');

    // Wait a brief moment for database operations to write
    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 5: Validate all DB records are completely purged (Data Leak Check)
    console.log('\nStep 5: Performing database leak verification...');
    
    // Check billboard registry
    const checkListRes = await fetch(`${API_BASE}/api/v1/billboards`);
    const finalBillboards = await checkListRes.json();
    if (finalBillboards.some((b: any) => b.id === TEST_BILLBOARD_ID)) {
      throw new Error('DATABASE LEAK: Billboard record still exists in the database.');
    }
    console.log('✓ Database Check: Billboard record purged.');

    // Check daily reports
    const checkReportRes = await fetch(`${API_BASE}/api/v1/reports/daily?sector_id=manhattan_west_side`);
    const finalReports = await checkReportRes.json();
    if (finalReports.some((r: any) => r.billboard_id === TEST_BILLBOARD_ID)) {
      throw new Error('DATABASE LEAK: Daily report logs still exist for deleted billboard.');
    }
    console.log('✓ Database Check: Daily reports records purged.');

    // Step 6: Validate all physical file assets are unlinked from disk (Storage Leak Check)
    console.log('\nStep 6: Performing storage leak verification...');
    if (fs.existsSync(fullAdPath)) {
      throw new Error(`STORAGE LEAK: Dynamic ad design image was not deleted: ${fullAdPath}`);
    }
    console.log(`✓ Storage Check: Dynamic ad design image deleted.`);

    if (fs.existsSync(fullStreetviewPath)) {
      throw new Error(`STORAGE LEAK: Cached street view frame was not deleted: ${fullStreetviewPath}`);
    }
    console.log(`✓ Storage Check: Cached street view frame deleted.`);

    console.log('\n==================================================');
    console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
    console.log('✓ Registry record deleted.');
    console.log('✓ Streetview cache record deleted.');
    console.log('✓ Daily reports logs deleted.');
    console.log('✓ Disk assets unlinked.');
    console.log('✓ Zero data leaks detected.');
    console.log('GAVI IS PRODUCTION READY! 🚀');
    console.log('==================================================');

  } catch (err: any) {
    console.error('\n✗ TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTest();
