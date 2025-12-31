
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  GameConfig, GameState, SkierLevel, Facility, Point, TrailDifficulty, 
  LiftType, FacilityType, SavedMap, Skier 
} from './types';
import { distance, isLineInPolygon, isPointInPolygon, getProjectedPointOnSegment } from './services/geometry';
import { updateGame, createSkier, getRandomName, generateForest, clearTreesForFacility, findBestStartPoint, calculateHotelPosition } from './services/gameLogic';
import { COSTS, DEFAULT_GRID_W, DEFAULT_GRID_H, GRID_SIZE, INCOME } from './constants';
import { saveMapToStorage, loadMapsFromStorage, deleteMapFromStorage } from './services/storage';
import GameCanvas from './components/GameCanvas';
import Dashboard from './components/Dashboard';
import Controls from './components/Controls';
import StatusPanel from './components/StatusPanel';
import { GoogleGenAI } from "@google/genai";

const SAMPLE_BG_URL = "https://images.unsplash.com/photo-1551524559-8af4e669d17d?q=80&w=2670&auto=format&fit=crop";

type GamePhase = 'init' | 'drawing' | 'playing';

const App: React.FC = () => {
  const [config, setConfig] = useState<GameConfig>({ gridWidth: DEFAULT_GRID_W, gridHeight: DEFAULT_GRID_H, mountains: [] });
  const [gamePhase, setGamePhase] = useState<GamePhase>('init');
  const [gameState, setGameState] = useState<GameState>({
    skiers: [], facilities: [], trees: [], coins: 500, time: 0, gameSpeed: 1, promotedCount: 0,
    history: ['Game Started'], nextSkierLabelIndex: 0, lastSpawnTime: 0, proPassActive: false, isNight: false,
    lightOpacity: 0, hotelPosition: { x: 0, y: 0 }, floatingTexts: [], snowDepth: 60
  });

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
  const [selectedSkierId, setSelectedSkierId] = useState<string | null>(null);
  const [savedMaps, setSavedMaps] = useState<SavedMap[]>([]);
  const [showLoadScreen, setShowLoadScreen] = useState(true);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [showTrailNames, setShowTrailNames] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const centerView = useCallback((targetX?: number, targetY?: number) => {
    const centerX = (targetX ?? Math.floor(DEFAULT_GRID_W / 2)) * GRID_SIZE;
    const centerY = (targetY ?? (Math.floor(DEFAULT_GRID_H / 2) - 5)) * GRID_SIZE;
    const viewportW = window.innerWidth - 288;
    const viewportH = window.innerHeight;
    setViewX(centerX - viewportW / 2); setViewY(centerY - viewportH / 2); setZoom(1);
  }, []);

  const setupGameFromMountains = useCallback((mountains: Point[][]) => {
    const w = DEFAULT_GRID_W;
    const h = DEFAULT_GRID_H;
    const mainMountain = mountains[0];
    const { start: startPoint, mid: midPoint } = findBestStartPoint(mainMountain);
    const hotelPosition = calculateHotelPosition(mountains, h);

    // Initial Loop: One Lift up, One Green trail down
    const facilities: Facility[] = [
      {
        id: 'start-lift', name: 'Chair 1', type: FacilityType.LIFT, subType: LiftType.CHAIR_4,
        start: { x: startPoint.x, y: startPoint.y }, end: midPoint, length: distance(startPoint, midPoint), queue: [], createdAt: 0
      },
      {
        id: 'start-run', name: 'Green Run 1', type: FacilityType.TRAIL, subType: TrailDifficulty.GREEN,
        start: midPoint, end: { x: startPoint.x, y: startPoint.y }, length: distance(startPoint, midPoint), queue: [], createdAt: 0, isOpen: true
      }
    ];

    let trees = generateForest(mountains, w, h);
    facilities.forEach(f => { trees = clearTreesForFacility(trees, f); });
    const skiers = Array.from({ length: 5 }).map((_, i) => createSkier(`skier-${i}`, { x: startPoint.x, y: startPoint.y }, i, SkierLevel.BEGINNER));

    setConfig({ gridWidth: DEFAULT_GRID_W, gridHeight: DEFAULT_GRID_H, mountains });
    setGameState({
      skiers, facilities, trees, coins: 500, time: 0, gameSpeed: 1, promotedCount: 0,
      history: ['Game Started'], nextSkierLabelIndex: 5, lastSpawnTime: 0, proPassActive: false, isNight: false,
      lightOpacity: 0, hotelPosition, floatingTexts: [], snowDepth: 60
    });

    centerView(startPoint.x, (startPoint.y + midPoint.y) / 2);
  }, [centerView]);

  // AI Pipeline
  const generateAndAnalyzeMap = useCallback(async () => {
    setGameState(prev => ({ ...prev, skiers: [], facilities: [], trees: [], coins: 500, promotedCount: 0 }));
    setConfig(prev => ({ ...prev, mountains: [] }));
    setBgImage(null);
    setGamePhase('init');
    setDrawingPoints([]);
    setIsGenerating(true);
    setGenStep("Checking API Key...");

    if ((window as any).aistudio) {
      try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) await (window as any).aistudio.openSelectKey();
      } catch (err) { console.warn("AI Studio Key Selection check failed", err); }
    }

    setGenStep("Creating Map Visuals...");
    
    const runGeneration = async (retryAttempt: boolean): Promise<string> => {
       try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts: [{ text: "A high-angle frontal view (orthographic/isometric style) of a massive snowy ski resort. Foreground: 3 main snow-covered mountain slopes with sharp peaks and wide bases, completely clean (white snow only) for game overlay. Background: A rich scenic environment including a large blue lake at the bottom, a smoking volcano in the distance, and surrounding mountain ranges. Style: 4k, vivid colors, detailed landscape art. NOT a bird's eye view. STRICTLY NO TREES or LIFTS on the main 3 mountains." }] },
            config: { imageConfig: { aspectRatio: "16:9", imageSize: "2K" } }
          });
          let base64 = "";
          if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
              if (part.inlineData) { base64 = part.inlineData.data; break; }
            }
          }
          if (!base64) throw new Error("No image data in response");
          return base64;
       } catch (error: any) {
          console.error("AI Generation Failed", error);
          let isPermission = false;
          let isNotFound = false;
          const str = error.toString().toLowerCase();
          const json = JSON.stringify(error).toLowerCase();
          if (str.includes("403") || str.includes("permission_denied") || json.includes("permission_denied")) isPermission = true;
          if (str.includes("404") || str.includes("not found") || json.includes("not found")) isNotFound = true;
          if (error.error?.code === 403 || error.status === 403) isPermission = true;

          if ((isPermission || isNotFound) && !retryAttempt && (window as any).aistudio) {
             setGenStep("Please select a valid API Key...");
             await (window as any).aistudio.openSelectKey();
             setGenStep("Retrying Generation...");
             return await runGeneration(true);
          }
          throw error;
       }
    };

    try {
      if (!process.env.API_KEY) {
         if ((window as any).aistudio) await (window as any).aistudio.openSelectKey();
      }
      const base64Image = await runGeneration(false);
      if (base64Image) {
        setBgImage(`data:image/png;base64,${base64Image}`);
        setGenStep("Ready to Draw!");
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e: any) {
      console.error("Map Gen Error:", e);
      setMessage(`AI Map Gen failed. Switching to manual drawing.`);
    } finally {
      setIsGenerating(false); setGenStep(""); setGamePhase('drawing'); setIsDrawing(true);
    }
  }, []);

  // Initialize
  useEffect(() => {
    const load = async () => {
      try { const maps = await loadMapsFromStorage(); setSavedMaps(maps); } catch (e) { console.error("Failed to load maps from storage", e); }
    };
    load();
  }, []);

  // Game Loop
  useEffect(() => {
    if (gamePhase !== 'playing') return; 
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

  const handleLoadMap = (map: SavedMap) => {
    setShowLoadScreen(false);
    setBgImage(map.backgroundImage);
    setConfig(prev => ({ ...prev, mountains: map.mountains }));
    setupGameFromMountains(map.mountains);
    setGamePhase('playing');
  };

  const handleCreateNew = () => { setShowLoadScreen(false); generateAndAnalyzeMap(); };
  const handleUseSample = () => {
    setGameState(prev => ({ ...prev, skiers: [], facilities: [], trees: [], coins: 500, promotedCount: 0 }));
    setConfig(prev => ({ ...prev, mountains: [] }));
    setBgImage(SAMPLE_BG_URL);
    setShowLoadScreen(false); setGamePhase('drawing'); setIsDrawing(true); setDrawingPoints([]);
  };
  const handleUploadClick = () => { fileInputRef.current?.click(); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        if (evt.target?.result) {
            setGameState(prev => ({ ...prev, skiers: [], facilities: [], trees: [], coins: 500, promotedCount: 0 }));
            setConfig(prev => ({ ...prev, mountains: [] }));
            setBgImage(evt.target.result as string);
            setShowLoadScreen(false); setGamePhase('drawing'); setIsDrawing(true); setDrawingPoints([]);
        }
    };
    reader.readAsDataURL(file);
  };
  const handleDeleteMap = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await deleteMapFromStorage(id); setSavedMaps(prev => prev.filter(m => m.id !== id)); } catch (err) { console.error("Failed to delete map", err); }
  };
  const handleFinishDrawingClick = () => {
    if (drawingPoints.length < 3) { setMessage("Shape must have at least 3 points!"); setTimeout(() => setMessage(null), 2000); return; }
    if (gamePhase === 'drawing') { setNewMapName(`Resort ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString().slice(0,5)}`); setShowSaveDialog(true); } 
    else { finalizeGameStart(false); }
  };
  const handleSaveAndPlay = async () => {
    if (!newMapName.trim()) { setMessage("Please enter a name"); return; }
    const newMap: SavedMap = { id: Date.now().toString(), name: newMapName, date: Date.now(), backgroundImage: bgImage || "", mountains: [drawingPoints] };
    try { await saveMapToStorage(newMap); setSavedMaps(prev => [...prev, newMap]); setShowSaveDialog(false); finalizeGameStart(true); } catch (e) { setMessage("Failed to save map"); console.error(e); setTimeout(() => setMessage(null), 4000); }
  };
  const handlePlayWithoutSaving = () => { setShowSaveDialog(false); finalizeGameStart(true); };

  const finalizeGameStart = (isInitialSetup: boolean) => {
    const newPoly = [...drawingPoints];
    setConfig(prev => ({ ...prev, mountains: [newPoly] }));
    if (isInitialSetup) { setupGameFromMountains([newPoly]); setGamePhase('playing'); } 
    else {
      setGameState(prev => {
          const keptTrees = prev.trees.filter(t => isPointInPolygon(t, newPoly));
          const keptFacilities = prev.facilities.filter(f => {
              if (f.type === FacilityType.GONDOLA) return isPointInPolygon(f.start, newPoly) && isPointInPolygon(f.end, newPoly);
              return isLineInPolygon(f.start, f.end, [newPoly]);
          });
          const keptFacIds = new Set(keptFacilities.map(f => f.id));
          const updatedSkiers = prev.skiers.map(s => {
               if (s.currentFacilityId && !keptFacIds.has(s.currentFacilityId)) {
                   const safeStart = keptFacilities[0]?.start || {x: newPoly[0].x, y: newPoly[0].y};
                   return { ...s, x: safeStart.x, y: safeStart.y, state: 'idle' as const, currentFacilityId: undefined, progress: 0 };
               }
               return s;
          });
          return { ...prev, trees: keptTrees, facilities: keptFacilities, skiers: updatedSkiers };
      });
    }
    setIsDrawing(false); setDrawingPoints([]);
  };

  const handleMapClick = (p: Point) => {
    if (isDrawing) { setDrawingPoints(prev => [...prev, p]); return; }
    if (gamePhase !== 'playing') return; 
    if (destroyMode) {
      const HIT_RADIUS = 1.5; 
      const target = gameState.facilities.find(f => {
         if (distance(p, f.start) < HIT_RADIUS || distance(p, f.end) < HIT_RADIUS) return true;
         if (f.type !== FacilityType.CAFE) { const { dist } = getProjectedPointOnSegment(p, f.start, f.end); if (dist < HIT_RADIUS) return true; }
         if (f.type === FacilityType.CAFE) { if (distance(p, f.start) < HIT_RADIUS) return true; }
         return false;
      });
      if (target) {
        setGameState(prev => ({
          ...prev, coins: prev.coins + (target.length * (COSTS.TRAIL)) / 2,
          facilities: prev.facilities.filter(f => f.id !== target.id),
          skiers: prev.skiers.map(s => s.currentFacilityId === target.id ? { ...s, x: prev.facilities[0]?.start.x || 0, y: prev.facilities[0]?.start.y || 0, state: 'idle' as const, currentFacilityId: undefined, progress: 0 } : s)
        }));
        setDestroyMode(false);
      }
      return;
    }
    if (!selectedTool) { setSelectedSkierId(null); return; }
    if (!dragStart) {
      if (selectedTool.type === FacilityType.CAFE) {
         if (gameState.coins < selectedTool.cost) { setMessage("Not enough coins!"); setTimeout(() => setMessage(null), 2000); return; }
         if (!config.mountains.some(m => isPointInPolygon(p, m))) { setMessage("Must build within bounds!"); setTimeout(() => setMessage(null), 2000); return; }
         const newFacility: Facility = { id: `fac-${Date.now()}`, name: getRandomName('Cafe'), type: FacilityType.CAFE, subType: 'Cafe', start: {x: p.x, y: p.y}, end: {x: p.x+1, y: p.y+1}, length: 1, queue: [], createdAt: gameState.time, isOpen: true };
         setGameState(prev => ({ ...prev, coins: prev.coins - selectedTool.cost, facilities: [...prev.facilities, newFacility], trees: clearTreesForFacility(prev.trees, newFacility) }));
         return;
      }
      let isValidStart = false; for (const mtn of config.mountains) { if (isPointInPolygon(p, mtn)) isValidStart = true; }
      const connects = gameState.facilities.some(f => distance(f.start, p) < 0.1 || distance(f.end, p) < 0.1);
      if (isValidStart || connects) { setDragStart(p); } else { setMessage("Must start in mountain or connected to facility!"); setTimeout(() => setMessage(null), 2000); }
    } else {
      const dist = distance(dragStart, p);
      let costMultiplier = COSTS.TRAIL;
      if (selectedTool.type === FacilityType.LIFT) costMultiplier = COSTS.LIFT_BASE; 
      if (selectedTool.type === FacilityType.GONDOLA) costMultiplier = COSTS.GONDOLA_BASE;
      const cost = dist * costMultiplier;
      if (gameState.coins < cost) { setMessage("Not enough coins!"); setTimeout(() => setMessage(null), 2000); setDragStart(null); return; }
      let valid = false;
      if (selectedTool.type === FacilityType.GONDOLA) { const startIn = config.mountains.some(m => isPointInPolygon(dragStart, m)); const endIn = config.mountains.some(m => isPointInPolygon(p, m)); valid = startIn && endIn; } 
      else { valid = isLineInPolygon(dragStart, p, config.mountains); }
      if (!valid) { setMessage("Construction must be within mountain boundaries!"); setTimeout(() => setMessage(null), 2000); setDragStart(null); return; }
      if (selectedTool.type === FacilityType.TRAIL) { if (p.y <= dragStart.y) { setMessage("Trails must go downhill!"); setTimeout(() => setMessage(null), 2000); setDragStart(null); return; } } 
      else { if (p.y >= dragStart.y) { setMessage("Lifts must go uphill!"); setTimeout(() => setMessage(null), 2000); setDragStart(null); return; } }
      const newFacility: Facility = { id: `fac-${Date.now()}`, name: getRandomName(selectedTool.label), type: selectedTool.type, subType: selectedTool.sub, start: dragStart, end: p, length: dist, queue: [], createdAt: gameState.time, isOpen: true };
      setGameState(prev => {
        const refreshedSkiers = prev.skiers.map(s => s.state === 'waiting' ? { ...s, state: 'idle' as const, currentFacilityId: undefined, progress: 0 } : s);
        return { ...prev, coins: prev.coins - cost, facilities: [...prev.facilities, newFacility], skiers: refreshedSkiers, trees: clearTreesForFacility(prev.trees, newFacility) };
      });
      setDragStart(null);
    }
  };
  const toggleDestroy = () => { setDestroyMode(!destroyMode); setSelectedTool(null); }
  const toggleProPass = () => {
    setGameState(prev => {
       if (prev.proPassActive) return { ...prev, proPassActive: false };
       else { if (prev.coins >= COSTS.PRO_PASS) return { ...prev, coins: prev.coins - COSTS.PRO_PASS, proPassActive: true }; else { setMessage("Not enough coins for Pro Pass!"); setTimeout(() => setMessage(null), 2000); return prev; } }
    });
  }
  const handleModSkier = (action: 'force-lift' | 'force-lodge' | 'sell-lesson') => {
     if (!selectedSkierId) return;
     setGameState(prev => {
        const skier = prev.skiers.find(s => s.id === selectedSkierId); if (!skier) return prev;
        let newSkiers = [...prev.skiers]; let newCoins = prev.coins;
        if (action === 'sell-lesson') { newCoins += INCOME.LESSON; newSkiers = newSkiers.map(s => s.id === selectedSkierId ? { ...s, rideCount: s.rideCount + 2 } : s); } 
        else if (action === 'force-lift') { const lift = prev.facilities.find(f => f.type === FacilityType.LIFT); if (lift) newSkiers = newSkiers.map(s => s.id === selectedSkierId ? { ...s, x: lift.start.x, y: lift.start.y, state: 'idle', currentFacilityId: undefined, progress: 0 } : s); } 
        else if (action === 'force-lodge') { const cafe = prev.facilities.find(f => f.type === FacilityType.CAFE); if (cafe) newSkiers = newSkiers.map(s => s.id === selectedSkierId ? { ...s, x: cafe.start.x, y: cafe.start.y, state: 'idle', currentFacilityId: undefined, progress: 0, hunger: 0 } : s); }
        return { ...prev, skiers: newSkiers, coins: newCoins };
     });
  };
  const selectedSkier = gameState.skiers.find(s => s.id === selectedSkierId);

  return (
    <div className="flex h-screen w-screen overflow-hidden text-slate-800 font-sans relative">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      {showLoadScreen && (
        <div className="absolute inset-0 bg-slate-800 z-[100] flex flex-col items-center justify-center text-white p-8">
           <h1 className="text-5xl font-bold mb-2">⛷️ Ski Resort Tycoon 2D</h1>
           <p className="text-slate-400 mb-12">Build your dream resort, manage slopes, and create experts!</p>
           <div className="flex gap-8 w-full max-w-5xl h-[60vh]">
              <div className="flex-1 bg-slate-700/50 rounded-xl p-6 overflow-hidden flex flex-col">
                 <h2 className="text-xl font-bold mb-4 flex justify-between"><span>Select a Resort</span><span className="text-sm font-normal text-slate-400">{savedMaps.length} saved</span></h2>
                 <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                    {savedMaps.length === 0 ? <div className="text-center text-slate-500 mt-20">No saved maps found. Create a new one!</div> : savedMaps.map(map => (
                        <div key={map.id} onClick={() => handleLoadMap(map)} className="bg-slate-600 rounded-lg p-3 hover:bg-slate-500 cursor-pointer transition-all flex gap-4 group">
                           <div className="w-32 h-20 bg-black rounded overflow-hidden shrink-0 border border-slate-500">{map.backgroundImage ? <img src={map.backgroundImage} className="w-full h-full object-cover" alt="map thumbnail" /> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">No Image</div>}</div>
                           <div className="flex-1 flex flex-col justify-center"><div className="font-bold text-lg">{map.name}</div><div className="text-xs text-slate-300">{new Date(map.date).toLocaleDateString()}</div></div>
                           <button onClick={(e) => handleDeleteMap(map.id, e)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-200 px-3 py-1 text-sm">Delete</button>
                        </div>
                      ))}
                 </div>
              </div>
              <div className="w-1/3 flex flex-col gap-4">
                  <div onClick={handleCreateNew} className="flex-1 bg-blue-600/20 border-2 border-dashed border-blue-500/50 rounded-xl p-6 flex flex-col items-center justify-center hover:bg-blue-600/30 transition-all cursor-pointer">
                      <div className="text-6xl mb-4">🏔️</div><h2 className="text-2xl font-bold text-blue-200">AI Generate Map</h2><p className="text-center text-blue-200/60 mt-2 text-sm">Create unique landscapes with Gemini 3 Pro.</p>
                  </div>
                  <div className="h-1/3 flex gap-4">
                     <div onClick={handleUseSample} className="flex-1 bg-slate-700/50 hover:bg-slate-600 rounded-xl border border-slate-600 p-4 flex flex-col items-center justify-center cursor-pointer transition-colors"><div className="text-3xl mb-2">🖼️</div><span className="font-bold text-sm">Use Sample</span></div>
                     <div onClick={handleUploadClick} className="flex-1 bg-slate-700/50 hover:bg-slate-600 rounded-xl border border-slate-600 p-4 flex flex-col items-center justify-center cursor-pointer transition-colors"><div className="text-3xl mb-2">📂</div><span className="font-bold text-sm">Upload Image</span></div>
                  </div>
              </div>
           </div>
        </div>
      )}
      {showSaveDialog && (
         <div className="absolute inset-0 bg-black/60 z-[90] flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-96 text-center">
               <h2 className="text-2xl font-bold text-slate-800 mb-2">Save Your Resort Map?</h2>
               <p className="text-slate-500 mb-6 text-sm">Save this landscape to replay it later without regenerating.</p>
               <input type="text" value={newMapName} onChange={(e) => setNewMapName(e.target.value)} placeholder="Enter Resort Name..." className="w-full border border-gray-300 rounded p-2 mb-6 text-lg focus:outline-blue-500" />
               <div className="space-y-3">
                  <button onClick={handleSaveAndPlay} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">Save & Start Playing</button>
                  <button onClick={handlePlayWithoutSaving} className="w-full bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200">Don't Save, Just Play</button>
               </div>
            </div>
         </div>
      )}
      {gamePhase === 'playing' && !showLoadScreen && (
        <Dashboard gameState={gameState} onCheat={() => setGameState(p => ({...p, coins: p.coins + 500}))} onReset={() => { setShowLoadScreen(true); setGamePhase('init'); }} onSelectSkier={(id) => setSelectedSkierId(id)} />
      )}
      <div className="flex-1 relative bg-slate-200">
        <GameCanvas 
          config={config} 
          gameState={gameState} 
          viewX={viewX} viewY={viewY} zoom={zoom} 
          buildingMode={selectedTool} 
          onMapClick={handleMapClick} 
          onMapHover={setHoverPoint} 
          onViewChange={(x, y, z) => { setViewX(x); setViewY(y); setZoom(z); }} 
          hoverPoint={hoverPoint} 
          dragStart={dragStart} 
          backgroundImage={bgImage} 
          isDrawing={isDrawing} 
          drawingPoints={drawingPoints} 
          showTrailNames={showTrailNames}
        />
        {selectedSkier && (
           <div className="absolute top-20 right-4 w-64 bg-white rounded-xl shadow-2xl border-2 border-slate-700 overflow-hidden z-[60] animate-fade-in">
              <div className="bg-slate-800 p-3 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div>Skier {selectedSkier.label}</h3><button onClick={() => setSelectedSkierId(null)} className="hover:text-red-400">✖</button></div>
              <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mb-2"><div>Level: <span className="font-bold">{selectedSkier.level}</span></div><div>Hunger: <span className={`font-bold ${selectedSkier.hunger < 30 ? 'text-red-500' : 'text-green-600'}`}>{Math.floor(selectedSkier.hunger)}%</span></div><div>State: <span className="font-bold">{selectedSkier.state}</span></div><div>Runs: <span className="font-bold">{selectedSkier.rideCount}</span></div></div>
                  <div className="space-y-2"><p className="text-xs font-bold uppercase text-slate-400">Modify Behavior</p><button onClick={() => handleModSkier('sell-lesson')} className="w-full py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded font-bold text-xs flex justify-between px-4"><span>Sell Lesson</span><span>+${INCOME.LESSON}</span></button><button onClick={() => handleModSkier('force-lift')} className="w-full py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded font-bold text-xs">Force to Nearest Lift</button><button onClick={() => handleModSkier('force-lodge')} className="w-full py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded font-bold text-xs">Force to Cafe (Feed)</button></div>
              </div>
           </div>
        )}
        {gamePhase === 'drawing' && !showLoadScreen && !showSaveDialog && (
           <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-blue-600/90 text-white px-8 py-6 rounded-xl shadow-2xl z-50 flex flex-col items-center"><h2 className="text-2xl font-bold mb-2">Define Your Ski Resort</h2><p className="text-lg mb-4 text-center">Click on the map to outline the snowy mountain area.<br/>Trees and facilities will be built inside this shape.</p><div className="text-sm opacity-80 animate-pulse">Click at least 3 points...</div></div>
        )}
        {message && <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-2 rounded-full shadow-lg animate-bounce z-50">{message}</div>}
        {isGenerating && <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-full shadow-2xl text-lg font-bold z-50 animate-pulse flex flex-col items-center"><span>🚀 {genStep}</span><span className="text-xs font-normal opacity-80 mt-1">Powered by Gemini 3.0 Pro</span></div>}
        {gameState.promotedCount >= 10 && <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-white p-8 rounded-xl text-center shadow-2xl"><h1 className="text-4xl font-bold text-yellow-500 mb-4">🏆 Victory! 🏆</h1><p className="text-xl mb-6">You have promoted 10 expert skiers!</p><button onClick={() => setShowLoadScreen(true)} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">Play Again</button></div></div>}
        {!showLoadScreen && !showSaveDialog && (
          <Controls 
            gamePhase={gamePhase} gameSpeed={gameState.gameSpeed} setGameSpeed={(s) => setGameState(p => ({...p, gameSpeed: s}))} 
            selectedTool={selectedTool} setSelectedTool={setSelectedTool} 
            onDestroy={toggleDestroy} destroyMode={destroyMode} onRecenter={() => centerView()} 
            isDrawing={isDrawing} onToggleDrawing={() => { setIsDrawing(!isDrawing); setDrawingPoints([]); setSelectedTool(null); }} 
            onFinishDrawing={handleFinishDrawingClick} 
            proPassActive={gameState.proPassActive} onToggleProPass={toggleProPass}
            showTrailNames={showTrailNames} toggleTrailNames={() => setShowTrailNames(!showTrailNames)}
          />
        )}
        <div className="absolute top-4 right-4 bg-white/50 p-2 rounded text-xs pointer-events-none z-10"><p>Click + Drag to Pan (Empty Space)</p><p>Click Skier to Inspect (Left Panel)</p>{gamePhase === 'playing' && <p>Click + Drag to Build</p>}</div>
      </div>
      {gamePhase === 'playing' && !showLoadScreen && (
        <StatusPanel facilities={gameState.facilities} />
      )}
    </div>
  );
};
export default App;
