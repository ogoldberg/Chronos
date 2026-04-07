import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import type { TimelineEvent } from '../../types';
import { EMPIRES } from '../../data/empires';
import type { Empire } from '../../data/empires';
import { REGION_LANES, matchEventToRegion } from '../../data/regions';
import { getPaleoContinents, paleoEraLabel } from '../../data/paleoReconstruction';
import RegionInfoCard from './RegionInfoCard';

interface Props {
  events: TimelineEvent[];
  selectedEvent: TimelineEvent | null;
  hoveredEvent: TimelineEvent | null;
  isCosmicScale: boolean;
  onClose: () => void;
  currentYear?: number;
  onAskGuide?: (question: string) => void;
}

/** Size modes for the globe panel — compact tile, medium, or near-fullscreen. */
type GlobeSize = 'compact' | 'large' | 'fullscreen';

// Convert lat/lng to 3D position on sphere
function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Create a curved arc between two points on the globe
function createArc(
  start: [number, number],
  end: [number, number],
  radius: number,
  segments = 64
): THREE.Vector3[] {
  const startV = latLngToVector3(start[0], start[1], radius);
  const endV = latLngToVector3(end[0], end[1], radius);
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = new THREE.Vector3().lerpVectors(startV, endV, t);
    // Lift the arc above the surface
    const dist = startV.distanceTo(endV);
    const lift = 1 + Math.sin(t * Math.PI) * dist * 0.15;
    point.normalize().multiplyScalar(radius * lift);
    points.push(point);
  }
  return points;
}

// Build a filled polygon mesh on the globe surface from [lat,lng] points.
// Uses a simple triangle-fan from the centroid, projected onto the sphere.
function buildEmpireMesh(
  empire: Empire,
  radius: number,
): THREE.Mesh {
  const pts = empire.polygon;
  // Compute centroid in lat/lng space
  let cLat = 0;
  let cLng = 0;
  for (const [lat, lng] of pts) {
    cLat += lat;
    cLng += lng;
  }
  cLat /= pts.length;
  cLng /= pts.length;

  const r = radius * 1.004; // Slightly above surface to avoid z-fighting
  const center = latLngToVector3(cLat, cLng, r);

  // Build triangle fan: center -> p[i] -> p[i+1]
  const positions: number[] = [];

  for (let i = 0; i < pts.length; i++) {
    const next = (i + 1) % pts.length;
    const v0 = center;
    const v1 = latLngToVector3(pts[i][0], pts[i][1], r);
    const v2 = latLngToVector3(pts[next][0], pts[next][1], r);

    positions.push(v0.x, v0.y, v0.z);
    positions.push(v1.x, v1.y, v1.z);
    positions.push(v2.x, v2.y, v2.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();

  const color = new THREE.Color(empire.color);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.20,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}

/**
 * Point-in-polygon test in lat/lng space (ray casting algorithm).
 *
 * This is a simple flat-plane check, which is inaccurate for polygons that
 * cross the antimeridian or contain a pole — but every empire polygon in
 * our dataset is comfortably inside a single longitude hemisphere, so the
 * simple version is good enough for click identification.
 */
function pointInPolygon(lat: number, lng: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [lati, lngi] = poly[i];
    const [latj, lngj] = poly[j];
    const intersect =
      lngi > lng !== lngj > lng &&
      lat < ((latj - lati) * (lng - lngi)) / (lngj - lngi) + lati;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Find the first active empire whose polygon contains the given lat/lng at
 * the given year. Active = year falls within [startYear, endYear].
 */
function findEmpireAt(lat: number, lng: number, year: number): Empire | null {
  for (const empire of EMPIRES) {
    if (year < empire.startYear || year > empire.endYear) continue;
    if (pointInPolygon(lat, lng, empire.polygon)) return empire;
  }
  return null;
}

// Build a border outline for an empire polygon
function buildEmpireBorder(
  empire: Empire,
  radius: number,
): THREE.Line {
  const r = radius * 1.005;
  const points = empire.polygon.map(([lat, lng]) => latLngToVector3(lat, lng, r));
  // Close the loop
  if (points.length > 0) {
    points.push(points[0].clone());
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(empire.color),
    transparent: true,
    opacity: 0.6,
  });
  return new THREE.Line(geometry, material);
}

// Vertex shader for the atmosphere
const ATMO_VERTEX = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMO_FRAGMENT = `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
  }
`;

/**
 * Build an equirectangular canvas texture that shows the paleogeography at
 * the given year. Ocean is painted first as a latitudinal gradient (deep
 * blue at the poles, brighter blue at the equator). Each paleo continent
 * polygon is then projected into canvas pixel space and filled with an
 * era-appropriate land color. A subtle coastline stroke is drawn on top.
 *
 * We regenerate this texture every time the year changes. The cost is
 * modest (~1–2 ms for a 2048×1024 canvas) and it only happens on era jumps
 * or drag-panning, not per-frame.
 */
function buildEarthTexture(year: number): HTMLCanvasElement {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Ocean base — vertical gradient, brighter than the "from space at night"
  // look we had before so the globe stays legible at small panel sizes.
  const ocean = ctx.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0.0, '#184a72');
  ocean.addColorStop(0.3, '#24649a');
  ocean.addColorStop(0.5, '#2b75b2');
  ocean.addColorStop(0.7, '#24649a');
  ocean.addColorStop(1.0, '#184a72');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  // Land colors drift with geologic era. Before grasses (Cenozoic) and
  // forests (Devonian), continents would have looked more uniformly dry
  // and olive-brown from orbit.
  const maBefore = Math.max(0, -year / 1e6);
  let land: string;
  let coast: string;
  let interior: string;
  if (maBefore < 50) {
    // Modern: vegetated greens
    land = '#3d5c2e';
    interior = '#2e4a22';
    coast = '#8c7a52';
  } else if (maBefore < 145) {
    // Cretaceous: less developed grasslands, more conifers
    land = '#526534';
    interior = '#3e4c28';
    coast = '#8a7450';
  } else if (maBefore < 250) {
    // Triassic–Jurassic Pangaea: olive drab, vast arid interior
    land = '#5c5930';
    interior = '#453e20';
    coast = '#7a6540';
  } else {
    // Paleozoic: more primitive vegetation, browner/rustier tones
    land = '#6b5a3a';
    interior = '#4e4025';
    coast = '#705a38';
  }

  // Before ~4.4 Ga there was no meaningful crust — return ocean only so
  // the Hadean period shows as a molten-looking water world.
  if (maBefore > 4400) {
    return canvas;
  }
  // Between 4.4 Ga and 3.5 Ga we fade the land in so the continents ghost
  // into existence gradually.
  let landAlpha = 1;
  if (maBefore > 3500) {
    landAlpha = Math.max(0, 1 - (maBefore - 3500) / 900);
  }

  const continents = getPaleoContinents(year);
  ctx.save();
  ctx.globalAlpha = landAlpha;
  for (const continent of continents) {
    drawContinentOnCanvas(ctx, continent.coords, width, height, land, interior, coast);
  }
  ctx.restore();

  return canvas;
}

/**
 * Project a paleogeographic continent polygon into canvas (equirectangular)
 * space and fill it. Handles antimeridian crossings by splitting the polygon
 * into sub-paths whenever two consecutive points jump by more than 180° of
 * longitude, so a rotated continent that now spans ±180° doesn't render as
 * a horizontal streak across the whole map.
 */
function drawContinentOnCanvas(
  ctx: CanvasRenderingContext2D,
  polygon: [number, number][],
  width: number,
  height: number,
  fillColor: string,
  interiorColor: string,
  strokeColor: string,
): void {
  if (polygon.length < 3) return;

  // Split into subpaths that don't cross the antimeridian.
  const subpaths: [number, number][][] = [];
  let current: [number, number][] = [];
  let prevLng: number | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const [lng, lat] = polygon[i];
    if (prevLng !== null && Math.abs(lng - prevLng) > 180) {
      if (current.length >= 3) subpaths.push(current);
      current = [];
    }
    current.push([lng, lat]);
    prevLng = lng;
  }
  if (current.length >= 3) subpaths.push(current);

  const project = (lng: number, lat: number): [number, number] => [
    ((lng + 180) / 360) * width,
    ((90 - lat) / 180) * height,
  ];

  for (const sub of subpaths) {
    // Fill pass (slightly darker interior via a radial-ish gradient faked by
    // filling the base then overlaying a softer inner darker region).
    ctx.beginPath();
    const [x0, y0] = project(sub[0][0], sub[0][1]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < sub.length; i++) {
      const [x, y] = project(sub[i][0], sub[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Soft inner shadow — fake some relief by filling again slightly inset.
    // This is purely a color trick; there's no real elevation.
    ctx.save();
    ctx.clip();
    const bbox = pathBoundingBox(sub, project);
    const grad = ctx.createRadialGradient(
      bbox.cx,
      bbox.cy,
      Math.max(bbox.rx, bbox.ry) * 0.2,
      bbox.cx,
      bbox.cy,
      Math.max(bbox.rx, bbox.ry) * 1.0,
    );
    grad.addColorStop(0, interiorColor);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
    ctx.restore();

    // Coastline stroke
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < sub.length; i++) {
      const [x, y] = project(sub[i][0], sub[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function pathBoundingBox(
  sub: [number, number][],
  project: (lng: number, lat: number) => [number, number],
) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [lng, lat] of sub) {
    const [x, y] = project(lng, lat);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    rx: (maxX - minX) / 2,
    ry: (maxY - minY) / 2,
  };
}


export default function GlobePanel({
  events,
  selectedEvent,
  hoveredEvent,
  isCosmicScale,
  onClose,
  currentYear = 0,
  onAskGuide,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const globeRef = useRef<THREE.Group | null>(null);
  const markersRef = useRef<THREE.Group | null>(null);
  const pathsRef = useRef<THREE.Group | null>(null);
  const empiresRef = useRef<THREE.Group | null>(null);
  // Earth sphere's material — we swap its `map` texture whenever the year
  // changes so the canvas-painted paleogeography updates without rebuilding
  // the whole scene.
  const earthMatRef = useRef<THREE.MeshPhongMaterial | null>(null);
  // (Legacy) coastlines group — left as a thin accent over the texture
  // instead of the primary continent rendering.
  const coastlinesRef = useRef<THREE.Group | null>(null);
  // Star field — rebuilt sparsely for times when stars don't exist yet
  // (near the Big Bang) or for slow "star drift" over geologic time.
  const starsRef = useRef<THREE.Points | null>(null);
  // Invisible sphere used for raycasting clicks to a lat/lng. It sits exactly
  // on the globe surface so raycaster intersection points can be converted
  // directly back into geographic coordinates.
  const pickSphereRef = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number>(0);
  const rotationRef = useRef({ x: 0, y: 0, autoRotate: true });
  const dragRef = useRef({ active: false, x: 0, y: 0, moved: 0 });
  const targetRotationRef = useRef<{ x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [size, setSize] = useState<GlobeSize>('compact');
  // The region the user clicked on — lat/lng, display name, and fetched info.
  const [clickedRegion, setClickedRegion] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  const RADIUS = 2;

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 5.5;
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Globe group
    const globeGroup = new THREE.Group();
    globeRef.current = globeGroup;
    scene.add(globeGroup);

    // Earth sphere — textured with a procedurally-painted equirectangular
    // map of the paleogeography at the current year. The canvas is built
    // in a side-effect below on first render; for now we give the material
    // a fallback ocean color so the sphere isn't black while the first
    // texture is being generated.
    const earthGeom = new THREE.SphereGeometry(RADIUS, 96, 96);
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,         // white so the texture colors pass through unchanged
      emissive: 0x030812,      // very faint self-illumination on the night side
      // Much dimmer specular — the bright ocean highlight was the main
      // source of glare. Keep just enough to hint at water reflectance.
      specular: 0x2a4868,
      shininess: 8,
      transparent: false,
    });
    earthMatRef.current = earthMat;
    const earth = new THREE.Mesh(earthGeom, earthMat);
    globeGroup.add(earth);

    // Coastlines group — empty; kept only so legacy code paths (like empire
    // borders) can still attach line objects here if needed in the future.
    const coastlineGroup = new THREE.Group();
    coastlinesRef.current = coastlineGroup;
    globeGroup.add(coastlineGroup);

    // Grid lines (latitude/longitude) — very subtle, just enough to give
    // the sphere some perspective cues without looking like wireframe.
    const gridGroup = new THREE.Group();
    const gridMat = new THREE.LineBasicMaterial({ color: 0x8fb4dd, transparent: true, opacity: 0.04 });

    // Latitude lines
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: THREE.Vector3[] = [];
      for (let lng = 0; lng <= 360; lng += 5) {
        points.push(latLngToVector3(lat, lng, RADIUS * 1.003));
      }
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMat));
    }
    // Longitude lines
    for (let lng = 0; lng < 360; lng += 30) {
      const points: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 5) {
        points.push(latLngToVector3(lat, lng, RADIUS * 1.003));
      }
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMat));
    }
    globeGroup.add(gridGroup);

    // Atmosphere glow
    const atmoGeom = new THREE.SphereGeometry(RADIUS * 1.15, 64, 64);
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: ATMO_VERTEX,
      fragmentShader: ATMO_FRAGMENT,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
    globeGroup.add(new THREE.Mesh(atmoGeom, atmoMat));

    // Markers group
    const markers = new THREE.Group();
    markersRef.current = markers;
    globeGroup.add(markers);

    // Paths group
    const paths = new THREE.Group();
    pathsRef.current = paths;
    globeGroup.add(paths);

    // Empire overlays group
    const empiresGroup = new THREE.Group();
    empiresRef.current = empiresGroup;
    globeGroup.add(empiresGroup);

    // Invisible picking sphere — raycaster targets this for click-to-region.
    // It shares the globe's transform so rotation is handled automatically.
    const pickGeom = new THREE.SphereGeometry(RADIUS, 32, 32);
    const pickMat = new THREE.MeshBasicMaterial({
      visible: false,
      side: THREE.FrontSide,
    });
    const pickSphere = new THREE.Mesh(pickGeom, pickMat);
    pickSphereRef.current = pickSphere;
    globeGroup.add(pickSphere);

    // Lighting — tuned to give a real day/night terminator. The directional
    // "sun" light is strong; a dim ambient keeps the night side from going
    // fully black (Earthlight / reflected starlight analogue); a small cool
    // rim light on the opposite side implies atmospheric scattering on the
    // limb so the night edge doesn't look like a flat cutoff.
    // Bright, evenly-lit globe. Without clouds there's nothing to cause
    // specular glare, so we can crank everything up without losing shading.
    const ambient = new THREE.AmbientLight(0x7a94b4, 1.6);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff5d8, 2.0);
    sun.position.set(6, 2.5, 5);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6e9ed0, 0.6);
    rim.position.set(-6, -1, -4);
    scene.add(rim);

    // Stars background — stored in a ref so the paleogeographic effect can
    // rebuild it when the time period changes. At the Big Bang (13.8 Ga)
    // and for the first few hundred million years we want far fewer stars
    // since most hadn't formed yet; for deep time we also slightly rotate
    // the constellation pattern to imply stellar drift.
    const starsGeom = new THREE.BufferGeometry();
    starsGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    const starsMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.1,
      transparent: true,
      opacity: 0.6,
      vertexColors: true,
    });
    const starsPoints = new THREE.Points(starsGeom, starsMat);
    starsRef.current = starsPoints;
    scene.add(starsPoints);

    // Animation loop
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);

      // Auto-rotate — skipped while dragging, hovering, or while any
      // interaction flag in rotationRef disables it (e.g. a RegionInfoCard
      // is open, or the user recently clicked on the globe).
      if (rotationRef.current.autoRotate && !dragRef.current.active) {
        rotationRef.current.y += 0.002;
      }

      // Smooth rotation to target
      if (targetRotationRef.current) {
        const target = targetRotationRef.current;
        rotationRef.current.x += (target.x - rotationRef.current.x) * 0.05;
        rotationRef.current.y += (target.y - rotationRef.current.y) * 0.05;
        if (
          Math.abs(target.x - rotationRef.current.x) < 0.001 &&
          Math.abs(target.y - rotationRef.current.y) < 0.001
        ) {
          targetRotationRef.current = null;
        }
      }

      globeGroup.rotation.x = rotationRef.current.x;
      globeGroup.rotation.y = rotationRef.current.y;

      // Pulse markers
      if (markersRef.current) {
        const time = Date.now() * 0.003;
        markersRef.current.children.forEach((child, i) => {
          if (child instanceof THREE.Mesh) {
            const scale = 1 + Math.sin(time + i) * 0.15;
            child.scale.setScalar(scale);
          }
        });
      }

      renderer.render(scene, camera);
    }
    animate();

    // Resize observer. On resize we also recompute the camera distance so
    // the globe fits comfortably inside the panel regardless of size mode.
    // The camera FOV is 45°, so the minimum distance for a sphere of radius
    // RADIUS to fit vertically is RADIUS / tan(22.5°) ≈ 4.83; we add a bit
    // of breathing room so atmosphere glow isn't clipped.
    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      camera.aspect = w / h;
      // Use the smaller dimension to ensure the globe fits both ways.
      const aspect = w / h;
      const fitDist = RADIUS / Math.tan((camera.fov * Math.PI) / 360);
      // If wider than tall, the globe could overflow vertically at a small
      // distance — compensate by scaling distance inversely to aspect when
      // aspect < 1, and using fitDist + small padding otherwise.
      camera.position.z = fitDist * 1.25 * Math.max(1, 1 / aspect);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // Mouse interaction for globe rotation
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { active: true, x: e.clientX, y: e.clientY, moved: 0 };
    rotationRef.current.autoRotate = false;
    targetRotationRef.current = null;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current.moved += Math.abs(dx) + Math.abs(dy);
    rotationRef.current.y += dx * 0.005;
    rotationRef.current.x += dy * 0.005;
    rotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationRef.current.x));
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current.active = false;
    // Resume auto-rotate after 3 seconds
    setTimeout(() => {
      if (!dragRef.current.active) rotationRef.current.autoRotate = true;
    }, 3000);
  }, []);

  /**
   * Raycast a click against the invisible picking sphere and convert the
   * intersection point into geographic lat/lng. Then identify which region
   * (either an active empire or a fallback REGION_LANE) the click belongs to
   * and open the RegionInfoCard for it.
   *
   * We only treat a mouseup as a click if the total drag distance since
   * mousedown was tiny — otherwise the user was rotating the globe.
   */
  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragRef.current.moved > 6) return; // was a drag, not a click
      const container = containerRef.current;
      const camera = cameraRef.current;
      const pickSphere = pickSphereRef.current;
      const globeGroup = globeRef.current;
      if (!container || !camera || !pickSphere || !globeGroup) return;

      const rect = container.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(pickSphere);
      if (!hits.length) return;

      // Convert world-space intersection to globe-local space so we can
      // invert latLngToVector3 without worrying about current rotation.
      const localPoint = hits[0].point.clone();
      globeGroup.worldToLocal(localPoint);
      const n = localPoint.clone().normalize();
      // Inverse of latLngToVector3:
      //   x = -r sin(phi) cos(theta)
      //   y =  r cos(phi)
      //   z =  r sin(phi) sin(theta)
      // where phi = (90 - lat) * π/180, theta = (lng + 180) * π/180
      const phi = Math.acos(n.y);
      const theta = Math.atan2(n.z, -n.x);
      const lat = 90 - (phi * 180) / Math.PI;
      let lng = (theta * 180) / Math.PI - 180;
      while (lng < -180) lng += 360;
      while (lng > 180) lng -= 360;

      // Identify a human-readable region name: prefer an active empire the
      // click falls inside, then fall back to the broad REGION_LANE bucket.
      const empireHit = findEmpireAt(lat, lng, currentYear);
      const laneId = matchEventToRegion(lat, lng);
      const lane = REGION_LANES.find(l => l.id === laneId);
      const name = empireHit?.name ?? lane?.label ?? 'Open ocean';

      setClickedRegion({ lat, lng, name });
      rotationRef.current.autoRotate = false;
    },
    [currentYear],
  );

  // Update markers when events change
  useEffect(() => {
    const markers = markersRef.current;
    const paths = pathsRef.current;
    if (!markers || !paths) return;

    // Clear existing — dispose GPU resources to prevent memory leak
    const disposeChild = (child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
      if (child instanceof THREE.Line) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    };
    while (markers.children.length) {
      disposeChild(markers.children[0]);
      markers.remove(markers.children[0]);
    }
    while (paths.children.length) {
      disposeChild(paths.children[0]);
      paths.remove(paths.children[0]);
    }

    // Get events with geo data
    const geoEvents = events.filter(e => e.lat != null && e.lng != null);

    for (const ev of geoEvents) {
      const isSelected = selectedEvent?.id === ev.id;
      const isHovered = hoveredEvent?.id === ev.id;
      const color = new THREE.Color(ev.color);

      if (ev.geoType === 'path' && ev.path && ev.path.length >= 2) {
        // Draw path arcs
        for (let i = 0; i < ev.path.length - 1; i++) {
          const arcPoints = createArc(ev.path[i], ev.path[i + 1], RADIUS);
          const lineGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
          const lineMat = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: isSelected || isHovered ? 0.9 : 0.5,
            linewidth: 2,
          });
          paths.add(new THREE.Line(lineGeom, lineMat));
        }
        // Add markers at waypoints
        for (const [lat, lng] of ev.path) {
          const pos = latLngToVector3(lat, lng, RADIUS * 1.01);
          const dotGeom = new THREE.SphereGeometry(0.02, 8, 8);
          const dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
          const dot = new THREE.Mesh(dotGeom, dotMat);
          dot.position.copy(pos);
          markers.add(dot);
        }
      } else if (ev.geoType === 'battle') {
        // Battle marker — pulsing ring
        const pos = latLngToVector3(ev.lat!, ev.lng!, RADIUS * 1.01);
        const ringGeom = new THREE.RingGeometry(0.04, 0.07, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xff3333,
          transparent: true,
          opacity: isSelected || isHovered ? 1 : 0.6,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.position.copy(pos);
        ring.lookAt(pos.clone().multiplyScalar(2)); // Face outward
        markers.add(ring);

        // Cross marker
        const crossMat = new THREE.LineBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.8 });
        const s = 0.04;
        const crossPoints1 = [
          latLngToVector3(ev.lat! + s * 3, ev.lng! - s * 3, RADIUS * 1.015),
          latLngToVector3(ev.lat! - s * 3, ev.lng! + s * 3, RADIUS * 1.015),
        ];
        const crossPoints2 = [
          latLngToVector3(ev.lat! + s * 3, ev.lng! + s * 3, RADIUS * 1.015),
          latLngToVector3(ev.lat! - s * 3, ev.lng! - s * 3, RADIUS * 1.015),
        ];
        paths.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(crossPoints1), crossMat));
        paths.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(crossPoints2), crossMat));
      } else {
        // Point marker — glowing sphere
        const pos = latLngToVector3(ev.lat!, ev.lng!, RADIUS * 1.01);
        const size = isSelected ? 0.06 : isHovered ? 0.05 : 0.035;
        const markerGeom = new THREE.SphereGeometry(size, 12, 12);
        const markerMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: isSelected || isHovered ? 1 : 0.7,
        });
        const marker = new THREE.Mesh(markerGeom, markerMat);
        marker.position.copy(pos);
        markers.add(marker);

        // Glow ring
        if (isSelected || isHovered) {
          const glowGeom = new THREE.RingGeometry(size * 1.5, size * 2.5, 16);
          const glowMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
          });
          const glow = new THREE.Mesh(glowGeom, glowMat);
          glow.position.copy(pos);
          glow.lookAt(pos.clone().multiplyScalar(2));
          markers.add(glow);
        }
      }
    }
  }, [events, selectedEvent, hoveredEvent]);

  // Rebuild the Earth texture whenever the paleogeography meaningfully
  // changes. We bucket `currentYear` to ~1 Myr resolution so that panning
  // through the timeline doesn't trigger a fresh 2048×1024 canvas + GPU
  // upload on every drag step (which used to chew through ~6 GB of GPU
  // memory in long sessions before any texture cleanup could catch up).
  //
  // 1 Myr is much finer than the simulated plate-tectonic motion needs —
  // continents don't visibly shift in less than ~5 Myr — but it's coarse
  // enough that a fast pan only fires this effect a handful of times.
  const earthTextureBucket = Math.round(currentYear / 1e6);
  useEffect(() => {
    const mat = earthMatRef.current;
    if (!mat) return;
    const canvas = buildEarthTexture(earthTextureBucket * 1e6);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    const old = mat.map;
    mat.map = texture;
    mat.needsUpdate = true;
    // Dispose the old texture immediately so its GPU upload doesn't stay
    // pinned. The HTMLCanvasElement that backed the previous texture is
    // unreferenced after this scope exits and is collected normally.
    if (old) old.dispose();
  }, [earthTextureBucket]);

  // Rebuild the star field for the current time. Far back in cosmic time
  // stars are few/absent; during the modern era we show a rich starfield.
  // We also apply a tiny time-dependent rotation to suggest stellar drift.
  //
  // Bucketed to 100 Myr resolution because star count and color
  // distribution change extremely slowly. Without this bucket the effect
  // re-allocated two Float32Arrays + a BufferGeometry on every drag step.
  const starsBucket = Math.round(currentYear / 1e8);
  useEffect(() => {
    const stars = starsRef.current;
    if (!stars) return;

    const bucketYear = starsBucket * 1e8;
    const maBefore = Math.max(0, -bucketYear / 1e6);
    // Star count ramps from 0 (before any stars) → full sky by ~12 Ga.
    // The first stars ignited ~13.4 Ga → effectively 400 Ma after the
    // Big Bang. Chronos uses 13.8 Ga as the Big Bang, so maBefore > 13800
    // means "before the Big Bang" (nothing) and 13400 < maBefore < 13800
    // means "pre-stellar darkness".
    let countFrac = 1;
    if (maBefore > 13800) countFrac = 0;
    else if (maBefore > 13400) countFrac = 0;
    else if (maBefore > 13000) countFrac = (13400 - maBefore) / 400;
    else if (maBefore > 12000) countFrac = 0.3 + 0.7 * (13000 - maBefore) / 1000;
    // Clamp
    countFrac = Math.max(0, Math.min(1, countFrac));
    const count = Math.round(600 * countFrac);

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    // Deterministic seed so the starfield doesn't jitter frame to frame —
    // use a simple LCG seeded by floor(maBefore / 100) so the pattern
    // shifts in blocks of ~100 million years (slow "stellar drift").
    const seed = Math.floor(maBefore / 100) + 12345;
    let s = seed;
    const rand = () => {
      s = (s * 16807 + 1) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < count; i++) {
      const r = 30 + rand() * 30;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      // Slight tint variation — most stars white, some blue-white,
      // some yellow-orange. During the very early universe (first
      // hundreds of Myr) Population III stars were extremely hot and
      // blue, so bias toward blue at that time.
      const t = rand();
      const earlyBlueBias = maBefore > 12000 ? 0.6 : 0;
      if (t < 0.7 - earlyBlueBias) {
        // White
        colors[i * 3] = 1; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 1;
      } else if (t < 0.9 - earlyBlueBias * 0.5) {
        // Yellow-orange
        colors[i * 3] = 1; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0.6;
      } else {
        // Blue-white
        colors[i * 3] = 0.7; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1;
      }
    }
    stars.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    stars.geometry = g;
  }, [starsBucket]);

  // Update empire overlays when currentYear changes. Bucketed to 5-year
  // resolution since empire boundaries don't shift faster than that and
  // we'd otherwise rebuild the meshes on every drag step.
  const empiresBucket = Math.round(currentYear / 5);
  useEffect(() => {
    const empiresGroup = empiresRef.current;
    if (!empiresGroup) return;
    const bucketYear = empiresBucket * 5;

    // Clear existing empire meshes AND dispose their GPU resources so we
    // don't pin Three.js BufferGeometries forever.
    while (empiresGroup.children.length) {
      const child = empiresGroup.children[0];
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
      empiresGroup.remove(child);
    }

    // Only show empires at civilization scale (year > -5000)
    if (bucketYear < -5000) return;

    // Filter empires active at current year
    const activeEmpires = EMPIRES.filter(
      (e) => bucketYear >= e.startYear && bucketYear <= e.endYear,
    );

    for (const empire of activeEmpires) {
      // Filled polygon overlay
      const mesh = buildEmpireMesh(empire, RADIUS);
      empiresGroup.add(mesh);

      // Border outline
      const border = buildEmpireBorder(empire, RADIUS);
      empiresGroup.add(border);
    }
  }, [empiresBucket]);

  // Pause auto-rotate whenever a RegionInfoCard is open. We also clear any
  // in-flight "snap to target" animation so the globe holds steady on the
  // place the user just clicked. Re-enable when the card closes.
  useEffect(() => {
    if (clickedRegion) {
      rotationRef.current.autoRotate = false;
      targetRotationRef.current = null;
    } else {
      // Resume after a short delay so the user can read any tooltip/card
      // they're dismissing without the globe immediately drifting away.
      const t = setTimeout(() => {
        if (!dragRef.current.active) rotationRef.current.autoRotate = true;
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [clickedRegion]);

  // Pause auto-rotate while the mouse is over the panel (separate from
  // drag, so simply hovering to read stops the motion).
  const onMouseEnter = useCallback(() => {
    rotationRef.current.autoRotate = false;
  }, []);
  const onMouseLeavePanel = useCallback(() => {
    // Only resume if not interacting and no card is shown.
    if (!dragRef.current.active && !clickedRegion) {
      rotationRef.current.autoRotate = true;
    }
  }, [clickedRegion]);

  // Rotate globe to focus on selected/hovered event
  useEffect(() => {
    const ev = selectedEvent || hoveredEvent;
    if (!ev?.lat || !ev?.lng) return;

    // Calculate target rotation to center on the event
    const targetY = -ev.lng * (Math.PI / 180) - Math.PI / 2;
    const targetX = ev.lat * (Math.PI / 180) * 0.5;

    targetRotationRef.current = { x: targetX, y: targetY };
    rotationRef.current.autoRotate = false;

    // Resume auto-rotate after focusing
    const timer = setTimeout(() => {
      if (!dragRef.current.active) rotationRef.current.autoRotate = true;
    }, 5000);
    return () => clearTimeout(timer);
  }, [selectedEvent, hoveredEvent]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'absolute',
          top: 60,
          right: 20,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(13, 17, 23, 0.9)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff',
          fontSize: 20,
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          zIndex: 25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        🌍
      </button>
    );
  }

  // Panel chrome size preset — compact is the corner tile, large is a
  // prominent mid-screen card, fullscreen fills nearly the whole viewport.
  const panelStyle: React.CSSProperties =
    size === 'fullscreen'
      ? {
          position: 'fixed',
          top: 20,
          left: 20,
          right: 20,
          bottom: 20,
          width: 'auto',
          height: 'auto',
        }
      : size === 'large'
      ? {
          position: 'absolute',
          top: 55,
          right: 20,
          width: 640,
          height: 640,
          maxWidth: 'calc(100vw - 40px)',
          maxHeight: 'calc(100vh - 100px)',
        }
      : {
          position: 'absolute',
          top: 55,
          right: 20,
          width: 300,
          height: 300,
          maxWidth: 'calc(100vw - 40px)',
          maxHeight: 'calc(50vh - 60px)',
        };

  return (
    <div
      className="globe-panel"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeavePanel}
      style={{
        ...panelStyle,
        background: 'rgba(13, 17, 23, 0.85)',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
        zIndex: size === 'fullscreen' ? 50 : 25,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 2,
        background: 'linear-gradient(rgba(13,17,23,0.8), transparent)',
      }}>
        <span style={{ color: '#ffffff60', fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>
          {isCosmicScale ? '🌌 COSMOS' : '🌍 EARTH'}
          <span style={{ marginLeft: 8, color: '#60a5fa', fontWeight: 600, letterSpacing: 0 }}>
            {paleoEraLabel(currentYear)}
          </span>
          {size !== 'compact' && (
            <span style={{ marginLeft: 8, color: '#ffffff40', fontWeight: 500, letterSpacing: 0 }}>
              Click the globe to learn about any region
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setSize(size === 'fullscreen' ? 'compact' : size === 'large' ? 'fullscreen' : 'large')}
            title={size === 'fullscreen' ? 'Shrink' : 'Expand'}
            style={headerBtnStyle}
          >
            {size === 'fullscreen' ? '⊟' : '⛶'}
          </button>
          {size === 'compact' && (
            <button onClick={() => setCollapsed(true)} style={headerBtnStyle}>−</button>
          )}
          <button onClick={onClose} style={headerBtnStyle}>✕</button>
        </div>
      </div>

      {/* Event info overlay */}
      {(selectedEvent?.lat || hoveredEvent?.lat) && (
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          right: 8,
          padding: '6px 10px',
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 8,
          zIndex: 2,
        }}>
          <div style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>
            {(selectedEvent || hoveredEvent)?.emoji} {(selectedEvent || hoveredEvent)?.title}
          </div>
          {(selectedEvent || hoveredEvent)?.geoType === 'path' && (
            <div style={{ color: '#ffffff60', fontSize: 9, marginTop: 2 }}>
              Journey route shown
            </div>
          )}
          {(selectedEvent || hoveredEvent)?.geoType === 'battle' && (
            <div style={{ color: '#ff333399', fontSize: 9, marginTop: 2 }}>
              Battle site
            </div>
          )}
        </div>
      )}

      {/* Three.js canvas container */}
      <div
        ref={containerRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onCanvasClick}
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
      />

      {/* Region info card — surfaces AI explanation for the clicked point */}
      {clickedRegion && (
        <RegionInfoCard
          lat={clickedRegion.lat}
          lng={clickedRegion.lng}
          regionName={clickedRegion.name}
          year={currentYear}
          onClose={() => setClickedRegion(null)}
          onAskGuide={onAskGuide}
        />
      )}
    </div>
  );
}

const headerBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#ffffff80',
  cursor: 'pointer',
  fontSize: 14,
  padding: '2px 6px',
  lineHeight: 1,
};
