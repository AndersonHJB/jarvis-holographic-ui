
import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { VisionService } from './services/mediaPipe';
import HologramEarth from './components/HologramEarth';
import HUD from './components/HUD';
import { distance, mapRange, lerp } from './utils/math';
import { Loader2, Power } from 'lucide-react';
import { playSound, speak } from './utils/audio';
import * as THREE from 'three';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // App State
  const [hasStarted, setHasStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  // Interaction State
  const [handDetected, setHandDetected] = useState(false);
  const [gestureState, setGestureState] = useState("等待指令...");
  const [currentTime, setCurrentTime] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Earth Control State
  const earthRotationRef = useRef({ x: 0, y: 0 }); 
  // Default anchor position (Left side of screen)
  const ANCHOR_POS = { x: -2.5, y: 0 }; 
  const earthPositionRef = useRef({ x: ANCHOR_POS.x, y: ANCHOR_POS.y, z: 0 }); 
  const [earthScale, setEarthScale] = useState(1.5);
  const [activeContinent, setActiveContinent] = useState("系统初始化...");

  // Interaction Flags
  // Use ref for grabbing state inside loop to prevent closure staleness
  const isGrabbingRef = useRef(false);
  const [isGrabbingState, setIsGrabbingState] = useState(false); // For UI only

  // Panel Control State
  const [rightHandPos, setRightHandPos] = useState<{x: number, y: number} | null>(null);

  // Time updater
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize MediaPipe and Camera
  useEffect(() => {
    const init = async () => {
      try {
        await VisionService.initialize();
        
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
             video: {
               width: { ideal: 1280 },
               height: { ideal: 720 },
               facingMode: "user"
             }
          });
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.addEventListener('loadeddata', () => {
              setLoading(false);
            });
          }
        } else {
          setError("Camera access not supported.");
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to initialize vision system.");
        setLoading(false);
      }
    };
    init();
    
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Startup Sequence
  const handleStart = () => {
    playSound('boot');
    setHasStarted(true);
    
    setTimeout(() => {
      setIsSpeaking(true);
      speak("AI悦创你好，贾维斯系统已上线。");
      setTimeout(() => setIsSpeaking(false), 4000);
      
      // Start Loop
      predictWebcam();
    }, 800);
  };

  // Main Prediction Loop
  const predictWebcam = useCallback(() => {
    if (!videoRef.current || !canvas2dRef.current) return;

    const startTime = performance.now();
    const results = VisionService.detect(videoRef.current);
    
    // Draw on 2D Canvas (Skeleton)
    const ctx = canvas2dRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas2dRef.current.width, canvas2dRef.current.height);
      
      if (canvas2dRef.current.width !== videoRef.current.videoWidth) {
        canvas2dRef.current.width = videoRef.current.videoWidth;
        canvas2dRef.current.height = videoRef.current.videoHeight;
      }

      if (results && results.landmarks && results.landmarks.length > 0) {
        setHandDetected(true);
        const landmarks = results.landmarks;
        
        // --- SKELETON DRAWING ---
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0, 255, 255, 0.4)";
        ctx.fillStyle = "#FFFFFF";

        let leftHand = null;
        let rightHand = null;

        // Simple categorization: x < 0.5 is Left, x > 0.5 is Right
        // Note: Camera is mirrored visually but data might be relative.
        // Assuming user facing camera: Screen Left is User Right Hand if not mirrored.
        // But we applied CSS transform scaleX(-1).
        // Let's stick to screen zones.
        for (const hand of landmarks) {
          // Draw joints
          for (let i = 0; i < hand.length; i++) {
             const x = hand[i].x * ctx.canvas.width;
             const y = hand[i].y * ctx.canvas.height;
             ctx.beginPath();
             ctx.arc(x, y, 3, 0, 2 * Math.PI);
             ctx.fill();
          }

          const wrist = hand[0];
          // Determine handedness by screen position for simplicity in this mirrored setup
          if (wrist.x < 0.5) leftHand = hand;
          else rightHand = hand;
        }

        // --- INTERACTION LOGIC ---
        let statusText = "系统待机";
        let isGrabbingFrame = isGrabbingRef.current;

        // 1. DUAL HAND MODE (Flip Control)
        if (leftHand && rightHand) {
          statusText = "双重链接模式";
          const leftY = leftHand[0].y;
          const rightY = rightHand[0].y;
          const diffY = leftY - rightY; 

          const targetTilt = mapRange(diffY, -0.3, 0.3, -1.0, 1.0);
          earthRotationRef.current.x = lerp(earthRotationRef.current.x, targetTilt, 0.1);
        }
        
        // 2. LEFT HAND (Navigation & Physics Push/Pull - Z Axis)
        if (leftHand) {
          const wrist = leftHand[0];
          
          // Rotation (Yaw)
          const targetRotY = mapRange(wrist.x, 0, 0.5, -1.5, 1.5);
          earthRotationRef.current.y = targetRotY;

          // PUSH / PULL (Z-Depth)
          // Hand Big (Close) -> Push Away (Z decreases)
          // Hand Small (Far) -> Pull Close (Z increases)
          // Only adjust Z if NOT actively grabbing with right hand to avoid conflict, 
          // OR allow Z modulation while grabbing for full 3D control. Let's allow it.
          const handSize = distance(leftHand[0].x, leftHand[0].y, leftHand[9].x, leftHand[9].y);
          // Tuning: 0.05 (far) to 0.25 (close)
          const targetZ = mapRange(handSize, 0.05, 0.25, 3, -8); 
          earthPositionRef.current.z = lerp(earthPositionRef.current.z, targetZ, 0.05);

          if (!rightHand) statusText = "姿态控制 (推/拉)";
        }

        // 3. RIGHT HAND (Precision Zoom & GRAB MOVE)
        if (rightHand) {
          const thumb = rightHand[4];
          const index = rightHand[8];
          const pinchDist = distance(thumb.x, thumb.y, index.x, index.y);
          
          // Visual Feedback Pos
          setRightHandPos({ x: 1 - rightHand[0].x, y: rightHand[0].y });

          // --- GRAB HYSTERESIS ---
          // Enter grab at 0.05, Exit grab at 0.08 to prevent flickering
          if (isGrabbingFrame) {
             if (pinchDist > 0.08) isGrabbingFrame = false;
          } else {
             if (pinchDist < 0.05) isGrabbingFrame = true;
          }
          isGrabbingRef.current = isGrabbingFrame;

          if (isGrabbingFrame) {
             // --- GRAB & MOVE LOGIC (PRECISE MAPPING) ---
             statusText = "物体抓取中";
             
             // Unproject logic: Map 2D Hand to 3D Plane at current depth
             const cameraZ = 5; // Default camera Z in Three Fiber
             const objectZ = earthPositionRef.current.z;
             const distToCam = cameraZ - objectZ;
             
             // Vertical FOV is 45 degrees
             const vFov = (45 * Math.PI) / 180;
             // Visible height at this depth
             const visibleHeight = 2 * Math.tan(vFov / 2) * distToCam;
             // Visible width depends on aspect ratio
             const aspect = window.innerWidth / window.innerHeight;
             const visibleWidth = visibleHeight * aspect;

             // Hand Coordinates: x (0..1), y (0..1)
             // Mirror X: 1 - thumb.x
             // Center: 0.5
             
             const rawX = 1 - thumb.x;
             const rawY = thumb.y;

             // Map 0..1 to -width/2 .. width/2
             const targetX = (rawX - 0.5) * visibleWidth;
             // Map 0..1 to height/2 .. -height/2 (Y is inverted in 3D)
             const targetY = -(rawY - 0.5) * visibleHeight;

             // Direct follow (tighter lerp for "stickiness")
             earthPositionRef.current.x = lerp(earthPositionRef.current.x, targetX, 0.25);
             earthPositionRef.current.y = lerp(earthPositionRef.current.y, targetY, 0.25);

             // Draw Connection Line
             const tx = thumb.x * ctx.canvas.width;
             const ty = thumb.y * ctx.canvas.height;
             const ix = index.x * ctx.canvas.width;
             const iy = index.y * ctx.canvas.height;
             ctx.beginPath();
             ctx.moveTo(tx, ty);
             ctx.lineTo(ix, iy);
             ctx.strokeStyle = "#00FFFF";
             ctx.lineWidth = 4;
             ctx.stroke();

          } else {
             // --- SCALE LOGIC (Open Hand) ---
             // Map pinch 0.05 -> Scale 0.5
             // Map pinch 0.25 -> Scale 2.5
             const targetScale = mapRange(pinchDist, 0.08, 0.25, 0.5, 2.5);
             setEarthScale(prev => lerp(prev, targetScale, 0.1));

             // Return to Anchor Logic (Only if not grabbed)
             // When released, earth floats back to original position
             earthPositionRef.current.x = lerp(earthPositionRef.current.x, ANCHOR_POS.x, 0.08);
             earthPositionRef.current.y = lerp(earthPositionRef.current.y, ANCHOR_POS.y, 0.08);

             if (!leftHand) statusText = "精密缩放 (捏合)";
          }
        } else {
           // No right hand: Return to anchor
           earthPositionRef.current.x = lerp(earthPositionRef.current.x, ANCHOR_POS.x, 0.05);
           earthPositionRef.current.y = lerp(earthPositionRef.current.y, ANCHOR_POS.y, 0.05);
           isGrabbingRef.current = false;
        }

        // Sync Ref to State for UI (throttled/batched by React, but okay)
        if (isGrabbingState !== isGrabbingRef.current) {
           setIsGrabbingState(isGrabbingRef.current);
        }

        setGestureState(statusText);

      } else {
        setHandDetected(false);
        setGestureState("扫描中...");
        // Auto rotate/reset when idle
        earthRotationRef.current.y += 0.002; 
        earthPositionRef.current.z = lerp(earthPositionRef.current.z, 0, 0.02);
        earthPositionRef.current.x = lerp(earthPositionRef.current.x, ANCHOR_POS.x, 0.05);
        earthPositionRef.current.y = lerp(earthPositionRef.current.y, ANCHOR_POS.y, 0.05);
        isGrabbingRef.current = false;
        if(isGrabbingState) setIsGrabbingState(false);
      }
    }
    
    // FPS calc
    const endTime = performance.now();
    setFps(Math.round(1000 / (endTime - startTime)));

    requestRef.current = requestAnimationFrame(predictWebcam);
  }, [isGrabbingState]); // Depend on state only if needed, mostly using refs inside loop


  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
      {/* 1. Background Video */}
      <video
        ref={videoRef}
        className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100"
        autoPlay
        playsInline
        muted
      />

      {/* 2. Skeleton Canvas Overlay */}
      <canvas 
        ref={canvas2dRef}
        className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none opacity-60 z-10"
      />

      {/* 3. 3D Scene Layer */}
      <div className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
           <ambientLight intensity={0.5} />
           <pointLight position={[10, 10, 10]} intensity={1} color="#00ffff" />
           <Suspense fallback={null}>
              <HologramEarth 
                rotation={earthRotationRef.current} 
                position={earthPositionRef.current}
                scale={earthScale}
                onContinentChange={setActiveContinent}
              />
           </Suspense>
        </Canvas>
      </div>

      {/* 4. React HUD Overlay */}
      {hasStarted && !loading && !error && (
        <HUD 
          currentTime={currentTime}
          isHandDetected={handDetected}
          gestureState={gestureState}
          activeContinent={activeContinent}
          rightHandPos={rightHandPos}
          isDraggingRight={isGrabbingState} 
          systemFPS={fps}
          isSpeaking={isSpeaking}
        />
      )}

      {/* Start / Loading Screen */}
      {(!hasStarted || loading) && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-50 text-cyan-500 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
           <div className="relative group cursor-pointer" onClick={!loading ? handleStart : undefined}>
             <div className="absolute -inset-1 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
             
             <div className={`relative w-24 h-24 rounded-full bg-black border-2 ${loading ? 'border-cyan-800' : 'border-cyan-400'} flex items-center justify-center`}>
                {loading ? (
                   <Loader2 className="w-10 h-10 animate-spin text-cyan-600" />
                ) : (
                   <Power className="w-10 h-10 text-cyan-400 group-hover:text-white transition-colors" />
                )}
             </div>
           </div>
           
           <h2 className="text-3xl font-bold tracking-[0.3em] mt-8 animate-pulse text-center">
             {loading ? "INITIALIZING SYSTEMS" : "J.A.R.V.I.S"}
           </h2>
           <p className="text-xs mt-2 text-cyan-700 tracking-widest">
             {loading ? "LOADING NEURAL NETWORK..." : "TOUCH TO INITIALIZE PROTOCOL"}
           </p>
        </div>
      )}

      {/* Error Screen */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50">
          <div className="border border-red-500 p-8 text-red-500 text-center rounded bg-red-950/20 backdrop-blur-md">
             <h2 className="text-2xl font-bold mb-2 tracking-widest">SYSTEM FAILURE</h2>
             <p className="font-mono">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
