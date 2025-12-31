
import { 
  GameState, Skier, Facility, Point, 
  SkierLevel, FacilityType, TrailDifficulty, LiftType, FloatingText
} from '../types';
import { 
  distance, getProjectedPointOnSegment, getNearestPointOnTrail, isPointInPolygon
} from './geometry';
import { 
  SPEED_MULTIPLIERS, BASE_SKI_SPEED, LIFT_SPEED, GONDOLA_SPEED, 
  getLiftCapacity, getLiftNumChairs, PROMOTION_COUNTS, INCOME, 
  MAX_POPULATION, MAX_SPAWNED_EXPERTS, CYCLE_TOTAL, DURATION_DAY, DURATION_FADE, DURATION_NIGHT,
  SNOW_MIN, SNOW_IDEAL, TRAIL_NAMES, LIFT_NAMES, DEFAULT_GRID_H
} from '../constants';

const NAMES = ["Peak", "Slope", "Run", "Glider", "Express", "Way", "Path", "Drop", "Rise", "View"];

export const getRandomName = (type: string) => {
  if (type === 'Trail') {
     return TRAIL_NAMES[Math.floor(Math.random() * TRAIL_NAMES.length)];
  }
  if (type === 'Lift' || type === 'Gondola' || type === '2-Seat' || type === '4-Seat') {
     return LIFT_NAMES[Math.floor(Math.random() * LIFT_NAMES.length)];
  }
  return `${NAMES[Math.floor(Math.random() * NAMES.length)]} ${type} ${Math.floor(Math.random() * 100)}`;
};

const getLabel = (index: number): string => {
  let label = "";
  let i = index;
  if (i < 0) return "A";
  do {
    const rem = i % 26;
    label = String.fromCharCode(65 + rem) + label;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return label;
};

// --- Helper: Find Hotel Position (Middle Bottom of Scope) ---
export const calculateHotelPosition = (mountains: Point[][], gridH: number): Point => {
    if (!mountains.length) return { x: 80, y: gridH - 10 };
    
    // Flatten points to find bounding box of the first main mountain
    const mainMtn = mountains[0];
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    mainMtn.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    });

    // Place in the middle horizontally, at the bottom of the mountain
    const centerX = (minX + maxX) / 2;
    
    return {
        x: centerX,
        y: Math.min(gridH - 5, maxY)
    };
};

export const findBestStartPoint = (mountain: Point[]): { start: Point, mid: Point } => {
  if (!mountain || mountain.length === 0) return { start: {x: 80, y: 80}, mid: {x: 80, y: 40} };

  // Find lowest center point for start
  const sortedByY = [...mountain].sort((a, b) => b.y - a.y);
  const lowest = sortedByY[0];
  
  // Find highest point for mid
  const highest = [...mountain].sort((a, b) => a.y - b.y)[0];

  const start = { x: lowest.x, y: lowest.y - 2 };
  
  // Mid point at 60% up the mountain
  const mid = {
      x: start.x + (highest.x - start.x) * 0.6,
      y: start.y + (highest.y - start.y) * 0.6
  };

  return { start, mid };
};

// --- Tree Management ---
export const generateForest = (mountains: Point[][], w: number, h: number): Point[] => {
  const trees: Point[] = [];
  const density = 0.45;
  const passes = 5;
  const edgeMargin = 1.0;
  
  for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
          for (let i = 0; i < passes; i++) {
            if (Math.random() > density) continue;
            const px = x + Math.random();
            const py = y + Math.random();
            const p = { x: px, y: py };
            let inside = false;
            for (const poly of mountains) {
                if (isPointInPolygon(p, poly)) {
                    inside = true;
                    break;
                }
            }
            if (!inside) continue;
            if (py < h * 0.20) continue;
            trees.push(p);
          }
      }
  }
  return trees;
};

export const clearTreesForFacility = (trees: Point[], facility: Facility): Point[] => {
  const CLEAR_RADIUS = 0.8; 
  return trees.filter(tree => {
      if (facility.type === FacilityType.TRAIL) {
          if (facility.length < 2) {
              const { dist } = getProjectedPointOnSegment(tree, facility.start, facility.end);
              return dist > CLEAR_RADIUS;
          } else {
              const { dist } = getNearestPointOnTrail(tree, facility.start, facility.end, facility.id, facility.subType as string);
              return dist > CLEAR_RADIUS;
          }
      } else {
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
  rideCount: 0,
  seatIndex: 0,
  speedVariance: 0.85 + Math.random() * 0.3,
  hunger: 100,
  lastRentalPayTime: Date.now()
});

const getPromotionTarget = (level: SkierLevel): TrailDifficulty | null => {
  switch (level) {
    case SkierLevel.BEGINNER: return TrailDifficulty.GREEN; 
    case SkierLevel.AMATEUR: return TrailDifficulty.GREEN; 
    case SkierLevel.ADVANCED: return TrailDifficulty.BLUE; 
    default: return null;
  }
};

export const getTrailPreference = (skier: Skier, trailType: TrailDifficulty, createdAt: number, currentTime: number, isOpen: boolean = true): number => {
  if (!isOpen) return 0; // Skier will not choose a closed trail

  const levelMap = {
    [SkierLevel.BEGINNER]: 0,
    [SkierLevel.AMATEUR]: 1,
    [SkierLevel.ADVANCED]: 2,
    [SkierLevel.EXPERTISE]: 3
  };
  const trailMap = {
    [TrailDifficulty.GREEN]: 0,
    [TrailDifficulty.BLUE]: 1,
    [TrailDifficulty.BLACK]: 2,
    [TrailDifficulty.DOUBLE_DIAMOND]: 3,
    [TrailDifficulty.PARK]: 1.5
  };
  const sLvl = levelMap[skier.level];
  const tLvl = trailMap[trailType];
  let score = 0;

  if (skier.level === SkierLevel.EXPERTISE) {
    if (trailType === TrailDifficulty.DOUBLE_DIAMOND) score = 100;
    else if (trailType === TrailDifficulty.BLACK) score = 90;
    else score = 50;
  } else {
      if (tLvl === sLvl) score = 100;
      else if (tLvl === sLvl - 1) score = 60;
      else if (tLvl > sLvl) score = 1; 
      else score = 20;
  }

  // Bonus for new trails
  if (currentTime - createdAt < 120 && tLvl <= sLvl) score += 200;
  return score;
};

const evaluateLift = (lift: Facility, facilities: Facility[], skier: Skier, currentTime: number): number => {
  // If Lift is closed, AI rejects it
  if (lift.isOpen === false) return 0;

  // Find connected trails at the end of the lift
  const nextTrails = facilities.filter(f => 
    f.type === FacilityType.TRAIL && 
    distance(f.start, lift.end) < 2 
  );

  // DEAD LOOP CHECK: If there are no trails, or ALL connected trails are closed, do not take this lift.
  const openTrails = nextTrails.filter(t => t.isOpen !== false);
  if (openTrails.length === 0) return 0;

  let maxScore = 0;
  openTrails.forEach(t => {
      let score = getTrailPreference(skier, t.subType as TrailDifficulty, t.createdAt, currentTime, t.isOpen);
      if (score > maxScore) maxScore = score;
  });
  return maxScore;
};

// --- Payment Helper ---
const processPayment = (state: GameState, amount: number, x: number, y: number): { coins: number, floatingTexts: FloatingText[] } => {
    const ft: FloatingText = {
        id: `ft-${Date.now()}-${Math.random()}`,
        x, y,
        text: `+$${amount}`,
        life: 1.0,
        color: '#fbbf24' // Gold
    };
    return {
        coins: state.coins + amount,
        floatingTexts: [...state.floatingTexts, ft]
    };
};

const applyConnectivityRules = (facilities: Facility[], gridH: number): Facility[] => {
  const openSet = new Set<string>();
  const queue: string[] = [];

  // 1. Sources: Open Lifts/Gondolas starting in lower 50% of screen (Base Area)
  const BASE_Y_THRESHOLD = gridH * 0.5;
  
  facilities.forEach(f => {
      // Cafes are always open if intrinsically open (independent of lifts)
      if (f.type === FacilityType.CAFE) {
          if (f.isOpen !== false) openSet.add(f.id);
          return;
      }

      if ((f.type === FacilityType.LIFT || f.type === FacilityType.GONDOLA) && f.isOpen !== false) {
          if (f.start.y > BASE_Y_THRESHOLD) {
              openSet.add(f.id);
              queue.push(f.id);
          }
      }
  });

  // 2. Build Graph (Source feeds Target)
  const adj = new Map<string, string[]>();
  facilities.forEach(source => {
      if (source.isOpen === false) return; // Closed things don't feed
      facilities.forEach(target => {
          if (source.id === target.id) return;
          // Connection: Source END feeds Target START
          // Tolerance 3.0 units
          if (distance(source.end, target.start) < 3.0) {
              if (!adj.has(source.id)) adj.set(source.id, []);
              adj.get(source.id)!.push(target.id);
          }
      });
  });

  // 3. Propagate Open Status via BFS
  while(queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = adj.get(curr);
      if (neighbors) {
          neighbors.forEach(nextId => {
              if (!openSet.has(nextId)) {
                  const f = facilities.find(x => x.id === nextId);
                  // Only propagate if intrinsically open
                  if (f && f.isOpen !== false) {
                      openSet.add(nextId);
                      queue.push(nextId);
                  }
              }
          });
      }
  }

  // 4. Update Open Status
  return facilities.map(f => {
      if (f.type === FacilityType.CAFE) return f; 
      if (f.isOpen === false) return f; // Already closed
      
      // If not reachable from base, force close
      if (!openSet.has(f.id)) {
          return { ...f, isOpen: false };
      }
      return f;
  });
};

export const updateGame = (state: GameState, deltaTime: number): GameState => {
  if (state.gameSpeed === 0) return state;

  const dt = deltaTime * state.gameSpeed;
  const newTime = state.time + dt;
  let newCoins = state.coins;
  let promotedCount = state.promotedCount;
  let nextLabelIdx = state.nextSkierLabelIndex ?? 5; 
  let lastSpawnTime = state.lastSpawnTime;
  let newFloatingTexts = [...state.floatingTexts];
  let snowDepth = state.snowDepth ?? 60; 

  // Update Floating Texts (Physics)
  newFloatingTexts = newFloatingTexts.map(ft => ({
      ...ft,
      y: ft.y - (dt * 0.5), // Float up
      life: ft.life - (dt * 0.5) // Decay
  })).filter(ft => ft.life > 0);

  // Day / Night Cycle
  const cycleTime = newTime % CYCLE_TOTAL;
  let lightOpacity = 0;
  let isNight = false;

  if (cycleTime < DURATION_DAY) {
      lightOpacity = 0; isNight = false;
  } else if (cycleTime < DURATION_DAY + DURATION_FADE) {
      isNight = false;
      lightOpacity = ((cycleTime - DURATION_DAY) / DURATION_FADE);
  } else if (cycleTime < DURATION_DAY + DURATION_FADE + DURATION_NIGHT) {
      isNight = true; lightOpacity = 1; 
  } else {
      isNight = true; 
      lightOpacity = 1 - ((cycleTime - (DURATION_DAY + DURATION_FADE + DURATION_NIGHT)) / DURATION_FADE);
  }

  // Detect Phase Shifts
  const justBecameNight = isNight && !state.isNight;
  const justBecameDay = !isNight && state.isNight;

  // Snow Weather Simulation
  if (Math.random() < 0.05) {
      const change = (Math.random() - 0.4) * 0.5;
      snowDepth = Math.max(0, Math.min(300, snowDepth + change));
  }
  
  const getSnowSpeedMod = (depth: number) => {
      if (depth < SNOW_MIN) return 0.4;
      if (depth < 50) return 0.8;
      if (depth > 200) return 0.9;
      return 1.0;
  };
  const snowSpeedMod = getSnowSpeedMod(snowDepth);

  // Update Facility Status (Daily & Nightly Logic)
  let newFacilities = state.facilities;

  // Determine daily statuses on sunrise or if facilities changed
  if (justBecameDay) {
      newFacilities = state.facilities.map(f => {
          let isOpen = true;
          // Random Wind Hold for Lifts on a new day (10% chance)
          if (f.type === FacilityType.LIFT || f.type === FacilityType.GONDOLA) {
              if (Math.random() < 0.1) isOpen = false; 
          }
          return { ...f, isOpen, queue: [...f.queue] };
      });
  } else if (justBecameNight) {
      const nextFacilities = state.facilities.map(f => ({ ...f, queue: [...f.queue] }));
      const openTrailIds = new Set<string>();

      // 1. Determine Trail Status (Green=Open, Blue=70%, Others=Closed)
      nextFacilities.forEach(f => {
          if (f.type === FacilityType.TRAIL) {
              let isOpen = false;
              if (f.subType === TrailDifficulty.GREEN) {
                  isOpen = true;
              } else if (f.subType === TrailDifficulty.BLUE) {
                  isOpen = Math.random() < 0.7;
              } else {
                  isOpen = false;
              }
              f.isOpen = isOpen;
              if (isOpen) openTrailIds.add(f.id);
          } else if (f.type === FacilityType.LIFT || f.type === FacilityType.GONDOLA) {
              f.isOpen = false; // Close all first, open needed ones below
          }
      });

      // 2. Identify Lifts needed for Open Trails (Reverse Connectivity)
      const feeders = new Map<string, Facility[]>();
      nextFacilities.forEach(source => {
          if (source.type === FacilityType.LIFT || source.type === FacilityType.GONDOLA) {
              nextFacilities.forEach(target => {
                  if (source.id !== target.id && distance(source.end, target.start) < 3.0) {
                      if (!feeders.has(target.id)) feeders.set(target.id, []);
                      feeders.get(target.id)!.push(source);
                  }
              });
          }
      });

      const neededQueue = Array.from(openTrailIds);
      const neededLifts = new Set<string>();

      while (neededQueue.length > 0) {
          const targetId = neededQueue.shift()!;
          const sources = feeders.get(targetId);
          if (sources) {
              sources.forEach(source => {
                  if (!neededLifts.has(source.id)) {
                      neededLifts.add(source.id);
                      neededQueue.push(source.id);
                  }
              });
          }
      }

      // 3. Open needed lifts
      nextFacilities.forEach(f => {
          if (neededLifts.has(f.id)) f.isOpen = true;
      });
      
      // Fallback: Ensure at least one lift is open if trails are open but no connections found
      if (openTrailIds.size > 0 && neededLifts.size === 0) {
          let bestLift: Facility | null = null;
          let minD = Infinity;
          const lifts = nextFacilities.filter(f => f.type === FacilityType.LIFT || f.type === FacilityType.GONDOLA);
          lifts.forEach(l => {
              nextFacilities.filter(t => openTrailIds.has(t.id)).forEach(t => {
                  const d = distance(l.end, t.start);
                  if (d < minD) { minD = d; bestLift = l; }
              });
          });
          if (bestLift && minD < 20) (bestLift as Facility).isOpen = true;
      }

      newFacilities = nextFacilities;
  } else {
      // Just copy queue refs to mutate safely below
      newFacilities = state.facilities.map(f => ({ ...f, queue: [...f.queue] }));
  }

  // Check Connectivity (Reachability from Base)
  newFacilities = applyConnectivityRules(newFacilities, DEFAULT_GRID_H);

  const skiersToAdd: Skier[] = [];

  // Identify skiers to rest at night start (50% chance)
  const skiersToRest = new Set<string>();
  if (justBecameNight) {
      state.skiers.forEach(s => {
          if (Math.random() < 0.5) {
              skiersToRest.add(s.id);
          }
      });
      
      // Clear them from queues immediately
      newFacilities.forEach(f => {
          f.queue = f.queue.filter(id => !skiersToRest.has(id));
      });
  }

  // Identify lifts for wake up spawn
  let spawnPoints: Point[] = [];
  if (justBecameDay) {
      spawnPoints = newFacilities
          .filter(f => (f.type === FacilityType.LIFT || f.type === FacilityType.GONDOLA) && f.isOpen !== false)
          .map(f => f.start);
      // Fallback if all lifts closed, spawn near middle base
      if (spawnPoints.length === 0) spawnPoints.push({x: 80, y: 80});
  }

  // Spawning (Only Day)
  if (!isNight && state.skiers.length < MAX_POPULATION && newTime - lastSpawnTime >= 60) {
      // Find an OPEN lift to spawn at
      const startFacility = newFacilities.find(f => (f.type === FacilityType.LIFT || f.type === FacilityType.GONDOLA) && f.isOpen !== false) || newFacilities[0];
      
      if (startFacility) {
          const roll = Math.random();
          let spawnLevel = SkierLevel.BEGINNER;
          const currentExperts = state.skiers.filter(s => s.level === SkierLevel.EXPERTISE).length;
          const canSpawnExpert = currentExperts < MAX_SPAWNED_EXPERTS;

          if (roll < 0.30) spawnLevel = SkierLevel.BEGINNER;
          else if (roll < 0.70) spawnLevel = SkierLevel.AMATEUR;
          else if (roll < 0.95) spawnLevel = SkierLevel.ADVANCED;
          else spawnLevel = canSpawnExpert ? SkierLevel.EXPERTISE : SkierLevel.ADVANCED;

          skiersToAdd.push(createSkier(`s-${Date.now()}-spawn`, startFacility.start, nextLabelIdx, spawnLevel));
          lastSpawnTime += 60;
      }
  }

  // Lift Boarding
  const boardingUpdates = new Map<string, {newState: 'lifting', progress: number, seat: number}>();
  newFacilities.forEach(f => {
    // Skiers cannot board closed lifts
    if ((f.type === FacilityType.LIFT || f.type === FacilityType.GONDOLA) && f.isOpen !== false) {
       const isGondola = f.type === FacilityType.GONDOLA;
       const baseSpeed = isGondola ? GONDOLA_SPEED : LIFT_SPEED;
       const speed = baseSpeed / Math.max(f.length, 1);
       const numChairs = getLiftNumChairs(f.length, f.subType as string);
       const capacity = getLiftCapacity(f.subType as string);
       const cyclePos = newTime * speed * numChairs;
       const phase = cyclePos % 1; 

       const skiersOnLift = state.skiers.filter(s => s.currentFacilityId === f.id && s.state === 'lifting');
       const skiersAtStart = skiersOnLift.filter(s => s.progress < (1/numChairs) * 0.5);
       
       const occupiedSeats = new Set<number>();
       skiersAtStart.forEach(s => { if (s.seatIndex !== undefined) occupiedSeats.add(s.seatIndex); });
       
       if (phase < 0.2) { 
           const freeSeats = capacity - occupiedSeats.size;
           if (freeSeats > 0 && f.queue.length > 0) {
               for (let i = 0; i < Math.min(f.queue.length, freeSeats); i++) {
                   const skierId = f.queue[0];
                   let seat = 0;
                   if (capacity > 1) {
                      const available = [];
                      for(let k=0; k<capacity; k++) if (!occupiedSeats.has(k)) available.push(k);
                      if (available.length > 0) {
                          seat = available[Math.floor(Math.random() * available.length)];
                          occupiedSeats.add(seat);
                      }
                   }
                   boardingUpdates.set(skierId, { newState: 'lifting', progress: phase / numChairs, seat: seat });
                   f.queue.shift();
                   i--; 
               }
           }
       }
    }
  });

  const processedSkiers = state.skiers.map(skier => {
    let s = { ...skier };
    
    // NIGHT TRANSITION (Go to Hotel)
    if (justBecameNight && skiersToRest.has(s.id)) {
        s.state = 'resting';
        s.currentFacilityId = undefined;
        s.x = state.hotelPosition.x + (Math.random() * 4 - 2);
        s.y = state.hotelPosition.y + (Math.random() * 2 - 1);
        
        // Pay Hotel Fee
        const pay = processPayment({ ...state, coins: newCoins, floatingTexts: newFloatingTexts }, INCOME.HOTEL, s.x, s.y);
        newCoins = pay.coins;
        newFloatingTexts = pay.floatingTexts;
    } 
    // DAY TRANSITION (Wake up from resting)
    else if (justBecameDay && s.state === 'resting') {
        s.state = 'idle';
        const start = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
        s.x = start.x + (Math.random() - 0.5);
        s.y = start.y + (Math.random() - 0.5);
    }

    if (s.state === 'resting') {
        // Micro-movement in hotel
        if (Math.random() < 0.05) {
             s.x += (Math.random() - 0.5) * 0.5;
             s.y += (Math.random() - 0.5) * 0.2;
             if(Math.abs(s.x - state.hotelPosition.x) > 4) s.x = state.hotelPosition.x;
             if(Math.abs(s.y - state.hotelPosition.y) > 2) s.y = state.hotelPosition.y;
        }
        return s; 
    }

    // RENTAL CHARGE (Every 60 game seconds)
    if (!s.lastRentalPayTime) s.lastRentalPayTime = newTime;
    if (newTime - s.lastRentalPayTime > 60) {
       s.lastRentalPayTime = newTime;
       const pay = processPayment({ ...state, coins: newCoins, floatingTexts: newFloatingTexts }, INCOME.RENTAL, s.x, s.y);
       newCoins = pay.coins;
       newFloatingTexts = pay.floatingTexts;
    }

    // HUNGER DECAY (Rate: ~80 points per 100s cycle -> 0.8/sec)
    if (s.state !== 'eating') {
      s.hunger = Math.max(0, s.hunger - (dt * 0.8));
    }

    if (boardingUpdates.has(s.id)) {
        const update = boardingUpdates.get(s.id)!;
        s.state = update.newState;
        s.progress = update.progress;
        s.seatIndex = update.seat;
    }

    // EATING
    if (s.state === 'eating') {
       s.progress += dt * 0.5; 
       if (s.progress >= 1) {
          s.hunger = 100;
          s.state = 'idle';
          s.currentFacilityId = undefined;
          
          const pay = processPayment({ ...state, coins: newCoins, floatingTexts: newFloatingTexts }, INCOME.CAFE, s.x, s.y);
          newCoins = pay.coins;
          newFloatingTexts = pay.floatingTexts;
          
          const cafe = newFacilities.find(f => f.id === s.currentFacilityId);
          if (cafe) {
             s.x = cafe.start.x + (Math.random()-0.5);
             s.y = cafe.start.y + (Math.random()-0.5);
          }
       }
       return s;
    }

    // IDLE LOGIC
    if (s.state === 'idle') {
      let options: { facility: Facility, t: number, score: number }[] = [];

      // Hungry?
      if (s.hunger < 30) {
          const cafes = newFacilities.filter(f => f.type === FacilityType.CAFE);
          cafes.forEach(cafe => {
             const d = distance(cafe.start, s);
             if (d < 15) options.push({ facility: cafe, t: 0, score: 2000 - d * 10 });
          });
      }

      if (options.length === 0) {
        // Find nearby facilities
        const starts = newFacilities.filter(f => Math.abs(f.start.x - s.x) < 1.0 && Math.abs(f.start.y - s.y) < 1.0);
        
        // Or connect to mid-trail?
        const trails = newFacilities.filter(f => f.type === FacilityType.TRAIL && !starts.includes(f));
        const merges = trails.map(f => {
           const minX = Math.min(f.start.x, f.end.x) - 1;
           const maxX = Math.max(f.start.x, f.end.x) + 1;
           const minY = Math.min(f.start.y, f.end.y) - 1;
           const maxY = Math.max(f.start.y, f.end.y) + 1;
           if (s.x < minX || s.x > maxX || s.y < minY || s.y > maxY) return null;

           if (f.length < 2) {
               const { t, dist } = getProjectedPointOnSegment({x: s.x, y: s.y}, f.start, f.end);
               if (dist < 0.8 && t > 0.05 && t < 0.95) return { facility: f, t };
           } else {
               const { t, dist } = getNearestPointOnTrail({x: s.x, y: s.y}, f.start, f.end, f.id, f.subType as string);
               if (dist < 0.8 && t > 0.05 && t < 0.95) return { facility: f, t };
           }
           return null;
        }).filter(Boolean) as { facility: Facility, t: number }[];

        [...starts.map(f => ({ facility: f, t: 0 })), ...merges].forEach(opt => {
          let score = 0;
          if (opt.facility.type === FacilityType.TRAIL) {
             score = getTrailPreference(s, opt.facility.subType as TrailDifficulty, opt.facility.createdAt, newTime, opt.facility.isOpen);
          } else if (opt.facility.type === FacilityType.LIFT || opt.facility.type === FacilityType.GONDOLA) {
             score = evaluateLift(opt.facility, newFacilities, s, newTime);
          }
          if (opt.t > 0) score += 20;
          options.push({ ...opt, score });
        });
      }

      if (options.length > 0) {
        const viableOptions = options.filter(o => o.score > 0);
        const pool = viableOptions.length > 0 ? viableOptions : options;
        
        // Simple weighted choice
        let bestOption = pool[0];
        let maxS = -1;
        // Add randomness
        pool.forEach(o => {
            const rScore = o.score * Math.random();
            if(rScore > maxS) { maxS = rScore; bestOption = o; }
        });

        if (bestOption.facility.type === FacilityType.CAFE) {
           s.state = 'eating'; s.currentFacilityId = bestOption.facility.id; s.progress = 0;
        } else if (bestOption.facility.type === FacilityType.LIFT || bestOption.facility.type === FacilityType.GONDOLA) {
          s.state = 'waiting'; s.currentFacilityId = bestOption.facility.id; s.progress = bestOption.t;
          const fac = newFacilities.find(f => f.id === bestOption.facility.id);
          if (fac && !fac.queue.includes(s.id)) fac.queue.push(s.id);
        } else {
          s.state = 'skiing'; s.currentFacilityId = bestOption.facility.id; s.progress = bestOption.t;
        }
      } 
    } else if (s.state === 'waiting') {
      const f = newFacilities.find(fac => fac.id === s.currentFacilityId);
      if (f && !f.queue.includes(s.id) && !boardingUpdates.has(s.id)) f.queue.push(s.id);
    } else if (s.state === 'skiing' || s.state === 'lifting') {
      const facility = newFacilities.find(f => f.id === s.currentFacilityId);
      if (facility) {
        const len = Math.max(facility.length, 1);
        let speed = 0;
        const wasSkiing = s.state === 'skiing';
        
        if (wasSkiing) {
          const trailMult = { [TrailDifficulty.GREEN]: 1.0, [TrailDifficulty.BLUE]: 1.2, [TrailDifficulty.BLACK]: 1.44, [TrailDifficulty.DOUBLE_DIAMOND]: 1.73, [TrailDifficulty.PARK]: 1.1 }[facility.subType as string] || 1;
          speed = (BASE_SKI_SPEED * trailMult * SPEED_MULTIPLIERS[s.level] * (s.speedVariance || 1.0)) / len;
          
          // Beginners slow on hard trails
           const tLvl = { [TrailDifficulty.GREEN]: 0, [TrailDifficulty.BLUE]: 1, [TrailDifficulty.BLACK]: 2, [TrailDifficulty.DOUBLE_DIAMOND]: 3 }[facility.subType] ?? -1;
           const sLvl = { [SkierLevel.BEGINNER]: 0, [SkierLevel.AMATEUR]: 1, [SkierLevel.ADVANCED]: 2, [SkierLevel.EXPERTISE]: 3 }[s.level];
           if (tLvl > sLvl) speed *= 0.3; 

           // Apply Snow Depth Penalty
           speed *= snowSpeedMod;
        } else {
          // Check if Lift is Open
          if (facility.isOpen === false) {
              speed = 0; // Chair stops moving
          } else {
              speed = (facility.type === FacilityType.GONDOLA ? GONDOLA_SPEED : LIFT_SPEED) / len;
          }
        }

        if (wasSkiing && s.hunger < 30) speed *= 0.5;
        if (!Number.isFinite(speed)) speed = 0.01;

        s.progress += speed * dt;
        
        if (s.progress >= 1) {
           if (wasSkiing && facility.type === FacilityType.TRAIL) {
               // Promotion Logic
               const subType = facility.subType as TrailDifficulty;
               const target = getPromotionTarget(s.level);
               let rideValue = (target === subType) ? 1 : (subType === TrailDifficulty.PARK ? 2 : 0);
               
               if (rideValue > 0) {
                   s.rideCount = (s.rideCount || 0) + rideValue;
                   const req = PROMOTION_COUNTS[s.level] || 10;
                   if (s.rideCount >= req) {
                       s.rideCount = 0;
                       let promoted = false;
                       if (s.level === SkierLevel.BEGINNER) { s.level = SkierLevel.AMATEUR; promoted = true; }
                       else if (s.level === SkierLevel.AMATEUR) { s.level = SkierLevel.ADVANCED; promoted = true; }
                       else if (s.level === SkierLevel.ADVANCED) { s.level = SkierLevel.EXPERTISE; promotedCount += 1; promoted = true; }
                   }
               }
           }
           s.x = facility.end.x + (Math.random() - 0.5) * 0.3;
           s.y = facility.end.y + (Math.random() - 0.5) * 0.3;
           s.state = 'idle'; s.progress = 0; s.currentFacilityId = undefined;
        }
      } else {
        s.state = 'idle'; s.currentFacilityId = undefined;
      }
    }
    return s;
  });

  if (skiersToAdd.length > 0) nextLabelIdx += skiersToAdd.length;

  return {
    ...state,
    time: newTime,
    coins: newCoins,
    skiers: [...processedSkiers, ...skiersToAdd],
    facilities: newFacilities,
    promotedCount,
    nextSkierLabelIndex: nextLabelIdx,
    lastSpawnTime,
    isNight,
    lightOpacity,
    floatingTexts: newFloatingTexts,
    snowDepth
  };
};
