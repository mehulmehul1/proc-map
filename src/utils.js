// utils.js
import * as THREE from 'https://cdn.skypack.dev/three@0.137';
import { MeshPhysicalMaterial, Vector2 } from 'https://cdn.skypack.dev/three@0.137';
import { mergeBufferGeometries } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/utils/BufferGeometryUtils';

export function tileToPosition(tileX, tileY) {
  return new Vector2((tileX + (tileY % 2) * 0.5) * 1.77, tileY * 1.535);
}

// Material creation helper
export function createHexMaterial(map, envmap, normalMap) {
  const matParams = {
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

// Decorative geometry functions (if you bring them back or need similar)
export function treeGeometry(baseHeight, position) { // Renamed to avoid conflict
  const treeHeight = Math.random() * 1 + 1.25;
  const geo = new THREE.CylinderGeometry(0, 1.5, treeHeight, 3);
  geo.translate(position.x, baseHeight + treeHeight * 0 + 1, position.y);
  const geo2 = new THREE.CylinderGeometry(0, 1.15, treeHeight, 3);
  geo2.translate(position.x, baseHeight + treeHeight * 0.6 + 1, position.y);
  const geo3 = new THREE.CylinderGeometry(0, 0.8, treeHeight, 3);
  geo3.translate(position.x, baseHeight + treeHeight * 1.25 + 1, position.y);
  return mergeBufferGeometries([geo, geo2, geo3]);
}

export function stoneGeometry(baseHeight, position) { // Renamed to avoid conflict
  const px = Math.random() * 0.4;
  const pz = Math.random() * 0.4;
  const geo = new THREE.SphereGeometry(Math.random() * 0.3 + 0.1, 7, 7);
  geo.translate(position.x + px, baseHeight, position.y + pz);
  return geo;
}

// Could also include getSphereCurrentHexCoords and worldPointToHexCoords if they are general enough
// For now, let's assume they are tied more closely to interaction or map data.