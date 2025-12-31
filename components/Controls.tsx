
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
}

const Controls: React.FC<ControlsProps> = ({ 
  gamePhase, gameSpeed, setGameSpeed, selectedTool, setSelectedTool, onDestroy, destroyMode, onRecenter,
  isDrawing, onToggleDrawing, onFinishDrawing
}) => {
  
  const tools = [
    { type: FacilityType.TRAIL, sub: TrailDifficulty.MAGIC_CARPET, label: 'Carpet', cost: 10 },
    { type: FacilityType.TRAIL, sub: TrailDifficulty.GREEN, label: 'Green', cost: 10 },
    { type: FacilityType.TRAIL, sub: TrailDifficulty.BLUE, label: 'Blue', cost: 10 },
    { type: FacilityType.TRAIL, sub: TrailDifficulty.BLACK, label: 'Black', cost: 10 },
    { type: FacilityType.TRAIL, sub: TrailDifficulty.DOUBLE_DIAMOND, label: 'D. Black', cost: 10 },
    { type: FacilityType.TRAIL, sub: TrailDifficulty.PARK, label: 'Park', cost: 10 },
    { type: FacilityType.LIFT, sub: LiftType.CHAIR_2, label: '2-Seat', cost: 50 },
    { type: FacilityType.LIFT, sub: LiftType.CHAIR_4, label: '4-Seat', cost: 50 },
    { type: FacilityType.GONDOLA, sub: 'Gondola', label: 'Gondola', cost: 100 },
  ];

  // If initial drawing phase (mandatory), only show Finish button
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

  // Normal Game Controls (Playing Phase)
  return (
    <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur rounded-lg shadow-xl p-4 flex justify-between items-center gap-4 border border-gray-200 z-20">
      {/* Speed Controls */}
      <div className="flex gap-1">
        {[0, 1, 2, 4, 10, 20, 50].map(speed => (
          <button 
            key={speed}
            onClick={() => setGameSpeed(speed)}
            className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs ${gameSpeed === speed ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            {speed === 0 ? '||' : `${speed}x`}
          </button>
        ))}
      </div>

      {/* Re-Drawing Mode Override (During Play) */}
      {isDrawing ? (
        <div className="flex-1 flex justify-center items-center gap-4">
           <span className="text-sm font-bold animate-pulse text-blue-600">Redefining Boundary...</span>
           <button 
             onClick={onFinishDrawing}
             className="px-4 py-2 bg-green-600 text-white rounded font-bold shadow hover:bg-green-700 animate-bounce"
           >
             Update Shape
           </button>
           <button 
             onClick={onToggleDrawing}
             className="px-4 py-2 bg-red-500 text-white rounded font-bold shadow hover:bg-red-600"
           >
             Cancel
           </button>
        </div>
      ) : (
        /* Build Tools */
        <div className="flex gap-2 overflow-x-auto pb-1 max-w-[50vw]">
          {tools.map((tool, idx) => (
            <button
              key={idx}
              onClick={() => { setSelectedTool(tool); if(destroyMode) onDestroy(); }} // Disable destroy if picking tool
              className={`px-3 py-2 rounded whitespace-nowrap text-sm flex flex-col items-center min-w-[80px] border ${
                selectedTool?.sub === tool.sub ? 'bg-blue-100 border-blue-500' : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="font-bold">{tool.label}</span>
              <span className="text-xs text-gray-500">${tool.cost}/u</span>
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
         {!isDrawing && (
           <>
             <button 
               onClick={onToggleDrawing}
               className="px-3 py-2 rounded font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 flex flex-col items-center text-xs"
             >
               <span>✏️ Redraw</span>
             </button>
             <button 
               onClick={onRecenter}
               className="px-3 py-2 rounded font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 flex flex-col items-center text-xs"
             >
               <span>🎯 Center</span>
             </button>
             <button 
               onClick={onDestroy}
               className={`px-3 py-2 rounded font-bold flex flex-col items-center text-xs ${destroyMode ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
             >
               <span>{destroyMode ? 'Cancel' : '💣 Destroy'}</span>
             </button>
           </>
         )}
      </div>
    </div>
  );
};

export default Controls;
