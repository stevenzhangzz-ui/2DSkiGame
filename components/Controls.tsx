
import React from 'react';
import { FacilityType, TrailDifficulty, LiftType } from '../types';

interface ControlsProps {
  gamePhase: 'init' | 'drawing' | 'playing';
  gameSpeed: number;
  setGameSpeed: (s: number) => void;
  selectedTool: any;
  setSelectedTool: (t: any) => void;
  onDestroy: () => void;
  destroyMode: boolean;
  onRecenter: () => void;
  isDrawing: boolean;
  onToggleDrawing: () => void;
  onFinishDrawing: () => void;
  proPassActive: boolean;
  onToggleProPass: () => void;
  showTrailNames?: boolean;
  toggleTrailNames?: () => void;
}

const Controls: React.FC<ControlsProps> = ({ 
  gamePhase, gameSpeed, setGameSpeed, selectedTool, setSelectedTool, onDestroy, destroyMode, onRecenter,
  isDrawing, onToggleDrawing, onFinishDrawing, showTrailNames, toggleTrailNames
}) => {
  
  const tools = [
    { type: FacilityType.TRAIL, sub: TrailDifficulty.GREEN, label: 'Green', cost: 10, color: 'bg-green-500 border-green-700 text-white', icon: '🟢', desc: 'Easy Trail' },
    { type: FacilityType.TRAIL, sub: TrailDifficulty.BLUE, label: 'Blue', cost: 10, color: 'bg-blue-500 border-blue-700 text-white', icon: '🟦', desc: 'Medium Trail' },
    { type: FacilityType.TRAIL, sub: TrailDifficulty.BLACK, label: 'Black', cost: 10, color: 'bg-neutral-900 border-black text-white', icon: '♦️', desc: 'Hard Trail' },
    { type: FacilityType.TRAIL, sub: TrailDifficulty.DOUBLE_DIAMOND, label: 'Double', cost: 10, color: 'bg-neutral-800 border-yellow-500 text-yellow-400', icon: '♦️♦️', desc: 'Expert Trail' },
    { type: FacilityType.TRAIL, sub: TrailDifficulty.PARK, label: 'Park', cost: 10, color: 'bg-pink-500 border-pink-700 text-white', icon: '🛹', desc: 'Terrain Park' },
    { type: FacilityType.LIFT, sub: LiftType.CHAIR_2, label: '2-Seat', cost: 50, color: 'bg-orange-400 border-orange-600 text-white', icon: '🚡', desc: 'Basic Lift' },
    { type: FacilityType.LIFT, sub: LiftType.CHAIR_4, label: '4-Seat', cost: 50, color: 'bg-orange-600 border-orange-800 text-white', icon: '🚠', desc: 'Fast Lift' },
    { type: FacilityType.GONDOLA, sub: 'Gondola', label: 'Gondola', cost: 100, color: 'bg-red-600 border-red-800 text-white', icon: '🚋', desc: 'High Capacity' },
    { type: FacilityType.CAFE, sub: 'Cafe', label: 'Cafe', cost: 500, color: 'bg-amber-800 border-amber-950 text-white', icon: '☕', desc: 'Food & Rest' },
  ];

  if (gamePhase === 'drawing') {
    return (
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur rounded-lg shadow-xl p-6 flex flex-col items-center gap-4 border border-gray-200 z-50">
         <span className="text-lg font-bold text-gray-800">Step 1: Draw Mountain Boundary</span>
         <button 
             onClick={onFinishDrawing}
             className="px-8 py-3 bg-green-600 text-white rounded-lg font-bold shadow-lg hover:bg-green-700 animate-bounce text-lg"
           >
             Finish Shape & Start Game
         </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end gap-4 z-20 pointer-events-none">
      {/* Speed Controls (Left) */}
      <div className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-xl pointer-events-auto border border-gray-200">
        <div className="flex gap-1">
          {[0, 1, 4].map(speed => (
            <button 
              key={speed}
              onClick={() => setGameSpeed(speed)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm transition-all ${
                gameSpeed === speed 
                ? 'bg-blue-600 text-white shadow-md scale-105' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {speed === 0 ? '||' : `${speed}x`}
            </button>
          ))}
        </div>
      </div>
      
      {/* Build Tools (Center) */}
      <div className="flex-1 flex justify-center pointer-events-auto">
        {isDrawing ? (
          <div className="bg-white/90 backdrop-blur p-4 rounded-xl shadow-xl flex gap-4 items-center border border-blue-200">
             <span className="text-sm font-bold animate-pulse text-blue-600">Redefining Boundary...</span>
             <button onClick={onFinishDrawing} className="px-4 py-2 bg-green-600 text-white rounded font-bold shadow hover:bg-green-700">Update Shape</button>
             <button onClick={onToggleDrawing} className="px-4 py-2 bg-red-500 text-white rounded font-bold shadow hover:bg-red-600">Cancel</button>
          </div>
        ) : (
          <div className="bg-white/90 backdrop-blur p-3 rounded-2xl shadow-2xl border border-gray-200 overflow-x-auto max-w-[60vw]">
             <div className="flex gap-3">
              {tools.map((tool, idx) => (
                <button
                  key={idx}
                  onClick={() => { setSelectedTool(tool); if(destroyMode) onDestroy(); }}
                  className={`
                    group relative flex flex-col items-center justify-center w-16 h-16 rounded-xl border-b-4 transition-all transform hover:-translate-y-1 active:translate-y-0 active:border-b-0
                    ${selectedTool?.label === tool.label ? 'ring-4 ring-blue-400 scale-105 z-10' : 'opacity-90 hover:opacity-100'}
                    ${tool.color}
                  `}
                >
                  <span className="text-2xl drop-shadow-md">{tool.icon}</span>
                  <span className="text-[9px] font-bold uppercase mt-1 tracking-tight">{tool.label}</span>
                  <div className="absolute -top-3 -right-3 bg-white text-gray-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow border border-gray-300">
                    ${tool.cost}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions (Right) */}
      <div className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-xl pointer-events-auto border border-gray-200 flex flex-col gap-2">
         {!isDrawing && (
           <>
             <button 
               onClick={toggleTrailNames} 
               className={`w-12 h-12 rounded-lg font-bold text-xs flex flex-col items-center justify-center transition-all ${
                 showTrailNames 
                 ? 'bg-blue-100 text-blue-600 border border-blue-300' 
                 : 'bg-gray-100 text-gray-500'
               }`}
               title="Toggle Trail Names"
             >
               <span>abc</span>
             </button>
             <button 
               onClick={onRecenter} 
               className="w-12 h-12 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold text-2xl flex items-center justify-center transition-colors" 
               title="Recenter Map"
             >
               🎯
             </button>
             <button 
               onClick={onDestroy}
               className={`w-12 h-12 rounded-lg font-bold text-2xl flex items-center justify-center transition-all ${
                 destroyMode 
                 ? 'bg-red-600 text-white shadow-inner animate-pulse' 
                 : 'bg-red-100 text-red-600 hover:bg-red-200'
               }`}
               title="Destroy Mode"
             >
               💣
             </button>
           </>
         )}
      </div>
    </div>
  );
};

export default Controls;
