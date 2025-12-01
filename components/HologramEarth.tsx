
import React, { useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';

interface HologramEarthProps {
  rotation: { x: number; y: number };
  position: { x: number; y: number; z: number };
  scale: number;
  onContinentChange: (continent: string) => void;
}

const HologramEarth: React.FC<HologramEarthProps> = ({ rotation, position, scale, onContinentChange }) => {
  const earthRef = useRef<THREE.Group>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  
  // Load texture
  const earthMap = useLoader(THREE.TextureLoader, 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg');

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
      // Rotation lerp
      // We add Math.PI to rotation.x (yaw) to align textures initially if needed
      // rotation.x from props is mostly used as Tilt (pitch) in Threejs
      // Let's interpret rotation prop: x -> pitch (X axis), y -> yaw (Y axis)
      earthRef.current.rotation.x = THREE.MathUtils.lerp(earthRef.current.rotation.x, rotation.x * 0.5, 0.1);
      earthRef.current.rotation.y = THREE.MathUtils.lerp(earthRef.current.rotation.y, rotation.y + Math.PI, 0.1);
      
      // Position lerp (Smooth Z-depth transition)
      earthRef.current.position.x = THREE.MathUtils.lerp(earthRef.current.position.x, position.x, 0.1);
      earthRef.current.position.y = THREE.MathUtils.lerp(earthRef.current.position.y, position.y, 0.1);
      earthRef.current.position.z = THREE.MathUtils.lerp(earthRef.current.position.z, position.z, 0.1);

      // Scale lerp
      const currentScale = earthRef.current.scale.x;
      const targetScale = scale;
      const newScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.15);
      earthRef.current.scale.set(newScale, newScale, newScale);

      // Animation
      if (atmosphereRef.current) {
         atmosphereRef.current.rotation.z -= delta * 0.1;
      }
      
      if (particlesRef.current) {
        particlesRef.current.rotation.y += delta * 0.05;
      }

      // Check continent
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

  return (
    <group ref={earthRef} position={[-2, 0, 0]}>
      {/* Core Earth */}
      <mesh material={material}>
        <sphereGeometry args={[1.5, 64, 64]} />
      </mesh>
      
      {/* Outer Wireframe Sphere (Techno feel) */}
      <mesh material={wireframeMaterial}>
        <sphereGeometry args={[1.52, 24, 24]} />
      </mesh>

      {/* Decorative Rings */}
      <mesh ref={atmosphereRef} rotation={[Math.PI / 2, 0, 0]}>
         <torusGeometry args={[2.0, 0.01, 16, 100]} />
         <meshBasicMaterial color="#00ffff" transparent opacity={0.6} blending={THREE.AdditiveBlending} />
      </mesh>
      
      <mesh rotation={[Math.PI / 1.8, 0, 0]}>
         <torusGeometry args={[1.8, 0.01, 16, 100]} />
         <meshBasicMaterial color="#00ffff" transparent opacity={0.3} blending={THREE.AdditiveBlending} />
      </mesh>
      
      {/* Floating particles/Satellites */}
      <points ref={particlesRef}>
        <sphereGeometry args={[2.5, 64, 64]} />
        <pointsMaterial color="#00ffff" size={0.015} transparent opacity={0.4} blending={THREE.AdditiveBlending} />
      </points>

      {/* Label Helper */}
      <Html position={[0, 2.2, 0]} center distanceFactor={10}>
        <div className="flex flex-col items-center pointer-events-none select-none">
           <div className="text-[8px] text-cyan-500 tracking-[0.3em] uppercase mb-1">Target</div>
           <div className="w-px h-8 bg-cyan-500/50"></div>
        </div>
      </Html>
    </group>
  );
};

export default HologramEarth;
