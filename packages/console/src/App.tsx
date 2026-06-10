import React, { useEffect, useRef, useState } from 'react';
import { 
  Eye, 
  Car, 
  User, 
  MapPin, 
  Sliders, 
  RefreshCw, 
  Activity, 
  Server, 
  TrendingUp, 
  Send,
  SlidersHorizontal,
  FileText,
  AlertCircle,
  Key,
  Upload,
  Code,
  Trash2
} from 'lucide-react';

interface Billboard {
  id: string;
  sector_id: string;
  lat: number;
  lng: number;
  height_agl: number;
  face_width: number;
  face_height: number;
  orientation_degrees: number;
  max_range_meters: number;
  ad_image_path?: string;
  last_validated_at?: string;
  validation_status?: 'PENDING' | 'VERIFIED' | 'MISALIGNED' | 'OCCLUDED' | 'NOT_FOUND';
  observed_bearing?: number;
  observed_confidence?: number;
  streetview_image_path?: string;
  bounding_box?: string;
}

interface AgentStatus {
  agent_id: string;
  status: string;
  config: {
    liveApiMode: boolean;
    confidenceThreshold: number;
    mapsKeyMasked?: string;
    geminiKeyMasked?: string;
  };
  stats: {
    roadsApiCalls?: number;
    streetviewDownloadCalls?: number;
    geminiVlmCalls?: number;
    cacheHits: number;
    trajectoriesProcessed: number;
  };
  logs: string[];
}

interface SimulatedParticle {
  id: string;
  mode: 'vehicle' | 'pedestrian';
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  isExposed: boolean;
  matchedBillboardId?: string;
}

const API_BASE = window.location.port === '3000' ? 'http://localhost:3001' : '';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Dynamic API Configuration Keys
  const [mapsKey, setMapsKey] = useState(() => localStorage.getItem('gavi_maps_key') || '');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gavi_gemini_key') || '');

  // Active Data State
  const [billboards, setBillboards] = useState<Billboard[]>([]);
  const [selectedBillboard, setSelectedBillboard] = useState<Billboard | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [apiStatus, setApiStatus] = useState<'CONNECTED' | 'OFFLINE'>('OFFLINE');
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    agent_id: 'gavi_spatial_node_01',
    status: 'ONLINE',
    config: { liveApiMode: false, confidenceThreshold: 0.70 },
    stats: { roadsApiCalls: 0, streetviewDownloadCalls: 0, geminiVlmCalls: 0, cacheHits: 0, trajectoriesProcessed: 0 },
    logs: ['System initializing...']
  });

  // Street View Visual States
  const [streetviewUrl, setStreetviewUrl] = useState<string>('');
  const [bbox, setBbox] = useState<number[] | null>(null);
  const [showImgLoader, setShowImgLoader] = useState(false);
  const [showContracts, setShowContracts] = useState(false);

  // GAVI Autonomous Discovery State
  const [discoverLat, setDiscoverLat] = useState('');
  const [discoverLng, setDiscoverLng] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Active Particle list
  const [particles, setParticles] = useState<SimulatedParticle[]>([]);
  const [isSimulating, setIsSimulating] = useState(true);
  const [totalVehiclesSimulated, setTotalVehiclesSimulated] = useState(0);
  const [totalPedestriansSimulated, setTotalPedestriansSimulated] = useState(0);
  const [totalImpressions, setTotalImpressions] = useState(0);

  // Bill Agent Ingress Form State
  const [billId, setBillId] = useState('bb_manhattan_times');
  const [billLat, setBillLat] = useState('40.7582');
  const [billLng, setBillLng] = useState('-73.9856');
  const [billBearing, setBillBearing] = useState('90');
  const [billHeight, setBillHeight] = useState('8');
  const [billWidth, setBillWidth] = useState('15');
  const [imageBase64, setImageBase64] = useState<string>('');

  // Interactive Google Maps Street View States
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<'static' | 'interactive'>('interactive');
  const [panoLat, setPanoLat] = useState<number | null>(null);
  const [panoLng, setPanoLng] = useState<number | null>(null);
  const [panoHeading, setPanoHeading] = useState<number>(0);
  const [panoPitch, setPanoPitch] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');

  const panoRef = useRef<HTMLDivElement | null>(null);
  const panoInstanceRef = useRef<any>(null);

  const [panoHeight, setPanoHeight] = useState(220);
  const isResizingRef = useRef(false);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startHeight = panoHeight;
    const startY = e.clientY;

    const doDrag = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(150, Math.min(600, startHeight + deltaY));
      setPanoHeight(newHeight);
    };

    const stopDrag = () => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  // Dynamic Google Maps JS API Script Loader
  useEffect(() => {
    if (!mapsKey) {
      setMapsLoaded(false);
      return;
    }

    const scriptId = 'gmaps-js-api-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const initializeMaps = () => {
      setMapsLoaded(true);
    };

    if (script) {
      if (script.src.includes(`key=${mapsKey}`)) {
        if ((window as any).google && (window as any).google.maps) {
          setMapsLoaded(true);
        }
        return;
      }
      script.remove();
      const backupElement = document.getElementById(scriptId);
      if (backupElement) backupElement.remove();
      if ((window as any).google) {
        delete (window as any).google;
      }
    }

    script = document.createElement('script');
    script.id = scriptId;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}`;
    script.async = true;
    script.defer = true;
    script.onload = initializeMaps;
    script.onerror = () => {
      console.error('Failed to load Google Maps script.');
      setMapsLoaded(false);
    };
    document.head.appendChild(script);
  }, [mapsKey]);

  // Mount/Initialize Interactive Street View Panorama with Click Handler
  useEffect(() => {
    if (viewMode !== 'interactive' || !mapsLoaded || !panoRef.current) {
      panoInstanceRef.current = null;
      return;
    }

    const google = (window as any).google;
    if (!google || !google.maps) return;

    let initialLat = panoLat ?? 12.956948;
    let initialLng = panoLng ?? 77.701502;
    let initialHeading = panoHeading || 0;
    let initialPitch = panoPitch || 0;

    if (selectedBillboard) {
      initialLat = selectedBillboard.lat;
      initialLng = selectedBillboard.lng;
      initialHeading = selectedBillboard.observed_bearing ?? selectedBillboard.orientation_degrees;
      let solved = false;

      if (selectedBillboard.streetview_image_path) {
        // Filenames look like: billboardId_roadLat_roadLng.jpg
        const match = selectedBillboard.streetview_image_path.match(/_(-?\d+\.\d+)_(-?\d+\.\d+)\.jpg$/);
        if (match) {
          initialLat = parseFloat(match[1]);
          initialLng = parseFloat(match[2]);
          // Calculate heading/pitch from the snapped road coordinates back to the billboard
          const cameraHeight = 1.5;
          const dy = selectedBillboard.lat - initialLat;
          const dx = (selectedBillboard.lng - initialLng) * Math.cos(initialLat * Math.PI / 180);
          let bearingToBb = Math.atan2(dx, dy) * 180 / Math.PI;
          if (bearingToBb < 0) bearingToBb += 360;

          initialHeading = bearingToBb;
          
          // Pitch vertical angle calculation
          const distDegrees = Math.sqrt(dx * dx + dy * dy);
          const distMeters = distDegrees * 111111;
          const hDiff = selectedBillboard.height_agl - cameraHeight;
          initialPitch = (Math.atan2(hDiff, distMeters) * 180) / Math.PI;
          solved = true;
        }
      }

      // Fallback to calculated offset (30m in front of billboard face normal)
      if (!solved) {
        const bearing = selectedBillboard.observed_bearing ?? selectedBillboard.orientation_degrees;
        const rad = (bearing * Math.PI) / 180;
        const offsetDistance = 30; // 30 meters
        initialLat = selectedBillboard.lat + (offsetDistance * Math.cos(rad)) / 111111;
        initialLng = selectedBillboard.lng + (offsetDistance * Math.sin(rad)) / (111111 * Math.cos(selectedBillboard.lat * Math.PI / 180));
        initialHeading = (bearing + 180) % 360;
        initialPitch = 10; // slightly tilted up
      }
    }

    const pano = new google.maps.StreetViewPanorama(panoRef.current, {
      position: { lat: initialLat, lng: initialLng },
      pov: { heading: initialHeading, pitch: initialPitch },
      zoom: 1,
      visible: true
    });

    panoInstanceRef.current = pano;

    setPanoLat(initialLat);
    setPanoLng(initialLng);
    setPanoHeading(initialHeading);
    setPanoPitch(initialPitch);

    const posListener = pano.addListener('position_changed', () => {
      const pos = pano.getPosition();
      if (pos) {
        setPanoLat(pos.lat());
        setPanoLng(pos.lng());
      }
    });

    const povListener = pano.addListener('pov_changed', () => {
      const pov = pano.getPov();
      if (pov) {
        setPanoHeading(pov.heading);
        setPanoPitch(pov.pitch);
      }
    });

    // Click on Panorama to Place Billboard Spec
    const clickListener = pano.addListener('click', (event: any) => {
      let lat = pano.getPosition()?.lat();
      let lng = pano.getPosition()?.lng();
      let bearing = pano.getPov()?.heading || 0;

      if (event.latLng) {
        lat = event.latLng.lat();
        lng = event.latLng.lng();
      } else if (event.pointer) {
        const headingRad = (event.pointer.heading * Math.PI) / 180;
        const camLat = pano.getPosition()?.lat() || 12.956948;
        const camLng = pano.getPosition()?.lng() || 77.701502;
        lat = camLat + (30 * Math.cos(headingRad)) / 111111;
        lng = camLng + (30 * Math.sin(headingRad)) / (111111 * Math.cos(camLat * Math.PI / 180));
        bearing = event.pointer.heading;
      } else {
        return;
      }

      const facingBearing = (bearing + 180) % 360;

      // Update Form State
      const newId = `bb_placed_${Date.now()}`;
      setBillId(newId);
      setBillLat(lat.toFixed(6));
      setBillLng(lng.toFixed(6));
      setBillBearing(Math.round(facingBearing).toString());

      alert(`✓ Captured coordinates from Street View click:\n- Position: ${lat.toFixed(6)}, ${lng.toFixed(6)}\n- Orientation: ${Math.round(facingBearing)}°\nPre-filled in "Bill" Ingress Form.`);
    });

    return () => {
      if (google.maps.event) {
        google.maps.event.removeListener(posListener);
        google.maps.event.removeListener(povListener);
        google.maps.event.removeListener(clickListener);
      }
    };
  }, [viewMode, mapsLoaded]);

  // Update existing panorama location when a new billboard is selected
  useEffect(() => {
    if (panoInstanceRef.current && selectedBillboard) {
      // 1. Try to extract road coordinates from cached streetview image path
      let roadLat = selectedBillboard.lat;
      let roadLng = selectedBillboard.lng;
      let heading = selectedBillboard.observed_bearing ?? selectedBillboard.orientation_degrees;
      let pitch = 0;
      let solved = false;

      if (selectedBillboard.streetview_image_path) {
        // Filenames look like: billboardId_roadLat_roadLng.jpg
        const match = selectedBillboard.streetview_image_path.match(/_(-?\d+\.\d+)_(-?\d+\.\d+)\.jpg$/);
        if (match) {
          roadLat = parseFloat(match[1]);
          roadLng = parseFloat(match[2]);
          // Calculate heading/pitch from the snapped road coordinates back to the billboard
          const cameraHeight = 1.5;
          const dy = selectedBillboard.lat - roadLat;
          const dx = (selectedBillboard.lng - roadLng) * Math.cos(roadLat * Math.PI / 180);
          let bearingToBb = Math.atan2(dx, dy) * 180 / Math.PI;
          if (bearingToBb < 0) bearingToBb += 360;

          heading = bearingToBb;
          
          // Pitch vertical angle calculation
          const distDegrees = Math.sqrt(dx * dx + dy * dy);
          const distMeters = distDegrees * 111111;
          const hDiff = selectedBillboard.height_agl - cameraHeight;
          pitch = (Math.atan2(hDiff, distMeters) * 180) / Math.PI;
          solved = true;
        }
      }

      // 2. Fallback to calculated offset (30m in front of billboard face normal)
      if (!solved) {
        const bearing = selectedBillboard.observed_bearing ?? selectedBillboard.orientation_degrees;
        const rad = (bearing * Math.PI) / 180;
        const offsetDistance = 30; // 30 meters
        roadLat = selectedBillboard.lat + (offsetDistance * Math.cos(rad)) / 111111;
        roadLng = selectedBillboard.lng + (offsetDistance * Math.sin(rad)) / (111111 * Math.cos(selectedBillboard.lat * Math.PI / 180));
        heading = (bearing + 180) % 360;
        pitch = 10; // slightly tilted up
      }

      panoInstanceRef.current.setPosition({ lat: roadLat, lng: roadLng });
      panoInstanceRef.current.setPov({ heading, pitch });
    }
  }, [selectedBillboard?.id, mapsLoaded]);

  // Trigger Maps resize redraw when height changes and the DOM has completed layout
  useEffect(() => {
    const google = (window as any).google;
    if (google && google.maps && panoInstanceRef.current) {
      google.maps.event.trigger(panoInstanceRef.current, 'resize');
    }
  }, [panoHeight]);

  // Geocode location address search query
  const handleLocationSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery || !mapsLoaded) return;

    const google = (window as any).google;
    if (!google || !google.maps) return;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: searchQuery }, (results: any, status: any) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        const lat = loc.lat();
        const lng = loc.lng();
        
        setDiscoverLat(lat.toFixed(6));
        setDiscoverLng(lng.toFixed(6));
        setPanoLat(lat);
        setPanoLng(lng);

        if (panoInstanceRef.current) {
          panoInstanceRef.current.setPosition({ lat, lng });
        }
      } else {
        alert(`✗ Geocoding search failed: ${status}`);
      }
    });
  };

  // Extract Billboard specs from the current POV coordinates
  const handleExtractFromPov = () => {
    if (panoLat === null || panoLng === null) return;
    
    const headingRad = (panoHeading * Math.PI) / 180;
    const projectedLat = panoLat + (30 * Math.cos(headingRad)) / 111111;
    const projectedLng = panoLng + (30 * Math.sin(headingRad)) / (111111 * Math.cos(panoLat * Math.PI / 180));
    const facingBearing = (panoHeading + 180) % 360;

    const newId = `bb_discovered_${Date.now()}`;
    setBillId(newId);
    setBillLat(projectedLat.toFixed(6));
    setBillLng(projectedLng.toFixed(6));
    setBillBearing(Math.round(facingBearing).toString());
    
    alert(`✓ Extracted billboard specs from current POV:\n- Position: ${projectedLat.toFixed(6)}, ${projectedLng.toFixed(6)}\n- Orientation: ${Math.round(facingBearing)}°\nPre-filled in "Bill" Ingress Form.`);
  };

  // Dynamic BVI Score and Suggestion Engine
  const calculateBvi = () => {
    if (!selectedBillboard) return { bvi: 0, povMatch: false, audienceExposure: 0, suggestions: [] as string[] };

    const targetBearing = selectedBillboard.observed_bearing ?? selectedBillboard.orientation_degrees;
    const confidence = selectedBillboard.observed_confidence ?? 0.94;

    if (viewMode !== 'interactive' || panoLat === null || panoLng === null) {
      let generalBvi = Math.round(confidence * 100);
      const suggestions = [];
      if (selectedBillboard.validation_status === 'OCCLUDED') {
        suggestions.push('⚠ Occlusion detected. Consider raising the structure height AGL by 2.5 meters to clear street visual blocks.');
        generalBvi = Math.max(10, generalBvi - 30);
      }
      if (selectedBillboard.validation_status === 'MISALIGNED') {
        suggestions.push('⚠ Orientation misalignment detected. Consider rotating the face structure by ±15° to face approaching roadway lanes.');
        generalBvi = Math.max(10, generalBvi - 20);
      }
      if (selectedBillboard.validation_status === 'VERIFIED') {
        suggestions.push('✓ Optimal placement detected. Current face orientation captures traffic flow with clear line-of-sight.');
      }
      return { bvi: generalBvi, povMatch: true, audienceExposure: 85, suggestions };
    }

    const camLat = panoLat;
    const camLng = panoLng;

    const dyCam = camLat - selectedBillboard.lat;
    const dxCam = (camLng - selectedBillboard.lng) * Math.cos(selectedBillboard.lat * Math.PI / 180);
    let bearingToCam = Math.atan2(dxCam, dyCam) * 180 / Math.PI;
    if (bearingToCam < 0) bearingToCam += 360;

    let exposureDiff = Math.abs(targetBearing - bearingToCam) % 360;
    if (exposureDiff > 180) exposureDiff = 360 - exposureDiff;
    const insideBbCone = exposureDiff <= 60;

    let bearingToBb = (bearingToCam + 180) % 360;
    let fovDiff = Math.abs(panoHeading - bearingToBb) % 360;
    if (fovDiff > 180) fovDiff = 360 - fovDiff;
    const insideCamFov = fovDiff <= 45;

    const latDiffM = (selectedBillboard.lat - camLat) * 111111;
    const lngDiffM = (selectedBillboard.lng - camLng) * 111111 * Math.cos(camLat * Math.PI / 180);
    const distM = Math.sqrt(latDiffM * latDiffM + lngDiffM * lngDiffM);
    const withinRange = distM <= selectedBillboard.max_range_meters;

    const povMatch = insideBbCone && insideCamFov && withinRange;

    const exposureFactor = insideBbCone ? Math.cos(exposureDiff * Math.PI / 180) : 0;
    const audienceExposure = Math.round(Math.max(0, exposureFactor) * 100);
    const distanceFactor = Math.exp(-1.5 * (distM / selectedBillboard.max_range_meters));
    const centeringFactor = insideCamFov ? Math.cos(fovDiff * Math.PI / 180) : 0;

    let bviScore = 0;
    if (povMatch) {
      bviScore = Math.round(confidence * exposureFactor * centeringFactor * distanceFactor * 100);
      bviScore = Math.max(10, Math.min(100, bviScore));
    }

    const suggestions: string[] = [];
    if (!withinRange) {
      suggestions.push(`⚠ Camera is out of range (${Math.round(distM)}m vs max ${Math.round(selectedBillboard.max_range_meters)}m). Move closer along the road coordinate.`);
    } else {
      if (!insideBbCone) {
        suggestions.push(`⚠ Billboard face (facing ${Math.round(targetBearing)}°) is angled away from camera position. Adjust billboard orientation to face oncoming observers.`);
      }
      if (!insideCamFov) {
        suggestions.push(`⚠ Billboard is not in camera's direct line of sight. Rotate Street View camera towards bearing ${Math.round(bearingToBb)}° to face it.`);
      }
    }

    if (povMatch) {
      suggestions.push(`✓ Sightline aligned! Distance: ${Math.round(distM)}m.`);
      if (exposureDiff > 25) {
        suggestions.push(`💡 Suggestion: Rotate billboard orientation by ${Math.round(exposureDiff)}° to align directly with oncoming road coordinates.`);
      }
      if (selectedBillboard.validation_status === 'OCCLUDED') {
        suggestions.push('💡 Placement check: Occlusion detected at this segment. Raise height AGL to clear visual obstructions.');
      } else {
        suggestions.push('✓ Optimal positioning: Direct line-of-sight holds high viewer visibility index.');
      }
    }

    return {
      bvi: bviScore,
      povMatch,
      audienceExposure,
      suggestions
    };
  };

  // Fetch GAVI Agent Node Data
  const fetchApiData = async () => {
    try {
      const resBb = await fetch(`${API_BASE}/api/v1/billboards`);
      if (resBb.ok) {
        const dataBb = await resBb.json();
        setBillboards(dataBb);
        if (dataBb.length > 0 && !selectedBillboard) {
          setSelectedBillboard(dataBb[0]);
        } else if (selectedBillboard) {
          const synced = dataBb.find((b: any) => b.id === selectedBillboard.id);
          if (synced) setSelectedBillboard(synced);
        }
        setApiStatus('CONNECTED');
      }

      const resReports = await fetch(`${API_BASE}/api/v1/reports/daily`);
      if (resReports.ok) {
        const dataReports = await resReports.json();
        setReports(dataReports);
      }

      const resAgent = await fetch(`${API_BASE}/api/v1/agent/status`);
      if (resAgent.ok) {
        const dataAgent = await resAgent.json();
        setAgentStatus(dataAgent);
        if (dataAgent.api_error) {
          alert(`✗ GAVI API Error:\n${dataAgent.api_error}`);
        }
      }
    } catch (e) {
      setApiStatus('OFFLINE');
    }
  };

  useEffect(() => {
    fetchApiData();
    const interval = setInterval(fetchApiData, 2000);
    return () => clearInterval(interval);
  }, [selectedBillboard]);

  // Load Street View Visuals from Cloud cache
  useEffect(() => {
    if (!selectedBillboard) return;
    
    setShowImgLoader(true);
    if (selectedBillboard.validation_status !== 'PENDING') {
      // Point to GAVI backend static storage directory, resolving dynamic paths if available
      if (selectedBillboard.streetview_image_path) {
        setStreetviewUrl(`${API_BASE}${selectedBillboard.streetview_image_path}`);
      } else {
        setStreetviewUrl(`${API_BASE}/storage/streetview/${selectedBillboard.id}_${selectedBillboard.lat.toFixed(5)}_${selectedBillboard.lng.toFixed(5)}.jpg`);
      }

      // Check if there is a cached bounding box dynamically returned from SQLite
      if (selectedBillboard.bounding_box) {
        try {
          const parsedBbox = typeof selectedBillboard.bounding_box === 'string'
            ? JSON.parse(selectedBillboard.bounding_box)
            : selectedBillboard.bounding_box;
          if (Array.isArray(parsedBbox) && parsedBbox.length === 4) {
            setBbox(parsedBbox);
          } else {
            const isWestSide = selectedBillboard.id === 'bb_west_side_highway';
            setBbox(isWestSide ? [180, 420, 310, 580] : [200, 150, 400, 480]);
          }
        } catch (e) {
          const isWestSide = selectedBillboard.id === 'bb_west_side_highway';
          setBbox(isWestSide ? [180, 420, 310, 580] : [200, 150, 400, 480]);
        }
      } else {
        const isWestSide = selectedBillboard.id === 'bb_west_side_highway';
        setBbox(isWestSide ? [180, 420, 310, 580] : [200, 150, 400, 480]);
      }
    } else {
      setStreetviewUrl('');
      setBbox(null);
    }
    
    const timer = setTimeout(() => setShowImgLoader(false), 400);
    return () => clearTimeout(timer);
  }, [
    selectedBillboard?.id, 
    selectedBillboard?.validation_status, 
    selectedBillboard?.streetview_image_path, 
    selectedBillboard?.bounding_box
  ]);

  // Load saved keys from localStorage on mount and sync them to the backend automatically
  useEffect(() => {
    const savedMapsKey = localStorage.getItem('gavi_maps_key') || '';
    const savedGeminiKey = localStorage.getItem('gavi_gemini_key') || '';
    if (savedMapsKey && savedGeminiKey && apiStatus === 'CONNECTED') {
      fetch(`${API_BASE}/api/v1/agent/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liveApiMode: true,
          confidenceThreshold: 0.70,
          mapsKey: savedMapsKey,
          geminiKey: savedGeminiKey
        })
      })
      .then(res => {
        if (res.ok) {
          console.log('✓ Dynamic keys auto-synced with GAVI backend.');
          fetchApiData();
        }
      })
      .catch(() => {});
    }
  }, [apiStatus]);

  // Push Dynamic API Keys to GAVI Node in the Cloud
  const handleConfigSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (apiStatus === 'OFFLINE') return;

    let finalMapsKey = mapsKey;
    let finalGeminiKey = geminiKey;

    if (mapsKey && geminiKey) {
      const mapsIsGeminiFormat = mapsKey.startsWith('gen-la') || mapsKey.startsWith('AQ') || mapsKey.includes('studio');
      const geminiIsMapsFormat = geminiKey.startsWith('AIzaSy') && !geminiKey.includes('studio');

      if (mapsIsGeminiFormat && geminiIsMapsFormat) {
        alert('⚠ GAVI Self-Correction: Detected that Google Maps API Key and Gemini API Key were entered in the wrong fields! GAVI has automatically swapped them to their correct roles.');
        finalMapsKey = geminiKey;
        finalGeminiKey = mapsKey;
        setMapsKey(finalMapsKey);
        setGeminiKey(finalGeminiKey);
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/agent/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liveApiMode: true,
          confidenceThreshold: 0.70,
          mapsKey: finalMapsKey,
          geminiKey: finalGeminiKey
        })
      });
      if (res.ok) {
        localStorage.setItem('gavi_maps_key', finalMapsKey);
        localStorage.setItem('gavi_gemini_key', finalGeminiKey);
        fetchApiData();
        alert('✓ Google API Keys synced with cloud GAVI agent node and saved locally.');
      }
    } catch (err) {}
  };

  const handleClearConfig = async () => {
    if (apiStatus === 'OFFLINE') return;

    try {
      const res = await fetch(`${API_BASE}/api/v1/agent/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liveApiMode: false,
          confidenceThreshold: 0.70,
          mapsKey: '',
          geminiKey: ''
        })
      });
      if (res.ok) {
        setMapsKey('');
        setGeminiKey('');
        localStorage.removeItem('gavi_maps_key');
        localStorage.removeItem('gavi_gemini_key');
        fetchApiData();
        alert('✓ Active credentials cleared. GAVI requires API keys to perform scans and validations.');
      }
    } catch (err: any) {
      alert('✗ Failed to clear credentials: ' + err.message);
    }
  };

  const handleResetSystem = async () => {
    if (apiStatus === 'OFFLINE') return;
    if (!confirm('Are you sure you want to perform a clean start? This will wipe all discovered billboards, cached visibility checks, daily logs, and clear active API keys.')) return;

    try {
      const res = await fetch(`${API_BASE}/api/v1/agent/reset`, {
        method: 'POST'
      });
      if (res.ok) {
        setMapsKey('');
        setGeminiKey('');
        localStorage.removeItem('gavi_maps_key');
        localStorage.removeItem('gavi_gemini_key');
        fetchApiData();
        alert('✓ System reset completed successfully. GAVI has been restored to fresh seeded defaults.');
      } else {
        alert('✗ Reset failed: ' + await res.text());
      }
    } catch (err: any) {
      alert('✗ Request error: ' + err.message);
    }
  };

  // Convert uploaded image file to base64
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Str = (reader.result as string).split(',')[1];
        setImageBase64(base64Str);
      };
      reader.readAsDataURL(file);
    }
  };

  // Wiz GPS Telemetry Push Integration
  const handleWizTelemetryPush = async () => {
    if (apiStatus === 'OFFLINE' || !selectedBillboard) return;
    
    // Construct trajectories relative to the selected billboard
    const targetLat = selectedBillboard.lat;
    const targetLng = selectedBillboard.lng;
    const targetBearing = selectedBillboard.observed_bearing ?? selectedBillboard.orientation_degrees;
    
    // We want a trajectory that is visible:
    // Moving towards the face of the billboard.
    // The opposite of the orientation degrees is the direction of travel.
    const oppositeFacing = (targetBearing + 180) % 360;
    
    // We start some distance away and move towards the billboard.
    const bearingRad = (targetBearing * Math.PI) / 180;
    
    // points along the vector (bearingRad) from the billboard
    const p1Lat = targetLat + Math.sin(bearingRad) * 0.0006;
    const p1Lng = targetLng + Math.cos(bearingRad) * 0.0006;
    
    const p2Lat = targetLat + Math.sin(bearingRad) * 0.0003;
    const p2Lng = targetLng + Math.cos(bearingRad) * 0.0003;
    
    const p3Lat = targetLat;
    const p3Lng = targetLng;

    const payload = {
      sector_id: selectedBillboard.sector_id || 'manhattan_west_side',
      timestamp: new Date().toISOString(),
      trajectories: [
        {
          id: `wiz_manual_vehicle_${Date.now()}`,
          mode: 'vehicle',
          points: [
            { lat: p1Lat, lng: p1Lng, timestamp: new Date(Date.now() - 4000).toISOString(), speed: 15.0, heading: oppositeFacing },
            { lat: p2Lat, lng: p2Lng, timestamp: new Date(Date.now() - 2000).toISOString(), speed: 15.0, heading: oppositeFacing },
            { lat: p3Lat, lng: p3Lng, timestamp: new Date().toISOString(), speed: 15.0, heading: oppositeFacing }
          ]
        },
        {
          id: `wiz_manual_pedestrian_${Date.now()}`,
          mode: 'pedestrian',
          points: [
            { lat: p2Lat + 0.0001, lng: p2Lng + 0.0001, timestamp: new Date().toISOString(), speed: 1.2, heading: oppositeFacing }
          ]
        }
      ]
    };

    try {
      const res = await fetch(`${API_BASE}/api/v1/exposure/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('✓ Snapped GPS trajectory telemetry successfully pushed from Wiz sub-agent.');
        fetchApiData();
      } else {
        alert('✗ Failed pushing trajectory: ' + await res.text());
      }
    } catch (e: any) {
      alert('✗ Connection error: ' + e.message);
    }
  };

  // GAVI Autonomous 360° Billboard Discovery Inflow
  const handleAutonomousDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (apiStatus === 'OFFLINE') return;

    if (!discoverLat || !discoverLng || isNaN(parseFloat(discoverLat)) || isNaN(parseFloat(discoverLng))) {
      alert('⚠ Please perform a location search first or enter valid Scan coordinates.');
      return;
    }

    const scanLat = parseFloat(discoverLat);
    const scanLng = parseFloat(discoverLng);
    setPanoLat(scanLat);
    setPanoLng(scanLng);
    if (panoInstanceRef.current) {
      panoInstanceRef.current.setPosition({ lat: scanLat, lng: scanLng });
    }

    setIsDiscovering(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/billboards/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: parseFloat(discoverLat),
          lng: parseFloat(discoverLng)
        })
      });
      if (res.ok) {
        const data = await res.json();
        fetchApiData();
        
        if (data.list && data.list.length > 0) {
          setSelectedBillboard(data.list[0]);
          alert(`✓ GAVI Agent completed 360° visual scan! Discovered and registered ${data.list.length} new billboards at this intersection!`);
        } else {
          alert('⚠ GAVI Agent completed 360° scan but found no billboard structures at this intersection.');
        }
      } else {
        let errMsg = await res.text();
        try {
          const parsed = JSON.parse(errMsg);
          if (parsed.error) errMsg = parsed.error;
        } catch (_) {}
        alert('✗ Discovery scan failed: ' + errMsg);
      }
    } catch (err: any) {
      alert('✗ Request error: ' + err.message);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleRemoveBillboard = async (id: string) => {
    if (apiStatus === 'OFFLINE') return;
    if (!window.confirm(`Are you sure you want to remove billboard ${id} and all its associated reports/images?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/v1/billboards/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert('✓ Billboard removed successfully!');
        if (selectedBillboard?.id === id) {
          setSelectedBillboard(null);
        }
        fetchApiData();
      } else {
        alert('✗ Removal failed: ' + await res.text());
      }
    } catch (err: any) {
      alert('✗ Request error: ' + err.message);
    }
  };

  // Bill Agent Push Registry Integration
  const handleBillAgentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (apiStatus === 'OFFLINE') return;

    const payload = {
      id: billId,
      sector_id: parseFloat(billLat) < 20.0 ? 'bangalore_marathahalli' : 'manhattan_west_side',
      lat: parseFloat(billLat),
      lng: parseFloat(billLng),
      height_agl: parseFloat(billHeight),
      face_width: parseFloat(billWidth),
      face_height: 5.0,
      orientation_degrees: parseFloat(billBearing),
      max_range_meters: 150.0,
      ad_image_base64: imageBase64 || undefined
    };

    try {
      const res = await fetch(`${API_BASE}/api/v1/billboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const newBillboard: Billboard = {
          id: payload.id,
          sector_id: payload.sector_id,
          lat: payload.lat,
          lng: payload.lng,
          height_agl: payload.height_agl,
          face_width: payload.face_width,
          face_height: payload.face_height,
          orientation_degrees: payload.orientation_degrees,
          max_range_meters: payload.max_range_meters,
          validation_status: 'PENDING'
        };
        const rad = (payload.orientation_degrees * Math.PI) / 180;
        const offsetDistance = 30; // 30 meters
        const roadLat = payload.lat + (offsetDistance * Math.cos(rad)) / 111111;
        const roadLng = payload.lng + (offsetDistance * Math.sin(rad)) / (111111 * Math.cos(payload.lat * Math.PI / 180));
        const headingToBb = (payload.orientation_degrees + 180) % 360;

        setSelectedBillboard(newBillboard);
        setPanoLat(roadLat);
        setPanoLng(roadLng);
        setPanoHeading(headingToBb);
        setViewMode('interactive');

        if (panoInstanceRef.current) {
          panoInstanceRef.current.setPosition({ lat: roadLat, lng: roadLng });
          panoInstanceRef.current.setPov({ heading: headingToBb, pitch: 10 });
        }

        fetchApiData();
        setBillId(`bb_ts_${Math.floor(Math.random() * 1000)}`);
        setImageBase64('');
        alert('✓ Billboard specs registered successfully!');
      } else {
        alert('✗ Ingestion failed: ' + await res.text());
      }
    } catch (err: any) {
      alert('✗ Request error: ' + err.message);
    }
  };

  // Wiz GPS Stream Simulator Particle generator
  useEffect(() => {
    if (!isSimulating || !selectedBillboard) return;

    const interval = setInterval(() => {
      // Spawn simulated vehicle/pedestrian trajectory points around the selected billboard coordinates!
      const isVehicle = Math.random() < 0.7;
      const offsetLat = (Math.random() - 0.5) * 0.002;
      const offsetLng = (Math.random() - 0.5) * 0.002;

      const newP: SimulatedParticle = {
        id: `wiz_live_${Date.now()}`,
        mode: isVehicle ? 'vehicle' : 'pedestrian',
        lat: selectedBillboard.lat + offsetLat,
        lng: selectedBillboard.lng + offsetLng,
        speed: isVehicle ? 12 + Math.random() * 8 : 1.2 + Math.random() * 0.5,
        heading: Math.random() * 360,
        isExposed: false
      };

      if (isVehicle) setTotalVehiclesSimulated(v => v + 1);
      else setTotalPedestriansSimulated(p => p + 1);

      setParticles(prev => [...prev, newP]);
    }, 1600);

    return () => clearInterval(interval);
  }, [isSimulating, selectedBillboard]);

  // Canvas radar renderer mapping geodesic locations to local canvas dimensions!
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const anchorLat = selectedBillboard ? selectedBillboard.lat : (panoLat ?? 12.956948);
    const anchorLng = selectedBillboard ? selectedBillboard.lng : (panoLng ?? 77.701502);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const scale = 250000; // coordinate scale factor to fit in 600px canvas

    let frameId: number;

    const draw = () => {
      ctx.fillStyle = '#080710';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 1. Draw Radar Sweep Rings
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.08)';
      ctx.lineWidth = 1;
      for (let r = 50; r <= 200; r += 50) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Draw crosshairs
      ctx.beginPath();
      ctx.moveTo(centerX - 220, centerY);
      ctx.lineTo(centerX + 220, centerY);
      ctx.moveTo(centerX, centerY - 180);
      ctx.lineTo(centerX, centerY + 180);
      ctx.stroke();

      // 2. Draw Billboard Cones
      billboards.forEach(bb => {
        // Calculate offsets relative to the selected anchor (center anchor)
        const latDiff = bb.lat - anchorLat;
        const lngDiff = bb.lng - anchorLng;

        const bx = centerX + lngDiff * scale;
        const by = centerY - latDiff * scale;
        const radius = bb.max_range_meters * 0.8;

        const bearingAngle = bb.observed_bearing ?? bb.orientation_degrees;
        const canvasRad = ((bearingAngle - 90) * Math.PI) / 180;
        const start = canvasRad - (60 * Math.PI) / 180;
        const end = canvasRad + (60 * Math.PI) / 180;

        const g = ctx.createRadialGradient(bx, by, 3, bx, by, radius);
        if (bb.validation_status === 'VERIFIED') {
          g.addColorStop(0, 'rgba(0, 242, 254, 0.2)');
          g.addColorStop(1, 'rgba(0, 242, 254, 0)');
          ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        } else if (bb.validation_status === 'MISALIGNED') {
          g.addColorStop(0, 'rgba(255, 230, 0, 0.2)');
          g.addColorStop(1, 'rgba(255, 230, 0, 0)');
          ctx.strokeStyle = 'rgba(255, 230, 0, 0.4)';
        } else {
          g.addColorStop(0, 'rgba(255, 0, 128, 0.1)');
          g.addColorStop(1, 'rgba(255, 0, 128, 0)');
          ctx.strokeStyle = 'rgba(255, 0, 128, 0.2)';
        }

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.arc(bx, by, radius, start, end);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Signboard
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(canvasRad + Math.PI / 2);
        ctx.fillStyle = '#080710';
        ctx.strokeStyle = selectedBillboard && bb.id === selectedBillboard.id ? '#00f2fe' : '#ffe600';
        ctx.lineWidth = selectedBillboard && bb.id === selectedBillboard.id ? 3 : 1.5;
        ctx.beginPath();
        ctx.rect(-bb.face_width / 2, -2, bb.face_width, 4);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px "Share Tech Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(bb.id.toUpperCase(), 0, -8);
        ctx.restore();
      });

      // 2.5 Draw Interactive Camera Position & POV Cone
      if (viewMode === 'interactive' && panoLat !== null && panoLng !== null) {
        const camLatDiff = panoLat - anchorLat;
        const camLngDiff = panoLng - anchorLng;
        const cx = centerX + camLngDiff * scale;
        const cy = centerY - camLatDiff * scale;

        // Draw camera position dot (cyan with glowing shadow)
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#00f2fe';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00f2fe';
        ctx.fill();
        ctx.shadowBlur = 0; // reset shadow
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw FOV Cone (90 degrees, +/- 45 deg)
        const camCanvasRad = ((panoHeading - 90) * Math.PI) / 180;
        const fovStart = camCanvasRad - (45 * Math.PI) / 180;
        const fovEnd = camCanvasRad + (45 * Math.PI) / 180;
        const fovRadius = 80;

        const fovGradient = ctx.createRadialGradient(cx, cy, 3, cx, cy, fovRadius);
        fovGradient.addColorStop(0, 'rgba(0, 242, 254, 0.25)');
        fovGradient.addColorStop(1, 'rgba(0, 242, 254, 0)');

        ctx.fillStyle = fovGradient;
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, fovRadius, fovStart, fovEnd);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // If there's a selected billboard, calculate visual sightline intersection
        if (selectedBillboard) {
          const targetBearing = selectedBillboard.observed_bearing ?? selectedBillboard.orientation_degrees;
          const dyCam = panoLat - selectedBillboard.lat;
          const dxCam = (panoLng - selectedBillboard.lng) * Math.cos(selectedBillboard.lat * Math.PI / 180);
          let bearingToCam = Math.atan2(dxCam, dyCam) * 180 / Math.PI;
          if (bearingToCam < 0) bearingToCam += 360;

          let exposureDiff = Math.abs(targetBearing - bearingToCam) % 360;
          if (exposureDiff > 180) exposureDiff = 360 - exposureDiff;
          const insideBbCone = exposureDiff <= 60; // 120 deg aperture

          let bearingToBb = (bearingToCam + 180) % 360;
          let fovDiff = Math.abs(panoHeading - bearingToBb) % 360;
          if (fovDiff > 180) fovDiff = 360 - fovDiff;
          const insideCamFov = fovDiff <= 45; // 90 deg FOV

          const latDiffM = (selectedBillboard.lat - panoLat) * 111111;
          const lngDiffM = (selectedBillboard.lng - panoLng) * 111111 * Math.cos(panoLat * Math.PI / 180);
          const distM = Math.sqrt(latDiffM * latDiffM + lngDiffM * lngDiffM);
          const withinRange = distM <= selectedBillboard.max_range_meters;

          const sightlineLocked = insideBbCone && insideCamFov && withinRange;

          // Draw sightline connecting camera to center selected billboard
          if (sightlineLocked) {
            ctx.strokeStyle = '#00ff66';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#00ff66';
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(centerX, centerY);
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#00ff66';
            ctx.font = 'bold 9px "Share Tech Mono"';
            ctx.textAlign = 'center';
            ctx.fillText('SIGHTLINE LOCKED', (cx + centerX) / 2, (cy + centerY) / 2 - 5);
          } else {
            ctx.strokeStyle = 'rgba(255, 0, 127, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(centerX, centerY);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      // 3. Update & Draw Particles (Snapping Wiz GPS Coordinates relative to center)
      setParticles(prev => {
        const next: SimulatedParticle[] = [];

        prev.forEach(p => {
          const latDiff = p.lat - anchorLat;
          const lngDiff = p.lng - anchorLng;

          const px = centerX + lngDiff * scale;
          const py = centerY - latDiff * scale;

          if (px < 0 || px > canvas.width || py < 0 || py > canvas.height) return;

          let isExposed = false;
          let matchedId = '';

          billboards.forEach(bb => {
            const dx = bb.lat - p.lat;
            const dy = bb.lng - p.lng;
            const degDist = Math.sqrt(dx * dx + dy * dy);
            
            if (degDist <= 0.0012) {
              const bearingAngle = bb.observed_bearing ?? bb.orientation_degrees;
              const opposite = (bearingAngle + 180) % 360;
              let diff = Math.abs(p.heading - opposite) % 360;
              if (diff > 180) diff = 360 - diff;

              if (diff <= 90 || p.mode === 'pedestrian') {
                isExposed = true;
                matchedId = bb.id;
              }
            }
          });

          if (isExposed && !p.isExposed) {
            setTotalImpressions(c => c + 1);
          }

          ctx.beginPath();
          ctx.arc(px, py, p.mode === 'vehicle' ? 4 : 2.5, 0, 2 * Math.PI);
          ctx.fillStyle = p.mode === 'vehicle' ? 'hsl(180, 100%, 50%)' : 'hsl(320, 100%, 50%)';
          
          if (isExposed) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = p.mode === 'vehicle' ? 'hsl(180, 100%, 50%)' : 'hsl(320, 100%, 50%)';
            ctx.fill();
            ctx.shadowBlur = 0;
            
            const match = billboards.find(b => b.id === matchedId);
            if (match) {
              // Calculate offset of matched billboard relative to current anchor
              const mbx = centerX + (match.lng - anchorLng) * scale;
              const mby = centerY - (match.lat - anchorLat) * scale;
              ctx.strokeStyle = 'rgba(255, 230, 0, 0.3)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(mbx, mby);
              ctx.stroke();
            }
          } else {
            ctx.fill();
          }

          next.push({
            ...p,
            lat: p.lat - Math.sin((p.heading * Math.PI) / 180) * 0.00002,
            lng: p.lng + Math.cos((p.heading * Math.PI) / 180) * 0.00002,
            isExposed,
            matchedBillboardId: matchedId
          });
        });

        return next;
      });

      frameId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frameId);
  }, [billboards, selectedBillboard, viewMode, panoLat, panoLng, panoHeading, panoPitch]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* 1. Header Navigation */}
      <header className="glass-panel" style={{ borderRadius: '0', borderBottom: '1px solid var(--border-glow)', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity size={24} color="hsl(180, 100%, 50%)" className="pulse-glow" />
          <h1 style={{ margin: '0', fontSize: '20px', fontFamily: '"Orbitron", sans-serif', letterSpacing: '2px', fontWeight: 'bold' }}>
            GAVI <span style={{ color: 'var(--text-slate)', fontSize: '11px', fontFamily: '"Share Tech Mono", monospace' }}>SPATIAL AD INTEL GATEWAY v2.0</span>
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontFamily: '"Share Tech Mono", monospace', fontSize: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={14} />
            CLOUDRUN NODE: <span className={apiStatus === 'CONNECTED' ? 'glow-cyan' : ''} style={{ color: apiStatus === 'CONNECTED' ? 'var(--neon-cyan)' : '#f44336' }}>{apiStatus}</span>
          </div>
          <button 
            onClick={() => setShowContracts(!showContracts)}
            style={{ background: 'transparent', border: '1px solid var(--border-glow)', color: '#fff', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Code size={12} /> API Contracts
          </button>
        </div>
      </header>

      {/* 2. Main Workspace layout split */}
      <div style={{ flex: '1', display: 'flex', overflow: 'hidden' }}>

        {/* Left Control Center: Keys Config & Bill Ingress */}
        <section className="glass-panel" style={{ width: '330px', borderLeft: 'none', borderTop: 'none', borderBottom: 'none', borderRadius: '0', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Dynamic API Configuration Credentials */}
          <div>
            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-slate)', letterSpacing: '1px', marginTop: '0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Key size={14} /> Cloud Auth Credentials
            </h2>
            <form onSubmit={handleConfigSync} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', fontSize: '11px' }}>
              <div>
                <label>Google Maps API Key</label>
                <input 
                  type="password" value={mapsKey} onChange={(e) => setMapsKey(e.target.value)} placeholder="AIzaSy..."
                  style={{ width: '92%', background: '#0e0d16', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px', borderRadius: '4px', marginTop: '4px' }}
                />
              </div>
              <div>
                <label>Gemini API Key</label>
                <input 
                  type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIzaSy..."
                  style={{ width: '92%', background: '#0e0d16', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px', borderRadius: '4px', marginTop: '4px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button 
                  type="submit" 
                  disabled={apiStatus === 'OFFLINE'}
                  style={{ flex: 1, background: 'rgba(0, 242, 254, 0.08)', border: '1px solid var(--border-glow)', color: '#fff', padding: '8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Authenticate
                </button>
                <button 
                  type="button"
                  onClick={handleClearConfig}
                  disabled={apiStatus === 'OFFLINE'}
                  style={{ flex: 1, background: 'rgba(255, 0, 127, 0.08)', border: '1px solid rgba(255, 0, 127, 0.3)', color: '#fff', padding: '8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Clear Keys
                </button>
              </div>
              <button 
                type="button" 
                onClick={handleResetSystem}
                disabled={apiStatus === 'OFFLINE'}
                style={{ width: '100%', background: 'rgba(255, 170, 0, 0.08)', border: '1px solid rgba(255, 170, 0, 0.3)', color: '#fff', padding: '8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' }}
              >
                Reset System (Fresh Start)
              </button>
            </form>
          </div>

          <hr style={{ borderColor: 'rgba(0, 242, 254, 0.1)', margin: '0' }} />

          {/* Bill Sub-Agent configuration */}
          <div>
            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-slate)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} /> "Bill" Ingress (GPS & Specs)
            </h2>
            <form onSubmit={handleBillAgentRegister} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', fontSize: '11px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '8px' }}>
                <div>
                  <label>ID</label>
                  <input type="text" value={billId} onChange={(e) => setBillId(e.target.value)} style={{ width: '90%', background: '#0e0d16', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px', borderRadius: '4px', marginTop: '4px' }} />
                </div>
                <div>
                  <label>Orientation (θ)</label>
                  <input type="number" min="0" max="360" value={billBearing} onChange={(e) => setBillBearing(e.target.value)} style={{ width: '90%', background: '#0e0d16', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px', borderRadius: '4px', marginTop: '4px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label>Latitude</label>
                  <input type="text" value={billLat} onChange={(e) => setBillLat(e.target.value)} style={{ width: '90%', background: '#0e0d16', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px', borderRadius: '4px', marginTop: '4px' }} />
                </div>
                <div>
                  <label>Longitude</label>
                  <input type="text" value={billLng} onChange={(e) => setBillLng(e.target.value)} style={{ width: '90%', background: '#0e0d16', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px', borderRadius: '4px', marginTop: '4px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label>Height (AGL)</label>
                  <input type="number" min="2" max="30" value={billHeight} onChange={(e) => setBillHeight(e.target.value)} style={{ width: '90%', background: '#0e0d16', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px', borderRadius: '4px', marginTop: '4px' }} />
                </div>
                <div>
                  <label>Width</label>
                  <input type="number" min="5" max="30" value={billWidth} onChange={(e) => setBillWidth(e.target.value)} style={{ width: '90%', background: '#0e0d16', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px', borderRadius: '4px', marginTop: '4px' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: '#0e0d16', border: '1px dashed var(--border-glow)', padding: '10px', borderRadius: '4px', marginTop: '4px', justifyContent: 'center' }}>
                  <Upload size={14} /> Upload Billboard Ad Design
                  <input 
                    type="file" accept="image/*" onChange={handleImageFileChange} 
                    style={{ display: 'none' }}
                  />
                </label>
                {imageBase64 && <div style={{ color: 'var(--neon-cyan)', fontSize: '9px', marginTop: '4px', textAlign: 'center' }}>✓ Ad Image loaded. (Size: {Math.round(imageBase64.length/1024)}KB)</div>}
              </div>

              <button 
                type="submit" 
                disabled={apiStatus === 'OFFLINE'}
                style={{ width: '100%', background: 'rgba(0, 242, 254, 0.08)', border: '1px solid var(--border-glow)', color: '#fff', padding: '8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '4px' }}
              >
                Ingest Billboard Parameters
              </button>
            </form>
          </div>

          <hr style={{ borderColor: 'rgba(0, 242, 254, 0.1)', margin: '0' }} />

          {/* GAVI Autonomous Discovery Panel */}
          <div>
            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-slate)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={14} className={isDiscovering ? 'pulse-glow spin' : ''} /> GAVI Autonomous Discovery
            </h2>
            <p style={{ fontSize: '10px', color: 'var(--text-slate)', lineHeight: '1.4', margin: '4px 0 8px 0' }}>
              Search for a location using Gmaps Geocoding to automatically center the active Street View camera and Radar workspace.
            </p>

            {/* Gmaps Geocoding Search GUI */}
            <form onSubmit={handleLocationSearch} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input 
                type="text" 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                placeholder="Search address..."
                style={{ flex: 1, background: '#0e0d16', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px', borderRadius: '4px', fontSize: '11px' }}
              />
              <button 
                type="submit"
                disabled={!mapsKey || !mapsLoaded}
                style={{ background: 'rgba(0, 242, 254, 0.08)', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}
              >
                Search
              </button>
            </form>

            <p style={{ fontSize: '10px', color: 'var(--text-slate)', lineHeight: '1.4', margin: '4px 0 8px 0' }}>
              Or scan an intersection coordinate. GAVI queries Street View 360° and uses Gemini VLM to discover billboards.
            </p>
            <form onSubmit={handleAutonomousDiscovery} style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label>Scan Latitude</label>
                  <input type="text" value={discoverLat} onChange={(e) => setDiscoverLat(e.target.value)} style={{ width: '90%', background: '#0e0d16', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px', borderRadius: '4px', marginTop: '4px' }} />
                </div>
                <div>
                  <label>Scan Longitude</label>
                  <input type="text" value={discoverLng} onChange={(e) => setDiscoverLng(e.target.value)} style={{ width: '90%', background: '#0e0d16', border: '1px solid var(--border-glow)', color: '#fff', padding: '6px', borderRadius: '4px', marginTop: '4px' }} />
                </div>
              </div>
              <button 
                type="submit" 
                disabled={apiStatus === 'OFFLINE' || isDiscovering}
                style={{ width: '100%', background: 'rgba(255, 230, 0, 0.08)', border: '1px solid #ffe600', color: '#ffe600', padding: '8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                {isDiscovering ? (
                  'Scanning 360° Lens...'
                ) : (
                  'Run Autonomous Discovery'
                )}
              </button>
            </form>
          </div>

          <hr style={{ borderColor: 'rgba(0, 242, 254, 0.1)', margin: '0' }} />

          {/* Billboard selection */}
          <div>
            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-slate)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Eye size={14} /> Active Billboard Registry
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              {billboards.map(b => (
                <div 
                  key={b.id}
                  onClick={() => setSelectedBillboard(b)}
                  className="glow-border-cyan"
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: selectedBillboard?.id === b.id ? 'var(--neon-cyan)' : 'var(--border-glow)',
                    background: selectedBillboard?.id === b.id ? 'rgba(0, 242, 254, 0.04)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', fontFamily: '"Share Tech Mono", monospace' }}>
                    <span>{b.id}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ 
                        color: b.validation_status === 'VERIFIED' ? 'var(--neon-cyan)' : 
                               b.validation_status === 'MISALIGNED' ? 'var(--neon-yellow)' : 'var(--neon-magenta)' 
                      }}>{b.validation_status}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveBillboard(b.id);
                        }}
                        title="Remove Billboard"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ff4d4d',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                          opacity: 0.7,
                          transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-slate)', marginTop: '6px', fontSize: '9px' }}>
                    <span>Coordinates: {b.lat.toFixed(4)}, {b.lng.toFixed(4)}</span>
                    <span>H: {b.height_agl}m</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </section>

        {/* Center Grid Map Visualizer & bottom Logs */}
        <main style={{ flex: '1', position: 'relative', display: 'flex', flexDirection: 'column', background: '#040308', borderRight: '1px solid var(--border-glow)' }}>
          
          {showContracts ? (
            // Collapsible API Code Reference documentation panel
            <div className="glass-panel" style={{ flex: '1', margin: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: '0', fontSize: '16px', fontFamily: '"Orbitron", sans-serif' }}>GAVI Multi-Agent Integration Contracts</h2>
                <button onClick={() => setShowContracts(false)} style={{ background: 'transparent', border: '1px solid var(--border-glow)', color: '#fff', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px' }}>Close</button>
              </div>

              <div>
                <h3 style={{ fontSize: '13px', color: 'var(--neon-cyan)', margin: '0 0 8px 0' }}>1. BILL SUB-AGENT (Billboard Spec API)</h3>
                <pre style={{ background: '#0e0d16', border: '1px solid var(--border-glow)', padding: '10px', borderRadius: '6px', fontSize: '10px', overflowX: 'auto', color: '#8f9bb3' }}>
{`POST http://localhost:3001/api/v1/billboards
Content-Type: application/json

{
  "id": "bb_times_square_01",
  "sector_id": "manhattan_west_side",
  "lat": 40.7582,
  "lng": -73.9856,
  "height_agl": 8.0,          // Elevation (Height Above Ground)
  "face_width": 15.0,          // Breadth/Width of sign
  "face_height": 5.0,         // Height of sign
  "orientation_degrees": 90.0, // Face angle (0-360)
  "max_range_meters": 150.0,
  "ad_image_base64": "iVBORw0KGgoAAA..." // Optional reference design image
}`}
                </pre>
              </div>

              <div>
                <h3 style={{ fontSize: '13px', color: 'var(--neon-magenta)', margin: '0 0 8px 0' }}>2. WIZ SUB-AGENT (GPS Trajectory API)</h3>
                <pre style={{ background: '#0e0d16', border: '1px solid var(--border-glow)', padding: '10px', borderRadius: '6px', fontSize: '10px', overflowX: 'auto', color: '#8f9bb3' }}>
{`POST http://localhost:3001/api/v1/exposure/analyze
Content-Type: application/json

{
  "sector_id": "manhattan_west_side",
  "timestamp": "2026-06-09T18:00:00Z",
  "trajectories": [
    {
      "id": "wiz_traj_101",
      "mode": "vehicle", // "vehicle" or "pedestrian"
      "points": [
        { 
          "lat": 40.7582, 
          "lng": -73.9845, 
          "timestamp": "2026-06-09T18:00:01Z", 
          "speed": 12.5, 
          "heading": 270.0 // Travel heading direction
        }
      ]
    }
  ]
}`}
                </pre>
              </div>
            </div>
          ) : (
            <div style={{ flex: '1', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <canvas 
                ref={canvasRef} 
                width={540} 
                height={420} 
                style={{ border: '1px solid var(--border-glow)', borderRadius: '8px', background: '#080710' }}
              />
            </div>
          )}

          {/* Floating Canvas Stats */}
          {!showContracts && selectedBillboard && (
            <div style={{ position: 'absolute', top: '20px', left: '20px', display: 'flex', gap: '10px', fontSize: '11px' }}>
              <div className="glass-panel" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Car size={12} color="var(--neon-cyan)" /> Vehicles: {totalVehiclesSimulated}
              </div>
              <div className="glass-panel" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={12} color="var(--neon-magenta)" /> Pedestrians: {totalPedestriansSimulated}
              </div>
              <div className="glass-panel" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', borderColor: 'var(--neon-yellow)' }}>
                <Eye size={12} color="var(--neon-yellow)" /> Total VAI: {totalImpressions}
              </div>
            </div>
          )}

          {/* Bottom Panel: GAVI Agent Terminal Logs */}
          <section className="glass-panel" style={{ height: '170px', borderRadius: '0', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-slate)', letterSpacing: '1.5px', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={12} /> GAVI Cloud Agent Thought Logs
            </h2>
            <div 
              style={{
                flex: '1',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-glow)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: '10px',
                color: 'var(--neon-cyan)',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px'
              }}
            >
              {agentStatus.logs.map((log, index) => (
                <div key={index} style={{ borderBottom: '1px solid rgba(0, 242, 254, 0.02)', paddingBottom: '3px' }}>
                  {log}
                </div>
              ))}
            </div>
          </section>

        </main>

        {/* Right Panel: Street View Visual & Bounding Box */}
        <section className="glass-panel" style={{ width: '340px', borderRight: 'none', borderTop: 'none', borderBottom: 'none', borderRadius: '0', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Street View Panel (General Module) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-slate)', letterSpacing: '1px', margin: '0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Eye size={14} /> Street View Ingestion Lens
            </h2>

            {/* View Mode Toggle */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
              <button
                type="button"
                onClick={() => setViewMode('static')}
                style={{
                  flex: 1,
                  background: viewMode === 'static' ? 'rgba(0, 242, 254, 0.15)' : 'rgba(14, 13, 22, 0.6)',
                  border: '1px solid',
                  borderColor: viewMode === 'static' ? 'var(--neon-cyan)' : 'var(--border-glow)',
                  color: '#fff',
                  padding: '6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                Static VLM Overlay
              </button>
              <button
                type="button"
                onClick={() => setViewMode('interactive')}
                style={{
                  flex: 1,
                  background: viewMode === 'interactive' ? 'rgba(0, 242, 254, 0.15)' : 'rgba(14, 13, 22, 0.6)',
                  border: '1px solid',
                  borderColor: viewMode === 'interactive' ? 'var(--neon-cyan)' : 'var(--border-glow)',
                  color: '#fff',
                  padding: '6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                Interactive 360° Pano
              </button>
            </div>
            
            {viewMode === 'static' ? (
              showImgLoader ? (
                <div style={{ height: `${panoHeight}px`, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0e0d16', border: '1px solid var(--border-glow)', borderRadius: '6px', color: 'var(--neon-cyan)', fontFamily: '"Share Tech Mono", monospace', fontSize: '11px' }}>
                  <Activity size={18} className="pulse-glow" style={{ marginRight: '6px' }} /> Fetching Street View Pano...
                </div>
              ) : selectedBillboard && streetviewUrl ? (
                <div style={{ position: 'relative', width: '100%', height: `${panoHeight}px`, border: '1px solid var(--border-glow)', borderRadius: '6px', overflow: 'hidden', background: '#000' }}>
                  <img 
                    src={streetviewUrl} 
                    alt="Street View Pano" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  
                  {/* Draw Bounding Box Overlay if coordinates are present */}
                  {bbox && (
                    <div 
                      style={{
                        position: 'absolute',
                        border: '2px solid var(--neon-cyan)',
                        boxShadow: '0 0 8px var(--neon-cyan)',
                        top: `${(bbox[0] / 1000) * 100}%`,
                        left: `${(bbox[1] / 1000) * 100}%`,
                        width: `${((bbox[3] - bbox[1]) / 1000) * 100}%`,
                        height: `${((bbox[2] - bbox[0]) / 1000) * 100}%`,
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'flex-start'
                      }}
                    >
                      <span style={{ background: 'var(--neon-cyan)', color: '#000', fontSize: '7px', fontWeight: 'bold', padding: '1px 3px', fontFamily: 'monospace' }}>
                        BILLBOARD: {Math.round(selectedBillboard?.observed_confidence ? selectedBillboard.observed_confidence * 100 : 94)}%
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ height: `${panoHeight}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#0e0d16', border: '1px dashed var(--border-glow)', borderRadius: '6px', color: 'var(--text-slate)', textAlign: 'center', padding: '12px' }}>
                  <AlertCircle size={20} style={{ marginBottom: '8px', color: 'var(--neon-yellow)' }} />
                  <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{selectedBillboard ? "Validation Pending" : "No Billboard Selected"}</span>
                  <span style={{ fontSize: '9px', marginTop: '4px' }}>{selectedBillboard ? "Trigger the Wiz or Bill sub-agent to invoke GAVI's VLM check." : "Select or ingest a billboard to view static VLM verification overlays."}</span>
                </div>
              )
            ) : (
              // Interactive 360° Pano Mode
              !mapsKey ? (
                <div style={{ height: `${panoHeight}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#0e0d16', border: '1px dashed var(--neon-magenta)', borderRadius: '6px', color: 'var(--text-slate)', textAlign: 'center', padding: '12px' }}>
                  <AlertCircle size={20} style={{ marginBottom: '8px', color: 'var(--neon-magenta)' }} />
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#ff3d71' }}>Google Maps Key Required</span>
                  <span style={{ fontSize: '9px', marginTop: '4px', color: 'var(--text-slate)' }}>Configure your Google Maps API Key in the Cloud Auth panel to load the interactive Street View Panorama.</span>
                </div>
              ) : !mapsLoaded ? (
                <div style={{ height: `${panoHeight}px`, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0e0d16', border: '1px solid var(--border-glow)', borderRadius: '6px', color: 'var(--neon-cyan)', fontFamily: '"Share Tech Mono", monospace', fontSize: '11px' }}>
                  <Activity size={18} className="pulse-glow" style={{ marginRight: '6px' }} /> Loading Google Maps API...
                </div>
              ) : (
                <div style={{ position: 'relative', width: '100%', height: `${panoHeight}px`, border: '1px solid var(--border-glow)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div ref={panoRef} style={{ width: '100%', height: '100%', background: '#000' }} />
                </div>
              )
            )}

            {/* Resizable Height Handle */}
            <div 
              onMouseDown={handleResizeStart}
              style={{
                height: '6px',
                cursor: 'row-resize',
                background: 'rgba(0, 242, 254, 0.1)',
                borderTop: '1px solid var(--border-glow)',
                borderBottom: '1px solid var(--border-glow)',
                margin: '4px 0 10px 0',
                transition: 'background 0.2s',
                borderRadius: '3px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--neon-cyan)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 242, 254, 0.1)'}
            />

            {viewMode === 'interactive' && mapsLoaded && (
              <button
                type="button"
                onClick={handleExtractFromPov}
                disabled={panoLat === null}
                style={{
                  width: '100%',
                  background: 'rgba(0, 242, 254, 0.08)',
                  border: '1px solid var(--border-glow)',
                  color: '#fff',
                  padding: '8px',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  marginTop: '2px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <MapPin size={12} color="var(--neon-cyan)" /> Select Specs from current POV
              </button>
            )}
          </div>

          <hr style={{ borderColor: 'rgba(0, 242, 254, 0.1)', margin: '0' }} />

          {/* GAVI Efficiency & Usage Lens */}
          <div>
            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-slate)', letterSpacing: '1px', marginTop: '0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={14} /> GAVI Efficiency & Usage Lens
            </h2>
            
            {/* Keys Connectivity Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '9px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-glow)', marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Maps API Key:</span>
                <span style={{ color: agentStatus.config.mapsKeyMasked !== 'NOT_CONFIGURED' ? 'var(--neon-cyan)' : 'var(--neon-magenta)', fontFamily: 'monospace' }}>
                  {agentStatus.config.mapsKeyMasked}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Gemini API Key:</span>
                <span style={{ color: agentStatus.config.geminiKeyMasked !== 'NOT_CONFIGURED' ? 'var(--neon-cyan)' : 'var(--neon-magenta)', fontFamily: 'monospace' }}>
                  {agentStatus.config.geminiKeyMasked}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px', textAlign: 'center', fontSize: '9px' }}>
              <div className="glass-panel" style={{ padding: '6px' }}>
                <div style={{ color: 'var(--text-slate)' }}>Road Snaps</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: '"Share Tech Mono", monospace', marginTop: '4px', color: 'var(--neon-cyan)' }}>
                  {agentStatus.stats.roadsApiCalls || 0}
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '6px' }}>
                <div style={{ color: 'var(--text-slate)' }}>Street View downloads</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: '"Share Tech Mono", monospace', marginTop: '4px', color: 'var(--neon-cyan)' }}>
                  {agentStatus.stats.streetviewDownloadCalls || 0}
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '6px' }}>
                <div style={{ color: 'var(--text-slate)' }}>Gemini VLM Calls</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: '"Share Tech Mono", monospace', marginTop: '4px', color: 'var(--neon-magenta)' }}>
                  {agentStatus.stats.geminiVlmCalls || 0}
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '6px' }}>
                <div style={{ color: 'var(--text-slate)' }}>Cache Hit Savings</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: '"Share Tech Mono", monospace', marginTop: '4px', color: 'var(--neon-cyan)' }}>
                  {agentStatus.stats.cacheHits || 0}
                </div>
              </div>
            </div>

            {/* Financial & Efficiency Analysis */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '9px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-glow)', marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Estimated Direct Cost:</span>
                <span style={{ color: '#ff3d71', fontFamily: 'monospace', fontWeight: 'bold' }}>
                  ${((agentStatus.stats.roadsApiCalls || 0) * 0.01 + (agentStatus.stats.streetviewDownloadCalls || 0) * 0.007 + (agentStatus.stats.geminiVlmCalls || 0) * 0.00015).toFixed(4)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Estimated Agent Savings:</span>
                <span style={{ color: 'var(--neon-cyan)', fontFamily: 'monospace', fontWeight: 'bold' }}>
                  ${((agentStatus.stats.cacheHits || 0) * 0.00715).toFixed(4)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(0,242,254,0.05)', paddingTop: '4px', marginTop: '4px' }}>
                <span>Agent Cache Efficiency:</span>
                <span style={{ color: 'var(--neon-yellow)', fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {((agentStatus.stats.cacheHits || 0) + (agentStatus.stats.streetviewDownloadCalls || 0)) > 0
                    ? `${Math.round(((agentStatus.stats.cacheHits || 0) / ((agentStatus.stats.cacheHits || 0) + (agentStatus.stats.streetviewDownloadCalls || 0))) * 100)}%`
                    : '100%'}
                </span>
              </div>
            </div>
          </div>

          <hr style={{ borderColor: 'rgba(0, 242, 254, 0.1)', margin: '0' }} />

          {/* Billboard-Specific Controls */}
          {!selectedBillboard ? (
            <div 
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px 16px',
                border: '1px dashed rgba(0, 242, 254, 0.15)',
                borderRadius: '8px',
                background: 'rgba(0, 0, 0, 0.2)',
                textAlign: 'center',
                margin: '20px 0',
                color: 'var(--text-slate)'
              }}
            >
              <AlertCircle size={24} style={{ color: 'var(--neon-cyan)', marginBottom: '10px' }} />
              <h3 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#fff', fontFamily: '"Orbitron", sans-serif' }}>No Billboard Selected</h3>
              <p style={{ fontSize: '10px', margin: '0', lineHeight: '1.4' }}>
                Please create a new billboard via the "Bill" Ingress form or select an active billboard registry entry to begin spatial visual analysis and simulations.
              </p>
            </div>
          ) : (
            <>
              {/* "Wiz" Agent GPS Telemetry Simulator */}
              <div>
                <h2 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-slate)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Send size={14} /> "Wiz" Sub-Agent Ingress
                </h2>
                <p style={{ fontSize: '10px', color: 'var(--text-slate)', lineHeight: '1.4', margin: '6px 0 10px 0' }}>
                  Force simulate the Wiz agent pushing snapped GPS telemetry to GAVI's analyze routes.
                </p>
                <button
                  onClick={handleWizTelemetryPush}
                  disabled={apiStatus === 'OFFLINE' || !selectedBillboard}
                  className="glow-border-cyan"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(0, 242, 254, 0.08)',
                    border: '1px solid var(--border-glow)',
                    color: '#fff',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontFamily: '"Orbitron", sans-serif',
                    fontSize: '11px'
                  }}
                >
                  Simulate Wiz Trajectory Push
                </button>
              </div>

              {selectedBillboard && (
                (() => {
                  const { bvi, povMatch, audienceExposure, suggestions } = calculateBvi();
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-glow)', marginTop: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-slate)', letterSpacing: '0.5px' }}>Visibility Index:</span>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 'bold',
                          fontFamily: '"Share Tech Mono", monospace',
                          color: bvi > 80 ? '#00ff66' : bvi > 50 ? 'var(--neon-yellow)' : bvi > 0 ? 'var(--neon-magenta)' : '#888'
                        }}>
                          {bvi}% {bvi > 80 ? 'EXCELLENT' : bvi > 50 ? 'GOOD' : bvi > 0 ? 'POOR' : 'NOT VISIBLE'}
                        </span>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '9px', borderTop: '1px solid rgba(0,242,254,0.05)', paddingTop: '6px' }}>
                        <div>Validation: <span style={{ color: 'var(--neon-cyan)', fontWeight: 'bold' }}>{selectedBillboard.validation_status}</span></div>
                        <div>Confidence: <span style={{ color: 'var(--neon-yellow)' }}>{Math.round((selectedBillboard.observed_confidence ?? 0.94) * 100)}%</span></div>
                        
                        {viewMode === 'interactive' && panoLat !== null && (
                          <>
                            <div>POV Sightline: <span style={{ color: povMatch ? '#00ff66' : 'var(--neon-magenta)', fontWeight: 'bold' }}>{povMatch ? 'LOCKED' : 'OUT OF VIEW'}</span></div>
                            <div>Exposure: <span style={{ color: 'var(--neon-cyan)', fontWeight: 'bold' }}>{audienceExposure}%</span></div>
                            <div style={{ gridColumn: 'span 2', color: 'var(--text-slate)', borderTop: '1px dashed rgba(0,242,254,0.03)', paddingTop: '4px', marginTop: '2px' }}>
                              Camera: {panoLat.toFixed(5)}, {panoLng?.toFixed(5)} (@ {Math.round(panoHeading)}°)
                            </div>
                          </>
                        )}
                      </div>

                      {suggestions.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid rgba(0,242,254,0.05)', paddingTop: '6px', fontSize: '9px', color: 'var(--text-slate)' }}>
                          <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>GAVI Placement Suggestions:</div>
                          {suggestions.map((s, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '4px', lineHeight: '1.3' }}>
                              <span style={{ color: s.startsWith('✓') ? '#00ff66' : s.startsWith('💡') ? 'var(--neon-cyan)' : 'var(--neon-magenta)' }}>•</span>
                              <span>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </>
          )}

        </section>

      </div>
    </div>
  );
}
