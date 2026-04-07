import type { TimelineEvent, Viewport } from '../types';
import { getEra, ERAS } from '../data/eras';
import { formatYear, formatYearShort } from '../utils/format';
import { yearToPixel, isEventVisible } from './viewport';
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

  // Background — deep space gradient with subtle radial vignette
  const bg = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H));
  bg.addColorStop(0, '#0f1219');
  bg.addColorStop(0.5, '#0a0d14');
  bg.addColorStop(1, '#06080d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Animated starfield — twinkling stars with depth layers
  const time = Date.now() * 0.001;
  // Far stars (small, dim, slow twinkle)
  for (let i = 0; i < 120; i++) {
    const sx = ((i * 137.508) % W);
    const sy = ((i * 97.31 + 30) % H);
    const twinkle = 0.15 + Math.sin(time * 0.5 + i * 2.1) * 0.1;
    const size = ((i * 3.71) % 1.2) + 0.3;
    ctx.fillStyle = `rgba(200,210,255,${twinkle})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }
  // Near stars (larger, brighter, faster twinkle)
  for (let i = 0; i < 25; i++) {
    const sx = ((i * 211.7 + 50) % W);
    const sy = ((i * 173.9 + 20) % H);
    const twinkle = 0.3 + Math.sin(time * 1.2 + i * 3.7) * 0.2;
    const size = ((i * 2.3) % 1.5) + 0.8;
    ctx.fillStyle = `rgba(255,255,255,${twinkle})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
    // Subtle cross-glow on brightest stars
    if (twinkle > 0.4) {
      ctx.strokeStyle = `rgba(255,255,255,${twinkle * 0.3})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy);
      ctx.moveTo(sx, sy - 3); ctx.lineTo(sx, sy + 3);
      ctx.stroke();
    }
  }

  // Era ambient wash — soft gradient overlay
  const eraWash = ctx.createRadialGradient(W / 2, timelineY, 0, W / 2, timelineY, W * 0.6);
  eraWash.addColorStop(0, era.accent + '0c');
  eraWash.addColorStop(1, 'transparent');
  ctx.fillStyle = eraWash;
  ctx.fillRect(0, 0, W, H);

  // Era region: hairline dividers between eras + a big serif era label
  // floating above the ruler in the centre of each era's visible span.
  // The label is set in muted Fraunces small caps and acts as a section
  // header for the timeline (cf. a magazine spread heading).
  for (let i = 0; i < ERAS.length; i++) {
    const eraStart = ERAS[i].start;
    const eraEnd = i < ERAS.length - 1 ? ERAS[i + 1].start : 2030;
    if (eraEnd < left || eraStart > right) continue;
    const x1Raw = yearToPixel(eraStart, vp, W);
    const x2Raw = yearToPixel(eraEnd, vp, W);
    const x1 = Math.max(0, x1Raw);
    const x2 = Math.min(W, x2Raw);
    // Hairline divider between era bands.
    if (i > 0 && x1Raw > 4 && x1Raw < W - 4) {
      ctx.strokeStyle = '#ffffff10';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1Raw, timelineY - 36);
      ctx.lineTo(x1Raw, timelineY + 36);
      ctx.stroke();
    }
    // Era label above the timeline. Only render if the visible band is
    // wide enough to fit it without crowding the next era.
    const visibleWidth = x2 - x1;
    if (visibleWidth >= 80) {
      const labelText = ERAS[i].label.toUpperCase();
      const labelX = (x1 + x2) / 2;
      const labelY = timelineY - 64;
      ctx.font = '500 13px "Fraunces", "Iowan Old Style", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Skip drawing if the label wouldn't fit horizontally.
      const metrics = ctx.measureText(labelText);
      if (metrics.width <= visibleWidth - 16) {
        ctx.fillStyle = '#ffffff45';
        // Letter-spacing emulation for canvas: split into chars.
        const tracked = labelText.split('').join('\u2009\u2009');
        ctx.fillText(tracked, labelX, labelY);
        // Tiny serif italic year-range under the era label.
        ctx.font = 'italic 10px "Fraunces", "Iowan Old Style", Georgia, serif';
        ctx.fillStyle = '#ffffff25';
        const fmt = (y: number) => y < 0 ? `${formatYearShort(y)}` : `${formatYearShort(y)}`;
        ctx.fillText(`${fmt(eraStart)} \u2014 ${fmt(eraEnd)}`, labelX, labelY + 16);
      }
    }
  }

  // Timeline axis — single hairline rule, no colored glow.
  ctx.strokeStyle = '#ffffff20';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, timelineY);
  ctx.lineTo(W, timelineY);
  ctx.stroke();

  // Tick marks — minimal hairline ticks with serif year labels.
  const step = pickTickStep(vp.span);
  ctx.font = `italic 12px "Fraunces", "Iowan Old Style", Georgia, serif`;
  ctx.textAlign = 'center';
  for (let y = Math.ceil(left / step) * step; y <= right; y += step) {
    const x = yearToPixel(y, vp, W);
    ctx.strokeStyle = '#ffffff10';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, timelineY - 6);
    ctx.lineTo(x, timelineY + 6);
    ctx.stroke();
    ctx.fillStyle = '#ffffff55';
    ctx.fillText(formatYearShort(y), x, timelineY + 24);
  }

  // Filter visible events
  const visible = events.filter(ev => isEventVisible(ev, vp));

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

    // Event marker — minimal hairline dot. Era color is reserved for
    // hover/select state; everything else is ink-on-paper.
    const markerSize = isHovered ? 14 : isSelected ? 13 : 10;

    // Single dropline from the marker down to the timeline axis. The
    // line is a solid hairline; on hover it picks up the era accent.
    ctx.strokeStyle = isHovered || isSelected ? ev.color + 'aa' : '#ffffff18';
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x, timelineY);
    ctx.lineTo(x, evY);
    ctx.stroke();

    // Tiny tick where the dropline meets the axis (no fill pip).
    ctx.beginPath();
    ctx.arc(x, timelineY, isHovered ? 2.5 : 1.5, 0, Math.PI * 2);
    ctx.fillStyle = isHovered || isSelected ? ev.color : '#ffffff60';
    ctx.fill();

    // Filled disc — near-white, era color only on hover/select.
    ctx.beginPath();
    ctx.arc(x, evY, markerSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = isHovered || isSelected ? ev.color : '#f5f1e8';
    ctx.fill();
    if (isHovered || isSelected) {
      ctx.strokeStyle = '#ffffff60';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Title in serif — editorial label, white ink.
    ctx.font = `${isHovered ? '500 ' : '400 '}${isHovered ? 14 : 12}px "Fraunces", "Iowan Old Style", Georgia, serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = isHovered ? '#ffffff' : '#ffffffcc';
    ctx.fillText(ev.title, x, evY + markerSize / 2 + 6);
    ctx.shadowBlur = 0;

    // Year sub-label — small serif italic in muted ink.
    ctx.font = `italic 10px "Fraunces", "Iowan Old Style", Georgia, serif`;
    ctx.fillStyle = isHovered ? '#ffffff80' : '#ffffff50';
    ctx.fillText(formatYearShort(ev.year), x, evY + markerSize / 2 + 22);
    ctx.lineCap = 'butt';
  }

  // Render cluster bubbles for groups of 3+ events
  for (const cluster of clusterList) {
    const { events: clusterEvents, centroidX: cx, color } = cluster;
    const count = clusterEvents.length;
    const clusterY = timelineY - 30;
    const RADIUS = 14;

    // Connector line from timeline to cluster bubble
    // Hairline connector
    ctx.strokeStyle = '#ffffff20';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, timelineY);
    ctx.lineTo(cx, clusterY + RADIUS);
    ctx.stroke();
    void color;

    // Outline-only count circle in ink ivory
    ctx.beginPath();
    ctx.arc(cx, clusterY, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,14,26,0.85)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff35';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Count text in serif
    ctx.font = '500 12px "Fraunces", "Iowan Old Style", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f5f1e8';
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

      // Only render arcs for selected/hovered event to avoid visual clutter
      if (!isActiveEvent) continue;

      const lineWidth = 2;

      // Draw curved arc — offset scales with horizontal distance
      ctx.strokeStyle = ev.color + '60';
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();

      const midX = (ht.x + target.x) / 2;
      const arcHeight = Math.max(30, Math.abs(target.x - ht.x) * 0.15);
      const midY = Math.min(ht.y, target.y) - arcHeight;
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

  // (The era label + year range that used to be painted here lived under
  // the editorial header in the redesign and was always doubled-up. The
  // header surfaces both pieces of information typographically, so we
  // skip the on-canvas overlay entirely.)

  return hitTargets;
}
