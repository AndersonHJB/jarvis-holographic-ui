import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { VisionService } from './services/mediaPipe';
import HologramEarth from './components/HologramEarth';
import HUD from './components/HUD';
import { distance, mapRange, lerp } from './utils/math';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // App State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  // Interaction State
  const [handDetected, setHandDetected] = useState(false);
  const [gestureState, setGestureState] = useState("SCANNING");
  const [currentTime, setCurrentTime] = useState("");
  
  // Earth Control State
  // We use refs for some values to avoid react render loop on every frame for 3D logic
  const earthRotationRef = useRef({ x: 0, y: 0 }); 
  const [earthScale, setEarthScale] = useState(1.5);
  const [activeContinent, setActiveContinent] = useState("初始化中...");

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
              predictWebcam();
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
          ctx.strokeStyle = "#00FFFF";
          ctx.fillStyle = "#FFFFFF";

          // Process each hand
          // Note: MediaPipe multi_handedness labels 'Left'/'Right' are mirror-reversed usually in selfie mode.
          // In standard selfie mirror:
          // User's actual Left Hand appears on the Left side of screen (which MediaPipe might call Right depending on config).
          // To keep it simple: We split screen. x < 0.5 is Left Control (Earth), x > 0.5 is Right Control (Panel).
          
          let foundLeftAction = false;
          let foundRightAction = false;
          let newGesture = "IDLE";

          for (const hand of landmarks) {
            // Draw connections (simplified)
            for (let i = 0; i < hand.length; i++) {
               const x = hand[i].x * ctx.canvas.width;
               const y = hand[i].y * ctx.canvas.height;
               ctx.beginPath();
               ctx.arc(x, y, 3, 0, 2 * Math.PI);
               ctx.fill();
            }

            // Calculate Centroid
            const wrist = hand[0];
            
            // --- LOGIC DISTINCTION BASED ON SCREEN SIDE ---
            if (wrist.x < 0.5) { 
              // *** LEFT SIDE OF SCREEN -> EARTH CONTROL ***
              // Use Wrist X for Y-Rotation, Wrist Y for X-Rotation (inverted)
              // Center point is approx 0.25
              
              const targetRotX = mapRange(wrist.x, 0, 0.5, -Math.PI, Math.PI);
              const targetRotY = mapRange(wrist.y, 0, 1, -1, 1);
              
              // Smooth update ref
              earthRotationRef.current.x = targetRotX;
              earthRotationRef.current.y = targetRotY;

              // PINCH DETECTION (Thumb tip 4, Index tip 8)
              const pinchDist = distance(hand[4].x, hand[4].y, hand[8].x, hand[8].y);
              
              // Zoom Logic
              // Pinch (< 0.05) = Zoom Out (Scale Down), Open (> 0.1) = Zoom In?
              // Let's make it simpler: Map pinch distance to scale directly.
              // Min pinch ~0.02, Max pinch ~0.2
              const targetScale = mapRange(pinchDist, 0.02, 0.15, 1.0, 2.2);
              setEarthScale(prev => lerp(prev, targetScale, 0.1));
              
              foundLeftAction = true;
              if (pinchDist < 0.05) newGesture = "ZOOMING";

            } else {
              // *** RIGHT SIDE OF SCREEN -> PANEL CONTROL ***
              const pinchDist = distance(hand[4].x, hand[4].y, hand[8].x, hand[8].y);
              
              // Invert X because camera is mirrored
              const screenX = 1 - wrist.x; 
              const screenY = wrist.y;

              setRightHandPos({ x: screenX, y: screenY });

              if (pinchDist < 0.05) {
                setIsDraggingRight(true);
                newGesture = "DRAGGING";
                foundRightAction = true;
                
                // Draw feedback line
                ctx.beginPath();
                ctx.moveTo(hand[4].x * ctx.canvas.width, hand[4].y * ctx.canvas.height);
                ctx.lineTo(hand[8].x * ctx.canvas.width, hand[8].y * ctx.canvas.height);
                ctx.strokeStyle = "#FF00FF";
                ctx.stroke();
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
          setGestureState("SCANNING");
        }
      }
    }
    
    // FPS calc
    const endTime = performance.now();
    setFps(Math.round(1000 / (endTime - startTime)));

    requestRef.current = requestAnimationFrame(predictWebcam);
  }, []);


  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      {/* 1. Background Video (Darkened for HUD visibility) */}
      <video
        ref={videoRef}
        className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100 filter brightness-50 contrast-125"
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
      <div className="absolute top-0 left-0 w-full h-full z-10">
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
      {!loading && !error && (
        <HUD 
          currentTime={currentTime}
          isHandDetected={handDetected}
          gestureState={gestureState}
          activeContinent={activeContinent}
          rightHandPos={rightHandPos}
          isDraggingRight={isDraggingRight}
          systemFPS={fps}
        />
      )}

      {/* Loading Screen */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-50 text-cyan-500">
           <Loader2 className="w-16 h-16 animate-spin mb-4" />
           <h2 className="text-2xl font-bold tracking-widest animate-pulse">INITIALIZING J.A.R.V.I.S SYSTEM...</h2>
           <p className="text-sm mt-2 opacity-70">LOADING VISION MODULES</p>
        </div>
      )}

      {/* Error Screen */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50">
          <div className="border border-red-500 p-8 text-red-500 text-center rounded bg-red-950/20">
             <h2 className="text-2xl font-bold mb-2">SYSTEM FAILURE</h2>
             <p>{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;