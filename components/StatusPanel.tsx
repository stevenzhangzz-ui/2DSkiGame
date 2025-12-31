
import React from 'react';
import { Facility, FacilityType } from '../types';

interface StatusPanelProps {
  facilities: Facility[];
}

const StatusPanel: React.FC<StatusPanelProps> = ({ facilities }) => {
  const trails = facilities.filter(f => f.type === FacilityType.TRAIL);
  const lifts = facilities.filter(f => f.type === FacilityType.LIFT || f.type === FacilityType.GONDOLA);
  
  // Sort trails by creation time (newest last) or alphabetical
  const sortedTrails = [...trails].sort((a, b) => a.name.localeCompare(b.name));
  const sortedLifts = [...lifts].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shadow-lg z-10 shrink-0">
      <div className="p-4 bg-slate-800 text-white shadow-md z-10">
        <h2 className="text-xl font-bold">Resort Status</h2>
        <div className="text-xs text-gray-400 mt-1">Real-time Open/Closed Info</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
         
         {/* LIFTS SECTION */}
         <div>
             <h3 className="text-xs font-bold uppercase text-gray-500 mb-2 border-b pb-1">Lifts & Gondolas</h3>
             {sortedLifts.length === 0 ? (
                 <div className="text-gray-400 text-xs italic">No lifts built.</div>
             ) : (
                 sortedLifts.map(lift => {
                     const isOpen = lift.isOpen !== false;
                     return (
                         <div key={lift.id} className="flex items-center justify-between p-2 mb-1 bg-white rounded border border-gray-200 shadow-sm">
                             <div className="flex flex-col overflow-hidden">
                                 <span className="font-bold text-sm truncate w-32 text-gray-800" title={lift.name}>{lift.name}</span>
                                 <span className="text-[10px] text-gray-400 uppercase">{lift.subType}</span>
                             </div>
                             <div className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider ${isOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                 {isOpen ? 'RUNNING' : 'STOPPED'}
                             </div>
                         </div>
                     );
                 })
             )}
         </div>

         {/* TRAILS SECTION */}
         <div>
             <h3 className="text-xs font-bold uppercase text-gray-500 mb-2 border-b pb-1">Trails</h3>
             {sortedTrails.length === 0 ? (
                 <div className="text-gray-400 text-xs italic">No trails built.</div>
             ) : (
                 sortedTrails.map(trail => {
                     const isOpen = trail.isOpen !== false;
                     return (
                         <div key={trail.id} className="flex items-center justify-between p-2 mb-1 bg-white rounded border border-gray-200 shadow-sm">
                             <div className="flex flex-col overflow-hidden">
                                 <span className="font-bold text-sm truncate w-32 text-gray-800" title={trail.name}>{trail.name}</span>
                                 <span className="text-[10px] text-gray-400 uppercase">{trail.subType}</span>
                             </div>
                             <div className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider ${isOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                 {isOpen ? 'OPEN' : 'CLOSED'}
                             </div>
                         </div>
                     );
                 })
             )}
         </div>
         
      </div>
    </div>
  );
};

export default StatusPanel;
