
import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { VisionService } from './services/mediaPipe';
import HologramEarth from './components/HologramEarth';
import HUD from './components/HUD';
import { distance, mapRange, lerp } from './utils/math';
import { Loader2, Power } from 'lucide-react';
import { playSound, speak } from './utils/audio';

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
  const earthPositionRef = useRef({ x: -2, y: 0, z: 0 }); // New: Control Z depth
  const [earthScale, setEarthScale] = useState(1.5);
  const [activeContinent, setActiveContinent] = useState("系统初始化...");

  // Panel Control State
  const [rightHandPos, setRightHandPos] = useState<{x: number, y: number} | null>(null);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

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
      speak("AI悦创你好，贾维斯系统已上线。全息投影准备就绪。");
      setTimeout(() => setIsSpeaking(false), 5000);
      
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
        
        // --- SKELETON DRAWING & HUD BOX ---
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0, 255, 255, 0.4)";
        ctx.fillStyle = "#FFFFFF";

        let leftHand = null;
        let rightHand = null;

        // Categorize hands based on screen position (Mirrored: x < 0.5 is Left side of screen, actually user's Right hand usually, but let's call it Left Screen Hand)
        // We will stick to Screen Left/Right for simplicity.
        // Screen Left (x < 0.5) -> Controls Earth Rotation & Push/Pull
        // Screen Right (x > 0.5) -> Controls Zoom (Pinch) & Panel
        
        for (const hand of landmarks) {
          // Draw joints
          for (let i = 0; i < hand.length; i++) {
             const x = hand[i].x * ctx.canvas.width;
             const y = hand[i].y * ctx.canvas.height;
             ctx.beginPath();
             ctx.arc(x, y, 3, 0, 2 * Math.PI);
             ctx.fill();
          }
          // Draw connections (simple loop)
          // ... (simplified drawing for perf) ...

          const wrist = hand[0];
          if (wrist.x < 0.5) leftHand = hand;
          else rightHand = hand;
        }

        // --- INTERACTION LOGIC ---
        let statusText = "系统待机";

        // 1. DUAL HAND MODE (Flip Control)
        if (leftHand && rightHand) {
          statusText = "双重链接模式";
          // Calculate relative height diff
          const leftY = leftHand[0].y;
          const rightY = rightHand[0].y;
          const diffY = leftY - rightY; // Positive if Right is higher (smaller y)

          // Map diffY to Pitch (X-rotation)
          // If right hand is higher than left -> Tilt Up
          // If right hand is lower -> Tilt Down
          const targetTilt = mapRange(diffY, -0.3, 0.3, -1.0, 1.0);
          earthRotationRef.current.x = lerp(earthRotationRef.current.x, targetTilt, 0.1);
          
          // Still allow Push/Pull from Left hand size? Maybe disable to avoid conflict
        }
        
        // 2. LEFT HAND (Navigation & Physics Push/Pull)
        if (leftHand) {
          const wrist = leftHand[0];
          
          // Rotation (Yaw) based on X position
          const targetRotY = mapRange(wrist.x, 0, 0.5, -1.5, 1.5);
          earthRotationRef.current.y = targetRotY;

          // PUSH / PULL LOGIC (Z-Depth)
          // Measure hand size (Wrist to Middle Finger MCP)
          const handSize = distance(leftHand[0].x, leftHand[0].y, leftHand[9].x, leftHand[9].y);
          
          // Logic: 
          // Hand Big (Close to Cam, > 0.2) -> Push Away (Earth moves back, Z decreases)
          // Hand Small (Far from Cam, < 0.1) -> Pull Close (Earth moves forward, Z increases)
          
          // Normal 'rest' size approx 0.15
          // Map 0.1 (Far) -> Z = 2 (Close)
          // Map 0.3 (Close) -> Z = -5 (Far)
          const targetZ = mapRange(handSize, 0.08, 0.3, 2, -6);
          earthPositionRef.current.z = lerp(earthPositionRef.current.z, targetZ, 0.05);

          if (!rightHand) statusText = "姿态控制 (推/拉)";
        }

        // 3. RIGHT HAND (Precision Zoom & Panel)
        if (rightHand) {
          const thumb = rightHand[4];
          const index = rightHand[8];
          const pinchDist = distance(thumb.x, thumb.y, index.x, index.y);
          
          // PINCH / SPREAD LOGIC (Scale)
          // Pinch (< 0.05) -> Shrink
          // Spread (> 0.1) -> Enlarge
          // We map the distance directly to scale for analog control
          
          // Map pinch 0.02 -> Scale 0.8
          // Map pinch 0.20 -> Scale 2.5
          const targetScale = mapRange(pinchDist, 0.02, 0.25, 0.8, 2.5);
          setEarthScale(prev => lerp(prev, targetScale, 0.1));

          // Draw Pinch Line
          const tx = thumb.x * ctx.canvas.width;
          const ty = thumb.y * ctx.canvas.height;
          const ix = index.x * ctx.canvas.width;
          const iy = index.y * ctx.canvas.height;
          
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(ix, iy);
          ctx.strokeStyle = pinchDist < 0.05 ? "#FF00FF" : "#00FFFF";
          ctx.lineWidth = pinchDist < 0.05 ? 4 : 1;
          ctx.stroke();

          // Panel Drag (Legacy)
          setRightHandPos({ x: 1 - rightHand[0].x, y: rightHand[0].y });
          if (pinchDist < 0.05) {
             setIsDraggingRight(true);
             if (!isDraggingRight) playSound('blip');
          } else {
             setIsDraggingRight(false);
          }

          if (!leftHand) statusText = "精密缩放 (捏合)";
        }

        setGestureState(statusText);

      } else {
        setHandDetected(false);
        setGestureState("扫描中...");
        // Auto rotate when idle
        earthRotationRef.current.y += 0.002; 
        // Return to neutral Z
        earthPositionRef.current.z = lerp(earthPositionRef.current.z, 0, 0.02);
      }
    }
    
    // FPS calc
    const endTime = performance.now();
    setFps(Math.round(1000 / (endTime - startTime)));

    requestRef.current = requestAnimationFrame(predictWebcam);
  }, [isDraggingRight]);


  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
      {/* 1. Background Video */}
      <video
        ref={videoRef}
        className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100 filter brightness-50 contrast-125 sepia-[0.3] hue-rotate-[170deg]"
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
          isDraggingRight={isDraggingRight}
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
