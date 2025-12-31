import { Point, TrailDifficulty } from '../types';

export const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const getProjectedPointOnSegment = (p: Point, a: Point, b: Point): { t: number, dist: number } => {
  const l2 = Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2);
  if (l2 === 0) return { t: 0, dist: distance(p, a) };
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y)
  };
  return { t, dist: distance(p, proj) };
};

// Ray casting algorithm for point in polygon
export const isPointInPolygon = (point: Point, vs: Point[]): boolean => {
  const x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// Check if a line segment is completely within any of the polygons
export const isLineInPolygon = (p1: Point, p2: Point, polygons: Point[][]): boolean => {
  const steps = Math.ceil(distance(p1, p2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = p1.x + (p2.x - p1.x) * t;
    const py = p1.y + (p2.y - p1.y) * t;
    const point = { x: px, y: py };
    
    let inAny = false;
    for (const poly of polygons) {
      if (isPointInPolygon(point, poly)) {
        inAny = true;
        break;
      }
    }
    if (!inAny) return false;
  }
  return true;
};

export const generateComplexMountains = (w: number, h: number, count: number): Point[][] => {
  const mountains: Point[][] = [];
  const spacing = w / count;

  for (let i = 0; i < count; i++) {
      const centerX = (i * spacing) + (spacing / 2) + (Math.random() * 6 - 3);
      const peakY = 5 + Math.random() * 5; // Higher peaks
      const width = 12 + Math.random() * 5; // Reasonable width
      const height = 30 + Math.random() * 5; // Tall enough to cover facilities

      // Create a blobby mountain
      const points: Point[] = [];
      points.push({x: centerX, y: peakY}); // Top
      points.push({x: centerX + width/2, y: peakY + height * 0.4}); 
      points.push({x: centerX + width * 0.7, y: peakY + height * 0.8}); 
      points.push({x: centerX + width * 0.8, y: h + 5}); // Extend below bottom
      points.push({x: centerX - width * 0.8, y: h + 5}); // Extend below bottom
      points.push({x: centerX - width * 0.7, y: peakY + height * 0.8}); 
      points.push({x: centerX - width/2, y: peakY + height * 0.4}); 
      
      mountains.push(points);
  }
  return mountains;
}

// --- Curve / Trail Geometry ---

const getTrailParams = (p1: Point, p2: Point, id: string) => {
    const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Determine number of curves (1, 2, or 3)
    // Short trails (< 5 units) usually just 1 curve
    const freq = dist < 5 ? 1 : 1 + (hash % 3); 
    
    // Amplitude based on distance but capped
    // Direction flips based on hash
    const dir = (hash % 2 === 0) ? 1 : -1;
    let amp = Math.min(dist * 0.2, 2.5); 
    
    // Add some randomness to amplitude
    const rand = Math.sin(hash) * 0.5 + 0.5; // 0 to 1
    amp = (amp * 0.5 + amp * 0.5 * rand) * dir;

    return { freq, amp };
};

export const getPointOnTrail = (p1: Point, p2: Point, t: number, id: string, subType?: string) => {
    // Magic Carpet is straight
    if (subType === TrailDifficulty.MAGIC_CARPET) {
        return {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t
        };
    }

    const { freq, amp } = getTrailParams(p1, p2, id);

    // Linear Base
    const bx = p1.x + (p2.x - p1.x) * t;
    const by = p1.y + (p2.y - p1.y) * t;

    // Normal Vector
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    // Sine Wave Offset (Start/End always 0)
    const offset = amp * Math.sin(t * Math.PI * freq);

    return {
        x: bx + nx * offset,
        y: by + ny * offset
    };
};

export const getNearestPointOnTrail = (p: Point, p1: Point, p2: Point, id: string, subType?: string): { t: number, dist: number } => {
    let bestT = 0;
    let bestDist = Infinity;
    const steps = 30; // Higher precision for complex curves
    for(let i=0; i<=steps; i++) {
        const t = i / steps;
        const pos = getPointOnTrail(p1, p2, t, id, subType);
        const d = Math.sqrt(Math.pow(pos.x - p.x, 2) + Math.pow(pos.y - p.y, 2));
        if (d < bestDist) {
            bestDist = d;
            bestT = t;
        }
    }
    return { t: bestT, dist: bestDist };
};

// Generate SVG Path data "M ... L ... L ..."
export const getTrailPathD = (p1: Point, p2: Point, id: string, subType?: string, gridSize: number = 20) => {
    const steps = 20;
    let d = "";
    for(let i=0; i<=steps; i++) {
        const t = i / steps;
        const pos = getPointOnTrail(p1, p2, t, id, subType);
        const cmd = i === 0 ? "M" : "L";
        d += `${cmd} ${pos.x * gridSize} ${pos.y * gridSize} `;
    }
    return d;
}