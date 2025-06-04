import * as THREE from 'three';
import { MeshPhysicalMaterial, Vector2, CylinderGeometry, SphereGeometry, BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SIZE = 1.0; // Size of the hexagon (distance from center to corner)
const WIDTH = SIZE * Math.sqrt(3);
const HEIGHT = SIZE * 2;

// Cube coordinates to pixel position
export function cubeToPosition(q: number, r: number): Vector2 {
  const x = WIDTH * (q + r/2);
  const y = HEIGHT * (3/4) * r;
  return new Vector2(x, y);
}

// Pixel position to nearest cube coordinates
export function positionToCube(x: number, y: number): { q: number; r: number; s: number } {
  // Convert from pixel coordinates to axial coordinates
  const r = (2/3) * y / SIZE;
  const q = (x * Math.sqrt(3)/3 - y/3) / SIZE;
  const s = -q - r;  // s coordinate to satisfy q + r + s = 0
  
  // Round to nearest hex
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  
  const q_diff = Math.abs(rq - q);
  const r_diff = Math.abs(rr - r);
  const s_diff = Math.abs(rs - s);
  
  if (q_diff > r_diff && q_diff > s_diff) {
    rq = -rr - rs;
  } else if (r_diff > s_diff) {
    rr = -rq - rs;
  } else {
    rs = -rq - rr;
  }
  
  return { q: rq, r: rr, s: rs };
}

interface MaterialParams {
  envMap: THREE.Texture;
  envMapIntensity: number;
  flatShading: boolean;
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  normalScale?: THREE.Vector2;
}

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