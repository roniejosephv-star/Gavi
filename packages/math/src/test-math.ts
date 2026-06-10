import { analyzePointVisibility, BillboardDimensions } from './index.js';

const bb: BillboardDimensions = {
  id: 'bb_test',
  lat: 40.7582,
  lng: -73.9856,
  height_agl: 8.0,
  orientation_degrees: 90.0, // Facing East (looks towards traffic coming from East)
  max_range_meters: 100.0
};

console.log('===============================================');
console.log('🧪 RUNNING GAVI MATH INTERSECTION TEST SUITE');
console.log('===============================================');

// Case 1: Vehicle is East of billboard, driving West (towards the billboard face)
// Lat 40.7582, Lng -73.9850 is ~50m East. Heading 270 is West.
const c1 = analyzePointVisibility(40.7582, -73.9850, 270.0, 'vehicle', bb);
console.log('Case 1 (Vehicle inside cone & facing billboard):', c1.visible ? '✅ PASS' : '❌ FAIL', c1);

// Case 2: Vehicle is East of billboard, driving East (away from the billboard face)
// Lat 40.7582, Lng -73.9850. Heading 90 is East.
const c2 = analyzePointVisibility(40.7582, -73.9850, 90.0, 'vehicle', bb);
console.log('Case 2 (Vehicle inside cone but driving away):', !c2.visible ? '✅ PASS' : '❌ FAIL', c2);

// Case 3: Pedestrian is East of billboard (should trigger visibility regardless of heading)
// Lat 40.7582, Lng -73.9850. Heading 90 is East.
const c3 = analyzePointVisibility(40.7582, -73.9850, 90.0, 'pedestrian', bb);
console.log('Case 3 (Pedestrian inside cone):', c3.visible ? '✅ PASS' : '❌ FAIL', c3);

// Case 4: Pedestrian is West of billboard (behind the billboard)
// Lat 40.7582, Lng -73.9862 is ~50m West.
const c4 = analyzePointVisibility(40.7582, -73.9862, 90.0, 'pedestrian', bb);
console.log('Case 4 (Pedestrian behind billboard):', !c4.visible ? '✅ PASS' : '❌ FAIL', c4);

console.log('===============================================');
console.log('🧪 TEST SUITE COMPLETE');
console.log('===============================================');
