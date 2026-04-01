import type { TimelineEvent, Viewport } from '../types';
import { getEra, ERAS } from '../data/eras';
import { formatYear, formatYearShort } from '../utils/format';
import { yearToPixel } from './viewport';
import { REGION_LANES, matchEventToRegion } from '../data/regions';

const TICK_STEPS = [
  1e10, 5e9, 2e9, 1e9, 5e8, 2e8, 1e8, 5e7, 2e7, 1e7,
  5e6, 2e6, 1e6, 5e5, 2e5, 1e5, 5e4, 2e4, 1e4, 5000,
  2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1,
];

function pickTickStep(span: number): number {
  for (const step of TICK_STEPS) {
    const count = span / step;
    if (count >= 3 && count <= 15) return step;
  }
  return 1;
}

export interface HitTarget {
  event: TimelineEvent;
  x: number;
  y: number;
  cluster?: TimelineEvent[];
}

export function renderTimeline(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  events: TimelineEvent[],
  width: number,
  height: number,
  hoveredId: string | null,
  selectedId: string | null,
  activeLanes?: Set<string>,
): HitTarget[] {
  const dpr = window.devicePixelRatio || 1;
  const W = width;
  const H = height;
  const left = vp.centerYear - vp.span / 2;
  const right = vp.centerYear + vp.span / 2;
  const timelineY = H * 0.52;
  const era = getEra(vp.centerYear);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0a1a');
  bg.addColorStop(0.5, '#0d1117');
  bg.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Starfield
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (let i = 0; i < 80; i++) {
    const sx = ((i * 137.5) % W);
    const sy = ((i * 97.3 + 50) % H);
    const size = ((i * 3.7) % 2) + 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Era color band
  ctx.fillStyle = era.accent + '08';
  ctx.fillRect(0, 0, W, H);

  // Era regions on timeline
  for (let i = 0; i < ERAS.length; i++) {
    const eraStart = ERAS[i].start;
    const eraEnd = i < ERAS.length - 1 ? ERAS[i + 1].start : 2030;
    if (eraEnd < left || eraStart > right) continue;
    const x1 = Math.max(0, yearToPixel(eraStart, vp, W));
    const x2 = Math.min(W, yearToPixel(eraEnd, vp, W));
    ctx.fillStyle = ERAS[i].accent + '0a';
    ctx.fillRect(x1, timelineY - 40, x2 - x1, 80);
  }

  // Timeline axis
  const axGrad = ctx.createLinearGradient(0, 0, W, 0);
  axGrad.addColorStop(0, era.accent + '20');
  axGrad.addColorStop(0.5, era.accent + '60');
  axGrad.addColorStop(1, era.accent + '20');
  ctx.strokeStyle = axGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, timelineY);
  ctx.lineTo(W, timelineY);
  ctx.stroke();

  // Glow line
  ctx.strokeStyle = era.accent + '15';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, timelineY);
  ctx.lineTo(W, timelineY);
  ctx.stroke();

  // Tick marks
  const step = pickTickStep(vp.span);
  ctx.fillStyle = '#ffffff50';
  ctx.font = `${11 / dpr * dpr}px "SF Mono", "Fira Code", monospace`;
  ctx.textAlign = 'center';
  for (let y = Math.ceil(left / step) * step; y <= right; y += step) {
    const x = yearToPixel(y, vp, W);
    ctx.strokeStyle = '#ffffff15';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, timelineY - 12);
    ctx.lineTo(x, timelineY + 12);
    ctx.stroke();
    ctx.fillStyle = '#ffffff40';
    ctx.fillText(formatYearShort(y), x, timelineY + 28);
  }

  // Filter visible events
  const visible = events.filter(ev => {
    if (ev.year < left || ev.year > right) return false;
    if (ev.maxSpan && vp.span > ev.maxSpan) return false;
    return true;
  });

  // Lane mode: draw region bands
  const lanesActive = activeLanes && activeLanes.size > 0;
  const activeLaneList = lanesActive ? REGION_LANES.filter(l => activeLanes!.has(l.id)) : [];
  const laneHeight = lanesActive ? Math.min(80, (H - 80) / (activeLaneList.length + 1)) : 0;
  const laneStartY = lanesActive ? 70 : 0;

  if (lanesActive) {
    // Draw lane backgrounds and labels
    for (let i = 0; i < activeLaneList.length; i++) {
      const lane = activeLaneList[i];
      const y = laneStartY + (i + 1) * laneHeight;

      // Lane background band
      ctx.fillStyle = lane.color + '08';
      ctx.fillRect(0, y - laneHeight / 2, W, laneHeight);

      // Lane separator
      ctx.strokeStyle = lane.color + '20';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();

      // Lane label
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = lane.color + '80';
      ctx.fillText(`${lane.emoji} ${lane.label}`, 8, y);
    }
  }

  // Grid-based event clustering: divide canvas into ~60px cells
  const CELL_WIDTH = 60;

  const sorted = [...visible].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'anchor' ? -1 : 1;
    return Math.abs(b.year) - Math.abs(a.year);
  });

  // Compute pixel x for each visible event and assign to grid cells
  const eventPositions: { ev: TimelineEvent; x: number }[] = [];
  for (const ev of sorted) {
    const x = yearToPixel(ev.year, vp, W);
    if (x < -50 || x > W + 50) continue;
    eventPositions.push({ ev, x });
  }

  const cellMap = new Map<number, { ev: TimelineEvent; x: number }[]>();
  for (const item of eventPositions) {
    const cellIdx = Math.floor(item.x / CELL_WIDTH);
    let cell = cellMap.get(cellIdx);
    if (!cell) {
      cell = [];
      cellMap.set(cellIdx, cell);
    }
    cell.push(item);
  }

  // Build clusters from cells with 3+ events, merging adjacent cells within 40px
  const clusteredIds = new Set<string>();
  interface ClusterInfo {
    events: TimelineEvent[];
    centroidX: number;
    color: string; // most common color
  }
  const clusterList: ClusterInfo[] = [];

  const sortedCellKeys = [...cellMap.keys()].sort((a, b) => a - b);
  for (const cellIdx of sortedCellKeys) {
    const cellItems = cellMap.get(cellIdx)!;
    const unclaimed = cellItems.filter(it => !clusteredIds.has(it.ev.id));
    if (unclaimed.length === 0) continue;

    // Gather nearby items from adjacent cells (within 40px of any unclaimed item)
    const nearby: { ev: TimelineEvent; x: number }[] = [];
    for (let adj = cellIdx - 1; adj <= cellIdx + 1; adj++) {
      const adjItems = cellMap.get(adj);
      if (!adjItems) continue;
      for (const it of adjItems) {
        if (clusteredIds.has(it.ev.id)) continue;
        const closeEnough = unclaimed.some(u => Math.abs(u.x - it.x) <= 40);
        if (closeEnough && !nearby.some(n => n.ev.id === it.ev.id)) {
          nearby.push(it);
        }
      }
    }

    // Only cluster when 3+ events overlap
    if (nearby.length >= 3) {
      for (const it of nearby) clusteredIds.add(it.ev.id);
      const cx = nearby.reduce((s, it) => s + it.x, 0) / nearby.length;

      // Find most common color
      const colorCounts = new Map<string, number>();
      for (const it of nearby) {
        colorCounts.set(it.ev.color, (colorCounts.get(it.ev.color) || 0) + 1);
      }
      let bestColor = nearby[0].ev.color;
      let bestCount = 0;
      for (const [c, n] of colorCounts) {
        if (n > bestCount) { bestColor = c; bestCount = n; }
      }

      clusterList.push({
        events: nearby.map(it => it.ev),
        centroidX: cx,
        color: bestColor,
      });
    }
  }

  // Layout and render unclustered events normally
  const hitTargets: HitTarget[] = [];
  const placed: { x: number; y: number }[] = [];

  for (const item of eventPositions) {
    if (clusteredIds.has(item.ev.id)) continue;

    const ev = item.ev;
    const x = item.x;

    let evY: number;

    if (lanesActive) {
      // Place event in its region lane
      const regionId = matchEventToRegion(ev.lat, ev.lng);
      const laneIdx = regionId ? activeLaneList.findIndex(l => l.id === regionId) : -1;

      if (laneIdx >= 0) {
        evY = laneStartY + (laneIdx + 1) * laneHeight;
        // Micro-stagger within lane to avoid overlap
        let stagger = 0;
        for (const p of placed) {
          if (Math.abs(p.x - x) < 50 && Math.abs(p.y - evY) < laneHeight * 0.4) {
            stagger += 14;
          }
        }
        evY += stagger % (laneHeight * 0.3) * (stagger % 2 === 0 ? 1 : -1);
      } else {
        // Events without coords go on the main timeline
        evY = timelineY;
        let tries = 0;
        for (const p of placed) {
          if (Math.abs(p.x - x) < 60 && Math.abs(p.y - timelineY) < 50) {
            tries++;
            evY = timelineY + (tries % 2 === 0 ? -1 : 1) * (30 + tries * 18);
          }
        }
      }
    } else {
      // Normal single-lane layout
      let tries = 0;
      const direction = sorted.indexOf(ev) % 2 === 0 ? -1 : 1;
      let baseY = timelineY + direction * 30;
      for (const p of placed) {
        if (Math.abs(p.x - x) < 60) {
          tries++;
          baseY = timelineY + (tries % 2 === 0 ? -1 : 1) * (30 + tries * 22);
        }
      }
      evY = baseY;
    }
    placed.push({ x, y: evY });
    hitTargets.push({ event: ev, x, y: evY });

    const isHovered = hoveredId === ev.id;
    const isSelected = selectedId === ev.id;

    // Connector line
    ctx.strokeStyle = ev.color + (isHovered ? '80' : '40');
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.setLineDash(isHovered ? [] : [3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, timelineY);
    ctx.lineTo(x, evY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Event dot on timeline
    ctx.beginPath();
    ctx.arc(x, timelineY, isHovered ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = ev.color;
    ctx.fill();

    // Event marker
    const markerSize = isHovered ? 22 : isSelected ? 20 : 18;
    if (isHovered || isSelected) {
      ctx.shadowColor = ev.color;
      ctx.shadowBlur = 15;
    }
    ctx.beginPath();
    ctx.arc(x, evY, markerSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1117';
    ctx.fill();
    ctx.strokeStyle = ev.color + (isHovered ? 'ff' : '99');
    ctx.lineWidth = isHovered ? 2.5 : 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Emoji
    ctx.font = `${markerSize * 0.65}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ev.emoji, x, evY + 1);

    // Label
    ctx.font = `${isHovered ? 'bold ' : ''}${isHovered ? 13 : 11}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillStyle = isHovered ? '#ffffff' : '#ffffffcc';
    ctx.fillText(ev.title, x, evY + markerSize / 2 + 4);

    // Year sub-label
    ctx.font = `9px "SF Mono", monospace`;
    ctx.fillStyle = ev.color + '99';
    ctx.fillText(formatYearShort(ev.year), x, evY + markerSize / 2 + 20);
  }

  // Render cluster bubbles for groups of 3+ events
  for (const cluster of clusterList) {
    const { events: clusterEvents, centroidX: cx, color } = cluster;
    const count = clusterEvents.length;
    const clusterY = timelineY - 30;
    const RADIUS = 14;

    // Connector line from timeline to cluster bubble
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, timelineY);
    ctx.lineTo(cx, clusterY + RADIUS);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dot on timeline axis
    ctx.beginPath();
    ctx.arc(cx, timelineY, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Translucent filled circle (radius 14px)
    ctx.beginPath();
    ctx.arc(cx, clusterY, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color + '40';
    ctx.fill();
    ctx.strokeStyle = color + 'aa';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Count text
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffffee';
    ctx.fillText(String(count), cx, clusterY);

    // Add cluster to hitTargets so clicking it can zoom in
    hitTargets.push({ event: clusterEvents[0], x: cx, y: clusterY, cluster: clusterEvents });
  }

  // Connection arcs between related events
  const hitMap = new Map(hitTargets.map(ht => [ht.event.id, ht]));
  const titleMap = new Map(hitTargets.map(ht => [ht.event.title, ht]));

  for (const ht of hitTargets) {
    const ev = ht.event;
    if (!ev.connections) continue;
    const isActiveEvent = ev.id === selectedId || ev.id === hoveredId;

    for (const conn of ev.connections) {
      // Find the target event by id or title
      const target = hitMap.get(conn.targetId) || titleMap.get(conn.targetTitle || '');
      if (!target) continue;

      const opacity = isActiveEvent ? '60' : '20';
      const lineWidth = isActiveEvent ? 2 : 1;

      // Draw curved arc
      ctx.strokeStyle = ev.color + opacity;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();

      const midX = (ht.x + target.x) / 2;
      const midY = Math.min(ht.y, target.y) - 30; // arc above events
      ctx.moveTo(ht.x, ht.y);
      ctx.quadraticCurveTo(midX, midY, target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow head at target
      if (isActiveEvent && (conn.type === 'caused' || conn.type === 'led_to')) {
        const angle = Math.atan2(target.y - midY, target.x - midX);
        ctx.fillStyle = ev.color + '80';
        ctx.beginPath();
        ctx.moveTo(target.x, target.y);
        ctx.lineTo(
          target.x - 8 * Math.cos(angle - 0.4),
          target.y - 8 * Math.sin(angle - 0.4)
        );
        ctx.lineTo(
          target.x - 8 * Math.cos(angle + 0.4),
          target.y - 8 * Math.sin(angle + 0.4)
        );
        ctx.closePath();
        ctx.fill();
      }

      // Connection label
      if (isActiveEvent && conn.label) {
        ctx.font = '9px "SF Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#ffffff40';
        ctx.fillText(conn.label, midX, midY - 4);
      }
    }
  }

  // Current view label (top left)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 14px -apple-system, sans-serif';
  ctx.fillStyle = era.accent + 'cc';
  ctx.fillText(era.label.toUpperCase(), 20, 20);
  ctx.font = '12px "SF Mono", monospace';
  ctx.fillStyle = '#ffffff80';
  ctx.fillText(`${formatYear(left)}  →  ${formatYear(right)}`, 20, 40);

  return hitTargets;
}
