import React, { useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';

interface HologramEarthProps {
  rotation: { x: number; y: number };
  scale: number;
  onContinentChange: (continent: string) => void;
}

const HologramEarth: React.FC<HologramEarthProps> = ({ rotation, scale, onContinentChange }) => {
  const earthRef = useRef<THREE.Group>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  
  // Load texture
  const earthMap = useLoader(THREE.TextureLoader, 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg');

  // Continents approximate logic based on longitude (Y rotation)
  // Earth map usually starts at Greenwich (0 deg). 
  // We need to normalize rotation to 0-360 degrees.
  const checkContinent = (rotY: number) => {
    // Normalize to 0 - 2PI
    let normalized = rotY % (Math.PI * 2);
    if (normalized < 0) normalized += Math.PI * 2;
    
    // Convert to degrees for easier mapping
    const deg = (normalized * 180) / Math.PI;

    // These are rough approximations based on standard earth texture mapping
    // Texture usually centers Africa/Europe at 0/360.
    // 0-60: Europe/Africa
    // 60-150: Asia/Australia
    // 150-250: Pacific Ocean
    // 250-320: Americas
    // 320-360: Atlantic/Africa

    if ((deg >= 0 && deg < 60) || (deg >= 330 && deg <= 360)) return "非洲 / 欧洲 (AFR/EUR)";
    if (deg >= 60 && deg < 160) return "亚洲 / 澳洲 (ASIA/AUS)";
    if (deg >= 160 && deg < 250) return "太平洋区域 (PACIFIC)";
    if (deg >= 250 && deg < 330) return "美洲 (AMERICAS)";
    return "未知区域 (UNKNOWN)";
  };

  useFrame((state, delta) => {
    if (earthRef.current) {
      // Smooth interpolation for rotation
      earthRef.current.rotation.y = THREE.MathUtils.lerp(earthRef.current.rotation.y, rotation.x * 2 + Math.PI, 0.1); 
      earthRef.current.rotation.x = THREE.MathUtils.lerp(earthRef.current.rotation.x, rotation.y * 0.5, 0.1);
      
      // Smooth interpolation for scale
      const currentScale = earthRef.current.scale.x;
      const targetScale = scale;
      const newScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.1);
      earthRef.current.scale.set(newScale, newScale, newScale);

      // Rotate atmosphere ring
      if (atmosphereRef.current) {
         atmosphereRef.current.rotation.z += delta * 0.2;
      }

      // Check continent periodically
      if (state.clock.elapsedTime % 0.5 < 0.1) {
         const continent = checkContinent(earthRef.current.rotation.y);
         onContinentChange(continent);
      }
    }
  });

  const material = useMemo(() => new THREE.MeshPhongMaterial({
    map: earthMap,
    color: new THREE.Color('#00ffff'),
    emissive: new THREE.Color('#004444'),
    specular: new THREE.Color('#00ffff'),
    shininess: 40,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    wireframe: false, // Set to true for purely wireframe look
  }), [earthMap]);

  const wireframeMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#00ffff',
    wireframe: true,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
  }), []);

  return (
    <group ref={earthRef} position={[-2, 0, 0]}> {/* Positioned to the left */}
      {/* Core Earth */}
      <mesh material={material}>
        <sphereGeometry args={[1.5, 64, 64]} />
      </mesh>
      
      {/* Outer Wireframe Sphere */}
      <mesh material={wireframeMaterial}>
        <sphereGeometry args={[1.55, 32, 32]} />
      </mesh>

      {/* Decorative Rings */}
      <mesh ref={atmosphereRef} rotation={[Math.PI / 2, 0, 0]}>
         <torusGeometry args={[2.2, 0.02, 16, 100]} />
         <meshBasicMaterial color="#00ffff" transparent opacity={0.5} blending={THREE.AdditiveBlending} />
      </mesh>
      
      {/* Floating particles/Satellites */}
      <points>
        <sphereGeometry args={[2.5, 64, 64]} />
        <pointsMaterial color="#00ffff" size={0.01} transparent opacity={0.4} blending={THREE.AdditiveBlending} />
      </points>

      {/* Label Helper (World Space UI) */}
      <Html position={[0, 2, 0]} center>
        <div className="text-[10px] text-cyan-500 tracking-widest border border-cyan-500/30 bg-black/50 px-2 py-1 backdrop-blur-sm">
          TARGET: TERRA
        </div>
      </Html>
    </group>
  );
};

export default HologramEarth;