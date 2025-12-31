import React, { useRef, useState, useEffect } from 'react';
import { GameConfig, GameState, Point, Facility, Skier, FacilityType, TrailDifficulty, SkierLevel, LiftType } from '../types';
import { COLORS, GRID_SIZE, LIFT_SPEED, GONDOLA_SPEED, LIFT_WIDTHS, getLiftNumChairs, getLiftCapacity } from '../constants';
import { 
  getProjectedPointOnSegment, distance, 
  getPointOnTrail, getTrailPathD, getNearestPointOnTrail 
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
}

const GameCanvas: React.FC<GameCanvasProps> = ({
  config, gameState, viewX, viewY, zoom, buildingMode, onMapClick, onMapHover, onViewChange, hoverPoint, dragStart, backgroundImage,
  isDrawing, drawingPoints
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef<{x: number, y: number} | null>(null);

  const getFacilityColor = (f: Facility) => {
    if (f.type === FacilityType.TRAIL) {
      return COLORS[f.subType as TrailDifficulty] || '#000';
    }
    return '#374151';
  };

  const getFacilityDash = (f: Facility) => {
    if (f.type === FacilityType.TRAIL) {
      if (f.subType === TrailDifficulty.MAGIC_CARPET) return "4,4";
      return "";
    }
    return "";
  };

  const getSkierColor = (level: SkierLevel) => COLORS[level] || '#000';

  const getPointOnLine = (p1: Point, p2: Point, t: number) => {
    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t
    };
  };

  const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const scaleBy = 1.1;
      const factor = e.deltaY < 0 ? scaleBy : 1 / scaleBy;
      const newZoom = Math.min(Math.max(zoom * factor, 0.5), 5); // Limit zoom 0.5x to 5x
      
      // Zoom towards mouse pointer logic
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const newViewX = viewX + mouseX / zoom - mouseX / newZoom;
      const newViewY = viewY + mouseY / zoom - mouseY / newZoom;

      onViewChange(newViewX, newViewY, newZoom);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Always track start position on left click to differentiate click vs drag
    if (e.button === 0) {
        dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    // Pan Logic
    if (dragStartRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        
        // Threshold for "drag" vs "click" (5 pixels)
        if (!isPanning && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
            setIsPanning(true);
        }

        if (isPanning) {
            onViewChange(viewX - dx / zoom, viewY - dy / zoom, zoom);
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            return; // Skip hover logic while panning
        }
    }
    
    // Hover Logic
    let finalX = (rawX / zoom + viewX) / GRID_SIZE;
    let finalY = (rawY / zoom + viewY) / GRID_SIZE;

    let snapped = false;
    // Snapping logic for connecting new trails
    if (buildingMode && !isPanning && !isDrawing) {
       let bestDist = 1.0; 
       
       gameState.facilities.forEach(f => {
         // Snap to endpoints (stronger snap)
         const dStart = distance({x: finalX, y: finalY}, f.start);
         const dEnd = distance({x: finalX, y: finalY}, f.end);
         
         if (dStart < 0.5) {
             finalX = f.start.x; finalY = f.start.y; snapped = true; bestDist = 0;
         } else if (dEnd < 0.5) {
             finalX = f.end.x; finalY = f.end.y; snapped = true; bestDist = 0;
         }

         // Snap to line (for merging) - Only for Trails
         if (!snapped && f.type === FacilityType.TRAIL) {
           let targetX = 0, targetY = 0, targetDist = Infinity;

           // Detect if we should use linear or curved snap logic
           if (f.length < 2 || f.subType === TrailDifficulty.MAGIC_CARPET) {
              const { dist, t } = getProjectedPointOnSegment({x: finalX, y: finalY}, f.start, f.end);
              if (dist < bestDist) {
                 const p = getPointOnLine(f.start, f.end, t);
                 targetX = p.x; targetY = p.y; targetDist = dist;
              }
           } else {
              // Curved
              const { t, dist } = getNearestPointOnTrail({x: finalX, y: finalY}, f.start, f.end, f.id, f.subType as string);
              const curvePos = getPointOnTrail(f.start, f.end, t, f.id, f.subType as string);
              if (dist < bestDist) {
                 targetX = curvePos.x; targetY = curvePos.y; targetDist = dist;
              }
           }

           if (targetDist < bestDist) {
             finalX = targetX;
             finalY = targetY;
             bestDist = targetDist;
             snapped = true;
           }
         }
       });
    }

    if (!snapped) {
       finalX = Math.round(finalX);
       finalY = Math.round(finalY);
    }
    
    onMapHover({ x: finalX, y: finalY });
  };

  const handleMouseUp = () => {
      // If we were panning, stop panning.
      if (isPanning) {
          setIsPanning(false);
      } else {
          // If we were NOT panning, and we have a start ref, it's a click.
          if (dragStartRef.current && hoverPoint) {
              onMapClick(hoverPoint);
          }
      }
      dragStartRef.current = null;
  };

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full bg-slate-100 overflow-hidden cursor-crosshair relative"
    >
      <svg 
        ref={svgRef}
        width="100%" 
        height="100%"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
      >
        <defs>
          <g id="tree-vivid">
             {/* Trunk */}
             <rect x="-2" y="2" width="4" height="6" fill="#5D4037" />
             {/* Foliage - Bottom Tier */}
             <path d="M -10 4 L 10 4 L 0 -8 Z" fill="#14532d" />
             {/* Foliage - Mid Tier */}
             <path d="M -8 -4 L 8 -4 L 0 -14 Z" fill="#15803d" />
             {/* Foliage - Top Tier */}
             <path d="M -6 -10 L 6 -10 L 0 -18 Z" fill="#16a34a" />
          </g>
        </defs>

        <g transform={`scale(${zoom}) translate(${-viewX}, ${-viewY})`}>
          
          {/* AI Background Image */}
          {backgroundImage && (
            <image 
               href={backgroundImage} 
               x={0} 
               y={0} 
               width={config.gridWidth * GRID_SIZE} 
               height={config.gridHeight * GRID_SIZE} 
               preserveAspectRatio="none"
               opacity={0.9}
            />
          )}

          {/* Grid (More subtle if image is present) */}
          <g opacity={backgroundImage ? 0.05 : 0.1}>
             {Array.from({ length: config.gridWidth }).map((_, i) => (
               <line key={`v-${i}`} x1={i * GRID_SIZE} y1={0} x2={i * GRID_SIZE} y2={config.gridHeight * GRID_SIZE} stroke="black" strokeWidth={1} />
             ))}
             {Array.from({ length: config.gridHeight }).map((_, i) => (
               <line key={`h-${i}`} x1={0} y1={i * GRID_SIZE} x2={config.gridWidth * GRID_SIZE} y2={i * GRID_SIZE} stroke="black" strokeWidth={1} />
             ))}
          </g>

          {/* Mountains (Logical Boundary Visualization) */}
          {config.mountains.map((poly, i) => (
            <polygon 
              key={`mtn-${i}`} 
              points={poly.map(p => `${p.x * GRID_SIZE},${p.y * GRID_SIZE}`).join(' ')} 
              fill={backgroundImage ? "none" : "#cbd5e1"} 
              stroke={backgroundImage ? "rgba(255, 255, 255, 0.4)" : "none"}
              strokeWidth={backgroundImage ? 2 : 0}
              strokeDasharray={backgroundImage ? "10,10" : ""}
              opacity={backgroundImage ? 0.5 : 0.6}
            />
          ))}

          {/* DRAWING MODE VISUALIZATION */}
          {isDrawing && drawingPoints && (
            <g>
               {/* Points */}
               {drawingPoints.map((p, i) => (
                 <circle key={i} cx={p.x * GRID_SIZE} cy={p.y * GRID_SIZE} r={4} fill="#2563eb" />
               ))}
               {/* Lines connecting */}
               {drawingPoints.length > 1 && (
                 <polyline 
                   points={drawingPoints.map(p => `${p.x * GRID_SIZE},${p.y * GRID_SIZE}`).join(' ')}
                   fill="rgba(37, 99, 235, 0.2)"
                   stroke="#2563eb"
                   strokeWidth={2}
                   strokeDasharray="5,5"
                 />
               )}
               {/* Line to mouse cursor (preview) */}
               {drawingPoints.length > 0 && hoverPoint && (
                 <line 
                   x1={drawingPoints[drawingPoints.length - 1].x * GRID_SIZE}
                   y1={drawingPoints[drawingPoints.length - 1].y * GRID_SIZE}
                   x2={hoverPoint.x * GRID_SIZE}
                   y2={hoverPoint.y * GRID_SIZE}
                   stroke="#2563eb"
                   strokeWidth={2}
                   strokeDasharray="5,5"
                   opacity={0.5}
                 />
               )}
            </g>
          )}

          {/* Layer 0.5: Trees - using the Vivid Tree Definition */}
          {gameState.trees.map((t, i) => (
             <use 
               key={`tree-${i}`}
               href="#tree-vivid"
               x={t.x * GRID_SIZE}
               y={t.y * GRID_SIZE}
               // Slight random scale/rotation could be added here via transform if desired, 
               // but simpler to just place for perf.
               opacity={0.95}
             />
          ))}

          {/* LAYER 2: Facilities */}
          {gameState.facilities.map(f => {
            const isLift = f.type === FacilityType.LIFT || f.type === FacilityType.GONDOLA;
            const isGondola = f.type === FacilityType.GONDOLA;
            const isMagicCarpet = f.subType === LiftType.MAGIC_CARPET;
            
            // Trail
            if (!isLift) {
               let midPoint = {x:0, y:0};
               let pathD = "";
               let angle = 0;
               
               if (f.length < 2 || f.subType === TrailDifficulty.MAGIC_CARPET) {
                  pathD = `M ${f.start.x * GRID_SIZE} ${f.start.y * GRID_SIZE} L ${f.end.x * GRID_SIZE} ${f.end.y * GRID_SIZE}`;
                  midPoint = getPointOnLine(f.start, f.end, 0.5);
                  angle = Math.atan2(f.end.y - f.start.y, f.end.x - f.start.x) * 180 / Math.PI;
               } else {
                  pathD = getTrailPathD(f.start, f.end, f.id, f.subType as string, GRID_SIZE);
                  midPoint = getPointOnTrail(f.start, f.end, 0.5, f.id, f.subType as string);
                  // Calc angle
                  const nextP = getPointOnTrail(f.start, f.end, 0.51, f.id, f.subType as string);
                  angle = Math.atan2(nextP.y - midPoint.y, nextP.x - midPoint.x) * 180 / Math.PI;
               }

               const isBlack = f.subType === TrailDifficulty.BLACK;
               const isDouble = f.subType === TrailDifficulty.DOUBLE_DIAMOND;

               return (
                 <g key={f.id}>
                   <path 
                     d={pathD} 
                     stroke={getFacilityColor(f)}
                     strokeWidth={6}
                     strokeLinecap="round"
                     fill="none"
                     strokeDasharray={getFacilityDash(f)}
                     opacity={0.9}
                   />
                   {/* Arrow */}
                   <path 
                     d={`M 0 0 L -4 -4 L 4 0 L -4 4 z`} 
                     fill="rgba(0,0,0,0.3)" 
                     transform={`translate(${midPoint.x * GRID_SIZE}, ${midPoint.y * GRID_SIZE}) rotate(${angle}) translate(0, 0)`} 
                   /> 

                   {/* Difficulty Indicators on line */}
                   {(isBlack || isDouble) && (
                     <g transform={`translate(${midPoint.x * GRID_SIZE}, ${midPoint.y * GRID_SIZE}) rotate(${angle})`}>
                       {isDouble ? (
                         <>
                           <rect x={-8} y={-4} width={8} height={8} fill="black" transform="rotate(45, -4, 0)" />
                           <rect x={0} y={-4} width={8} height={8} fill="black" transform="rotate(45, 4, 0)" />
                         </>
                       ) : (
                           <rect x={-4} y={-4} width={8} height={8} fill="black" transform="rotate(45)" />
                       )}
                     </g>
                   )}
                 </g>
               );
            }

            // Lift System
            const numSeats = getLiftNumChairs(f.length);
            const speed = (isGondola ? GONDOLA_SPEED : LIFT_SPEED) / f.length;
            const baseProgress = (gameState.time * speed) % 1;
            const chairWidth = LIFT_WIDTHS[f.subType as LiftType] || 12;
            
            // Magic Carpet Rendering (Conveyor Belt)
            if (isMagicCarpet) {
              return (
                <g key={f.id}>
                  {/* Base Belt */}
                  <line 
                    x1={f.start.x * GRID_SIZE} 
                    y1={f.start.y * GRID_SIZE} 
                    x2={f.end.x * GRID_SIZE} 
                    y2={f.end.y * GRID_SIZE} 
                    stroke="#4b5563" // Dark Gray
                    strokeWidth={8}
                    strokeLinecap="round"
                  />
                  {/* Moving Treads */}
                  <line 
                    x1={f.start.x * GRID_SIZE} 
                    y1={f.start.y * GRID_SIZE} 
                    x2={f.end.x * GRID_SIZE} 
                    y2={f.end.y * GRID_SIZE} 
                    stroke="#9ca3af" // Light Gray
                    strokeWidth={4}
                    strokeDasharray="4,8"
                    strokeDashoffset={-baseProgress * 100} // Animated dash
                    strokeLinecap="butt"
                    opacity={0.8}
                  />
                  {/* Terminals (Flat) */}
                  <circle cx={f.start.x * GRID_SIZE} cy={f.start.y * GRID_SIZE} r={5} fill="#374151" />
                  <circle cx={f.end.x * GRID_SIZE} cy={f.end.y * GRID_SIZE} r={5} fill="#374151" />
                </g>
              );
            }

            // Standard Chairlift / Gondola Rendering
            return (
              <g key={f.id}>
                {/* Cable */}
                <line 
                  x1={f.start.x * GRID_SIZE} 
                  y1={f.start.y * GRID_SIZE} 
                  x2={f.end.x * GRID_SIZE} 
                  y2={f.end.y * GRID_SIZE} 
                  stroke="#374151"
                  strokeWidth={2}
                />
                
                {/* Terminals */}
                <circle cx={f.start.x * GRID_SIZE} cy={f.start.y * GRID_SIZE} r={4} fill="#1f2937" />
                <circle cx={f.end.x * GRID_SIZE} cy={f.end.y * GRID_SIZE} r={4} fill="#1f2937" />

                {/* Moving Seats */}
                {Array.from({ length: numSeats }).map((_, i) => {
                  const spacing = 1 / numSeats;
                  const progress = (baseProgress + i * spacing) % 1;
                  const pos = getPointOnLine(f.start, f.end, progress);
                  
                  // Check if occupied by a skier, but logic handles skier drawing separately.
                  // This is just the empty chair structure.
                  
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
              </g>
            );
          })}

          {/* Skiers */}
          {gameState.skiers.map(skier => {
            let pos = { x: skier.x, y: skier.y };
            
            // Render Queue Logic if waiting
            if (skier.state === 'waiting' && skier.currentFacilityId) {
                const fac = gameState.facilities.find(f => f.id === skier.currentFacilityId);
                if (fac) {
                    const queueIdx = fac.queue.indexOf(skier.id);
                    if (queueIdx !== -1) {
                        // Calculate position in queue
                        const capacity = getLiftCapacity(fac.subType as string);
                        // Row based on capacity (2 or 4)
                        const rowWidth = Math.max(2, capacity); 
                        const row = Math.floor(queueIdx / rowWidth);
                        const col = queueIdx % rowWidth;

                        // Vector from End to Start (Queue builds backwards from Start)
                        // Actually, better to extend "out" from the start point perpendicular to the lift line
                        // OR straight back. Straight back is easier.
                        const dx = fac.end.x - fac.start.x;
                        const dy = fac.end.y - fac.start.y;
                        const len = Math.sqrt(dx*dx + dy*dy) || 1;
                        const nx = dx / len;
                        const ny = dy / len;
                        
                        // Perpendicular vector
                        const px = -ny;
                        const py = nx;

                        // Spacing
                        const spacingY = 0.5; // distance between rows
                        const spacingX = 0.4; // distance between columns
                        
                        // Offset: Backwards (-N) + Sideways (centered)
                        // Centered X offset
                        const xOffset = (col - (rowWidth - 1) / 2) * spacingX;
                        
                        // Place behind start point.
                        // We use -nx, -ny to go backwards from start.
                        const distBack = 1.0 + row * spacingY;

                        pos = {
                            x: fac.start.x - nx * distBack + px * xOffset,
                            y: fac.start.y - ny * distBack + py * xOffset
                        };
                    }
                }
            }
            
            // Interpolate if moving
            const f = gameState.facilities.find(fac => fac.id === skier.currentFacilityId);
            if (f && (skier.state === 'skiing' || skier.state === 'lifting')) {
               if (f.type === FacilityType.TRAIL) {
                  // Get base position on the curve
                  pos = getPointOnTrail(f.start, f.end, skier.progress, f.id, f.subType as string);
                  
                  // Slalom / Waving Effect only on trails
                  if (f.subType !== TrailDifficulty.MAGIC_CARPET && f.length >= 2) {
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

               } else {
                  // Lifts are straight
                  const basePos = getPointOnLine(f.start, f.end, skier.progress);
                  const isMagicCarpet = f.subType === LiftType.MAGIC_CARPET;

                  if (isMagicCarpet) {
                     // On Magic Carpet, stand directly on the line
                     pos = basePos;
                  } else {
                    // Calculate seat offset for Chairlifts
                    const capacity = getLiftCapacity(f.subType as string);
                    const chairWidth = LIFT_WIDTHS[f.subType as LiftType] || 12;
                    
                    // Vector perpedicular to line
                    const dx = f.end.x - f.start.x;
                    const dy = f.end.y - f.start.y;
                    const len = Math.sqrt(dx*dx + dy*dy) || 1;
                    const nx = -dy / len;
                    const ny = dx / len;

                    if (capacity > 1) {
                        const seatIdx = skier.seatIndex ?? 0;
                        const offsetFactor = (seatIdx - (capacity - 1) / 2);
                        const offsetMag = 0.3; // 0.3 grid units spacing
                        
                        pos = {
                            x: basePos.x + nx * offsetFactor * offsetMag,
                            y: basePos.y + ny * offsetFactor * offsetMag
                        };
                    } else {
                        pos = basePos;
                    }
                  }
               }
            }

            const isExpertise = skier.level === SkierLevel.EXPERTISE;
            const color = getSkierColor(skier.level);
            
            return (
              <g key={skier.id} transform={`translate(${pos.x * GRID_SIZE}, ${pos.y * GRID_SIZE})`}>
                <circle r={isExpertise ? 8 : 6} fill={color} stroke="white" strokeWidth={2} />
                <text y={3} fontSize={8} fill={skier.level === SkierLevel.BEGINNER ? 'black' : 'white'} textAnchor="middle" fontWeight="bold">
                  {skier.label}
                </text>
              </g>
            );
          })}

          {/* Interaction Visuals */}
          {dragStart && hoverPoint && (
             <line 
               x1={dragStart.x * GRID_SIZE} 
               y1={dragStart.y * GRID_SIZE} 
               x2={hoverPoint.x * GRID_SIZE} 
               y2={hoverPoint.y * GRID_SIZE} 
               stroke="black" strokeDasharray="5,5" strokeWidth={2} opacity={0.5} 
             />
          )}
          
          {hoverPoint && !isDrawing && (
            <circle cx={hoverPoint.x * GRID_SIZE} cy={hoverPoint.y * GRID_SIZE} r={4} fill="rgba(0,0,255,0.3)" />
          )}
        </g>
      </svg>
    </div>
  );
};

export default GameCanvas;