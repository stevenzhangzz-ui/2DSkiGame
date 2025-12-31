
import { LiftType, TrailDifficulty, SkierLevel } from './types';

export const GRID_SIZE = 20; // Pixels per grid unit (zoom base)
export const DEFAULT_GRID_W = 160; // 16:9 Aspect Ratio (matches image gen)
export const DEFAULT_GRID_H = 90;  // 16:9 Aspect Ratio

export const COSTS = {
  TRAIL: 10, // per unit
  LIFT_BASE: 50,
  GONDOLA_BASE: 100,
  CAFE: 500, // Flat cost
  PRO_PASS: 2000, // Cost to unlock (or toggle price if we make it distinct)
};

export const INCOME = {
  RENTAL: 5, // Charged every minute
  CAFE: 15, // Charged per meal
  LESSON: 50, // Charged for manual lesson
  HOTEL: 20, // Charged per night stay
};

// Promotion Thresholds
export const PROMOTION_COUNTS = {
  [SkierLevel.BEGINNER]: 5,
  [SkierLevel.AMATEUR]: 7,
  [SkierLevel.ADVANCED]: 10,
  [SkierLevel.EXPERTISE]: Infinity // Max level
};

export const PROMOTION_RIDES_REQUIRED = 10; // Fallback
export const PRO_PASS_MULTIPLIER = 2.5; // XP Speed multiplier
export const MAX_POPULATION = 150;
export const MAX_SPAWNED_EXPERTS = 5;

// Day/Night Cycle (Seconds)
export const DURATION_DAY = 60;
export const DURATION_FADE = 5;
export const DURATION_NIGHT = 30;
export const CYCLE_TOTAL = DURATION_DAY + DURATION_FADE + DURATION_NIGHT + DURATION_FADE; // 100s

// Snow Depth (cm)
export const SNOW_IDEAL = 150;
export const SNOW_MIN = 20; // Trails slow below this

export const COLORS = {
  [SkierLevel.BEGINNER]: '#facc15', // Yellow (Tailwind yellow-400)
  [SkierLevel.AMATEUR]: '#22c55e', // Green (green-500)
  [SkierLevel.ADVANCED]: '#3b82f6', // Blue (blue-500)
  [SkierLevel.EXPERTISE]: '#000000', // Black
  
  [TrailDifficulty.GREEN]: '#22c55e', // Green 500
  [TrailDifficulty.BLUE]: '#2563eb', // Blue 600
  [TrailDifficulty.BLACK]: '#171717', // Neutral 900
  [TrailDifficulty.DOUBLE_DIAMOND]: '#171717', // Black (was Yellow)
  [TrailDifficulty.PARK]: '#f472b6', // Pink 400
  'Cafe': '#854d0e', // Brown
  'NightOverlay': 'rgba(10, 15, 40, 0.7)', // Dark Blue-Black
  'Light': '#fff7cd' // Warm light
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
  [LiftType.CHAIR_1]: 1,
  [LiftType.CHAIR_2]: 2,
  [LiftType.CHAIR_4]: 4,
  'Gondola': 6,
  'Cafe': 10,
};

export const TRAIL_NAMES = [
  "Widowmaker", "Lazy Mile", "Excalibur", "Upper Cut", "Lower Limit", "Gunbarrel", "High Noon", "Main Street", 
  "The Plunge", "Outer Limits", "Paradise", "Dynamite", "Ambush", "Stampede", "Ricochet", "Voo Doo", 
  "White Heat", "Rumble", "Temptation", "Shockwave", "Eureka", "Discovery", "Gold Rush", "Silver Bullet",
  "Blue Ox", "Log Jam", "Cloud Nine", "Skyline", "Ridge Run", "The Face", "Sundance", "Showtime",
  "Easy Street", "Home Run", "Sugarloaf", "Big Dipper", "Little Dipper", "Starlight", "Moonwalk", "Comet"
];

export const LIFT_NAMES = [
  "Eagle Express", "Summit Quad", "Gondola One", "Skyline Express", "Vista Bahn", "Galaxy Lift", "Comet Express", 
  "Meteor", "Pioneer", "Settler", "Prospector", "Gold Hill", "Silver Queen", "Red Dog", "K2 Express", 
  "Everest", "Olympia", "Highland", "Bowl Lift", "Backcountry T-Bar", "Super Gauge", "American Flyer", 
  "Timberline", "Iron Horse", "Quick Silver", "Falcon", "Raven", "Lark", "Bluebird"
];

export const getLiftCapacity = (subType: string): number => {
  return LIFT_CAPACITIES[subType as LiftType] || (subType === 'Gondola' ? 6 : (subType === 'Cafe' ? 10 : 1));
};

export const getLiftNumChairs = (length: number, subType?: string): number => {
  return Math.max(1, Math.floor(length * 0.5)); // 1 chair every 2 units roughly
};

// Visual widths for lifts (in pixels relative to generic size)
export const LIFT_WIDTHS = {
  [LiftType.CHAIR_1]: 8,
  [LiftType.CHAIR_2]: 12, // Shorter/Narrower
  [LiftType.CHAIR_4]: 24, // Wider
  'Gondola': 16,
};
