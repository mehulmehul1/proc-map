import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HexData } from './types';

interface ModelCache {
    rocks: THREE.Group[];
    tree: THREE.Group;
    infantry: THREE.Group;
}

interface InstancedModels {
    lightForestTrees: THREE.InstancedMesh;
    denseForestTrees: THREE.InstancedMesh;
}

const TREE_BASE_SCALE = 15; // 15m target height
const ROCK_BASE_SCALE = 3; // 3m target height
const INFANTRY_BASE_SCALE = 2; // 2m target height
const HEX_RADIUS = 60; // 120m edge-to-edge = ~60m radius

async function loadModels(): Promise<ModelCache> {
    const loader = new GLTFLoader();
    const rockPromises = [
        loader.loadAsync('/assets/rock1.glb'),
        loader.loadAsync('/assets/rock2.glb'),
        loader.loadAsync('/assets/rock3.glb')
    ];
    const [rock1, rock2, rock3] = await Promise.all(rockPromises);
    const treeModel = await loader.loadAsync('/assets/tree.glb');
    const infantryModel = await loader.loadAsync('/assets/union infantry 3d.glb');

    return {
        rocks: [rock1.scene, rock2.scene, rock3.scene],
        tree: treeModel.scene,
        infantry: infantryModel.scene
    };
}

function getRandomPositionInHex(hexWorldPos: THREE.Vector2): THREE.Vector2 {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * HEX_RADIUS;
    return new THREE.Vector2(
        hexWorldPos.x + radius * Math.cos(angle),
        hexWorldPos.y + radius * Math.sin(angle)
    );
}

function createInstancedMesh(
    originalGeometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number
): THREE.InstancedMesh {
    return new THREE.InstancedMesh(
        originalGeometry,
        material,
        count
    );
}

export async function populateHexMap(
    scene: THREE.Scene,
    hexDataMap: Map<string, HexData>
): Promise<void> {
    const models = await loadModels();
    const dummy = new THREE.Object3D();
    
    // Prepare instanced meshes for trees
    const treeGeometry = models.tree.children[0].geometry;
    const treeMaterial = (models.tree.children[0] as THREE.Mesh).material;
    
    // Count forest hexes to determine instance counts
    let lightForestCount = 0;
    let denseForestCount = 0;
    
    hexDataMap.forEach(hex => {
        if (hex.materialType === 'forest-light') lightForestCount += 15;
        if (hex.materialType === 'forest-dense') denseForestCount += 30;
    });

    const instancedModels: InstancedModels = {
        lightForestTrees: createInstancedMesh(treeGeometry, treeMaterial, lightForestCount),
        denseForestTrees: createInstancedMesh(treeGeometry, treeMaterial, denseForestCount)
    };

    let lightForestIndex = 0;
    let denseForestIndex = 0;

    hexDataMap.forEach(hex => {
        const matrix = new THREE.Matrix4();
        
        switch(hex.materialType) {
            case 'hill':
            case 'hill-steep':
                // Place 3-4 rocks
                const rockCount = Math.floor(Math.random() * 2) + 3;
                for (let i = 0; i < rockCount; i++) {
                    const rockModel = models.rocks[Math.floor(Math.random() * models.rocks.length)].clone();
                    const pos = getRandomPositionInHex(hex.worldPos);
                    const scale = ROCK_BASE_SCALE * (0.9 + Math.random() * 0.2);
                    
                    rockModel.position.set(pos.x, hex.baseHeight, pos.y);
                    rockModel.rotation.y = Math.random() * Math.PI * 2;
                    rockModel.scale.setScalar(scale);
                    scene.add(rockModel);
                }
                break;

            case 'forest-light':
                // Place 10-15 trees
                const lightTreeCount = Math.floor(Math.random() * 6) + 10;
                for (let i = 0; i < lightTreeCount; i++) {
                    const pos = getRandomPositionInHex(hex.worldPos);
                    const scale = TREE_BASE_SCALE * (0.9 + Math.random() * 0.2);
                    
                    dummy.position.set(pos.x, hex.baseHeight, pos.y);
                    dummy.rotation.y = Math.random() * Math.PI * 2;
                    dummy.scale.setScalar(scale);
                    dummy.updateMatrix();
                    
                    instancedModels.lightForestTrees.setMatrixAt(lightForestIndex++, dummy.matrix);
                }
                break;

            case 'forest-dense':
                // Place 20-30 trees
                const denseTreeCount = Math.floor(Math.random() * 11) + 20;
                for (let i = 0; i < denseTreeCount; i++) {
                    const pos = getRandomPositionInHex(hex.worldPos);
                    const scale = TREE_BASE_SCALE * (0.9 + Math.random() * 0.2);
                    
                    dummy.position.set(pos.x, hex.baseHeight, pos.y);
                    dummy.rotation.y = Math.random() * Math.PI * 2;
                    dummy.scale.setScalar(scale);
                    dummy.updateMatrix();
                    
                    instancedModels.denseForestTrees.setMatrixAt(denseForestIndex++, dummy.matrix);
                }
                break;

            case 'clear':
                // Place 1-2 trees and 1 rock
                const clearTreeCount = Math.floor(Math.random() * 2) + 1;
                for (let i = 0; i < clearTreeCount; i++) {
                    const treeModel = models.tree.clone();
                    const pos = getRandomPositionInHex(hex.worldPos);
                    const scale = TREE_BASE_SCALE * (0.9 + Math.random() * 0.2);
                    
                    treeModel.position.set(pos.x, hex.baseHeight, pos.y);
                    treeModel.rotation.y = Math.random() * Math.PI * 2;
                    treeModel.scale.setScalar(scale);
                    scene.add(treeModel);
                }
                
                // Add one rock
                const rockModel = models.rocks[Math.floor(Math.random() * models.rocks.length)].clone();
                const pos = getRandomPositionInHex(hex.worldPos);
                const scale = ROCK_BASE_SCALE * (0.9 + Math.random() * 0.2);
                
                rockModel.position.set(pos.x, hex.baseHeight, pos.y);
                rockModel.rotation.y = Math.random() * Math.PI * 2;
                rockModel.scale.setScalar(scale);
                scene.add(rockModel);
                break;
        }
    });

    // Add instanced meshes to scene
    scene.add(instancedModels.lightForestTrees);
    scene.add(instancedModels.denseForestTrees);
    
    // Update instance matrices
    instancedModels.lightForestTrees.instanceMatrix.needsUpdate = true;
    instancedModels.denseForestTrees.instanceMatrix.needsUpdate = true;
}