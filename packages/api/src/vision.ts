import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { 
  getStreetViewCache, 
  writeStreetViewCache, 
  getBillboards, 
  updateBillboardValidation,
  upsertBillboard,
  Billboard
} from '@gavi/core';
import { calculateCameraAngles, getStreetViewImageUrl } from '@gavi/math';

// Initialize the Google Gen AI client if API key is present
export let geminiApiKey = process.env.GEMINI_API_KEY || '';
export let mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';

export let lastApiError: string | null = null;
export function clearLastApiError() {
  lastApiError = null;
}
export function setLastApiError(err: string | null) {
  lastApiError = err;
}

export const getMapsApiKey = () => mapsApiKey;
export const getGeminiApiKey = () => geminiApiKey;

export let ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

export function setApiKeys(mapsKey: string, geminiKey: string) {
  mapsApiKey = mapsKey;
  geminiApiKey = geminiKey;
  if (geminiApiKey) {
    ai = new GoogleGenAI({ apiKey: geminiApiKey });
  } else {
    ai = null;
  }
}

export const agentStats = {
  roadsApiCalls: 0,
  streetviewDownloadCalls: 0,
  geminiVlmCalls: 0,
  cacheHits: 0,
  trajectoriesProcessed: 0
};

// Ensure directories exist
const cacheDir = path.join(process.cwd(), 'storage', 'streetview');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Helper: Download image and save locally
async function downloadImage(url: string, destPath: string): Promise<void> {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const response = await fetch(url);
  if (!response.ok) {
    let errorMsg = response.statusText || '';
    try {
      const text = await response.text();
      if (text) {
        // Attempt to parse JSON error message if present
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
    throw new Error(`Failed to download Street View image: ${errorMsg || `HTTP ${response.status}`}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(destPath, buffer);
}

// Convert local file to base64
function fileToBase64(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath).toString('base64');
}

export interface VerificationResult {
  visible: boolean;
  confidence: number;
  bounding_box: number[] | null; // [ymin, xmin, ymax, xmax]
  occlusion: 'none' | 'foliage' | 'building' | 'other';
  reasoning: string;
  imagePath: string;
}

function getBrandFromBillboard(bb: any): string {
  const name = (bb.id + '_' + (bb.ad_image_path || '')).toLowerCase();
  if (name.includes('bhima')) return 'Bhima Jewellers';
  if (name.includes('american') || name.includes('eagle')) return 'American Eagle';
  if (name.includes('pepsi')) return 'Pepsi';
  if (name.includes('tesla')) return 'Tesla';
  if (name.includes('aether')) return 'Aether';
  return 'any matching advertisement design';
}

/**
 * Runs GAVI's hybrid spatial-vision check to verify if a billboard
 * is visible from a given road coordinate, utilizing caching and Gemini Flash.
 */
export async function runBillboardVerification(
  billboardId: string,
  roadLat: number,
  roadLng: number,
  logCallback?: (msg: string) => void
): Promise<VerificationResult> {
  const log = (msg: string) => {
    if (logCallback) logCallback(msg);
    console.log(`[GAVI Vision] ${msg}`);
  };

  // 1. Fetch billboard configurations
  const billboards = await getBillboards();
  const bb = billboards.find(b => b.id === billboardId);
  if (!bb) {
    throw new Error(`Billboard [${billboardId}] not found in registry.`);
  }

  // 2. Calculate target camera orientation
  const cameraHeight = 1.5; // Standard camera car height in meters
  const { heading, pitch, distance } = calculateCameraAngles(
    roadLat,
    roadLng,
    cameraHeight,
    bb.lat,
    bb.lng,
    bb.height_agl
  );

  // Generate coordinate hash key for the SQLite cache
  const coordHash = `${billboardId}_${roadLat.toFixed(5)}_${roadLng.toFixed(5)}`;
  log(`Checking cache for coordinate geohash: ${coordHash}...`);

  // 3. Check SQLite Caching Layer
  const cached = await getStreetViewCache(coordHash);
  if (cached) {
    log(`✓ Cache Hit! Returning pre-computed visibility for [${billboardId}].`);
    agentStats.cacheHits++;
    return {
      visible: cached.is_visible === 1,
      confidence: cached.confidence ?? 0,
      bounding_box: cached.bounding_box ? JSON.parse(cached.bounding_box) : null,
      occlusion: 'none',
      reasoning: 'Loaded from local SQLite geohash cache.',
      imagePath: cached.image_path || ''
    };
  }

  log(`✗ Cache Miss. Proceeding with active spatial-vision check.`);

  // Define local output image path
  const imageFilename = `${coordHash}.jpg`;
  const imagePath = path.join(cacheDir, imageFilename);
  const relativeImagePath = `/storage/streetview/${imageFilename}`;

  // 4. Verify API credentials are configured
  if (!mapsApiKey || !geminiApiKey || !ai) {
    const err = new Error("API credentials missing. Please configure GOOGLE_MAPS_API_KEY and GEMINI_API_KEY in GAVI credentials.");
    setLastApiError(err.message);
    throw err;
  }

  // 5. Active Google Maps Ingestion Mode
  log(`Querying Google Street View Static API...`);
  const svUrl = getStreetViewImageUrl(roadLat, roadLng, heading, pitch, mapsApiKey);
  
  try {
    await downloadImage(svUrl, imagePath);
    agentStats.streetviewDownloadCalls++;
    log(`✓ Perspective image saved to ${imagePath}`);
  } catch (err: any) {
    log(`✗ Image download failed: ${err.message}`);
    throw err;
  }

  // 6. Invoke Google Gemini Vision VLM
  log(`Calling Google Gemini 2.5 Flash...`);
  
  // Load ad design reference
  let adImageBase64 = '';
  if (bb.ad_image_path) {
    const fullAdPath = path.isAbsolute(bb.ad_image_path) 
      ? bb.ad_image_path 
      : path.join(process.cwd(), bb.ad_image_path);
    adImageBase64 = fileToBase64(fullAdPath);
  }

  const svImageBase64 = fileToBase64(imagePath);
  if (!svImageBase64) {
    throw new Error(`Failed to load Street View image from disk for base64 conversion.`);
  }

  const brandName = getBrandFromBillboard(bb);
  const promptText = `
    You are GAVI (Geographical Visualisation Intelligence), an AI spatial analyst.
    Your task is to analyze the provided Street View image and verify if the target brand/advertiser "${brandName}" or its corresponding advertisement design is visible on any billboards, signs, or digital screens in the frame.
    
    Guidelines:
    1. Compare the Street View frame with the target ad design.
    2. Check if the brand name "${brandName}" (logo, text, or store sign) or the exact ad design is visible on any of the billboard structures or store displays.
    3. If there is a matching brand name, logo, or store sign visible on an advertising display, mark it as visible (visible: true).
    4. Return a confidence score between 0.0 and 1.0.
    5. If visible, return the bounding box coordinates [ymin, xmin, ymax, xmax] normalized to [0, 1000] mapping the outline of the billboard or sign showing the brand/ad.
    6. Determine the occlusion type if trees, poles, or structures are blocking it.
  `;

  const parts: any[] = [
    { text: promptText },
    { inlineData: { mimeType: 'image/jpeg', data: svImageBase64 } }
  ];

  if (adImageBase64) {
    parts.push({
      inlineData: { mimeType: 'image/jpeg', data: adImageBase64 }
    });
  }

  try {
    agentStats.geminiVlmCalls++;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            visible: { type: 'BOOLEAN' },
            confidence: { type: 'NUMBER' },
            bounding_box: {
              type: 'ARRAY',
              items: { type: 'NUMBER' },
              description: 'Bounding box [ymin, xmin, ymax, xmax] coordinates, normalized 0 to 1000'
            },
            occlusion: { 
              type: 'STRING', 
              enum: ['none', 'foliage', 'building', 'other'] 
            },
            reasoning: { type: 'STRING' }
          },
          required: ['visible', 'confidence', 'reasoning']
        }
      }
    });

    const replyText = response.text;
    log(`Gemini response: ${replyText}`);

    if (!replyText) {
      throw new Error('Gemini returned empty text response.');
    }

    const result = JSON.parse(replyText);

    const isVisible = result.visible === true;
    const confidence = result.confidence ?? 0;
    const bbox = result.bounding_box ?? null;
    const occlusion = result.occlusion ?? 'none';
    const reasoning = result.reasoning ?? '';

    // 7. Save to SQLite Ingestion Cache
    await writeStreetViewCache({
      coordinate_hash: coordHash,
      billboard_id: billboardId,
      is_visible: isVisible ? 1 : 0,
      confidence,
      bounding_box: bbox ? JSON.stringify(bbox) : undefined,
      image_path: relativeImagePath,
      created_at: new Date().toISOString()
    });

    // 8. Self-Correction Feedback Loop
    let validationStatus: 'VERIFIED' | 'MISALIGNED' | 'OCCLUDED' | 'NOT_FOUND' = 'NOT_FOUND';
    let observedBearing = bb.orientation_degrees;

    if (isVisible) {
      if (occlusion !== 'none') {
        validationStatus = 'OCCLUDED';
      } else {
        validationStatus = 'VERIFIED';
      }

      // Check if visual bounding box is shifted or rotated (simulated here)
      // If the bounding box is heavily offset towards the left/right,
      // it might indicate an orientation angle mismatch.
      if (bbox && bbox.length === 4) {
        const xCenter = (bbox[1] + bbox[3]) / 2; // middle x
        if (xCenter < 300) {
          // shifted left
          observedBearing = (bb.orientation_degrees - 10 + 360) % 360;
          validationStatus = 'MISALIGNED';
          log(`⚠ Self-Correction: Detected visual offset (left). Adjusting observed bearing to ${observedBearing}°`);
        } else if (xCenter > 700) {
          // shifted right
          observedBearing = (bb.orientation_degrees + 10) % 360;
          validationStatus = 'MISALIGNED';
          log(`⚠ Self-Correction: Detected visual offset (right). Adjusting observed bearing to ${observedBearing}°`);
        }
      }
    }

    await updateBillboardValidation(billboardId, validationStatus, observedBearing, confidence);
    log(`✓ Billboard [${billboardId}] registry status updated to ${validationStatus}`);

    return {
      visible: isVisible,
      confidence,
      bounding_box: bbox,
      occlusion,
      reasoning,
      imagePath: relativeImagePath
    };
  } catch (err: any) {
    log(`✗ Gemini VLM Call failed: ${err.message}`);
    setLastApiError(err.message);
    throw err;
  }
}

/**
 * Autonomously scans a 360-degree horizon around a coordinate using Street View and Gemini,
 * detecting and registering any billboards found in the wild.
 */
export async function discoverBillboardsAtLocation(
  lat: number,
  lng: number,
  logCallback?: (msg: string) => void
): Promise<Billboard[]> {
  const log = (msg: string) => {
    if (logCallback) logCallback(msg);
    console.log(`[GAVI Discovery] ${msg}`);
  };

  log(`Initiating Autonomous Billboard Discovery at location: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);

  const headings = [0, 90, 180, 270];
  const discovered: Billboard[] = [];

  // Verify API credentials are configured
  if (!mapsApiKey || !geminiApiKey || !ai) {
    const err = new Error("API credentials missing. Please configure GOOGLE_MAPS_API_KEY and GEMINI_API_KEY in GAVI credentials.");
    setLastApiError(err.message);
    throw err;
  }

  // Active Discovery Ingestion Mode
  log(`Performing 360° visual scan across ${headings.length} headings...`);
  
  for (const h of headings) {
    log(`Scanning heading ${h}°...`);
    
    // Download static image for this camera angle
    const svUrl = getStreetViewImageUrl(lat, lng, h, 5, mapsApiKey);
    const imageFilename = `discovery_${lat.toFixed(5)}_${lng.toFixed(5)}_${h}.jpg`;
    const imagePath = path.join(cacheDir, imageFilename);
    const relativeImagePath = `/storage/streetview/${imageFilename}`;

    try {
      await downloadImage(svUrl, imagePath);
      agentStats.streetviewDownloadCalls++;
    } catch (err: any) {
      log(`✗ Failed downloading Street View at heading ${h}°: ${err.message}. Skipping.`);
      continue;
    }

    const base64Img = fileToBase64(imagePath);
    if (!base64Img) continue;

    // Call Gemini VLM to find billboards
    const promptText = `
      You are GAVI (Geographical Visualisation Intelligence), an AI spatial analyst.
      Your task is to analyze the provided Street View image looking at heading ${h} degrees and detect if there are any billboard advertisement structures or panels.
      
      Look for signs, highway displays, or storefront ad panels.
      Return a JSON response matching the schema.
    `;

    try {
      agentStats.geminiVlmCalls++;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: promptText },
              { inlineData: { mimeType: 'image/jpeg', data: base64Img } }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              has_billboard: { type: 'BOOLEAN' },
              confidence: { type: 'NUMBER' },
              bounding_box: {
                type: 'ARRAY',
                items: { type: 'NUMBER' },
                description: 'Bounding box [ymin, xmin, ymax, xmax] coordinates, normalized 0 to 1000'
              },
              ad_text_or_brand: { type: 'STRING' },
              estimated_height_agl: { type: 'NUMBER' }
            },
            required: ['has_billboard', 'confidence']
          }
        }
      });

      const replyText = response.text;
      if (!replyText) continue;

      const result = JSON.parse(replyText);
      if (result.has_billboard === true && result.confidence >= 0.70) {
        const confidence = result.confidence;
        const bbox = result.bounding_box ?? null;
        const estimatedHeight = result.estimated_height_agl ?? 7.0;
        const brand = result.ad_text_or_brand || 'brand_unknown';

        // Calculate offset lat/lng for billboard position relative to road center (about 15 meters)
        const rad = (h * Math.PI) / 180;
        const bbLat = lat + Math.sin(rad) * 0.00013;
        const bbLng = lng + Math.cos(rad) * 0.00013;

        // Billboard is facing the camera, which is looking at heading H.
        // So the facing vector points back towards the camera: (H + 180) % 360
        const bbOrientation = (h + 180) % 360;
        const discoveredId = `bb_discovered_${Date.now()}_${h}`;

        const newBb: Billboard = {
          id: discoveredId,
          sector_id: bbLat < 20.0 ? 'bangalore_marathahalli' : 'manhattan_west_side',
          lat: bbLat,
          lng: bbLng,
          height_agl: estimatedHeight,
          face_width: 14.0,
          face_height: 5.0,
          orientation_degrees: bbOrientation,
          max_range_meters: 130.0,
          ad_image_path: relativeImagePath,
          validation_status: 'VERIFIED' as const,
          observed_bearing: bbOrientation,
          observed_confidence: confidence,
          last_validated_at: new Date().toISOString()
        };

        // Insert/upsert the billboard first to satisfy foreign key constraints
        await upsertBillboard(newBb);
        discovered.push(newBb);

        // Write cache for this viewpoint referencing the newly created billboard
        const coordHash = `${discoveredId}_${lat.toFixed(5)}_${lng.toFixed(5)}`;
        await writeStreetViewCache({
          coordinate_hash: coordHash,
          billboard_id: discoveredId,
          is_visible: 1,
          confidence,
          bounding_box: bbox ? JSON.stringify(bbox) : undefined,
          image_path: relativeImagePath,
          created_at: new Date().toISOString()
        });

        log(`✓ Discovered billboard [${discoveredId}] showing '${brand}' facing ${bbOrientation}°!`);
      }
    } catch (vErr: any) {
      log(`✗ Discovery inference failed for heading ${h}°: ${vErr.message}`);
      setLastApiError(vErr.message);
      throw vErr;
    }
  }

  return discovered;
}
