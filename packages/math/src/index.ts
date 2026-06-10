import * as turf from '@turf/turf';

export interface BillboardDimensions {
  id: string;
  lat: number;
  lng: number;
  height_agl: number;
  orientation_degrees: number;
  max_range_meters: number;
}

export interface VisibilityResult {
  visible: boolean;
  distance: number;
  angleDiff: number;
  headingDiff: number | null;
  exposureScore: number;
}

export interface TrajectoryPoint {
  lat: number;
  lng: number;
  timestamp: string;
  speed: number;
  heading?: number;
}

/**
 * Normalizes an angle difference to be within [0, 180] degrees.
 */
function getAngleDifference(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) {
    diff = 360 - diff;
  }
  return diff;
}

/**
 * Analyzes whether a single coordinate point can see a billboard.
 */
export function analyzePointVisibility(
  lat: number,
  lng: number,
  heading: number | undefined,
  mode: 'vehicle' | 'pedestrian',
  bb: BillboardDimensions
): VisibilityResult {
  const userPt = turf.point([lng, lat]);
  const bbPt = turf.point([bb.lng, bb.lat]);

  // 1. Calculate Geodesic Distance in meters
  const distance = turf.distance(bbPt, userPt, { units: 'kilometers' }) * 1000;

  // If distance exceeds the max range of the billboard, it is not visible
  if (distance > bb.max_range_meters) {
    return { visible: false, distance, angleDiff: 180, headingDiff: null, exposureScore: 0 };
  }

  // 2. Calculate Bearing from Billboard to User
  let bearing = turf.bearing(bbPt, userPt);
  if (bearing < 0) {
    bearing = 360 + bearing;
  }

  // Calculate the angle difference between billboard facing vector and direction to user
  const angleDiff = getAngleDifference(bb.orientation_degrees, bearing);

  // Billboard visual cone is a 120-degree arc (aperture of +/- 60 degrees)
  if (angleDiff > 60) {
    return { visible: false, distance, angleDiff, headingDiff: null, exposureScore: 0 };
  }

  // 3. Process Vehicle Heading Directional Constraints
  let headingDiff: number | null = null;
  if (mode === 'vehicle') {
    if (heading === undefined) {
      return { visible: false, distance, angleDiff, headingDiff: null, exposureScore: 0 };
    }

    // Vehicle must drive TOWARDS the billboard face.
    const oppositeFacing = (bb.orientation_degrees + 180) % 360;
    headingDiff = getAngleDifference(heading, oppositeFacing);

    if (headingDiff > 90) {
      return { visible: false, distance, angleDiff, headingDiff, exposureScore: 0 };
    }
  }

  // 4. Calculate Attenuation Exposure Score [0, 1]
  const distRatio = distance / bb.max_range_meters;
  const distWeight = Math.exp(-2.0 * distRatio);

  const angleRatio = angleDiff / 60;
  const angleWeight = Math.cos((angleRatio * Math.PI) / 3);

  let headingWeight = 1.0;
  if (mode === 'vehicle' && headingDiff !== null) {
    const headRatio = headingDiff / 90;
    headingWeight = Math.cos((headRatio * Math.PI) / 2);
  }

  const exposureScore = distWeight * angleWeight * headingWeight;

  return {
    visible: true,
    distance,
    angleDiff,
    headingDiff,
    exposureScore
  };
}

/**
 * Computes visibility metrics for an entire trajectory.
 */
export function analyzeTrajectoryVisibility(
  points: TrajectoryPoint[],
  mode: 'vehicle' | 'pedestrian',
  bb: BillboardDimensions
): { exposed: boolean; durationSec: number; maxScore: number } {
  if (points.length === 0) {
    return { exposed: false, durationSec: 0, maxScore: 0 };
  }

  let exposedPoints = 0;
  let maxScore = 0;
  let totalDurationSec = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const result = analyzePointVisibility(pt.lat, pt.lng, pt.heading, mode, bb);
    if (result.visible) {
      exposedPoints++;
      if (result.exposureScore > maxScore) {
        maxScore = result.exposureScore;
      }
    }
  }

  if (exposedPoints > 0) {
    const firstPointTime = new Date(points[0].timestamp).getTime();
    const lastPointTime = new Date(points[points.length - 1].timestamp).getTime();
    totalDurationSec = Math.max(1, (lastPointTime - firstPointTime) / 1000);
  }

  return {
    exposed: exposedPoints > 0,
    durationSec: totalDurationSec,
    maxScore
  };
}

/**
 * Computes the exact compass heading and tilt pitch to orient the camera
 * from the road coordinate to point directly at the billboard center.
 * 
 * @param roadLat Latitude of the camera on the road
 * @param roadLng Longitude of the camera on the road
 * @param roadAlt Camera altitude (usually 1.5m above ground level)
 * @param bbLat Latitude of the billboard
 * @param bbLng Longitude of the billboard
 * @param bbAlt Height of the billboard above ground level (Height AGL)
 */
export function calculateCameraAngles(
  roadLat: number,
  roadLng: number,
  roadAlt: number,
  bbLat: number,
  bbLng: number,
  bbAlt: number
): { heading: number; pitch: number; distance: number } {
  const roadPt = turf.point([roadLng, roadLat]);
  const bbPt = turf.point([bbLng, bbLat]);

  // 1. Calculate horizontal geodesic distance in meters
  const distance = turf.distance(roadPt, bbPt, { units: 'kilometers' }) * 1000;

  // 2. Calculate compass bearing (0-360 degrees)
  let heading = turf.bearing(roadPt, bbPt);
  if (heading < 0) {
    heading = 360 + heading;
  }

  // 3. Calculate pitch (vertical tilt) in degrees
  const hDiff = bbAlt - roadAlt;
  const pitchRad = Math.atan2(hDiff, distance);
  const pitch = (pitchRad * 180) / Math.PI;

  return {
    heading,
    pitch,
    distance
  };
}

/**
 * Formulates the static Street View perspective image query URL.
 */
export function getStreetViewImageUrl(
  lat: number,
  lng: number,
  heading: number,
  pitch: number,
  apiKey: string
): string {
  const h = Math.round(heading);
  const p = Math.round(pitch);
  return `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&heading=${h}&pitch=${p}&fov=60&key=${apiKey}`;
}

/**
 * Snaps raw trajectories coordinates to the road network using the Google Maps Roads API.
 */
export async function snapCoordinatesToRoads(
  points: { lat: number; lng: number }[],
  apiKey: string
): Promise<{ lat: number; lng: number }[]> {
  if (points.length === 0) return [];

  const pathStr = points.map(p => `${p.lat},${p.lng}`).join('|');
  const url = `https://roads.googleapis.com/v1/snapToRoads?path=${pathStr}&interpolate=true&key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      let errorMsg = res.statusText || '';
      try {
        const text = await res.text();
        if (text) {
          try {
            const json = JSON.parse(text);
            if (json.error && json.error.message) {
              errorMsg = json.error.message;
            } else if (json.message) {
              errorMsg = json.message;
            } else {
              errorMsg = text.substring(0, 150);
            }
          } catch (_) {
            errorMsg = text.substring(0, 150);
          }
        }
      } catch (_) {}
      throw new Error(`Roads API failed: ${errorMsg || `HTTP ${res.status}`}`);
    }
    const data = await res.json();
    if (!data.snappedPoints || !Array.isArray(data.snappedPoints)) {
      return points; // Fallback to raw points if empty
    }

    return data.snappedPoints.map((pt: any) => ({
      lat: pt.location.latitude,
      lng: pt.location.longitude
    }));
  } catch (err) {
    console.warn('[GAVI Math] Snap to roads failed, falling back to raw coordinates:', err);
    return points;
  }
}
