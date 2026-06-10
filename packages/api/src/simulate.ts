import { 
  getDatabase, 
  incrementDailyReport, 
  getBillboards, 
  getDailyReports 
} from '@gavi/core';
import { 
  analyzeTrajectoryVisibility, 
  BillboardDimensions 
} from '@gavi/math';

async function runBangaloreSimulation() {
  console.log('========================================================');
  console.log('🚀 STARTING GAVI TWO-DAY WIZ DATA SIMULATION & INFERENCE');
  console.log('📍 Location: Marathahalli Bridge Flyover, Bangalore');
  console.log('========================================================\n');

  const billboards = await getBillboards();
  const bb = billboards.find(b => b.id === 'bb_marathahalli_bridge');

  if (!bb) {
    console.error('❌ Error: bb_marathahalli_bridge is not registered in the database. Run seed first.');
    process.exit(1);
  }

  const bbDim: BillboardDimensions = {
    id: bb.id,
    lat: bb.lat,
    lng: bb.lng,
    height_agl: bb.height_agl,
    orientation_degrees: bb.observed_bearing ?? bb.orientation_degrees,
    max_range_meters: bb.max_range_meters
  };

  const dates = ['2026-06-08', '2026-06-09'];
  const db = await getDatabase();

  // Clean old daily reports for the test billboard to avoid double counting
  await db.run('DELETE FROM daily_reports WHERE billboard_id = ?', [bb.id]);

  for (const date of dates) {
    console.log(`📅 Simulating Day: ${date}`);
    let totalVehicles = 0;
    let exposedVehicles = 0;
    let totalPedestrians = 0;
    let exposedPedestrians = 0;
    let totalExposureDuration = 0;

    // Bangalore Specific Congestion Factors:
    // Day 1 (Jun 8) is a Monday (Office rush, heavy traffic, lower speed).
    // Day 2 (Jun 9) is a Tuesday (Normal congestion).
    const isHeavyDay = date === '2026-06-08';
    const vehicleSpeed = isHeavyDay ? 6.0 : 12.0; // m/s (~22 km/h vs ~43 km/h)
    const vehicleCount = isHeavyDay ? 180 : 120;
    const pedestrianCount = isHeavyDay ? 95 : 60;

    console.log(`   - Traffic profile: ${isHeavyDay ? '🚨 HEAVY WEEKDAY RUSH' : '🟢 MODERATE WEEKDAY FLOW'}`);
    console.log(`   - Speed constraint: ${vehicleSpeed} m/s | Vehicles: ${vehicleCount} | Pedestrians: ${pedestrianCount}`);

    // Generate vehicle trajectories
    for (let i = 0; i < vehicleCount; i++) {
      totalVehicles++;
      const isNEFlyover = Math.random() < 0.40; // 40% driving Northeast on flyover towards Whitefield
      const isSWFlyover = Math.random() < 0.35; // 35% driving Southwest on flyover towards Silk Board
      // Remaining 25% are driving on service roads underneath the flyover (blocked view)

      let points = [];
      const steps = 5;
      const timeStepMs = 1500;

      // Camera coordinates from embed is around: 12.956948, 77.701503 (SW of billboard)
      // Billboard is at: 12.957088, 77.701792
      
      if (isNEFlyover) {
        // Exposed Flow (Driving towards the face of the billboard)
        const heading = 63.52;
        const startLat = 12.95650;
        const startLng = 77.70050;
        const endLat = 12.95750;
        const endLng = 77.70250;

        for (let s = 0; s < steps; s++) {
          const t = s / (steps - 1);
          points.push({
            lat: startLat + t * (endLat - startLat),
            lng: startLng + t * (endLng - startLng),
            timestamp: new Date(new Date(date).getTime() + i * 10000 + s * timeStepMs).toISOString(),
            speed: vehicleSpeed,
            heading
          });
        }
      } else if (isSWFlyover) {
        // Driving away / Facing away
        const heading = 243.52;
        const startLat = 12.95750;
        const startLng = 77.70250;
        const endLat = 12.95650;
        const endLng = 77.70050;

        for (let s = 0; s < steps; s++) {
          const t = s / (steps - 1);
          points.push({
            lat: startLat + t * (endLat - startLat),
            lng: startLng + t * (endLng - startLng),
            timestamp: new Date(new Date(date).getTime() + i * 10000 + s * timeStepMs).toISOString(),
            speed: vehicleSpeed,
            heading
          });
        }
      } else {
        // Service Road under flyover (Northeast direction, but vertical occlusion/beam blockage)
        const heading = 63.52;
        // Service road runs lower down and shifted 15m to the side
        const startLat = 12.95640;
        const startLng = 77.70060;
        const endLat = 12.95740;
        const endLng = 77.70260;

        for (let s = 0; s < steps; s++) {
          const t = s / (steps - 1);
          points.push({
            lat: startLat + t * (endLat - startLat),
            lng: startLng + t * (endLng - startLng),
            timestamp: new Date(new Date(date).getTime() + i * 10000 + s * timeStepMs).toISOString(),
            speed: vehicleSpeed * 0.7, // slower on service road
            heading
          });
        }
      }

      // Run visibility analysis
      const geomResult = analyzeTrajectoryVisibility(points, 'vehicle', bbDim);
      
      // Determine if they were visually exposed (Service road is simulated as blocked view)
      const isExposed = geomResult.exposed && isNEFlyover;

      if (isExposed) {
        exposedVehicles++;
        totalExposureDuration += geomResult.durationSec;
      }

      await incrementDailyReport(date, bb.sector_id, bb.id, {
        isVehicle: true,
        isExposed,
        durationSec: geomResult.durationSec
      });
    }

    // Generate pedestrian trajectories
    for (let i = 0; i < pedestrianCount; i++) {
      totalPedestrians++;
      const isWalkNE = Math.random() < 0.45; // 45% walking Northeast along flyover footway (exposed)
      const isWalkSW = Math.random() < 0.35; // 35% walking Southwest (back to billboard)
      // Remaining 20% are crossing roads or under bridge

      let points = [];
      const steps = 6;
      const timeStepMs = 3000; // Pedestrians are slower
      const walkSpeed = 1.3;

      if (isWalkNE) {
        // Exposed Pedestrian
        const heading = 63.52;
        const startLat = 12.95670;
        const startLng = 77.70090;
        const endLat = 12.95730;
        const endLng = 77.70210;

        for (let s = 0; s < steps; s++) {
          const t = s / (steps - 1);
          points.push({
            lat: startLat + t * (endLat - startLat),
            lng: startLng + t * (endLng - startLng),
            timestamp: new Date(new Date(date).getTime() + i * 15000 + s * timeStepMs).toISOString(),
            speed: walkSpeed,
            heading
          });
        }
      } else if (isWalkSW) {
        // Facing away
        const heading = 243.52;
        const startLat = 12.95730;
        const startLng = 77.70210;
        const endLat = 12.95670;
        const endLng = 77.70090;

        for (let s = 0; s < steps; s++) {
          const t = s / (steps - 1);
          points.push({
            lat: startLat + t * (endLat - startLat),
            lng: startLng + t * (endLng - startLng),
            timestamp: new Date(new Date(date).getTime() + i * 15000 + s * timeStepMs).toISOString(),
            speed: walkSpeed,
            heading
          });
        }
      } else {
        // Crossing under the flyover
        const heading = 153.52;
        const startLat = 12.95720;
        const startLng = 77.70150;
        const endLat = 12.95680;
        const endLng = 77.70170;

        for (let s = 0; s < steps; s++) {
          const t = s / (steps - 1);
          points.push({
            lat: startLat + t * (endLat - startLat),
            lng: startLng + t * (endLng - startLng),
            timestamp: new Date(new Date(date).getTime() + i * 15000 + s * timeStepMs).toISOString(),
            speed: walkSpeed,
            heading
          });
        }
      }

      // Run visibility analysis
      const geomResult = analyzeTrajectoryVisibility(points, 'pedestrian', bbDim);
      const isExposed = geomResult.exposed && isWalkNE;

      if (isExposed) {
        exposedPedestrians++;
        totalExposureDuration += geomResult.durationSec;
      }

      await incrementDailyReport(date, bb.sector_id, bb.id, {
        isVehicle: false,
        isExposed,
        durationSec: geomResult.durationSec
      });
    }

    console.log(`   ✓ Day Completed: Ingested ${totalVehicles} vehicles (${exposedVehicles} exposed), ${totalPedestrians} pedestrians (${exposedPedestrians} exposed).`);
  }

  // Print results table
  console.log('\n========================================================');
  console.log('📊 SIMULATION RESULTS INGESTED INTO SQLite');
  console.log('========================================================');
  
  const reports = await getDailyReports(bb.sector_id);
  const bbReports = reports.filter(r => r.billboard_id === bb.id);

  console.table(bbReports.map(r => ({
    Date: r.date,
    'Vehicles Total': r.total_vehicle_trajectories,
    'Vehicles Seen (Imps)': r.total_vehicle_impressions,
    'Pedestrians Total': r.total_pedestrian_trajectories,
    'Pedestrians Seen (Imps)': r.total_pedestrian_impressions,
    'Avg exposure duration (sec)': (r.average_exposure_duration_sec ?? 0).toFixed(2)
  })));

  console.log('========================================================');
  console.log('✓ Success: Two-day dataset exposure inference fully updated.');
  console.log('========================================================');
  process.exit(0);
}

runBangaloreSimulation();
