import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, Float, PresentationControls, useTexture } from "@react-three/drei";
import { ARButton, XR, Controllers, Hands } from "@react-three/xr";
import * as THREE from "three";

// Displays the actual product image as a texture on a floating 3D plane
function ProductDisplay({ color, image }) {
  const meshRef = useRef();
  const texture = useTexture(image);

  // Gentle auto-rotation
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <group>
      {/* Main product image plane */}
      <mesh ref={meshRef} castShadow position={[0, 0, 0]}>
        <boxGeometry args={[3.2, 3.2, 0.08]} />
        <meshPhysicalMaterial
          map={texture}
          metalness={0.1}
          roughness={0.15}
          clearcoat={0.8}
          clearcoatRoughness={0.1}
          envMapIntensity={1.2}
        />
      </mesh>

      {/* Glowing accent ring behind the product */}
      <mesh position={[0, 0, -0.15]} rotation={[0, 0, 0]}>
        <torusGeometry args={[2.0, 0.04, 16, 100]} />
        <meshStandardMaterial color={color || "#6366f1"} emissive={color || "#6366f1"} emissiveIntensity={1.5} />
      </mesh>

      {/* Subtle colored backlight plane */}
      <mesh position={[0, 0, -0.5]}>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color={color || "#6366f1"} opacity={0.07} transparent />
      </mesh>
    </group>
  );
}

export default function Viewer({ color, image, name, onClose }) {
  const [arSupported, setArSupported] = useState(false);
  const [checkingAr, setCheckingAr] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.xr) {
      navigator.xr.isSessionSupported('immersive-ar')
        .then((supported) => {
          setArSupported(supported);
          setCheckingAr(false);
        })
        .catch(() => {
          setArSupported(false);
          setCheckingAr(false);
        });
    } else {
      setArSupported(false);
      setCheckingAr(false);
    }
  }, []);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(10, 14, 26, 0.95)', backdropFilter: 'blur(30px)',
      zIndex: 99999, display: 'flex', flexDirection: 'column'
    }}>

      {/* Header */}
      <div style={{ padding: '18px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <h2 style={{ color: 'white', margin: '0 0 2px 0', fontWeight: '700', fontFamily: 'sans-serif', fontSize: '1.1rem' }}>
            3D View
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', margin: 0, fontFamily: 'sans-serif', fontSize: '0.82rem' }}>
            {name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {!checkingAr && arSupported ? (
            <ARButton 
              className="ar-launch-button"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: 'white', border: 'none', padding: '10px 24px',
                borderRadius: '99px', cursor: 'pointer', fontWeight: '800',
                fontSize: '0.9rem', boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
                textTransform: 'uppercase', letterSpacing: '0.5px'
              }}
            >
              ✦ Start AR View
            </ARButton>
          ) : (
            <button
              onClick={() => alert("Chế độ AR (Augmented Reality) yêu cầu thiết bị di động hỗ trợ AR (như iOS Safari với WebXR / Android Chrome). Thiết bị hiện tại của bạn không hỗ trợ AR. Bạn vẫn có thể xoay, phóng to mô hình 3D trên màn hình này!")}
              style={{
                background: 'rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.85)', 
                border: '1px dashed rgba(255,255,255,0.25)', 
                padding: '10px 24px',
                borderRadius: '99px', 
                cursor: 'pointer', 
                fontWeight: '600',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ⚠️ AR mode unsupported
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.07)', color: 'white',
              border: '1px solid rgba(255,255,255,0.15)', padding: '10px 22px',
              borderRadius: '99px', cursor: 'pointer', fontWeight: '600',
              fontSize: '0.9rem', transition: 'all 0.2s', fontFamily: 'sans-serif'
            }}
            onMouseOver={e => e.target.style.background = 'rgba(239,68,68,0.7)'}
            onMouseOut={e => e.target.style.background = 'rgba(255,255,255,0.07)'}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Canvas shadows camera={{ position: [0, 0, 6], fov: 42 }}>
          <XR>
            <Controllers />
            <Hands />
            
            <ambientLight intensity={0.6} />
            <spotLight position={[8, 12, 8]} angle={0.25} penumbra={1} intensity={2.5} castShadow />
            <pointLight position={[-5, -5, 5]} intensity={0.8} color={color || "#6366f1"} />

            <Environment preset="studio" />

            <PresentationControls
              global
              config={{ mass: 2, tension: 400 }}
              snap={{ mass: 4, tension: 1200 }}
              rotation={[0, 0.2, 0]}
              polar={[-Math.PI / 4, Math.PI / 4]}
              azimuth={[-Math.PI / 2, Math.PI / 2]}
            >
              <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.8}>
                <ProductDisplay color={color} image={image} />
              </Float>
            </PresentationControls>

            <ContactShadows position={[0, -2.8, 0]} opacity={0.5} scale={12} blur={2} far={4} color="#000" />
            <OrbitControls enableZoom={true} enablePan={false} autoRotate={false} />
          </XR>
        </Canvas>
      </div>

      {/* Footer hint */}
      <div style={{
        position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.55)', padding: '10px 24px', borderRadius: '99px',
        color: 'rgba(255,255,255,0.7)', pointerEvents: 'none',
        border: '1px solid rgba(255,255,255,0.1)', fontWeight: '500',
        fontFamily: 'sans-serif', fontSize: '0.82rem', whiteSpace: 'nowrap'
      }}>
        Drag to rotate · Scroll to zoom
      </div>
    </div>
  );
}
