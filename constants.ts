
import { LiftType, TrailDifficulty, SkierLevel } from './types';

export const GRID_SIZE = 20; // Pixels per grid unit (zoom base)
export const DEFAULT_GRID_W = 160; // 16:9 Aspect Ratio (matches image gen)
export const DEFAULT_GRID_H = 90;  // 16:9 Aspect Ratio

export const COSTS = {
  TRAIL: 10, // per unit
  LIFT_BASE: 50,
  GONDOLA_BASE: 100,
};

export const PROMOTION_TIME_REQUIRED = 300; // 5 minutes (seconds)

export const COLORS = {
  [SkierLevel.BEGINNER]: '#facc15', // Yellow (Tailwind yellow-400)
  [SkierLevel.AMATEUR]: '#22c55e', // Green (green-500)
  [SkierLevel.ADVANCED]: '#3b82f6', // Blue (blue-500)
  [SkierLevel.EXPERTISE]: '#000000', // Black
  
  [TrailDifficulty.MAGIC_CARPET]: '#a7f3d0', // Emerald 200
  [TrailDifficulty.GREEN]: '#22c55e', // Green 500
  [TrailDifficulty.BLUE]: '#2563eb', // Blue 600
  [TrailDifficulty.BLACK]: '#171717', // Neutral 900
  [TrailDifficulty.DOUBLE_DIAMOND]: '#171717', // Black (was Yellow)
  [TrailDifficulty.PARK]: '#f472b6', // Pink 400
};

export const SPEED_MULTIPLIERS = {
  [SkierLevel.BEGINNER]: 1.0,
  [SkierLevel.AMATEUR]: 1.2,
  [SkierLevel.ADVANCED]: 1.44,
  [SkierLevel.EXPERTISE]: 1.728,
};

export const BASE_SKI_SPEED = 0.6; // Base skiing speed (units per second)
export const LIFT_SPEED = 0.4; // Lift speed (units per second)
export const GONDOLA_SPEED = 0.55; // Gondola speed (units per second)

export const LIFT_CAPACITIES = {
  [LiftType.MAGIC_CARPET]: 1, 
  [LiftType.CHAIR_1]: 1,
  [LiftType.CHAIR_2]: 2,
  [LiftType.CHAIR_4]: 4,
  'Gondola': 6,
};

export const getLiftCapacity = (subType: string): number => {
  return LIFT_CAPACITIES[subType as LiftType] || (subType === 'Gondola' ? 6 : 1);
};

export const getLiftNumChairs = (length: number): number => {
  return Math.max(1, Math.floor(length * 0.5)); // 1 chair every 2 units roughly
};

// Visual widths for lifts (in pixels relative to generic size)
export const LIFT_WIDTHS = {
  [LiftType.MAGIC_CARPET]: 0, // Not used
  [LiftType.CHAIR_1]: 8,
  [LiftType.CHAIR_2]: 12, // Shorter/Narrower
  [LiftType.CHAIR_4]: 24, // Wider
  'Gondola': 16,
};
