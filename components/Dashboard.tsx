
import React from 'react';
import { GameState, SkierLevel, FacilityType } from '../types';
import { COLORS, PROMOTION_TIME_REQUIRED } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardProps {
  gameState: GameState;
  onCheat: () => void;
  onReset: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ gameState, onCheat, onReset }) => {
  const skierCounts = gameState.skiers.reduce((acc, s) => {
    acc[s.level] = (acc[s.level] || 0) + 1;
    return acc;
  }, {} as Record<SkierLevel, number>);

  const facilityCounts = gameState.facilities.reduce((acc, f) => {
    acc[f.type] = (acc[f.type] || 0) + 1;
    return acc;
  }, {} as Record<FacilityType, number>);

  // Sort skiers: Expertise first, then by progress
  const sortedSkiers = [...gameState.skiers].sort((a, b) => {
    const levelOrder = [SkierLevel.EXPERTISE, SkierLevel.ADVANCED, SkierLevel.AMATEUR, SkierLevel.BEGINNER];
    const diff = levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level);
    if (diff !== 0) return diff;
    return b.timeOnHardestTrail - a.timeOnHardestTrail;
  });

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}m ${s}s`;
  };

  return (
    <div className="w-72 bg-white border-l border-gray-200 flex flex-col h-full shadow-lg z-10 shrink-0">
      <div className="p-4 bg-gray-800 text-white shadow-md z-10">
        <h2 className="text-xl font-bold">Resort Status</h2>
        <div className="flex items-center gap-2 mt-2 mb-3">
          <span className="text-yellow-400 text-2xl">●</span>
          <span className="text-2xl font-mono">{Math.floor(gameState.coins)}</span>
          <span className="text-xs text-gray-400">Coins</span>
        </div>
        
        {/* Actions moved to top */}
        <div className="grid grid-cols-2 gap-2 mb-2">
           <button onClick={onCheat} className="px-2 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-xs font-bold transition-colors shadow">
             +💰 Cheat
           </button>
           <button onClick={onReset} className="px-2 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold transition-colors shadow">
             🔄 Reset
           </button>
        </div>

        <div className="mt-2 text-sm text-gray-300 border-t border-gray-700 pt-2">
           Promoted to Expert: <span className="text-green-400 font-bold">{gameState.promotedCount}</span> / 10
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Skiers Summary */}
        <div>
          <h3 className="text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Population ({gameState.skiers.length})</h3>
          <div className="space-y-1 bg-gray-50 p-2 rounded-lg border border-gray-100">
            {Object.values(SkierLevel).map(level => (
              <div key={level} className="flex justify-between items-center text-sm">
                 <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[level] }}></div>
                   <span className="text-gray-600 text-xs">{level}</span>
                 </div>
                 <span className="font-mono text-xs font-bold">{skierCounts[level] || 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Skier Progress List */}
        <div>
           <h3 className="text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Player Progress</h3>
           <div className="space-y-2">
             <AnimatePresence>
             {sortedSkiers.map(skier => {
                const isMax = skier.level === SkierLevel.EXPERTISE;
                // Cap progress at 100%
                const pct = isMax ? 100 : Math.min(100, (skier.timeOnHardestTrail / PROMOTION_TIME_REQUIRED) * 100);
                
                return (
                   <motion.div 
                      key={skier.id} 
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="bg-white border border-gray-100 rounded-md p-2 shadow-sm hover:shadow-md"
                   >
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                           <div 
                             className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold"
                             style={{backgroundColor: COLORS[skier.level], color: skier.level === SkierLevel.BEGINNER ? 'black' : 'white'}}
                           >
                             {skier.label}
                           </div>
                           <div className="flex flex-col">
                             <span className="text-xs font-bold text-gray-700">{skier.level}</span>
                           </div>
                        </div>
                        <div className="text-[10px] font-mono text-gray-400">
                          {isMax ? 'MASTERED' : `${formatTime(skier.timeOnHardestTrail)} / 5m`}
                        </div>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-1">
                         <div 
                           className="h-full transition-all duration-500 rounded-full" 
                           style={{ 
                             width: `${pct}%`, 
                             backgroundColor: isMax ? '#10b981' : COLORS[skier.level] 
                           }}
                         />
                      </div>
                   </motion.div>
                );
             })}
             </AnimatePresence>
             {sortedSkiers.length === 0 && <div className="text-xs text-gray-400 italic">No skiers yet...</div>}
           </div>
        </div>

        {/* Facilities Summary */}
        <div>
          <h3 className="text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Facilities</h3>
          <div className="space-y-1 bg-gray-50 p-2 rounded-lg border border-gray-100">
            <div className="flex justify-between text-xs text-gray-600"><span>Trails</span> <span className="font-mono font-bold">{facilityCounts[FacilityType.TRAIL] || 0}</span></div>
            <div className="flex justify-between text-xs text-gray-600"><span>Lifts</span> <span className="font-mono font-bold">{facilityCounts[FacilityType.LIFT] || 0}</span></div>
            <div className="flex justify-between text-xs text-gray-600"><span>Gondolas</span> <span className="font-mono font-bold">{facilityCounts[FacilityType.GONDOLA] || 0}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
