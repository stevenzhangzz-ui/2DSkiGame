
import React, { useState } from 'react';
import { GameState, SkierLevel, FacilityType } from '../types';
import { COLORS, PROMOTION_RIDES_REQUIRED, SNOW_MIN } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardProps {
  gameState: GameState;
  onCheat: () => void;
  onReset: () => void;
  onSelectSkier: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ gameState, onCheat, onReset, onSelectSkier }) => {
  const [filterText, setFilterText] = useState("");
  const [sortBy, setSortBy] = useState<'progress' | 'name' | 'status'>('progress');

  const skierCounts = gameState.skiers.reduce((acc, s) => {
    acc[s.level] = (acc[s.level] || 0) + 1;
    return acc;
  }, {} as Record<SkierLevel, number>);

  const facilityCounts = gameState.facilities.reduce((acc, f) => {
    acc[f.type] = (acc[f.type] || 0) + 1;
    return acc;
  }, {} as Record<FacilityType, number>);

  const getStatusEmoji = (s: any) => {
      if (s.state === 'eating') return '😋';
      if (s.state === 'resting') return '💤';
      if (s.hunger < 30) return '🍔';
      return '⛷️';
  }

  // Filter and Sort
  const filteredSkiers = gameState.skiers.filter(s => 
    s.label.toLowerCase().includes(filterText.toLowerCase())
  );

  const sortedSkiers = [...filteredSkiers].sort((a, b) => {
    if (sortBy === 'progress') {
        const levelOrder = [SkierLevel.EXPERTISE, SkierLevel.ADVANCED, SkierLevel.AMATEUR, SkierLevel.BEGINNER];
        const diff = levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level);
        if (diff !== 0) return diff;
        return (b.rideCount || 0) - (a.rideCount || 0);
    } else if (sortBy === 'name') {
        return a.label.localeCompare(b.label);
    } else {
        // Sort by status emoji code
        const sa = getStatusEmoji(a);
        const sb = getStatusEmoji(b);
        return sa.localeCompare(sb);
    }
  });

  const snowDepth = Math.floor(gameState.snowDepth || 0);
  const snowColor = snowDepth < SNOW_MIN ? 'text-red-500' : (snowDepth > 200 ? 'text-blue-300' : 'text-white');

  return (
    <div className="w-72 bg-white border-l border-gray-200 flex flex-col h-full shadow-lg z-10 shrink-0">
      <div className="p-4 bg-gray-800 text-white shadow-md z-10">
        <h2 className="text-xl font-bold">Resort Status</h2>
        <div className="flex justify-between items-center mt-2 mb-3">
            <div className="flex items-center gap-2">
                <span className="text-yellow-400 text-2xl">●</span>
                <div>
                   <span className="text-2xl font-mono">{Math.floor(gameState.coins)}</span>
                   <div className="text-[10px] text-gray-400 uppercase leading-none">Coins</div>
                </div>
            </div>
            <div className="text-right">
                <div className={`text-xl font-mono ${snowColor}`}>❄️ {snowDepth}cm</div>
                <div className="text-[10px] text-gray-400 uppercase leading-none">Snow Depth</div>
            </div>
        </div>
        
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
        {gameState.isNight && (
             <div className="mt-2 text-center text-indigo-300 font-bold animate-pulse text-sm">
               🌙 Night Time (Resting)
             </div>
        )}
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
           
           {/* Controls */}
           <div className="mb-2 flex flex-col gap-2">
               <input 
                 type="text" 
                 placeholder="Search Name..." 
                 className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                 value={filterText}
                 onChange={e => setFilterText(e.target.value)}
               />
               <div className="flex gap-1">
                  <button onClick={() => setSortBy('progress')} className={`flex-1 text-[9px] font-bold py-1 rounded ${sortBy === 'progress' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>Progress</button>
                  <button onClick={() => setSortBy('name')} className={`flex-1 text-[9px] font-bold py-1 rounded ${sortBy === 'name' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>Name</button>
                  <button onClick={() => setSortBy('status')} className={`flex-1 text-[9px] font-bold py-1 rounded ${sortBy === 'status' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>Emoji</button>
               </div>
           </div>

           <div className="space-y-2">
             <AnimatePresence>
             {sortedSkiers.map(skier => {
                const isMax = skier.level === SkierLevel.EXPERTISE;
                // Cap progress at 100%
                const rides = skier.rideCount || 0;
                const pct = isMax ? 100 : Math.min(100, (rides / PROMOTION_RIDES_REQUIRED) * 100);
                
                return (
                   <motion.div 
                      key={skier.id} 
                      onClick={() => onSelectSkier(skier.id)}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="bg-white border border-gray-100 rounded-md p-2 shadow-sm hover:shadow-md cursor-pointer hover:bg-blue-50 transition-colors"
                   >
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                           <div 
                             className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold"
                             style={{backgroundColor: COLORS[skier.level], color: skier.level === SkierLevel.BEGINNER ? 'black' : 'white'}}
                           >
                             {skier.label}
                           </div>
                           <span className="text-lg" role="img" aria-label="status">{getStatusEmoji(skier)}</span>
                        </div>
                        <div className="text-[10px] font-mono text-gray-400">
                          {isMax ? 'MASTERED' : `${rides} / ${PROMOTION_RIDES_REQUIRED} Runs`}
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
             {sortedSkiers.length === 0 && <div className="text-xs text-gray-400 italic">No skiers found...</div>}
           </div>
        </div>

        {/* Facilities Summary */}
        <div>
          <h3 className="text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Facilities</h3>
          <div className="space-y-1 bg-gray-50 p-2 rounded-lg border border-gray-100">
            <div className="flex justify-between text-xs text-gray-600"><span>Trails</span> <span className="font-mono font-bold">{facilityCounts[FacilityType.TRAIL] || 0}</span></div>
            <div className="flex justify-between text-xs text-gray-600"><span>Lifts</span> <span className="font-mono font-bold">{facilityCounts[FacilityType.LIFT] || 0}</span></div>
            <div className="flex justify-between text-xs text-gray-600"><span>Gondolas</span> <span className="font-mono font-bold">{facilityCounts[FacilityType.GONDOLA] || 0}</span></div>
            <div className="flex justify-between text-xs text-gray-600"><span>Cafes</span> <span className="font-mono font-bold">{facilityCounts[FacilityType.CAFE] || 0}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
