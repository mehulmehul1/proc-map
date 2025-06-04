// utils.ts
import * as THREE from 'three';
import { MeshPhysicalMaterial, Vector2, CylinderGeometry, SphereGeometry, BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function tileToPosition(tileX: number, tileY: number): Vector2 {
  return new Vector2((tileX + (tileY % 2) * 0.5) * 1.77, tileY * 1.535);
}

interface MaterialParams {
  envMap: THREE.Texture;
  envMapIntensity: number;
  flatShading: boolean;
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  normalScale?: THREE.Vector2;
}

// Material creation helper
export function createHexMaterial(
  map: THREE.Texture, 
  envmap: THREE.Texture, 
  normalMap?: THREE.Texture
): MeshPhysicalMaterial {
  const matParams: MaterialParams = {
    envMap: envmap,
    envMapIntensity: 0.135,
    flatShading: true,
    map
  };
  if (normalMap) {
    matParams.normalMap = normalMap;
    matParams.normalScale = new THREE.Vector2(1, 1);
  }
  return new MeshPhysicalMaterial(matParams);
}

interface Position {
  x: number;
  y: number;
}

// Decorative geometry functions
export function treeGeometry(baseHeight: number, position: Position): BufferGeometry {
  const treeHeight = Math.random() * 1 + 1.25;
  const geo = new CylinderGeometry(0, 1.5, treeHeight, 3);
  geo.translate(position.x, baseHeight + treeHeight * 0 + 1, position.y);
  const geo2 = new CylinderGeometry(0, 1.15, treeHeight, 3);
  geo2.translate(position.x, baseHeight + treeHeight * 0.6 + 1, position.y);
  const geo3 = new CylinderGeometry(0, 0.8, treeHeight, 3);
  geo3.translate(position.x, baseHeight + treeHeight * 1.25 + 1, position.y);
  return mergeGeometries([geo, geo2, geo3]);
}

export function stoneGeometry(baseHeight: number, position: Position): BufferGeometry {
  const px = Math.random() * 0.4;
  const pz = Math.random() * 0.4;
  const geo = new SphereGeometry(Math.random() * 0.3 + 0.1, 7, 7);
  geo.translate(position.x + px, baseHeight, position.y + pz);
  return geo;
}