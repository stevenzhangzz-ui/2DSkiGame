
import { 
  GameState, Skier, Facility, Point, 
  SkierLevel, FacilityType, TrailDifficulty, LiftType 
} from '../types';
import { 
  distance, getProjectedPointOnSegment, getNearestPointOnTrail, isPointInPolygon, getPointOnTrail
} from './geometry';
import { 
  SPEED_MULTIPLIERS, BASE_SKI_SPEED, LIFT_SPEED, GONDOLA_SPEED, getLiftCapacity, getLiftNumChairs, PROMOTION_TIME_REQUIRED
} from '../constants';

const NAMES = ["Peak", "Slope", "Run", "Glider", "Express", "Way", "Path", "Drop", "Rise", "View"];

export const getRandomName = (type: string) => {
  return `${NAMES[Math.floor(Math.random() * NAMES.length)]} ${type} ${Math.floor(Math.random() * 100)}`;
};

const getLabel = (index: number): string => {
  let label = "";
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
};

// --- Helper for Map Generation ---
export const findBestStartPoint = (mountain: Point[]): { start: Point, mid: Point } => {
  if (!mountain || mountain.length === 0) return { start: {x: 80, y: 80}, mid: {x: 80, y: 40} };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  mountain.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  // Calculate "Middle of Bottom"
  const centerX = (minX + maxX) / 2;
  const bottomY = maxY;
  
  // Find a valid start point by scanning upwards from bottom-center
  // This ensures we are inside the polygon
  let startY = bottomY - 1; 
  let found = false;
  // Scan up to 30% of height to find a valid base spot
  const limitY = bottomY - (maxY - minY) * 0.3;
  
  while (startY > limitY) {
      if (isPointInPolygon({x: centerX, y: startY}, mountain)) {
          found = true;
          break;
      }
      startY -= 1;
  }

  // If scanning up the center didn't work (e.g. concave bottom), fallback to the lowest vertex
  let start: Point;
  if (found) {
      start = { x: centerX, y: startY - 2 }; // Give a little padding from edge
  } else {
      const lowest = mountain.reduce((prev, curr) => (prev.y > curr.y) ? prev : curr);
      start = { x: lowest.x, y: lowest.y - 2 };
  }

  // Define Mid Point (Mid Station / Peak) target
  // We try to find a point higher up.
  // Find the highest point (min Y)
  const highest = mountain.reduce((prev, curr) => (prev.y < curr.y) ? prev : curr);
  
  // Interpolate between start and highest to find a good mid-mountain spot
  // We prefer it to be roughly aligned with start X if possible for a straight lift look, 
  // but following the slope to the peak is safer for ensuring it's inside.
  const mid = {
      x: start.x + (highest.x - start.x) * 0.65, // 65% up the way to peak
      y: start.y + (highest.y - start.y) * 0.65
  };
  
  // Validation: If computed mid is not inside, fallback to geometric centroid or safe interpolation
  if (!isPointInPolygon(mid, mountain)) {
      // Try simple vertical ray at startX
      let testY = start.y - 10;
      let validMid = false;
      while(testY > minY) {
         if(!isPointInPolygon({x: start.x, y: testY}, mountain)) {
             // We hit a boundary going up? Backtrack a bit and use that
             validMid = true;
             mid.x = start.x;
             mid.y = testY + 5; 
             break;
         }
         testY -= 2;
      }
      if (!validMid) {
          // Fallback to geometric centroid of triangle (start, highest, and a third point?)
          // Just use halfway to highest
          mid.x = (start.x + highest.x) / 2;
          mid.y = (start.y + highest.y) / 2;
      }
  }

  return { start, mid };
};

// --- Tree Management ---

export const generateForest = (mountains: Point[][], w: number, h: number): Point[] => {
  const trees: Point[] = [];
  const density = 0.45; // Density factor per pass
  const passes = 5; // 5x more dense
  const edgeMargin = 1.0; // Margin to stay away from edge
  
  // Stratified Sampling: Iterate over grid cells and place trees randomly within them
  for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
          // Try multiple times per cell to increase density
          for (let i = 0; i < passes; i++) {
            // 1. Random chance to plant
            if (Math.random() > density) continue;

            // 2. Full random position within this 1x1 cell
            const px = x + Math.random();
            const py = y + Math.random();
            const p = { x: px, y: py };

            // 3. Must be inside a mountain AND not on the very edge
            let inside = false;
            for (const poly of mountains) {
                if (isPointInPolygon(p, poly)) {
                    // Check neighbors to ensure we aren't on the bleeding edge
                    const up = { x: px, y: py - edgeMargin };
                    const down = { x: px, y: py + edgeMargin };
                    const left = { x: px - edgeMargin, y: py };
                    const right = { x: px + edgeMargin, y: py };
                    
                    if (isPointInPolygon(up, poly) && 
                        isPointInPolygon(down, poly) && 
                        isPointInPolygon(left, poly) && 
                        isPointInPolygon(right, poly)) {
                        inside = true;
                        break;
                    }
                }
            }
            if (!inside) continue;

            // 4. Altitude check (No trees at very top)
            // Assuming y=0 is top. 
            // Simple Global Y check: Top 20% of screen is snow only.
            if (py < h * 0.20) continue;

            trees.push(p);
          }
      }
  }
  return trees;
};

export const clearTreesForFacility = (trees: Point[], facility: Facility): Point[] => {
  // Clearing radius (grid units)
  // Increased to 0.8 to ensure visible path is cleared (approx 16px radius at 20px grid)
  const CLEAR_RADIUS = 0.8; 

  return trees.filter(tree => {
      if (facility.type === FacilityType.TRAIL) {
          // For trails, we check against the curve
          if (facility.length < 2 || facility.subType === TrailDifficulty.MAGIC_CARPET) {
              // Linear
              const { dist } = getProjectedPointOnSegment(tree, facility.start, facility.end);
              return dist > CLEAR_RADIUS;
          } else {
              // Curved
              const { dist } = getNearestPointOnTrail(tree, facility.start, facility.end, facility.id, facility.subType as string);
              return dist > CLEAR_RADIUS;
          }
      } else {
          // Lifts / Gondolas are straight lines
          const { dist } = getProjectedPointOnSegment(tree, facility.start, facility.end);
          return dist > CLEAR_RADIUS;
      }
  });
};

// --- Skier Logic ---

export const createSkier = (id: string, startPoint: Point, labelIndex: number, level: SkierLevel = SkierLevel.BEGINNER): Skier => ({
  id,
  label: getLabel(labelIndex),
  level,
  x: startPoint.x,
  y: startPoint.y,
  state: 'idle',
  progress: 0,
  timeOnHardestTrail: 0,
  seatIndex: 0,
  speedVariance: 0.85 + Math.random() * 0.3 // 0.85 to 1.15 variance
});

const getHardestAllowed = (level: SkierLevel): TrailDifficulty => {
  switch (level) {
    case SkierLevel.BEGINNER: return TrailDifficulty.GREEN;
    case SkierLevel.AMATEUR: return TrailDifficulty.BLUE;
    case SkierLevel.ADVANCED: return TrailDifficulty.BLACK;
    case SkierLevel.EXPERTISE: return TrailDifficulty.DOUBLE_DIAMOND;
  }
};

// Returns a preference score. Higher is better. 0 means "Avoid".
export const getTrailPreference = (skier: Skier, trailType: TrailDifficulty): number => {
  const levelMap = {
    [SkierLevel.BEGINNER]: 0,
    [SkierLevel.AMATEUR]: 1,
    [SkierLevel.ADVANCED]: 2,
    [SkierLevel.EXPERTISE]: 3
  };
  
  const trailMap = {
    [TrailDifficulty.MAGIC_CARPET]: -1,
    [TrailDifficulty.GREEN]: 0,
    [TrailDifficulty.BLUE]: 1,
    [TrailDifficulty.BLACK]: 2,
    [TrailDifficulty.DOUBLE_DIAMOND]: 3,
    [TrailDifficulty.PARK]: 1.5
  };

  const sLvl = levelMap[skier.level];
  const tLvl = trailMap[trailType];

  // EXPERTISE BEHAVIOR: "Play all terrain, less green, more black/double black"
  if (skier.level === SkierLevel.EXPERTISE) {
    if (trailType === TrailDifficulty.DOUBLE_DIAMOND) return 100;
    if (trailType === TrailDifficulty.BLACK) return 90;
    if (trailType === TrailDifficulty.PARK) return 80;
    if (trailType === TrailDifficulty.BLUE) return 60;
    if (trailType === TrailDifficulty.GREEN) return 20; // Less green
    if (trailType === TrailDifficulty.MAGIC_CARPET) return 5;
    return 50;
  }

  const targetTrail = getHardestAllowed(skier.level);
  const isTarget = trailType === targetTrail;
  
  // Comfort trail is usually one level below current level
  const isComfort = (tLvl === sLvl - 1) || (sLvl === 0 && tLvl === -1); 

  // Check if "close to promotion" (70% of required time)
  const isCloseToPromotion = skier.timeOnHardestTrail >= (PROMOTION_TIME_REQUIRED * 0.7);

  // 1. Target Trail (Needed for promotion)
  if (isTarget) {
    // If close to promotion, prioritize target heavily to finish up
    if (isCloseToPromotion) return 150;
    // Otherwise, secondary preference (~30%)
    return 30; 
  }

  // 2. Comfort Zone
  if (isComfort) {
    // "Tend to stay on comfort (70%)"
    // If close to promotion, reduce comfort preference
    if (isCloseToPromotion) return 20;
    return 70; 
  }

  // Special case for Advanced: "Stay on Green OR Blue"
  // Blue is comfort (handled above), Green is super-comfort
  if (skier.level === SkierLevel.ADVANCED && trailType === TrailDifficulty.GREEN) {
    return isCloseToPromotion ? 10 : 60;
  }

  // 3. Park (Fun for everyone above beginner)
  if (trailType === TrailDifficulty.PARK && sLvl > 0) return 40;

  // 4. Too Hard
  if (tLvl > sLvl) return 1; // Avoid unless forced

  // 5. Way Too Easy
  if (sLvl > tLvl + 2) return 5; 

  // Default fallback
  return 10;
};

const isHardestTrail = (skier: Skier, trailType: TrailDifficulty): boolean => {
  return trailType === getHardestAllowed(skier.level);
};

// Check if a lift leads to suitable terrain
const evaluateLift = (lift: Facility, facilities: Facility[], skier: Skier): number => {
  // Find trails starting near lift end
  const nextTrails = facilities.filter(f => 
    f.type === FacilityType.TRAIL && 
    distance(f.start, lift.end) < 2 
  );

  if (nextTrails.length === 0) return 0; // Dead end

  // Calculate best option score available at the top
  let maxScore = 0;
  nextTrails.forEach(t => {
    let score = getTrailPreference(skier, t.subType as TrailDifficulty);
    
    // HEURISTIC: Encourage crossing mountains (finding higher difficulty trails)
    // If a lift leads to a Black/Double Diamond trail, give it a massive bonus for Advanced/Expertise
    // even if it's far away.
    if ((skier.level === SkierLevel.ADVANCED || skier.level === SkierLevel.EXPERTISE) && 
        (t.subType === TrailDifficulty.BLACK || t.subType === TrailDifficulty.DOUBLE_DIAMOND)) {
        score += 50; 
    }
    
    if (score > maxScore) maxScore = score;
  });

  return maxScore;
};

export const updateGame = (state: GameState, deltaTime: number): GameState => {
  if (state.gameSpeed === 0) return state;

  const dt = deltaTime * state.gameSpeed;
  const newTime = state.time + dt;
  let newCoins = state.coins;
  let promotedCount = state.promotedCount;
  let nextLabelIdx = state.nextSkierLabelIndex ?? 5; 
  let lastSpawnTime = state.lastSpawnTime;

  const coinRate = state.skiers.length / 60; 
  newCoins += coinRate * dt;

  const newFacilities = state.facilities.map(f => ({ ...f, queue: [...f.queue] })); // Deep copy queue
  const skiersToAdd: Skier[] = [];

  // Spawn new skier every 60 seconds
  if (newTime - lastSpawnTime >= 60) {
      const startFacility = newFacilities.find(f => f.name === "Holiday Lift") || newFacilities[0];
      if (startFacility) {
          skiersToAdd.push(createSkier(`s-${Date.now()}-spawn`, startFacility.start, nextLabelIdx));
          lastSpawnTime += 60;
      }
  }

  // LIFT BOARDING LOGIC
  const boardingUpdates = new Map<string, {newState: 'lifting', progress: number, seat: number}>();
  
  newFacilities.forEach(f => {
    if (f.type === FacilityType.LIFT || f.type === FacilityType.GONDOLA) {
       const isGondola = f.type === FacilityType.GONDOLA;
       const speed = (isGondola ? GONDOLA_SPEED : LIFT_SPEED) / Math.max(f.length, 1);
       const numChairs = getLiftNumChairs(f.length);
       const capacity = getLiftCapacity(f.subType as string);

       const cyclePos = newTime * speed * numChairs;
       const phase = cyclePos % 1; 

       const skiersOnLift = state.skiers.filter(s => s.currentFacilityId === f.id && s.state === 'lifting');
       const skiersAtStart = skiersOnLift.filter(s => s.progress < (1/numChairs) * 0.5);
       
       const occupiedSeats = new Set<number>();
       skiersAtStart.forEach(s => {
          if (s.seatIndex !== undefined) occupiedSeats.add(s.seatIndex);
       });
       
       if (phase < 0.2) { 
           // Can board
           const freeSeats = capacity - occupiedSeats.size;
           if (freeSeats > 0 && f.queue.length > 0) {
               
               // Board up to freeSeats from the queue
               for (let i = 0; i < Math.min(f.queue.length, freeSeats); i++) {
                   // We don't remove from queue here, we do it when processing the skier to avoid index mismatch during iteration?
                   // No, we can grab IDs here.
                   const skierId = f.queue[0]; // Peek
                   
                   // Determine seat
                   let seat = 0;
                   if (capacity > 1) {
                      const available = [];
                      for(let k=0; k<capacity; k++) if (!occupiedSeats.has(k)) available.push(k);
                      if (available.length > 0) {
                          seat = available[Math.floor(Math.random() * available.length)];
                          occupiedSeats.add(seat);
                      }
                   } else {
                       seat = 0;
                   }

                   boardingUpdates.set(skierId, {
                       newState: 'lifting',
                       progress: phase / numChairs, 
                       seat: seat
                   });
                   
                   // Remove from queue
                   f.queue.shift();
                   // Adjust loop index since we shifted
                   i--; 
               }
           }
       }
    }
  });

  const processedSkiers = state.skiers.map(skier => {
    let s = { ...skier };
    
    // Apply boarding updates
    if (boardingUpdates.has(s.id)) {
        const update = boardingUpdates.get(s.id)!;
        s.state = update.newState;
        s.progress = update.progress;
        s.seatIndex = update.seat;
    }

    if (s.state === 'idle') {
      let options: { facility: Facility, t: number, score: number }[] = [];

      // 1. Starts exactly near here
      const starts = newFacilities.filter(f => 
        Math.abs(f.start.x - s.x) < 0.5 && Math.abs(f.start.y - s.y) < 0.5
      );
      
      // 2. Merges into middle (Only Trails)
      const trails = newFacilities.filter(f => f.type === FacilityType.TRAIL && !starts.includes(f));
      
      const merges = trails.map(f => {
         if (f.length < 2 || f.subType === TrailDifficulty.MAGIC_CARPET) {
             const { t, dist } = getProjectedPointOnSegment({x: s.x, y: s.y}, f.start, f.end);
             if (dist < 0.8 && t > 0.05 && t < 0.95) return { facility: f, t };
         } else {
             const { t, dist } = getNearestPointOnTrail({x: s.x, y: s.y}, f.start, f.end, f.id, f.subType as string);
             if (dist < 0.8 && t > 0.05 && t < 0.95) return { facility: f, t };
         }
         return null;
      }).filter(Boolean) as { facility: Facility, t: number }[];

      // Evaluate Options
      [...starts.map(f => ({ facility: f, t: 0 })), ...merges].forEach(opt => {
        let score = 0;
        if (opt.facility.type === FacilityType.TRAIL) {
           score = getTrailPreference(s, opt.facility.subType as TrailDifficulty);
        } else {
           score = evaluateLift(opt.facility, newFacilities, s);
        }
        if (opt.t > 0) score += 20;
        if (s.y > 30 && opt.facility.type === FacilityType.LIFT) score += 5;

        options.push({ ...opt, score });
      });

      if (options.length > 0) {
        // Weighted Random Choice
        const viableOptions = options.filter(o => o.score > 0);
        const pool = viableOptions.length > 0 ? viableOptions : options;

        const lottery: typeof options = [];
        pool.forEach(opt => {
          const tickets = Math.max(1, Math.floor(opt.score));
          for(let i=0; i<tickets; i++) lottery.push(opt);
        });

        const chosen = lottery[Math.floor(Math.random() * lottery.length)];
        
        if (chosen.facility.type === FacilityType.LIFT || chosen.facility.type === FacilityType.GONDOLA) {
          s.state = 'waiting';
          s.currentFacilityId = chosen.facility.id;
          s.progress = chosen.t;
          
          // Add to queue
          const targetFac = newFacilities.find(f => f.id === chosen.facility.id);
          if (targetFac && !targetFac.queue.includes(s.id)) {
             targetFac.queue.push(s.id);
          }

        } else {
          s.state = 'skiing';
          s.currentFacilityId = chosen.facility.id;
          s.progress = chosen.t;
        }
      } else {
        // NO RESCUE LOGIC - Skiers wait here in lines (crowd) until a lift is built
        // They remain in 'idle' state at their current position.
        // We do nothing, preserving s.x and s.y.
      }
    } else if (s.state === 'waiting') {
      // Logic handled in boarding update. 
      // Ensure skier is in queue if for some reason popped out (reactivity fix)
      const f = newFacilities.find(fac => fac.id === s.currentFacilityId);
      if (f && !f.queue.includes(s.id)) {
        // If they are waiting but not in queue, add them back (unless they just boarded)
        if (!boardingUpdates.has(s.id)) {
            f.queue.push(s.id);
        }
      }
    } else if (s.state === 'skiing' || s.state === 'lifting') {
      const facility = newFacilities.find(f => f.id === s.currentFacilityId);
      if (facility) {
        const len = Math.max(facility.length, 1);
        let speed = 0;
        const wasSkiing = s.state === 'skiing';
        
        if (wasSkiing) {
          const trailSpeedMultipliers: Record<string, number> = {
             [TrailDifficulty.MAGIC_CARPET]: 0.5,
             [TrailDifficulty.GREEN]: 1.0,
             [TrailDifficulty.BLUE]: 1.2,
             [TrailDifficulty.BLACK]: 1.44,
             [TrailDifficulty.DOUBLE_DIAMOND]: 1.73,
             [TrailDifficulty.PARK]: 1.1
          };
          const trailMult = trailSpeedMultipliers[facility.subType as string] || 1;
          speed = (BASE_SKI_SPEED * trailMult * SPEED_MULTIPLIERS[s.level] * (s.speedVariance || 1.0)) / len;
          
          const levelMap: any = { [SkierLevel.BEGINNER]: 0, [SkierLevel.AMATEUR]: 1, [SkierLevel.ADVANCED]: 2, [SkierLevel.EXPERTISE]: 3 };
          const trailMap: any = { [TrailDifficulty.GREEN]: 0, [TrailDifficulty.BLUE]: 1, [TrailDifficulty.BLACK]: 2, [TrailDifficulty.DOUBLE_DIAMOND]: 3 };
          const tDifficulty = trailMap[facility.subType] ?? -1;
          const sSkill = levelMap[s.level];
          
          if (tDifficulty > sSkill) {
             speed *= 0.5; 
          }

          // --- UPDATE: Continuous Promotion Logic ---
          if (facility.type === FacilityType.TRAIL) {
             const diff = facility.subType as TrailDifficulty;
             if (isHardestTrail(s, diff)) {
                 s.timeOnHardestTrail += dt;
                 
                 // Check Promotion
                 if (s.timeOnHardestTrail >= PROMOTION_TIME_REQUIRED) {
                     s.timeOnHardestTrail = 0;
                     
                     let promoted = false;
                     if (s.level === SkierLevel.BEGINNER) {
                       s.level = SkierLevel.AMATEUR;
                       promoted = true;
                     } else if (s.level === SkierLevel.AMATEUR) {
                       s.level = SkierLevel.ADVANCED;
                       promoted = true;
                     } else if (s.level === SkierLevel.ADVANCED) {
                       s.level = SkierLevel.EXPERTISE;
                       promotedCount += 1;
                       promoted = true;
                     }

                     if (promoted) {
                        const numNew = Math.floor(Math.random() * 2) + 1; 
                        const startFacility = newFacilities.find(f => f.name === "Holiday Lift") || newFacilities[0];
                        if (startFacility) {
                          for(let k=0; k<numNew; k++) {
                             skiersToAdd.push(createSkier(`s-${Date.now()}-${k}`, startFacility.start, nextLabelIdx + k));
                          }
                        }
                     }
                 }
             }
          }

        } else {
          const isGondola = facility.type === FacilityType.GONDOLA;
          speed = (isGondola ? GONDOLA_SPEED : LIFT_SPEED) / len;
        }
        
        s.progress += speed * dt;
        
        if (s.progress >= 1) {
          // Set position to end of facility
          // Add small jitter so if they wait there, they don't stack perfectly (simulating a crowd)
          s.x = facility.end.x + (Math.random() - 0.5) * 0.3;
          s.y = facility.end.y + (Math.random() - 0.5) * 0.3;
          
          s.state = 'idle';
          s.progress = 0;
          s.currentFacilityId = undefined;
        }
      } else {
        s.state = 'idle';
        s.currentFacilityId = undefined;
      }
    }
    
    return s;
  });

  if (skiersToAdd.length > 0) {
     nextLabelIdx += skiersToAdd.length;
  }

  return {
    ...state,
    time: newTime,
    coins: newCoins,
    skiers: [...processedSkiers, ...skiersToAdd],
    facilities: newFacilities,
    promotedCount,
    nextSkierLabelIndex: nextLabelIdx,
    lastSpawnTime
  };
};
