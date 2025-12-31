
import React, { useRef, useState } from 'react';
import { GameConfig, GameState, Point, Facility, Skier, FacilityType, TrailDifficulty, SkierLevel, LiftType, FloatingText } from '../types';
import { COLORS, GRID_SIZE, LIFT_SPEED, GONDOLA_SPEED, LIFT_WIDTHS, getLiftNumChairs, getLiftCapacity } from '../constants';
import { 
  getProjectedPointOnSegment, distance, 
  getPointOnLine, getPointOnTrail, getTrailPathD, getNearestPointOnTrail 
} from '../services/geometry';

interface GameCanvasProps {
  config: GameConfig;
  gameState: GameState;
  viewX: number;
  viewY: number;
  zoom: number;
  buildingMode: any; 
  onMapClick: (p: Point) => void;
  onMapHover: (p: Point) => void;
  onViewChange: (x: number, y: number, zoom: number) => void;
  hoverPoint: Point | null;
  dragStart: Point | null;
  backgroundImage: string | null;
  isDrawing?: boolean;
  drawingPoints?: Point[];
  showTrailNames?: boolean;
}

// --- HELPER FUNCTIONS FOR RENDERING ---
const getFacilityColor = (f: Facility) => {
  if (f.type === FacilityType.TRAIL) {
    return COLORS[f.subType as TrailDifficulty] || '#000';
  }
  return '#374151';
};

const getSkierColor = (level: SkierLevel) => COLORS[level] || '#000';

// --- MEMOIZED LAYERS ---

const TreeLayer = React.memo(({ trees }: { trees: Point[] }) => (
  <g pointerEvents="none">
    {trees.map((t, i) => (
       <use key={`tree-${i}`} href="#tree-vivid" x={t.x * GRID_SIZE} y={t.y * GRID_SIZE} opacity={0.95} />
    ))}
  </g>
));

const MountainLayer = React.memo(({ mountains, hasBackground }: { mountains: Point[][], hasBackground: boolean }) => (
  <g pointerEvents="none">
    {mountains.map((poly, i) => (
        <polygon 
          key={`mtn-${i}`} 
          points={poly.map(p => `${p.x * GRID_SIZE},${p.y * GRID_SIZE}`).join(' ')} 
          fill={hasBackground ? "none" : "#cbd5e1"} 
          stroke={hasBackground ? "rgba(255, 255, 255, 0.4)" : "none"}
          strokeWidth={hasBackground ? 2 : 0}
          strokeDasharray={hasBackground ? "10,10" : ""}
          opacity={hasBackground ? 0.5 : 0.6}
        />
    ))}
  </g>
));

const GridLayer = React.memo(({ width, height, hasBackground }: { width: number, height: number, hasBackground: boolean }) => (
  <g opacity={hasBackground ? 0.05 : 0.1} pointerEvents="none">
     {Array.from({ length: width }).map((_, i) => (
       <line key={`v-${i}`} x1={i * GRID_SIZE} y1={0} x2={i * GRID_SIZE} y2={height * GRID_SIZE} stroke="black" strokeWidth={1} />
     ))}
     {Array.from({ length: height }).map((_, i) => (
       <line key={`h-${i}`} x1={0} y1={i * GRID_SIZE} x2={width * GRID_SIZE} y2={i * GRID_SIZE} stroke="black" strokeWidth={1} />
     ))}
  </g>
));

const BackgroundLayer = React.memo(({ image, width, height }: { image: string, width: number, height: number }) => (
  <image 
      href={image} x={0} y={0} 
      width={width * GRID_SIZE} height={height * GRID_SIZE} 
      preserveAspectRatio="none" opacity={0.9}
  />
));

const LightLayer = React.memo(({ facilities, opacity }: { facilities: Facility[], opacity: number }) => {
    if (opacity <= 0.1) return null;
    return (
        <g>
            {facilities.map((f, i) => {
                const isTrail = f.type === FacilityType.TRAIL;
                const isLightTrail = f.subType === TrailDifficulty.GREEN || f.subType === TrailDifficulty.BLUE;
                const lights = [f.start, f.end];
                if (isTrail && isLightTrail && f.length > 3) {
                    const numLights = Math.floor(f.length / 3); 
                    for(let k=1; k<=numLights; k++) {
                        const t = k / (numLights + 1);
                        lights.push(getPointOnTrail(f.start, f.end, t, f.id, f.subType as string));
                    }
                }
                return (
                    <g key={`light-group-${f.id}`}>
                        {lights.map((p, k) => (
                             <circle key={`l-${k}`} cx={p.x * GRID_SIZE} cy={p.y * GRID_SIZE} r={6} fill={COLORS['Light']} opacity={opacity * 0.8} filter="url(#glow)" />
                        ))}
                    </g>
                );
            })}
        </g>
    )
});

const HotelLayer = React.memo(({ pos, isNight }: { pos: Point, isNight: boolean }) => (
    <g transform={`translate(${pos.x * GRID_SIZE}, ${pos.y * GRID_SIZE})`}>
        {/* Shadow */}
        <ellipse cx={0} cy={10} rx={40} ry={10} fill="rgba(0,0,0,0.3)" />
        {/* Main Building Body */}
        <path d="M -30 0 L -30 -35 L 30 -35 L 30 0 Z" fill="#334155" stroke="#1e293b" strokeWidth={2} />
        {/* Roof */}
        <path d="M -35 -35 L 0 -55 L 35 -35 Z" fill="#7f1d1d" stroke="#450a0a" strokeWidth={2} />
        {/* Side Wing */}
        <rect x={-50} y={-20} width={20} height={20} fill="#475569" stroke="#1e293b" strokeWidth={2} />
        <path d="M -52 -20 L -40 -30 L -28 -20 Z" fill="#7f1d1d" stroke="#450a0a" strokeWidth={2} />
        
        {/* Windows */}
        <g fill={isNight ? "#fef08a" : "#1e293b"}>
          <rect x={-20} y={-25} width={8} height={10} />
          <rect x={-5} y={-25} width={10} height={10} />
          <rect x={12} y={-25} width={8} height={10} />
          <rect x={-45} y={-15} width={10} height={8} />
        </g>
        
        {/* Entrance */}
        <rect x={-8} y={-12} width={16} height={12} fill="#334155" />
        <rect x={-8} y={-12} width={16} height={3} fill="#7f1d1d" /> 

        <text x={0} y={12} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold" stroke="black" strokeWidth={0.5}>RESORT HOTEL</text>
        <text x={0} y={-60} textAnchor="middle" fontSize={24}>🏨</text>
    </g>
));

const FloatingTextLayer = React.memo(({ texts }: { texts: FloatingText[] }) => (
    <g pointerEvents="none">
        {texts.map(ft => (
            <g key={ft.id} transform={`translate(${ft.x * GRID_SIZE}, ${ft.y * GRID_SIZE})`}>
                <text 
                    textAnchor="middle"
                    fill={ft.color}
                    fontSize={20}
                    fontWeight="bold"
                    opacity={ft.life}
                    style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.5)', fontFamily: 'monospace' }}
                >
                    {ft.text}
                </text>
            </g>
        ))}
    </g>
));

const FacilitiesLayer = React.memo(({ facilities, time, showTrailNames }: { facilities: Facility[], time: number, showTrailNames?: boolean }) => {
  return (
    <g>
      {facilities.map(f => {
            // CAFE RENDER (Vivid 3D-ish Style)
            if (f.type === FacilityType.CAFE) {
                return (
                   <g key={f.id} transform={`translate(${f.start.x * GRID_SIZE}, ${f.start.y * GRID_SIZE})`}>
                      {/* Base Shadow */}
                      <ellipse cx={0} cy={5} rx={25} ry={10} fill="rgba(0,0,0,0.3)" />
                      {/* Structure Walls */}
                      <path d="M -20 0 L -20 -20 L 20 -20 L 20 0 Z" fill="#78350f" stroke="#451a03" strokeWidth={2} />
                      {/* Roof (A-Frame) */}
                      <path d="M -25 -20 L 0 -40 L 25 -20 Z" fill="#b45309" stroke="#78350f" strokeWidth={2} />
                      {/* Door */}
                      <rect x={-6} y={-15} width={12} height={15} fill="#451a03" />
                      {/* Sign */}
                      <rect x={-15} y={-30} width={30} height={8} fill="#fcd34d" rx={2} stroke="#b45309" strokeWidth={1} />
                      <text x={0} y={-24} textAnchor="middle" fontSize={6} fontWeight="bold" fill="#451a03">LODGE</text>
                      <text x={0} y={-45} textAnchor="middle" fontSize={16}>☕</text>
                   </g>
                );
            }

            const isLift = f.type === FacilityType.LIFT || f.type === FacilityType.GONDOLA;
            const isGondola = f.type === FacilityType.GONDOLA;
            const isPark = f.subType === TrailDifficulty.PARK;
            const isClosed = f.isOpen === false;
            
            // Trail
            if (!isLift) {
               let midPoint = {x:0, y:0};
               let pathD = "";
               let angle = 0;
               
               if (f.length < 2) {
                  pathD = `M ${f.start.x * GRID_SIZE} ${f.start.y * GRID_SIZE} L ${f.end.x * GRID_SIZE} ${f.end.y * GRID_SIZE}`;
                  midPoint = getPointOnLine(f.start, f.end, 0.5);
                  angle = Math.atan2(f.end.y - f.start.y, f.end.x - f.start.x) * 180 / Math.PI;
               } else {
                  pathD = getTrailPathD(f.start, f.end, f.id, f.subType as string, GRID_SIZE);
                  midPoint = getPointOnTrail(f.start, f.end, 0.5, f.id, f.subType as string);
                  const nextP = getPointOnTrail(f.start, f.end, 0.51, f.id, f.subType as string);
                  angle = Math.atan2(nextP.y - midPoint.y, nextP.x - midPoint.x) * 180 / Math.PI;
               }

               const isBlack = f.subType === TrailDifficulty.BLACK;
               const isDouble = f.subType === TrailDifficulty.DOUBLE_DIAMOND;
               
               return (
                 <g key={f.id}>
                   <path d={pathD} stroke={getFacilityColor(f)} strokeWidth={isPark ? 10 : 6} strokeLinecap="round" fill="none" opacity={isPark ? 0.4 : 0.9} strokeDasharray={isClosed ? "10,5" : ""} />
                   
                   {/* Park Features */}
                   {isPark && f.length > 2 && (
                       <g>
                           {[0.2, 0.4, 0.6, 0.8].map((t, idx) => {
                               const p = getPointOnTrail(f.start, f.end, t, f.id, f.subType as string);
                               const np = getPointOnTrail(f.start, f.end, t + 0.01, f.id, f.subType as string);
                               const a = Math.atan2(np.y - p.y, np.x - p.x) * 180 / Math.PI;
                               const isJump = idx % 2 === 0;
                               return (
                                   <g key={idx} transform={`translate(${p.x * GRID_SIZE}, ${p.y * GRID_SIZE}) rotate(${a})`}>
                                       {isJump ? (
                                           // Jump Ramp
                                           <path d="M -6 0 L 6 -4 L 6 4 L -6 0 Z" fill="#f472b6" stroke="#be185d" strokeWidth={1} />
                                       ) : (
                                           // Rail
                                           <rect x={-8} y={-2} width={16} height={4} fill="#e5e7eb" stroke="#374151" strokeWidth={1} />
                                       )}
                                   </g>
                               )
                           })}
                       </g>
                   )}

                   {/* Direction Indicator */}
                   <path d={`M 0 0 L -4 -4 L 4 0 L -4 4 z`} fill="rgba(0,0,0,0.3)" transform={`translate(${midPoint.x * GRID_SIZE}, ${midPoint.y * GRID_SIZE}) rotate(${angle}) translate(0, 0)`} /> 
                   
                   {/* Difficulty Symbol */}
                   {(isBlack || isDouble) && (
                     <g transform={`translate(${midPoint.x * GRID_SIZE}, ${midPoint.y * GRID_SIZE}) rotate(${angle})`}>
                       {isDouble ? (
                         <><rect x={-8} y={-4} width={8} height={8} fill="black" transform="rotate(45, -4, 0)" /><rect x={0} y={-4} width={8} height={8} fill="black" transform="rotate(45, 4, 0)" /></>
                       ) : ( <rect x={-4} y={-4} width={8} height={8} fill="black" transform="rotate(45)" /> )}
                     </g>
                   )}

                   {/* Trail Name & Closure Sign */}
                   {showTrailNames && (
                       <g transform={`translate(${midPoint.x * GRID_SIZE}, ${midPoint.y * GRID_SIZE})`}>
                           <text 
                               textAnchor="middle" 
                               dy={-10} 
                               fontSize={10} 
                               fontWeight="bold" 
                               fill="black" 
                               stroke="white" 
                               strokeWidth={2} 
                               paintOrder="stroke"
                           >
                               {f.name}
                           </text>
                           {isClosed && (
                               <text 
                                   textAnchor="middle" 
                                   dy={12} 
                                   fontSize={10} 
                                   fontWeight="bold" 
                                   fill="red" 
                                   stroke="white" 
                                   strokeWidth={2} 
                                   paintOrder="stroke"
                               >
                                   CLOSED
                               </text>
                           )}
                       </g>
                   )}
                 </g>
               );
            }

            // Lift System
            const numSeats = getLiftNumChairs(f.length, f.subType as string);
            let speed = isGondola ? GONDOLA_SPEED : LIFT_SPEED;
            speed = speed / f.length;

            // If Closed, speed = 0 implies progress does not advance visibly, but `time` keeps moving
            // To make it look "stopped", we just don't add time offset or use a fixed seed.
            // Using a static progress based on ID if closed.
            let baseProgress = 0;
            if (isClosed) {
                // Static "frozen" look
                baseProgress = (f.createdAt * 0.1) % 1; 
            } else {
                baseProgress = (time * speed) % 1;
            }

            const chairWidth = LIFT_WIDTHS[f.subType as LiftType] || 12;
            const opacity = isClosed ? 0.6 : 1;
            
            return (
              <g key={f.id} opacity={opacity}>
                <line x1={f.start.x * GRID_SIZE} y1={f.start.y * GRID_SIZE} x2={f.end.x * GRID_SIZE} y2={f.end.y * GRID_SIZE} stroke="#374151" strokeWidth={2} />
                <circle cx={f.start.x * GRID_SIZE} cy={f.start.y * GRID_SIZE} r={4} fill="#1f2937" />
                <circle cx={f.end.x * GRID_SIZE} cy={f.end.y * GRID_SIZE} r={4} fill="#1f2937" />
                {Array.from({ length: numSeats }).map((_, i) => {
                  const spacing = 1 / numSeats;
                  const progress = (baseProgress + i * spacing) % 1;
                  const pos = getPointOnLine(f.start, f.end, progress);
                  if (isGondola) {
                    return (
                      <g key={`seat-${i}`} transform={`translate(${pos.x * GRID_SIZE}, ${pos.y * GRID_SIZE})`}>
                         <rect x={-8} y={-6} width={16} height={12} rx={3} fill="#e5e7eb" stroke="#374151" strokeWidth={1} />
                         <line x1={0} y1={-6} x2={0} y2={-10} stroke="#374151" strokeWidth={1} />
                      </g>
                    );
                  }
                  return (
                    <g key={`seat-${i}`} transform={`translate(${pos.x * GRID_SIZE}, ${pos.y * GRID_SIZE})`}>
                       <rect x={-chairWidth/2} y={-4} width={chairWidth} height={8} fill="none" stroke="#374151" strokeWidth={2} />
                    </g>
                  );
                })}

                {/* Lift Name & Status (Same visual style as trails) */}
                {showTrailNames && (
                    <g transform={`translate(${((f.start.x + f.end.x) / 2) * GRID_SIZE}, ${((f.start.y + f.end.y) / 2) * GRID_SIZE})`}>
                       <text 
                           textAnchor="middle" 
                           dy={-10} 
                           fontSize={10} 
                           fontWeight="bold" 
                           fill="black" 
                           stroke="white" 
                           strokeWidth={2} 
                           paintOrder="stroke"
                       >
                           {f.name}
                       </text>
                       {isClosed && (
                           <text 
                               textAnchor="middle" 
                               dy={12} 
                               fontSize={10} 
                               fontWeight="bold" 
                               fill="red" 
                               stroke="white" 
                               strokeWidth={2} 
                               paintOrder="stroke"
                           >
                               STOPPED
                           </text>
                       )}
                   </g>
                )}
              </g>
            );
          })}
    </g>
  );
});

// Skiers Layer (Removed Emojis)
const SkiersLayer = React.memo(({ skiers, facilities }: { skiers: Skier[], facilities: Facility[] }) => {
  return (
    <g>
      {skiers.map(skier => {
            let pos = { x: skier.x, y: skier.y };
            let jumpHeight = 0;
            let rotation = 0;
            
            if (skier.state === 'eating') {
               const fac = facilities.find(f => f.id === skier.currentFacilityId);
               if (fac) pos = { x: fac.start.x, y: fac.start.y }; 
            }

            // Queue Positioning logic
            if (skier.state === 'waiting' && skier.currentFacilityId) {
                const fac = facilities.find(f => f.id === skier.currentFacilityId);
                if (fac) {
                    const queueIdx = fac.queue.indexOf(skier.id);
                    if (queueIdx !== -1) {
                        const capacity = getLiftCapacity(fac.subType as string);
                        const rowWidth = Math.max(2, capacity); 
                        const row = Math.floor(queueIdx / rowWidth);
                        const col = queueIdx % rowWidth;
                        const dx = fac.end.x - fac.start.x;
                        const dy = fac.end.y - fac.start.y;
                        const len = Math.sqrt(dx*dx + dy*dy) || 1;
                        const nx = dx / len;
                        const ny = dy / len;
                        const px = -ny;
                        const py = nx;
                        const spacingY = 0.5;
                        const spacingX = 0.4;
                        const xOffset = (col - (rowWidth - 1) / 2) * spacingX;
                        const distBack = 1.0 + row * spacingY;

                        pos = {
                            x: fac.start.x - nx * distBack + px * xOffset,
                            y: fac.start.y - ny * distBack + py * xOffset
                        };
                    }
                }
            }
            
            // Movement Interpolation
            const f = facilities.find(fac => fac.id === skier.currentFacilityId);
            if (f && (skier.state === 'skiing' || skier.state === 'lifting')) {
               if (f.type === FacilityType.TRAIL) {
                  pos = getPointOnTrail(f.start, f.end, skier.progress, f.id, f.subType as string);
                  if (f.length >= 2) {
                    const nextPos = getPointOnTrail(f.start, f.end, Math.min(1, skier.progress + 0.01), f.id, f.subType as string);
                    const tx = nextPos.x - pos.x;
                    const ty = nextPos.y - pos.y;
                    const len = Math.sqrt(tx*tx + ty*ty) || 1;
                    const nx = -ty / len;
                    const ny = tx / len;
                    const wave = Math.sin(skier.progress * Math.PI * 15) * 0.25;
                    pos.x += nx * wave;
                    pos.y += ny * wave;
                  }

                  // PARK ANIMATION
                  if (f.subType === TrailDifficulty.PARK) {
                     // Simple periodic jump features along the trail
                     // Jumps roughly at 0.2, 0.4, 0.6, 0.8 progress
                     const p = skier.progress;
                     const jumpPhase = (p * 5) % 1; // 5 cycles
                     if (jumpPhase > 0.3 && jumpPhase < 0.7) {
                         // In air
                         jumpHeight = Math.sin((jumpPhase - 0.3) / 0.4 * Math.PI) * 15;
                         rotation = (p * 360 * 2) % 360; 
                     }
                  }
               } else {
                  const basePos = getPointOnLine(f.start, f.end, skier.progress);
                  const capacity = getLiftCapacity(f.subType as string);
                  const dx = f.end.x - f.start.x;
                  const dy = f.end.y - f.start.y;
                  const len = Math.sqrt(dx*dx + dy*dy) || 1;
                  const ny = dx / len;
                  const nx = -dy / len;
                  if (capacity > 1) {
                      const seatIdx = skier.seatIndex ?? 0;
                      const offsetFactor = (seatIdx - (capacity - 1) / 2);
                      const offsetMag = 0.3; 
                      pos = {
                          x: basePos.x + nx * offsetFactor * offsetMag,
                          y: basePos.y + ny * offsetFactor * offsetMag
                      };
                  } else {
                      pos = basePos;
                  }
               }
            }

            const isExpertise = skier.level === SkierLevel.EXPERTISE;
            const color = getSkierColor(skier.level);
            
            return (
              <g key={skier.id} transform={`translate(${pos.x * GRID_SIZE}, ${pos.y * GRID_SIZE})`}>
                {/* Shadow (stays on ground) */}
                {jumpHeight > 0 && (
                   <ellipse cx={0} cy={2} rx={4} ry={2} fill="rgba(0,0,0,0.3)" />
                )}
                
                {/* Skier Body (Moves up) */}
                <g transform={`translate(0, ${-jumpHeight}) rotate(${rotation})`}>
                    <circle r={isExpertise ? 8 : 6} fill={color} stroke="white" strokeWidth={2} />
                    <text y={3} fontSize={8} fill={skier.level === SkierLevel.BEGINNER ? 'black' : 'white'} textAnchor="middle" fontWeight="bold" transform={`rotate(${-rotation})`}>
                      {skier.label}
                    </text>
                </g>
              </g>
            );
      })}
    </g>
  );
});


// --- Main Component ---

const GameCanvas: React.FC<GameCanvasProps> = ({
  config, gameState, viewX, viewY, zoom, buildingMode, onMapClick, onMapHover, onViewChange, hoverPoint, dragStart, backgroundImage,
  isDrawing, drawingPoints, showTrailNames
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef<{x: number, y: number} | null>(null);

  const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const scaleBy = 1.1;
      const factor = e.deltaY < 0 ? scaleBy : 1 / scaleBy;
      const newZoom = Math.min(Math.max(zoom * factor, 0.5), 5);
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const newViewX = viewX + mouseX / zoom - mouseX / newZoom;
      const newViewY = viewY + mouseY / zoom - mouseY / newZoom;
      onViewChange(newViewX, newViewY, newZoom);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
        dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    if (dragStartRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        if (!isPanning && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
            setIsPanning(true);
        }
        if (isPanning) {
            onViewChange(viewX - dx / zoom, viewY - dy / zoom, zoom);
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            return; 
        }
    }
    
    let finalX = (rawX / zoom + viewX) / GRID_SIZE;
    let finalY = (rawY / zoom + viewY) / GRID_SIZE;

    let snapped = false;
    if (buildingMode && !isPanning && !isDrawing) {
       const isPointBuild = buildingMode.type === FacilityType.CAFE;
       let bestDist = 1.0; 
       gameState.facilities.forEach(f => {
         const dStart = distance({x: finalX, y: finalY}, f.start);
         const dEnd = distance({x: finalX, y: finalY}, f.end);
         if (dStart < 0.5) { finalX = f.start.x; finalY = f.start.y; snapped = true; bestDist = 0; } 
         else if (dEnd < 0.5) { finalX = f.end.x; finalY = f.end.y; snapped = true; bestDist = 0; }
         if (!snapped && f.type === FacilityType.TRAIL && !isPointBuild) {
           let targetX = 0, targetY = 0, targetDist = Infinity;
           if (f.length < 2) {
              const { dist, t } = getProjectedPointOnSegment({x: finalX, y: finalY}, f.start, f.end);
              if (dist < bestDist) { const p = getPointOnLine(f.start, f.end, t); targetX = p.x; targetY = p.y; targetDist = dist; }
           } else {
              const { t, dist } = getNearestPointOnTrail({x: finalX, y: finalY}, f.start, f.end, f.id, f.subType as string);
              const curvePos = getPointOnTrail(f.start, f.end, t, f.id, f.subType as string);
              if (dist < bestDist) { targetX = curvePos.x; targetY = curvePos.y; targetDist = dist; }
           }
           if (targetDist < bestDist) { finalX = targetX; finalY = targetY; bestDist = targetDist; snapped = true; }
         }
       });
    }

    if (!snapped) { finalX = Math.round(finalX); finalY = Math.round(finalY); }
    if (!hoverPoint || Math.abs(hoverPoint.x - finalX) > 0.01 || Math.abs(hoverPoint.y - finalY) > 0.01) {
       onMapHover({ x: finalX, y: finalY });
    }
  };

  const handleMouseUp = () => {
      if (isPanning) { setIsPanning(false); } 
      else { if (dragStartRef.current && hoverPoint) onMapClick(hoverPoint); }
      dragStartRef.current = null;
  };

  const darkness = (gameState.lightOpacity || 0) * 0.7;

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-100 overflow-hidden cursor-crosshair relative">
      <svg 
        ref={svgRef}
        width="100%" height="100%"
        onMouseMove={handleMouseMove} onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel}
        style={{ touchAction: 'none' }}
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <g id="tree-vivid">
             <rect x="-2" y="2" width="4" height="6" fill="#5D4037" />
             <path d="M -10 4 L 10 4 L 0 -8 Z" fill="#14532d" />
             <path d="M -8 -4 L 8 -4 L 0 -14 Z" fill="#15803d" />
             <path d="M -6 -10 L 6 -10 L 0 -18 Z" fill="#16a34a" />
          </g>
        </defs>

        <g transform={`scale(${zoom}) translate(${-viewX}, ${-viewY})`}>
          {backgroundImage && (<BackgroundLayer image={backgroundImage} width={config.gridWidth} height={config.gridHeight} />)}
          <GridLayer width={config.gridWidth} height={config.gridHeight} hasBackground={!!backgroundImage} />
          <MountainLayer mountains={config.mountains} hasBackground={!!backgroundImage} />

          {isDrawing && drawingPoints && (
            <g>
               {drawingPoints.map((p, i) => (<circle key={i} cx={p.x * GRID_SIZE} cy={p.y * GRID_SIZE} r={4} fill="#2563eb" />))}
               {drawingPoints.length > 1 && (<polyline points={drawingPoints.map(p => `${p.x * GRID_SIZE},${p.y * GRID_SIZE}`).join(' ')} fill="rgba(37, 99, 235, 0.2)" stroke="#2563eb" strokeWidth={2} strokeDasharray="5,5" />)}
               {drawingPoints.length > 0 && hoverPoint && (<line x1={drawingPoints[drawingPoints.length - 1].x * GRID_SIZE} y1={drawingPoints[drawingPoints.length - 1].y * GRID_SIZE} x2={hoverPoint.x * GRID_SIZE} y2={hoverPoint.y * GRID_SIZE} stroke="#2563eb" strokeWidth={2} strokeDasharray="5,5" opacity={0.5} />)}
            </g>
          )}

          <TreeLayer trees={gameState.trees} />
          <rect x={-5000} y={-5000} width={10000} height={10000} fill={COLORS.NightOverlay} opacity={darkness} pointerEvents="none" />
          <HotelLayer pos={gameState.hotelPosition || {x:0, y:0}} isNight={gameState.isNight} />
          <FacilitiesLayer facilities={gameState.facilities} time={gameState.time} showTrailNames={showTrailNames} />
          <SkiersLayer skiers={gameState.skiers} facilities={gameState.facilities} />
          <LightLayer facilities={gameState.facilities} opacity={gameState.lightOpacity} />
          <FloatingTextLayer texts={gameState.floatingTexts} />

          {dragStart && hoverPoint && (<line x1={dragStart.x * GRID_SIZE} y1={dragStart.y * GRID_SIZE} x2={hoverPoint.x * GRID_SIZE} y2={hoverPoint.y * GRID_SIZE} stroke="black" strokeDasharray="5,5" strokeWidth={2} opacity={0.5} />)}
          {hoverPoint && !isDrawing && (<circle cx={hoverPoint.x * GRID_SIZE} cy={hoverPoint.y * GRID_SIZE} r={4} fill="rgba(0,0,255,0.3)" />)}
        </g>
      </svg>
    </div>
  );
};

export default GameCanvas;
