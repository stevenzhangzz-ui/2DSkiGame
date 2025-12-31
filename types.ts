
export enum SkierLevel {
  BEGINNER = 'Beginner',
  AMATEUR = 'Amateur',
  ADVANCED = 'Advanced',
  EXPERTISE = 'Expertise',
}

export enum FacilityType {
  TRAIL = 'Trail',
  LIFT = 'Lift',
  GONDOLA = 'Gondola',
  CAFE = 'Cafe',
}

export enum TrailDifficulty {
  GREEN = 'Green',
  BLUE = 'Blue',
  BLACK = 'Black',
  DOUBLE_DIAMOND = 'Double Diamond',
  PARK = 'Park',
}

export enum LiftType {
  CHAIR_1 = 'Single Chair',
  CHAIR_2 = 'Double Chair',
  CHAIR_4 = 'Quad Chair',
}

export interface Point {
  x: number;
  y: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  life: number; // 0 to 1
  color: string;
}

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  subType: TrailDifficulty | LiftType | 'Gondola' | 'Cafe';
  start: Point;
  end: Point;
  length: number;
  capacity?: number; // Seats per unit
  seats?: number[]; // Positions of seats (0 to length)
  queue: string[]; // Skier IDs waiting
  createdAt: number; // Timestamp for "New" bonus
  isOpen?: boolean; // Whether the trail is currently open
}

export interface Skier {
  id: string;
  label: string; // A, B, C...
  level: SkierLevel;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  state: 'waiting' | 'skiing' | 'lifting' | 'idle' | 'eating' | 'resting';
  currentFacilityId?: string; // If on a trail or lift
  progress: number; // 0 to 1 along the facility
  rideCount: number; // Number of valid runs for promotion
  seatIndex?: number; // 0..N-1 for lifts
  speedVariance: number; // Multiplier for speed (e.g. 0.9 - 1.1)
  hunger: number; // 0-100, 0 is starving
  lastRentalPayTime: number; 
}

export interface GameConfig {
  gridWidth: number;
  gridHeight: number;
  mountains: Point[][]; // Polygons
}

export interface GameState {
  skiers: Skier[];
  facilities: Facility[];
  trees: Point[]; // Individual tree coordinates
  coins: number;
  time: number; // Game ticks or seconds
  gameSpeed: number; // 0 = paused, 1 = normal, 2 = fast
  promotedCount: number;
  history: string[]; // Logs
  nextSkierLabelIndex: number;
  lastSpawnTime: number;
  proPassActive: boolean; // Learning boost
  isNight: boolean; // True if night time
  lightOpacity: number; // 0 (Day) to ~0.7 (Night)
  hotelPosition: Point; // Dynamic based on scope
  floatingTexts: FloatingText[]; // Animations
  snowDepth: number; // cm
}

export interface SavedMap {
  id: string;
  name: string;
  date: number;
  backgroundImage: string; // base64
  mountains: Point[][];
  hotelPosition?: Point;
}
