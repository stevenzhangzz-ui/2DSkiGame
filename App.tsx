import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  GameConfig, GameState, SkierLevel, Facility, Point, TrailDifficulty, 
  LiftType, FacilityType, SavedMap 
} from './types';
import { distance, isLineInPolygon, isPointInPolygon } from './services/geometry';
import { updateGame, createSkier, getRandomName, generateForest, clearTreesForFacility, findBestStartPoint } from './services/gameLogic';
import { COSTS, DEFAULT_GRID_W, DEFAULT_GRID_H, GRID_SIZE } from './constants';
import { saveMapToStorage, loadMapsFromStorage, deleteMapFromStorage } from './services/storage';
import GameCanvas from './components/GameCanvas';
import Dashboard from './components/Dashboard';
import Controls from './components/Controls';
import { GoogleGenAI } from "@google/genai";

type GamePhase = 'init' | 'drawing' | 'playing';

const App: React.FC = () => {
  // Config
  const [config, setConfig] = useState<GameConfig>({
    gridWidth: DEFAULT_GRID_W,
    gridHeight: DEFAULT_GRID_H,
    mountains: []
  });

  // State
  const [gamePhase, setGamePhase] = useState<GamePhase>('init');
  const [gameState, setGameState] = useState<GameState>({
    skiers: [],
    facilities: [],
    trees: [],
    coins: 500, // Starting coins
    time: 0,
    gameSpeed: 1,
    promotedCount: 0,
    history: [],
    nextSkierLabelIndex: 0,
    lastSpawnTime: 0
  });

  // UI State
  const [viewX, setViewX] = useState(0);
  const [viewY, setViewY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [selectedTool, setSelectedTool] = useState<any>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [destroyMode, setDestroyMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStep, setGenStep] = useState<string>("");
  
  // Save/Load System State
  const [savedMaps, setSavedMaps] = useState<SavedMap[]>([]);
  const [showLoadScreen, setShowLoadScreen] = useState(true);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newMapName, setNewMapName] = useState("");

  // Drawing Mode State
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);

  const centerView = useCallback((targetX?: number, targetY?: number) => {
    // Grid center in pixels (default or target)
    const centerX = (targetX ?? Math.floor(DEFAULT_GRID_W / 2)) * GRID_SIZE;
    const centerY = (targetY ?? (Math.floor(DEFAULT_GRID_H / 2) - 5)) * GRID_SIZE;
    
    // Viewport adjustment (subtract sidebar width 288px)
    const viewportW = window.innerWidth - 288;
    const viewportH = window.innerHeight;
    
    const vx = centerX - viewportW / 2;
    const vy = centerY - viewportH / 2;
    
    setViewX(vx);
    setViewY(vy);
    setZoom(1);
  }, []);

  // --- Logic to setup game state from mountain data ---
  const setupGameFromMountains = useCallback((mountains: Point[][]) => {
    const w = DEFAULT_GRID_W;
    const h = DEFAULT_GRID_H;

    // 1. Find the best mountain to start on (Middle or Largest)
    const sortedMounts = [...mountains].sort((a, b) => {
       const avgAx = a.reduce((sum, p) => sum + p.x, 0) / a.length;
       const avgBx = b.reduce((sum, p) => sum + p.x, 0) / b.length;
       return avgAx - avgBx;
    });

    const mainMountain = sortedMounts[Math.floor(sortedMounts.length / 2)] || mountains[0];
    
    // 2. Determine Start Points
    const { start: startPoint, mid: midPoint } = findBestStartPoint(mainMountain);

    // 3. Initial Facilities
    const facilities: Facility[] = [
      {
        id: 'magic-start', name: 'Magic Start', type: FacilityType.LIFT, subType: LiftType.MAGIC_CARPET,
        start: { x: startPoint.x - 5, y: startPoint.y }, end: { x: startPoint.x, y: startPoint.y }, length: 5, queue: []
      },
      {
        id: 'holiday-lift', name: 'Holiday Lift', type: FacilityType.LIFT, subType: LiftType.CHAIR_2,
        start: { x: startPoint.x, y: startPoint.y }, end: midPoint, length: distance(startPoint, midPoint), queue: []
      },
      {
        id: 'magic-down', name: 'Magic Down', type: FacilityType.TRAIL, subType: TrailDifficulty.GREEN,
        start: { x: startPoint.x, y: startPoint.y }, end: { x: startPoint.x - 5, y: startPoint.y }, length: 5, queue: []
      },
      {
        id: 'holiday-run', name: 'Holiday', type: FacilityType.TRAIL, subType: TrailDifficulty.GREEN,
        start: midPoint, end: { x: startPoint.x, y: startPoint.y }, length: distance(startPoint, midPoint), queue: []
      }
    ];

    // 4. Generate Trees
    let trees = generateForest(mountains, w, h);
    facilities.forEach(f => {
       trees = clearTreesForFacility(trees, f);
    });

    // 5. Initial Skiers
    const skiers = Array.from({ length: 5 }).map((_, i) => 
      createSkier(`skier-${i}`, { x: startPoint.x - 5, y: startPoint.y }, i, SkierLevel.BEGINNER)
    );

    // 6. Update State
    setConfig({ gridWidth: DEFAULT_GRID_W, gridHeight: DEFAULT_GRID_H, mountains });
    setGameState({
      skiers,
      facilities,
      trees,
      coins: 500,
      time: 0,
      gameSpeed: 1,
      promotedCount: 0,
      history: ['Game Started'],
      nextSkierLabelIndex: 5,
      lastSpawnTime: 0
    });

    centerView(startPoint.x, (startPoint.y + midPoint.y) / 2);

  }, [centerView]);


  // --- AI Pipeline ---
  const generateAndAnalyzeMap = useCallback(async () => {
    // Reset Game State for new generation
    setGameState(prev => ({ ...prev, skiers: [], facilities: [], trees: [], coins: 500, promotedCount: 0 }));
    setConfig(prev => ({ ...prev, mountains: [] }));
    setBgImage(null);
    setGamePhase('init');
    setDrawingPoints([]);

    // Step 0: Ensure API Key Selection
    // This is crucial for Pro models to avoid 500 errors related to billing/auth in some environments
    if ((window as any).aistudio) {
      try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) {
            await (window as any).aistudio.openSelectKey();
        }
      } catch (err) {
        console.warn("AI Studio Key Selection check failed", err);
      }
    }

    if (!process.env.API_KEY) {
      // No API Key - Skip to drawing on blank/fallback background
      console.log("No API Key found, skipping AI generation.");
      setGamePhase('drawing');
      setIsDrawing(true);
      return;
    }

    setIsGenerating(true);
    setGenStep("Creating Map Visuals...");
    
    try {
      // Re-init client to pick up any newly selected key
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Step 1: Generate Image
      // Using gemini-3-pro-image-preview for higher stability and quality
      const generateImage = async () => {
        return await ai.models.generateContent({
          model: 'gemini-3-pro-image-preview',
          contents: {
            parts: [
              { text: "A high-angle frontal view (orthographic/isometric style) of a massive snowy ski resort. Foreground: 3 main snow-covered mountain slopes with sharp peaks and wide bases, completely clean (white snow only) for game overlay. Background: A rich scenic environment including a large blue lake at the bottom, a smoking volcano in the distance, and surrounding mountain ranges. Style: 4k, vivid colors, detailed landscape art. NOT a bird's eye view. STRICTLY NO TREES or LIFTS on the main 3 mountains." }
            ]
          },
          config: {
            imageConfig: { 
              aspectRatio: "16:9",
              imageSize: "2K" // Better quality/performance balance
            }
          }
        });
      };

      let imageResp;
      try {
        imageResp = await generateImage();
      } catch (err) {
        console.warn("First image generation attempt failed, retrying...", err);
        // Simple retry mechanism for robustness
        imageResp = await generateImage();
      }

      let base64Image = "";
      if (imageResp.candidates?.[0]?.content?.parts) {
        for (const part of imageResp.candidates[0].content.parts) {
          if (part.inlineData) {
            base64Image = part.inlineData.data;
            break;
          }
        }
      }

      if (base64Image) {
        setBgImage(`data:image/png;base64,${base64Image}`);
        setGenStep("Ready to Draw!");
        await new Promise(r => setTimeout(r, 500));
      } else {
        throw new Error("No image data received from API");
      }

    } catch (e: any) {
      console.error("Map Gen Error:", e);
      // Fallback: Proceed to drawing mode even if image gen fails
      setMessage(`AI Map Gen failed (${e.message || 'Error'}). Switching to manual drawing.`);
    } finally {
      setIsGenerating(false);
      setGenStep("");
      // ALWAYS enter drawing phase
      setGamePhase('drawing');
      setIsDrawing(true);
    }
  }, []);

  // Initialize: Load Maps from IndexedDB
  useEffect(() => {
    const load = async () => {
      try {
        const maps = await loadMapsFromStorage();
        setSavedMaps(maps);
      } catch (e) {
        console.error("Failed to load maps from storage", e);
      }
    };
    load();
  }, []);

  // Handle window resize logic
  useEffect(() => {
      const handleResize = () => {
          // Optional: re-center or just let the user pan
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Game Loop
  useEffect(() => {
    if (gamePhase !== 'playing') return; // Don't run game loop until playing

    let lastTime = performance.now();
    let frameId: number;

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      setGameState(prev => updateGame(prev, dt));
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [gamePhase]);

  // Load Map Logic
  const handleLoadMap = (map: SavedMap) => {
    setShowLoadScreen(false);
    setBgImage(map.backgroundImage);
    setConfig(prev => ({ ...prev, mountains: map.mountains }));
    // Setup game with saved mountains
    setupGameFromMountains(map.mountains);
    setGamePhase('playing');
  };

  const handleCreateNew = () => {
    setShowLoadScreen(false);
    generateAndAnalyzeMap();
  };

  const handleDeleteMap = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteMapFromStorage(id);
      setSavedMaps(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error("Failed to delete map", err);
    }
  };

  // Triggered from Controls ("Finish Shape")
  const handleFinishDrawingClick = () => {
    if (drawingPoints.length < 3) {
      setMessage("Shape must have at least 3 points!");
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    if (gamePhase === 'drawing') {
      // If this is the initial setup drawing, ask to save
      setNewMapName(`Resort ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString().slice(0,5)}`);
      setShowSaveDialog(true);
    } else {
      // Just re-drawing during gameplay
      finalizeGameStart(false);
    }
  };

  const handleSaveAndPlay = async () => {
    if (!newMapName.trim()) {
      setMessage("Please enter a name");
      return;
    }

    // Create Save Object
    const newMap: SavedMap = {
      id: Date.now().toString(),
      name: newMapName,
      date: Date.now(),
      backgroundImage: bgImage || "", 
      mountains: [drawingPoints] // Currently we only support drawing 1 continuous polygon for save, or taking the last one
    };

    try {
      await saveMapToStorage(newMap);
      setSavedMaps(prev => [...prev, newMap]);
      setShowSaveDialog(false);
      finalizeGameStart(true);
    } catch (e) {
      setMessage("Failed to save map (Disk/Quota Error?)");
      console.error(e);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handlePlayWithoutSaving = () => {
    setShowSaveDialog(false);
    finalizeGameStart(true);
  };

  const finalizeGameStart = (isInitialSetup: boolean) => {
    const newPoly = [...drawingPoints];
    
    // Update Mountains
    setConfig(prev => ({ ...prev, mountains: [newPoly] }));

    if (isInitialSetup) {
      // INITIAL SETUP
      // 3. Plant trees & 4. Setup initial facilities
      setupGameFromMountains([newPoly]);
      setGamePhase('playing');
    } else {
      // RE-DRAWING (During Gameplay)
      setGameState(prev => {
          // 1. Trees
          const keptTrees = prev.trees.filter(t => isPointInPolygon(t, newPoly));
          // 2. Facilities
          const keptFacilities = prev.facilities.filter(f => {
              if (f.type === FacilityType.GONDOLA) {
                   return isPointInPolygon(f.start, newPoly) && isPointInPolygon(f.end, newPoly);
              }
              return isLineInPolygon(f.start, f.end, [newPoly]);
          });
          // 3. Reset Skiers
          const keptFacIds = new Set(keptFacilities.map(f => f.id));
          const updatedSkiers = prev.skiers.map(s => {
               if (s.currentFacilityId && !keptFacIds.has(s.currentFacilityId)) {
                   const safeStart = keptFacilities[0]?.start || {x: newPoly[0].x, y: newPoly[0].y};
                   return { ...s, x: safeStart.x, y: safeStart.y, state: 'idle' as const, currentFacilityId: undefined, progress: 0 };
               }
               return s;
          });

          return {
              ...prev,
              trees: keptTrees,
              facilities: keptFacilities,
              skiers: updatedSkiers
          };
      });
    }

    setIsDrawing(false);
    setDrawingPoints([]);
  };

  // Interaction Handlers
  const handleMapClick = (p: Point) => {
    if (isDrawing) {
      setDrawingPoints(prev => [...prev, p]);
      return;
    }

    if (gamePhase !== 'playing') return; // Ignore interactions if not playing/drawing

    if (destroyMode) {
      // Find facility close to click
      const target = gameState.facilities.find(f => {
         // Simple distance check to start or end or center
         const d1 = distance(p, f.start);
         const d2 = distance(p, f.end);
         return d1 < 2 || d2 < 2;
      });

      if (target) {
        setGameState(prev => ({
          ...prev,
          coins: prev.coins + (target.length * (COSTS.TRAIL)) / 2, // Simple refund logic
          facilities: prev.facilities.filter(f => f.id !== target.id),
          // Reset skiers on this facility
          skiers: prev.skiers.map(s => {
            if (s.currentFacilityId === target.id) {
               return {
                   ...s,
                   x: prev.facilities[0]?.start.x || 0,
                   y: prev.facilities[0]?.start.y || 0,
                   state: 'idle' as const,
                   currentFacilityId: undefined,
                   progress: 0
               };
            }
            return s;
          })
        }));
        setDestroyMode(false);
      }
      return;
    }

    if (!selectedTool) return;

    if (!dragStart) {
      // Start dragging
      // Check if start point is valid (inside mountain)
      let isValidStart = false;
      for (const mtn of config.mountains) {
        if (isPointInPolygon(p, mtn)) isValidStart = true;
      }
      
      // Allow starting outside ONLY if it connects to an existing track end/start (skier convenience)
      const connects = gameState.facilities.some(f => distance(f.start, p) < 0.1 || distance(f.end, p) < 0.1);

      if (isValidStart || connects) {
         setDragStart(p);
      } else {
        setMessage("Must start in mountain or connected to facility!");
        setTimeout(() => setMessage(null), 2000);
      }
    } else {
      // Finish dragging
      // Cost calc
      const dist = distance(dragStart, p);
      let costMultiplier = COSTS.TRAIL;
      if (selectedTool.type === FacilityType.LIFT) costMultiplier = COSTS.LIFT_BASE; // Simplify cost logic for demo
      if (selectedTool.type === FacilityType.GONDOLA) costMultiplier = COSTS.GONDOLA_BASE;
      
      const cost = dist * costMultiplier;

      if (gameState.coins < cost) {
        setMessage("Not enough coins!");
        setTimeout(() => setMessage(null), 2000);
        setDragStart(null);
        return;
      }

      // Validate placement
      // Trail/Lift: entire line in mountain
      // Gondola: start/end in mountain
      let valid = false;
      if (selectedTool.type === FacilityType.GONDOLA) {
         const startIn = config.mountains.some(m => isPointInPolygon(dragStart, m));
         const endIn = config.mountains.some(m => isPointInPolygon(p, m));
         valid = startIn && endIn;
      } else {
         valid = isLineInPolygon(dragStart, p, config.mountains);
      }

      if (!valid) {
        setMessage("Construction must be within mountain boundaries!");
        setTimeout(() => setMessage(null), 2000);
        setDragStart(null);
        return;
      }

      // Check Direction
      if (selectedTool.type === FacilityType.TRAIL) {
         // Trail must go DOWN (Higher Y to Lower Y, but in our coord system Y=0 is top, so Low Y value to High Y value)
         if (p.y <= dragStart.y) {
            setMessage("Trails must go downhill!");
            setTimeout(() => setMessage(null), 2000);
            setDragStart(null);
            return;
         }
      } else {
         // Lifts go UP (High Y -> Low Y)
         if (p.y >= dragStart.y) {
           setMessage("Lifts must go uphill!");
           setTimeout(() => setMessage(null), 2000);
           setDragStart(null);
           return;
         }
      }

      // Build it
      const newFacility: Facility = {
        id: `fac-${Date.now()}`,
        name: getRandomName(selectedTool.label),
        type: selectedTool.type,
        subType: selectedTool.sub,
        start: dragStart,
        end: p,
        length: dist,
        queue: []
      };

      setGameState(prev => {
        // Refresh skier decisions
        const refreshedSkiers = prev.skiers.map(s => {
          if (s.state === 'waiting') {
             return { ...s, state: 'idle' as const, currentFacilityId: undefined, progress: 0 };
          }
          return s;
        });
        
        // Remove trees colliding with new facility
        const remainingTrees = clearTreesForFacility(prev.trees, newFacility);

        return {
          ...prev,
          coins: prev.coins - cost,
          facilities: [...prev.facilities, newFacility],
          skiers: refreshedSkiers,
          trees: remainingTrees
        };
      });

      setDragStart(null);
    }
  };

  const toggleDestroy = () => {
    setDestroyMode(!destroyMode);
    setSelectedTool(null);
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden text-slate-800 font-sans relative">
      
      {/* INITIAL LOAD SCREEN */}
      {showLoadScreen && (
        <div className="absolute inset-0 bg-slate-800 z-[100] flex flex-col items-center justify-center text-white p-8">
           <h1 className="text-5xl font-bold mb-2">⛷️ Ski Resort Tycoon 2D</h1>
           <p className="text-slate-400 mb-12">Build your dream resort, manage slopes, and create experts!</p>
           
           <div className="flex gap-8 w-full max-w-5xl h-[60vh]">
              {/* Left: Saved Maps */}
              <div className="flex-1 bg-slate-700/50 rounded-xl p-6 overflow-hidden flex flex-col">
                 <h2 className="text-xl font-bold mb-4 flex justify-between">
                   <span>Select a Resort</span>
                   <span className="text-sm font-normal text-slate-400">{savedMaps.length} saved</span>
                 </h2>
                 <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                    {savedMaps.length === 0 ? (
                       <div className="text-center text-slate-500 mt-20">No saved maps found. Create a new one!</div>
                    ) : (
                      savedMaps.map(map => (
                        <div 
                          key={map.id} 
                          onClick={() => handleLoadMap(map)}
                          className="bg-slate-600 rounded-lg p-3 hover:bg-slate-500 cursor-pointer transition-all flex gap-4 group"
                        >
                           <div className="w-32 h-20 bg-black rounded overflow-hidden shrink-0 border border-slate-500">
                             {map.backgroundImage ? (
                               <img src={map.backgroundImage} className="w-full h-full object-cover" alt="map thumbnail" />
                             ) : (
                               <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">No Image</div>
                             )}
                           </div>
                           <div className="flex-1 flex flex-col justify-center">
                              <div className="font-bold text-lg">{map.name}</div>
                              <div className="text-xs text-slate-300">{new Date(map.date).toLocaleDateString()}</div>
                           </div>
                           <button 
                             onClick={(e) => handleDeleteMap(map.id, e)}
                             className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-200 px-3 py-1 text-sm"
                           >
                             Delete
                           </button>
                        </div>
                      ))
                    )}
                 </div>
              </div>

              {/* Right: New Map */}
              <div className="w-1/3 bg-blue-600/20 border-2 border-dashed border-blue-500/50 rounded-xl p-6 flex flex-col items-center justify-center hover:bg-blue-600/30 transition-all cursor-pointer" onClick={handleCreateNew}>
                  <div className="text-6xl mb-4">🏔️</div>
                  <h2 className="text-2xl font-bold text-blue-200">Create New Map</h2>
                  <p className="text-center text-blue-200/60 mt-2">Use AI to generate a unique mountain landscape and define your own boundaries.</p>
              </div>
           </div>
        </div>
      )}

      {/* SAVE MAP DIALOG */}
      {showSaveDialog && (
         <div className="absolute inset-0 bg-black/60 z-[90] flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-96 text-center">
               <h2 className="text-2xl font-bold text-slate-800 mb-2">Save Your Resort Map?</h2>
               <p className="text-slate-500 mb-6 text-sm">Save this landscape to replay it later without regenerating.</p>
               
               <input 
                 type="text" 
                 value={newMapName}
                 onChange={(e) => setNewMapName(e.target.value)}
                 placeholder="Enter Resort Name..."
                 className="w-full border border-gray-300 rounded p-2 mb-6 text-lg focus:outline-blue-500"
               />

               <div className="space-y-3">
                  <button 
                    onClick={handleSaveAndPlay}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700"
                  >
                    Save & Start Playing
                  </button>
                  <button 
                    onClick={handlePlayWithoutSaving}
                    className="w-full bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200"
                  >
                    Don't Save, Just Play
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* Hide Dashboard during initial drawing or load screen */}
      {gamePhase === 'playing' && !showLoadScreen && (
        <Dashboard 
          gameState={gameState} 
          onCheat={() => setGameState(p => ({...p, coins: p.coins + 500}))} 
          onReset={() => {
             // Instead of regen immediately, go back to load screen
             setShowLoadScreen(true);
             setGamePhase('init');
          }} 
        />
      )}
      
      <div className="flex-1 relative bg-slate-200">
        <GameCanvas 
          config={config} 
          gameState={gameState}
          viewX={viewX}
          viewY={viewY}
          zoom={zoom}
          buildingMode={selectedTool}
          onMapClick={handleMapClick}
          onMapHover={setHoverPoint}
          onViewChange={(x, y, z) => { setViewX(x); setViewY(y); setZoom(z); }}
          hoverPoint={hoverPoint}
          dragStart={dragStart}
          backgroundImage={bgImage}
          isDrawing={isDrawing}
          drawingPoints={drawingPoints}
        />

        {/* Instructions for Drawing Phase */}
        {gamePhase === 'drawing' && !showLoadScreen && !showSaveDialog && (
           <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-blue-600/90 text-white px-8 py-6 rounded-xl shadow-2xl z-50 flex flex-col items-center">
             <h2 className="text-2xl font-bold mb-2">Define Your Ski Resort</h2>
             <p className="text-lg mb-4 text-center">Click on the map to outline the snowy mountain area.<br/>Trees and facilities will be built inside this shape.</p>
             <div className="text-sm opacity-80 animate-pulse">Click at least 3 points...</div>
           </div>
        )}

        {/* Overlay Messages */}
        {message && (
          <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-2 rounded-full shadow-lg animate-bounce z-50">
            {message}
          </div>
        )}

        {isGenerating && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-full shadow-2xl text-lg font-bold z-50 animate-pulse flex flex-col items-center">
             <span>🚀 {genStep}</span>
             <span className="text-xs font-normal opacity-80 mt-1">Powered by Gemini 3.0 Pro</span>
          </div>
        )}

        {/* Win Condition */}
        {gameState.promotedCount >= 10 && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
             <div className="bg-white p-8 rounded-xl text-center shadow-2xl">
               <h1 className="text-4xl font-bold text-yellow-500 mb-4">🏆 Victory! 🏆</h1>
               <p className="text-xl mb-6">You have promoted 10 expert skiers!</p>
               <button onClick={() => setShowLoadScreen(true)} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">Play Again</button>
             </div>
          </div>
        )}

        {!showLoadScreen && !showSaveDialog && (
          <Controls 
            gamePhase={gamePhase}
            gameSpeed={gameState.gameSpeed}
            setGameSpeed={(s) => setGameState(p => ({...p, gameSpeed: s}))}
            selectedTool={selectedTool}
            setSelectedTool={setSelectedTool}
            onDestroy={toggleDestroy}
            destroyMode={destroyMode}
            onRecenter={() => centerView()}
            isDrawing={isDrawing}
            onToggleDrawing={() => { setIsDrawing(!isDrawing); setDrawingPoints([]); setSelectedTool(null); }}
            onFinishDrawing={handleFinishDrawingClick}
          />
        )}
        
        {/* Navigation Help */}
        <div className="absolute top-4 right-4 bg-white/50 p-2 rounded text-xs pointer-events-none z-10">
           <p>Click + Drag to Pan (Empty Space)</p>
           <p>Scroll to Zoom</p>
           {gamePhase === 'playing' && <p>Click + Drag to Build (Tool Selected)</p>}
        </div>
      </div>
    </div>
  );
};

export default App;