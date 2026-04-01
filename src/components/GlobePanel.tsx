import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import type { TimelineEvent } from '../types';
import { EMPIRES } from '../data/empires';
import type { Empire } from '../data/empires';
import { allCoastlines } from '../data/coastlines';

interface Props {
  events: TimelineEvent[];
  selectedEvent: TimelineEvent | null;
  hoveredEvent: TimelineEvent | null;
  isCosmicScale: boolean;
  onClose: () => void;
  currentYear?: number;
}

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

export default function GlobePanel({
  events,
  selectedEvent,
  hoveredEvent,
  isCosmicScale,
  onClose,
  currentYear = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const globeRef = useRef<THREE.Group | null>(null);
  const markersRef = useRef<THREE.Group | null>(null);
  const pathsRef = useRef<THREE.Group | null>(null);
  const empiresRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);
  const rotationRef = useRef({ x: 0, y: 0, autoRotate: true });
  const dragRef = useRef({ active: false, x: 0, y: 0 });
  const targetRotationRef = useRef<{ x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
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
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Globe group
    const globeGroup = new THREE.Group();
    globeRef.current = globeGroup;
    scene.add(globeGroup);

    // Earth sphere — dark ocean globe
    const earthGeom = new THREE.SphereGeometry(RADIUS, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x0a1628,
      emissive: 0x050e1a,
      specular: 0x333333,
      shininess: 25,
      transparent: true,
      opacity: 0.95,
    });
    const earth = new THREE.Mesh(earthGeom, earthMat);
    globeGroup.add(earth);

    // Coastline outlines — real continent shapes
    const coastlineGroup = new THREE.Group();
    const coastlineMat = new THREE.LineBasicMaterial({
      color: 0x2a5a8c,
      transparent: true,
      opacity: 0.7,
    });
    for (const continent of allCoastlines) {
      const points: THREE.Vector3[] = continent.coords.map(
        ([lng, lat]) => latLngToVector3(lat, lng, RADIUS * 1.002),
      );
      if (points.length > 1) {
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        coastlineGroup.add(new THREE.Line(geom, coastlineMat));
      }
    }
    globeGroup.add(coastlineGroup);

    // Grid lines (latitude/longitude)
    const gridGroup = new THREE.Group();
    const gridMat = new THREE.LineBasicMaterial({ color: 0x1a3a5c, transparent: true, opacity: 0.08 });

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

    // Lighting
    const ambient = new THREE.AmbientLight(0x334455, 1.5);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(5, 3, 5);
    scene.add(directional);
    const point = new THREE.PointLight(0x3366ff, 0.5, 20);
    point.position.set(-3, 2, 4);
    scene.add(point);

    // Stars background
    const starsGeom = new THREE.BufferGeometry();
    const starPositions = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const r = 30 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    starsGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, transparent: true, opacity: 0.6 });
    scene.add(new THREE.Points(starsGeom, starsMat));

    // Animation loop
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);

      // Auto-rotate
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

    // Resize observer
    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      camera.aspect = w / h;
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
    dragRef.current = { active: true, x: e.clientX, y: e.clientY };
    rotationRef.current.autoRotate = false;
    targetRotationRef.current = null;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
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

  // Update empire overlays when currentYear changes
  useEffect(() => {
    const empiresGroup = empiresRef.current;
    if (!empiresGroup) return;

    // Clear existing empire meshes
    while (empiresGroup.children.length) empiresGroup.remove(empiresGroup.children[0]);

    // Only show empires at civilization scale (year > -5000)
    if (currentYear < -5000) return;

    // Filter empires active at current year
    const activeEmpires = EMPIRES.filter(
      (e) => currentYear >= e.startYear && currentYear <= e.endYear,
    );

    for (const empire of activeEmpires) {
      // Filled polygon overlay
      const mesh = buildEmpireMesh(empire, RADIUS);
      empiresGroup.add(mesh);

      // Border outline
      const border = buildEmpireBorder(empire, RADIUS);
      empiresGroup.add(border);
    }
  }, [currentYear]);

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

  return (
    <div
      className="globe-panel"
      style={{
        position: 'absolute',
        top: 55,
        right: 20,
        width: 300,
        height: 300,
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: 'calc(50vh - 60px)',
        background: 'rgba(13, 17, 23, 0.85)',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
        zIndex: 25,
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
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setCollapsed(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff40',
              cursor: 'pointer',
              fontSize: 12,
              padding: 2,
            }}
          >
            −
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff40',
              cursor: 'pointer',
              fontSize: 12,
              padding: 2,
            }}
          >
            ✕
          </button>
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
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
      />
    </div>
  );
}
