
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';

interface HologramEarthProps {
  rotation: { x: number; y: number };
  position: { x: number; y: number; z: number };
  scale: number;
  onContinentChange: (continent: string) => void;
  eliminationStage: 'idle' | 'locking' | 'exploding' | 'destroyed';
}

// Visual Shockwave Ring
const Shockwave = ({ position }: { position: THREE.Vector3 }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      const currentScale = meshRef.current.scale.x;
      // Expand rapidly
      const newScale = currentScale + delta * 15;
      meshRef.current.scale.set(newScale, newScale, newScale);
      
      // Fade out
      const material = meshRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 1.5 - newScale * 0.5);
      
      meshRef.current.lookAt(new THREE.Vector3(0,0,10)); // Always face camera generally
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <ringGeometry args={[0.05, 0.1, 64]} />
      <meshBasicMaterial color="#ffaa00" transparent opacity={1} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>
  );
};

// Visual Flash
const ExplosionFlash = ({ position }: { position: THREE.Vector3 }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.MeshBasicMaterial;
      if (material.opacity > 0) {
          material.opacity -= 0.1;
      }
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
       <sphereGeometry args={[1, 32, 32]} />
       <meshBasicMaterial color="#ffffff" transparent opacity={1} blending={THREE.AdditiveBlending} />
    </mesh>
  );
};

// Particle system for explosion
const ExplosionParticles = ({ position }: { position: THREE.Vector3 }) => {
  const count = 800; // Increased particle count
  const [positions] = useState(() => new Float32Array(count * 3));
  const [velocities] = useState(() => new Float32Array(count * 3));
  const pointsRef = useRef<THREE.Points>(null);

  useMemo(() => {
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const speed = Math.random() * 0.8 + 0.2; // Faster particles
      
      velocities[i * 3] = speed * Math.sin(phi) * Math.cos(theta);
      velocities[i * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
      velocities[i * 3 + 2] = speed * Math.cos(phi);
    }
  }, [position]);

  useFrame(() => {
    if (pointsRef.current) {
      const positionsAttr = pointsRef.current.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        positionsAttr.setXYZ(
          i,
          positionsAttr.getX(i) + velocities[i * 3],
          positionsAttr.getY(i) + velocities[i * 3 + 1],
          positionsAttr.getZ(i) + velocities[i * 3 + 2]
        );
      }
      positionsAttr.needsUpdate = true;
      (pointsRef.current.material as THREE.PointsMaterial).opacity -= 0.01;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#ff2200"
        size={0.15}
        transparent
        opacity={1}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};

// Black Crater Decal
const Crater = ({ position }: { position: THREE.Vector3 }) => {
  return (
    <mesh position={position} lookAt={() => new THREE.Vector3(0,0,0)}>
      <circleGeometry args={[0.35, 32]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.95} depthTest={false} />
    </mesh>
  );
};

const HologramEarth: React.FC<HologramEarthProps> = ({ rotation, position, scale, onContinentChange, eliminationStage }) => {
  const earthRef = useRef<THREE.Group>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  
  const earthMap = useLoader(THREE.TextureLoader, 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg');

  // Calculate Japan Coordinate (Lat 36, Lon 138)
  const japanPos = useMemo(() => {
     const radius = 1.5;
     // Adjust these angles if the texture mapping is different
     const phi = (90 - 36) * (Math.PI / 180); 
     const theta = (138 + 90) * (Math.PI / 180); 
     
     const x = -radius * Math.sin(phi) * Math.cos(theta);
     const y = radius * Math.cos(phi);
     const z = radius * Math.sin(phi) * Math.sin(theta);
     
     return new THREE.Vector3(x, y, z);
  }, []);

  const checkContinent = (rotY: number) => {
    let normalized = rotY % (Math.PI * 2);
    if (normalized < 0) normalized += Math.PI * 2;
    const deg = (normalized * 180) / Math.PI;

    if ((deg >= 0 && deg < 60) || (deg >= 330 && deg <= 360)) return "非洲 / 欧洲";
    if (deg >= 60 && deg < 160) return "亚洲 / 澳洲";
    if (deg >= 160 && deg < 250) return "太平洋区域";
    if (deg >= 250 && deg < 330) return "美洲";
    return "海洋区域";
  };

  useFrame((state, delta) => {
    if (earthRef.current) {
      const isEliminating = eliminationStage !== 'idle';

      // 1. Position Control
      // During elimination, force earth to center for dramatic effect
      if (isEliminating) {
          earthRef.current.position.lerp(new THREE.Vector3(0, -0.5, 0), 0.1);
      } else {
          earthRef.current.position.x = THREE.MathUtils.lerp(earthRef.current.position.x, position.x, 0.1);
          earthRef.current.position.y = THREE.MathUtils.lerp(earthRef.current.position.y, position.y, 0.1);
          earthRef.current.position.z = THREE.MathUtils.lerp(earthRef.current.position.z, position.z, 0.1);
      }

      // 2. Rotation Control
      earthRef.current.rotation.x = THREE.MathUtils.lerp(earthRef.current.rotation.x, rotation.x * 0.5, 0.1);
      
      if (isEliminating) {
         // Lock Japan to front
         // Target angle: -2.4 (from 138 deg) - PI/2 to align with camera Z
         // 138 deg east -> rotate Y to approx -3.98 rads
         const targetY = -4.0; 
         earthRef.current.rotation.y = THREE.MathUtils.lerp(earthRef.current.rotation.y, targetY, 0.1);
      } else {
         earthRef.current.rotation.y = THREE.MathUtils.lerp(earthRef.current.rotation.y, rotation.y + Math.PI, 0.1);
      }

      // 3. Scale Control
      const currentScale = earthRef.current.scale.x;
      // If eliminating, force a specific dramatic scale (smaller than before)
      let targetScale = scale;
      if (isEliminating) targetScale = 1.2; 
      
      const newScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.1);
      earthRef.current.scale.set(newScale, newScale, newScale);

      // Environment Animation
      if (atmosphereRef.current) atmosphereRef.current.rotation.z -= delta * 0.1;
      if (particlesRef.current) particlesRef.current.rotation.y += delta * 0.05;

      // Update UI text
      if (state.clock.elapsedTime % 0.5 < 0.1) {
         const continent = checkContinent(earthRef.current.rotation.y);
         onContinentChange(continent);
      }
    }
  });

  const material = useMemo(() => new THREE.MeshPhongMaterial({
    map: earthMap,
    color: new THREE.Color('#00ffff'),
    emissive: new THREE.Color('#002222'),
    specular: new THREE.Color('#00ffff'),
    shininess: 50,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), [earthMap]);

  const wireframeMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#00ffff',
    wireframe: true,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
  }), []);

  // Locking Target Visual
  const TargetLock = () => (
    <mesh position={japanPos} lookAt={new THREE.Vector3(0,0,10)}>
       <ringGeometry args={[0.15, 0.2, 32]} />
       <meshBasicMaterial color="red" side={THREE.DoubleSide} transparent opacity={0.8} />
       <Html center position={[0, 0.3, 0]}>
         <div className="flex flex-col items-center">
            <div className="w-32 text-center text-red-500 font-bold text-sm tracking-widest animate-pulse border-b border-red-500 pb-1" style={{ textShadow: "0 0 10px red" }}>
                TARGET DETECTED
            </div>
            <div className="text-[10px] text-red-400 mt-1">COORDS: 36°N 138°E</div>
         </div>
       </Html>
    </mesh>
  );

  return (
    <group ref={earthRef} position={[-2, 0, 0]}>
      {/* Core Earth */}
      <mesh material={material}>
        <sphereGeometry args={[1.5, 64, 64]} />
        {eliminationStage === 'locking' && <TargetLock />}
        {(eliminationStage === 'exploding' || eliminationStage === 'destroyed') && <Crater position={japanPos} />}
      </mesh>
      
      {eliminationStage === 'exploding' && (
        <>
            <ExplosionParticles position={japanPos} />
            <Shockwave position={japanPos} />
            <ExplosionFlash position={japanPos} />
        </>
      )}

      {/* Outer Wireframe Sphere */}
      <mesh material={wireframeMaterial}>
        <sphereGeometry args={[1.52, 24, 24]} />
      </mesh>

      {/* Decorative Rings */}
      <mesh ref={atmosphereRef} rotation={[Math.PI / 2, 0, 0]}>
         <torusGeometry args={[2.0, 0.01, 16, 100]} />
         <meshBasicMaterial color={eliminationStage === 'locking' ? "red" : "#00ffff"} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
      </mesh>
      
      {/* Floating particles */}
      <points ref={particlesRef}>
        <sphereGeometry args={[2.5, 64, 64]} />
        <pointsMaterial color={eliminationStage === 'exploding' ? "#ff0000" : "#00ffff"} size={0.015} transparent opacity={0.4} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
};

export default HologramEarth;
