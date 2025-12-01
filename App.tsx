
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
  const [hasStarted, setHasStarted] = useState(false); // New: User must click to start (for Audio Context)
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
      // Reset speaking state after rough duration estimate or event listener
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
      
      // Set canvas size to match video
      if (canvas2dRef.current.width !== videoRef.current.videoWidth) {
        canvas2dRef.current.width = videoRef.current.videoWidth;
        canvas2dRef.current.height = videoRef.current.videoHeight;
      }

      if (results && results.landmarks) {
        const landmarks = results.landmarks;
        
        if (landmarks.length > 0) {
          setHandDetected(true);
          
          // --- SKELETON DRAWING ---
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgba(0, 255, 255, 0.4)";
          ctx.fillStyle = "#FFFFFF";

          // Process each hand
          let foundLeftAction = false;
          let foundRightAction = false;
          let newGesture = "待机中";

          for (const hand of landmarks) {
            // Draw connections
            for (let i = 0; i < hand.length; i++) {
               const x = hand[i].x * ctx.canvas.width;
               const y = hand[i].y * ctx.canvas.height;
               ctx.beginPath();
               ctx.arc(x, y, 2, 0, 2 * Math.PI);
               ctx.fill();
            }

            // Draw Box around hand (HUD effect)
            const xs = hand.map(l => l.x * ctx.canvas.width);
            const ys = hand.map(l => l.y * ctx.canvas.height);
            const minX = Math.min(...xs) - 20;
            const maxX = Math.max(...xs) + 20;
            const minY = Math.min(...ys) - 20;
            const maxY = Math.max(...ys) + 20;
            
            ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
            ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
            // Label
            ctx.font = "10px Rajdhani";
            ctx.fillStyle = "#00FFFF";
            ctx.fillText(`TRK: ${(maxX-minX).toFixed(0)}`, minX, minY - 5);

            // Calculate Centroid
            const wrist = hand[0];
            
            // --- LOGIC DISTINCTION BASED ON SCREEN SIDE ---
            if (wrist.x < 0.55) { 
              // *** LEFT SIDE (Or Main Hand) -> EARTH CONTROL ***
              foundLeftAction = true;

              // 1. Rotation (X/Y movement)
              const targetRotX = mapRange(wrist.x, 0, 0.6, -Math.PI, Math.PI);
              const targetRotY = mapRange(wrist.y, 0, 1, -1.2, 1.2);
              
              earthRotationRef.current.x = targetRotX;
              earthRotationRef.current.y = targetRotY;

              // 2. Push/Pull Scale Logic (Z-Depth approximation)
              // Calculate Hand Size: Distance between Wrist(0) and Middle Finger MCP(9)
              // Since coordinates are normalized (0-1), this works regardless of resolution
              const handSize = distance(hand[0].x, hand[0].y, hand[9].x, hand[9].y);
              
              // Calibration: 
              // Hand Far (Small) ~= 0.05 -> Pull (Scale Up)
              // Hand Close (Big) ~= 0.25 -> Push (Scale Down / Shrink)
              
              // NOTE: User requested "Push forward (close to cam) -> Shrink"
              // Inverse mapping: Size increases -> Scale decreases
              const targetScale = mapRange(handSize, 0.05, 0.25, 2.5, 0.5); 
              
              // Clamp scale
              const clampedScale = Math.max(0.5, Math.min(3.0, targetScale));
              
              setEarthScale(prev => lerp(prev, clampedScale, 0.08));

              if (handSize > 0.15) newGesture = "推离 (缩放 -)";
              else if (handSize < 0.08) newGesture = "拉近 (缩放 +)";
              else newGesture = "旋转控制";

            } else {
              // *** RIGHT SIDE -> PANEL CONTROL ***
              const pinchDist = distance(hand[4].x, hand[4].y, hand[8].x, hand[8].y);
              
              // Invert X because camera is mirrored
              const screenX = 1 - wrist.x; 
              const screenY = wrist.y;

              setRightHandPos({ x: screenX, y: screenY });

              if (pinchDist < 0.05) {
                setIsDraggingRight(true);
                foundRightAction = true;
                
                // Draw feedback line
                ctx.beginPath();
                ctx.moveTo(hand[4].x * ctx.canvas.width, hand[4].y * ctx.canvas.height);
                ctx.lineTo(hand[8].x * ctx.canvas.width, hand[8].y * ctx.canvas.height);
                ctx.strokeStyle = "#FF00FF";
                ctx.lineWidth = 3;
                ctx.stroke();
                
                if (!isDraggingRight) playSound('blip'); // Sound on engage
              } else {
                setIsDraggingRight(false);
              }
            }
          }
          
          if (!foundRightAction) setIsDraggingRight(false);
          setGestureState(newGesture);

        } else {
          setHandDetected(false);
          setIsDraggingRight(false);
          setGestureState("扫描中...");
        }
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
