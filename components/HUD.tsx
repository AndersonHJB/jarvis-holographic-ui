import React, { useEffect, useRef, useState } from 'react';
import { Activity, Globe, Wifi, Battery, Database, ShieldCheck, Hand, Move, Cpu, Layers } from 'lucide-react';

interface HUDProps {
  currentTime: string;
  isHandDetected: boolean;
  gestureState: string; // "IDLE", "PINCH_LEFT", "PINCH_RIGHT"
  activeContinent: string;
  rightHandPos: { x: number, y: number } | null;
  isDraggingRight: boolean;
  systemFPS: number;
}

const HUD: React.FC<HUDProps> = ({ 
  currentTime, 
  isHandDetected, 
  gestureState, 
  activeContinent,
  rightHandPos,
  isDraggingRight,
  systemFPS
}) => {
  const [hexCodes, setHexCodes] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  
  // Initial Panel Position (Centered right)
  const [panelPos, setPanelPos] = useState({ x: window.innerWidth - 320, y: 150 });
  
  // Mock data generation for hex dump
  useEffect(() => {
    const interval = setInterval(() => {
      const code = `0x${Math.floor(Math.random() * 16777215).toString(16).toUpperCase().padStart(6, '0')}`;
      setHexCodes(prev => [code, ...prev].slice(0, 8));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Handle Dragging Logic
  useEffect(() => {
    if (isDraggingRight && rightHandPos) {
      // Map hand position (0-1) to screen coordinates
      const targetX = rightHandPos.x * window.innerWidth;
      const targetY = rightHandPos.y * window.innerHeight;
      
      // Smooth follow
      setPanelPos({
        x: Math.max(0, Math.min(window.innerWidth - 300, targetX - 150)), // Center the panel on hand
        y: Math.max(0, Math.min(window.innerHeight - 300, targetY - 100))
      });
    }
  }, [isDraggingRight, rightHandPos]);

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20 text-cyan-400 font-mono overflow-hidden">
      <div className="scanline" />
      
      {/* --- Top Left: System Status --- */}
      <div className="absolute top-8 left-8 flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-cyan-500/50 pb-2">
          <Activity className="w-6 h-6 animate-pulse" />
          <span className="text-xl font-bold tracking-widest glow-text">SYSTEM ONLINE</span>
        </div>
        <div className="flex flex-col text-xs space-y-1 opacity-80">
          <div className="flex justify-between w-48">
            <span>CPU LOAD</span>
            <div className="w-24 bg-cyan-900/50 h-3 border border-cyan-500/30">
              <div className="bg-cyan-400 h-full animate-[pulse_2s_infinite]" style={{ width: '45%' }}></div>
            </div>
          </div>
          <div className="flex justify-between w-48">
            <span>MEMORY</span>
            <div className="w-24 bg-cyan-900/50 h-3 border border-cyan-500/30">
              <div className="bg-cyan-400 h-full" style={{ width: '62%' }}></div>
            </div>
          </div>
          <div className="flex justify-between w-48">
            <span>NETWORK</span>
            <span className="text-cyan-200">SECURE // 540Mbps</span>
          </div>
          <div className="flex justify-between w-48">
             <span>FPS</span>
             <span className="text-white">{systemFPS}</span>
          </div>
        </div>
        
        {/* Hex Dump */}
        <div className="mt-4 font-mono text-[10px] opacity-60 flex flex-col text-cyan-600">
           {hexCodes.map((hex, i) => (
             <span key={i} style={{ opacity: 1 - i * 0.1 }}>{`>> MEM_ALLOC: ${hex}`}</span>
           ))}
        </div>
      </div>

      {/* --- Top Right: Title & Time --- */}
      <div className="absolute top-8 right-8 text-right">
        <h1 className="text-6xl font-bold tracking-tighter glow-text opacity-90">J.A.R.V.I.S</h1>
        <div className="text-2xl tracking-[0.2em] text-cyan-100">{currentTime}</div>
        <div className="flex justify-end gap-2 mt-2">
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
          <div className="w-12 h-2 bg-cyan-900 border border-cyan-500"></div>
          <div className="w-2 h-2 bg-cyan-400"></div>
        </div>
      </div>

      {/* --- Bottom Left: Hand Status --- */}
      <div className="absolute bottom-8 left-8 border-l-4 border-cyan-500 pl-4 py-2 bg-black/40 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-2">
          <Hand className={`w-5 h-5 ${isHandDetected ? 'text-cyan-400' : 'text-red-500'}`} />
          <span className="text-sm font-semibold tracking-wider">
            HAND TRACKING: {isHandDetected ? 'ACTIVE' : 'SEARCHING...'}
          </span>
        </div>
        <div className="text-xs space-y-1 text-cyan-300">
          <div>GESTURE: <span className="text-white font-bold">{gestureState}</span></div>
          <div>MODE: <span className="text-white">{isDraggingRight ? 'DRAG & DROP' : 'OBSERVATION'}</span></div>
        </div>
      </div>

      {/* --- Right: Draggable Info Panel --- */}
      <div 
        ref={panelRef}
        style={{ 
          transform: `translate(${panelPos.x}px, ${panelPos.y}px)`,
          transition: isDraggingRight ? 'none' : 'transform 0.3s ease-out'
        }}
        className={`absolute w-72 bg-black/60 backdrop-blur-md border border-cyan-500/40 p-4 rounded-br-2xl shadow-[0_0_15px_rgba(0,255,255,0.15)] 
          ${isDraggingRight ? 'border-white scale-105 shadow-[0_0_25px_rgba(0,255,255,0.4)]' : ''}
        `}
      >
        <div className="flex items-center justify-between mb-4 border-b border-cyan-500/30 pb-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            <h3 className="font-bold tracking-widest text-sm">GEO-ANALYSIS</h3>
          </div>
          {isDraggingRight && <Move className="w-4 h-4 animate-pulse text-white" />}
        </div>

        <div className="space-y-4">
          <div className="bg-cyan-900/20 p-2 border-l-2 border-cyan-500">
            <div className="text-[10px] text-cyan-400 mb-1">CURRENT FOCUS</div>
            <div className="text-lg font-bold text-white leading-tight">{activeContinent}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-black/40 p-2 border border-cyan-500/20">
              <div className="text-[10px] opacity-70">POPULATION</div>
              <div className="text-sm font-bold">{(Math.random() * 2 + 1).toFixed(2)}B</div>
            </div>
            <div className="bg-black/40 p-2 border border-cyan-500/20">
              <div className="text-[10px] opacity-70">ENERGY</div>
              <div className="text-sm font-bold">{Math.floor(Math.random() * 40 + 60)}%</div>
            </div>
          </div>

          <div className="h-24 w-full bg-black/50 border border-cyan-500/20 relative overflow-hidden flex items-end">
             {/* Fake Bar Chart */}
             {Array.from({ length: 15 }).map((_, i) => (
               <div 
                 key={i} 
                 className="flex-1 bg-cyan-500/40 mx-[1px] hover:bg-cyan-400 transition-all"
                 style={{ height: `${Math.random() * 80 + 20}%` }}
               />
             ))}
          </div>
          
          <div className="text-[10px] text-center opacity-50 pt-2 border-t border-cyan-500/10">
            DRAG WITH RIGHT HAND PINCH
          </div>
        </div>
      </div>
      
      {/* Decorative Grid Lines */}
      <div className="absolute bottom-10 right-10 w-32 h-32 border-r border-b border-cyan-500/30 rounded-br-3xl"></div>
      <div className="absolute top-1/2 left-4 w-1 h-32 bg-gradient-to-b from-transparent via-cyan-500/50 to-transparent"></div>
    </div>
  );
};

export default HUD;