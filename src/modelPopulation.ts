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

// Scaled up by 4x
const TREE_BASE_SCALE = 60; // 60m target height (4 * 15)
const ROCK_BASE_SCALE = 12;  // 12m target height (4 * 3)
const INFANTRY_BASE_SCALE = 8; // 8m target height (4 * 2)
const HEX_RADIUS = 240; // 480m edge-to-edge = ~240m radius (4 * 60)
const ROAD_CLEARANCE = 12; // 12m clearance from roads (4 * 3)

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

function getRandomPositionInHex(hexWorldPos: THREE.Vector2, avoidRoads: boolean = false): THREE.Vector2 {
    let position: THREE.Vector2;
    let attempts = 0;
    const maxAttempts = 10;

    do {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * HEX_RADIUS;
        position = new THREE.Vector2(
            hexWorldPos.x + radius * Math.cos(angle),
            hexWorldPos.y + radius * Math.sin(angle)
        );
        attempts++;
        
        if (!avoidRoads || attempts >= maxAttempts) break;
        
    } while (true);

    return position;
}

function createInstancedMesh(
    originalGeometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    count: number
): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(originalGeometry, material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function placeRocks(
    scene: THREE.Scene,
    hex: HexData,
    models: ModelCache,
    count: number
): void {
    for (let i = 0; i < count; i++) {
        const rockModel = models.rocks[Math.floor(Math.random() * models.rocks.length)].clone();
        const pos = getRandomPositionInHex(hex.worldPos, true);
        const scale = ROCK_BASE_SCALE * (0.9 + Math.random() * 0.2);
        
        rockModel.position.set(pos.x, hex.baseHeight * 4, pos.y); // Scale height by 4x
        rockModel.rotation.y = Math.random() * Math.PI * 2;
        rockModel.scale.setScalar(scale);
        rockModel.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(rockModel);
    }
}

function placeTrees(
    dummy: THREE.Object3D,
    hex: HexData,
    instancedMesh: THREE.InstancedMesh,
    startIndex: number,
    count: number
): number {
    for (let i = 0; i < count; i++) {
        const pos = getRandomPositionInHex(hex.worldPos, true);
        const scale = TREE_BASE_SCALE * (0.9 + Math.random() * 0.2);
        
        dummy.position.set(pos.x, hex.baseHeight * 4, pos.y); // Scale height by 4x
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        
        instancedMesh.setMatrixAt(startIndex + i, dummy.matrix);
    }
    return startIndex + count;
}

function findFirstMesh(object: THREE.Object3D): THREE.Mesh | null {
    let firstMesh: THREE.Mesh | null = null;
    object.traverse((child) => {
        if (!firstMesh && child instanceof THREE.Mesh) {
            firstMesh = child;
        }
    });
    return firstMesh;
}

export async function populateHexMap(
    scene: THREE.Scene,
    hexDataMap: Map<string, HexData>
): Promise<void> {
    const models = await loadModels();
    const dummy = new THREE.Object3D();
    
    const treeMesh = findFirstMesh(models.tree);
    if (!treeMesh) {
        console.error('No mesh found in tree model');
        return;
    }
    
    const treeGeometry = treeMesh.geometry.clone();
    const treeMaterial = treeMesh.material;
    
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
        switch(hex.materialType) {
            case 'hill':
            case 'hill-steep':
                placeRocks(scene, hex, models, Math.floor(Math.random() * 2) + 3);
                break;

            case 'forest-light':
                lightForestIndex = placeTrees(
                    dummy,
                    hex,
                    instancedModels.lightForestTrees,
                    lightForestIndex,
                    Math.floor(Math.random() * 6) + 10
                );
                break;

            case 'forest-dense':
                denseForestIndex = placeTrees(
                    dummy,
                    hex,
                    instancedModels.denseForestTrees,
                    denseForestIndex,
                    Math.floor(Math.random() * 11) + 20
                );
                break;

            case 'clear':
                const clearTreeCount = Math.floor(Math.random() * 2) + 1;
                for (let i = 0; i < clearTreeCount; i++) {
                    const treeModel = models.tree.clone();
                    const pos = getRandomPositionInHex(hex.worldPos, true);
                    const scale = TREE_BASE_SCALE * (0.9 + Math.random() * 0.2);
                    
                    treeModel.position.set(pos.x, hex.baseHeight * 4, pos.y); // Scale height by 4x
                    treeModel.rotation.y = Math.random() * Math.PI * 2;
                    treeModel.scale.setScalar(scale);
                    treeModel.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    scene.add(treeModel);
                }
                
                placeRocks(scene, hex, models, 1);
                break;
        }
    });

    scene.add(instancedModels.lightForestTrees);
    scene.add(instancedModels.denseForestTrees);
    
    instancedModels.lightForestTrees.instanceMatrix.needsUpdate = true;
    instancedModels.denseForestTrees.instanceMatrix.needsUpdate = true;
}