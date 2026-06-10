console.log('===============================================');
console.log('📡 GAVI INTEGRATION TEST CLIENT (GPS AGENT SIMULATOR)');
console.log('===============================================');

async function runTest() {
  const url = 'http://localhost:3001/api/v1/exposure/analyze';
  
  // 1. Construct simulated trajectories snapping to the West Side Highway sector
  const payload = {
    sector_id: 'manhattan_west_side',
    timestamp: new Date().toISOString(),
    trajectories: [
      {
        id: 'traj_vehicle_visible_east_to_west',
        mode: 'vehicle',
        points: [
          // Located East of the billboard and moving West (heading 270)
          // Billboard is at 40.7582, -73.9856 facing East (90 degrees).
          // Opposite of 90 degrees is 270 (West). 
          // So a vehicle driving West is heading directly towards the face!
          { lat: 40.7582, lng: -73.9845, timestamp: new Date(Date.now() - 4000).toISOString(), speed: 15.0, heading: 270.0 },
          { lat: 40.7582, lng: -73.9850, timestamp: new Date(Date.now() - 2000).toISOString(), speed: 15.0, heading: 270.0 },
          { lat: 40.7582, lng: -73.9856, timestamp: new Date().toISOString(), speed: 15.0, heading: 270.0 }
        ]
      },
      {
        id: 'traj_vehicle_invisible_west_to_east',
        mode: 'vehicle',
        points: [
          // Located East of the billboard but driving East (heading 90) away from the face
          { lat: 40.7582, lng: -73.9850, timestamp: new Date(Date.now() - 2000).toISOString(), speed: 15.0, heading: 90.0 },
          { lat: 40.7582, lng: -73.9845, timestamp: new Date().toISOString(), speed: 15.0, heading: 90.0 }
        ]
      },
      {
        id: 'traj_pedestrian_visible_cone',
        mode: 'pedestrian',
        points: [
          // Pedestrian walking slowly inside the East visual cone. Omnidirectional, heading doesn't matter.
          { lat: 40.7581, lng: -73.9852, timestamp: new Date().toISOString(), speed: 1.2, heading: 180.0 }
        ]
      }
    ]
  };

  console.log(`Sending ${payload.trajectories.length} trajectories to GAVI Ingestion API...`);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    console.log('\n✓ GAVI Processing Succeeded!');
    console.log('Summary:', JSON.stringify(data.summary, null, 2));
    
    console.log('\nDetail Results:');
    data.results.forEach((r: any) => {
      console.log(`- Trajectory [${r.trajectory_id}] (${r.mode}):`);
      console.log(`  Exposed: ${r.exposed ? '🔥 YES' : '❌ NO'} ${r.reason ? `(Reason: ${r.reason})` : ''}`);
      if (r.exposed) {
        console.log(`  Matched Billboard: ${r.matched_billboard_id}`);
        console.log(`  View Duration: ${r.exposure_duration_sec}s`);
        console.log(`  Visibility Score: ${r.visibility_score}`);
      }
    });

    // 2. Fetch daily report summary
    console.log('\nFetching aggregated daily reports from GAVI...');
    const resRep = await fetch('http://localhost:3001/api/v1/reports/daily?sector_id=manhattan_west_side');
    if (resRep.ok) {
      const reports = await resRep.json();
      console.log('Daily Reports Table:');
      console.table(reports);
    }
  } catch (err: any) {
    console.error('\n✗ Test failed:', err.message);
    console.log('Make sure GAVI Express API server is running on port 3001 (npm start)');
  }
  
  console.log('===============================================');
}

runTest();
