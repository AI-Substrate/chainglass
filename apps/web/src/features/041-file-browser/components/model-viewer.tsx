'use client';

/**
 * ModelViewer — 3D model preview (OBJ / STL / GLB / GLTF) via React Three Fiber.
 *
 * Loads the mesh from the raw-file API and renders it with orbit controls,
 * auto-fit bounds, and a ground grid. STL (and OpenSCAD output) is Z-up;
 * OBJ/GLTF are Y-up — the stage rotates accordingly.
 *
 * Heavy (three.js) — always lazy-loaded via ModelViewerLazy in the panel.
 */

import { AsciiSpinner } from '@/features/_platform/panel-layout';
import { Bounds, Center, Grid, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export type ModelKind = 'obj' | 'stl' | 'gltf';

export function modelKindFromFilename(filename: string): ModelKind | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'obj') return 'obj';
  if (ext === 'stl') return 'stl';
  if (ext === 'glb' || ext === 'gltf') return 'gltf';
  return null;
}

/** Neutral studio material — applied to OBJ/STL which carry no materials of their own. */
function neutralMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#8fa3bf',
    metalness: 0.1,
    roughness: 0.55,
  });
}

/** Parse binary/ascii STL bytes into a renderable mesh. Shared with ScadViewer. */
export function stlToObject(buffer: ArrayBuffer): THREE.Object3D {
  const geometry = new STLLoader().parse(buffer);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, neutralMaterial());
}

async function loadModel(src: string, kind: ModelKind): Promise<THREE.Object3D> {
  if (kind === 'stl') {
    const geometry = await new STLLoader().loadAsync(src);
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, neutralMaterial());
  }
  if (kind === 'obj') {
    const group = await new OBJLoader().loadAsync(src);
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.material = neutralMaterial();
    });
    return group;
  }
  // gltf/glb — keep the file's own materials. External .gltf sub-resources
  // (separate .bin/textures) don't resolve through the raw-file URL shape;
  // self-contained GLB always works.
  const gltf = await new GLTFLoader().loadAsync(src);
  return gltf.scene;
}

/**
 * Shared R3F stage — lights, auto-fit bounds, ground grid, orbit controls.
 * `zUp` rotates Z-up sources (STL / OpenSCAD) into three.js Y-up space.
 */
export function ModelStage({ object, zUp }: { object: THREE.Object3D; zUp?: boolean }) {
  return (
    <Canvas camera={{ position: [8, 6, 8], fov: 45 }} data-testid="model-canvas">
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 10, 8]} intensity={1.4} />
      <directionalLight position={[-6, -4, -8]} intensity={0.4} />
      <Bounds fit clip observe margin={1.3}>
        <Center bottom>
          <group rotation={zUp ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
            <primitive object={object} />
          </group>
        </Center>
      </Bounds>
      <Grid infiniteGrid fadeDistance={120} cellColor="#94a3b8" sectionColor="#64748b" />
      <OrbitControls makeDefault enableDamping />
    </Canvas>
  );
}

export interface ModelViewerProps {
  src: string;
  filename: string;
}

export function ModelViewer({ src, filename }: ModelViewerProps) {
  const kind = modelKindFromFilename(filename);
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind) return;
    let cancelled = false;
    setObject(null);
    setError(null);
    loadModel(src, kind).then(
      (obj) => {
        if (!cancelled) setObject(obj);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load model');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [src, kind]);

  if (!kind) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Unsupported model format: {filename}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
        <p className="text-sm">Failed to load model</p>
        <p className="text-xs font-mono">{error}</p>
      </div>
    );
  }
  if (!object) {
    return (
      <div className="flex items-center justify-center h-full">
        <AsciiSpinner active={true} />
      </div>
    );
  }
  return (
    <div className="h-full w-full min-h-0" data-testid="model-viewer">
      <ModelStage object={object} zUp={kind === 'stl'} />
    </div>
  );
}
