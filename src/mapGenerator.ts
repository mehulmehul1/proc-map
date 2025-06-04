// mapGenerator.ts
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { tileToPosition, createHexMaterial } from './utils.ts';
import { MAX_HEIGHT } from './config.ts';

export interface HexData {
    tileX: number;
    tileY: number;
    worldPos: THREE.Vector2;
    baseHeight: number;
    materialType: string;
    perGroupInstanceId: number;
}

interface InstanceData {
    matrix: THREE.Matrix4;
    tileX: number;
    tileY: number;
    worldPos: THREE.Vector2;
    baseHeight: number;
    perGroupInstanceId: number;
}

interface HexInfo {
    i: number;
    j: number;
    position: THREE.Vector2;
    height: number;
    materialType: string;
}

interface GroupedInstanceData {
    [key: string]: InstanceData[];
}

interface LoadedMapData {
    hex_data?: Array<{
        coord: string;
        terrain: string;
        elevation: number;
    }>;
    strategic_control_zones?: {
        [zoneId: string]: {
            all_hexes?: string[];
            key_hexes?: string[];
            color_hint?: string;
        };
    };
}

interface Textures {
    [key: string]: THREE.Texture | THREE.Texture[] | undefined;
    grass: THREE.Texture[];
    grassNormal?: THREE.Texture;
}

// Hex data storage, managed within this module or passed if needed elsewhere directly
export const hexDataMap: Map<string, HexData> = new Map();
export const allHexMeshes: THREE.InstancedMesh[] = [];

// Store references to InstancedMesh objects by type
export const instancedMeshes: { [key: string]: THREE.InstancedMesh } = {};

export function createMap(
    scene: THREE.Scene,
    world: CANNON.World,
    loadedMapData: LoadedMapData,
    textures: Textures,
    envmap: THREE.Texture,
    defaultMaterial: CANNON.Material
): void {
    const allHexInfo: HexInfo[] = [];
    const groupedInstanceData: GroupedInstanceData = { stone: [], dirt: [], grass: [], sand: [], dirt2: [], water: [], grassNormal: [] };

    let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;

    if (loadedMapData?.hex_data) {
        for (const tile of loadedMapData.hex_data) {
            const coords = tile.coord.split(',');
            const tileX = parseInt(coords[0], 10);
            const tileY = parseInt(coords[1], 10);
            const position = tileToPosition(tileX, tileY);
            let materialType = tile.terrain;

            if (!groupedInstanceData[materialType]) {
                console.warn(`Material type "${materialType}" from JSON not pre-defined. Adding dynamically.`);
                groupedInstanceData[materialType] = [];
                if (!textures[materialType]) {
                    console.error(`CRITICAL---: Texture for dynamically added material type "${materialType}" is missing.`);
                    materialType = "stone";
                }
            }

            allHexInfo.push({
                i: tileX,
                j: tileY,
                position,
                height: tile.elevation,
                materialType
            });
            minI = Math.min(minI, tileX);
            maxI = Math.max(maxI, tileX);
            minJ = Math.min(minJ, tileY);
            maxJ = Math.max(maxJ, tileY);
        }
    } else {
        console.error("Failed to load hex_data or it's missing. Creating a default tile.");
        allHexInfo.push({ i: 0, j: 0, position: tileToPosition(0,0), height: 1, materialType: "grass" });
        minI = 0; maxI = 0; minJ = 0; maxJ = 0;
    }

    const heightfieldMatrix: number[][] = [];
    const paddedMinI = minI - 1;
    const paddedMaxI = maxI + 1;
    const paddedMinJ = minJ - 1;
    const paddedMaxJ = maxJ + 1;
    const numRows = paddedMaxJ - paddedMinJ + 1;
    const numCols = paddedMaxI - paddedMinI + 1;
    const veryLowHeight = -MAX_HEIGHT * 2;

    for (let r = 0; r < numRows; r++) {
        heightfieldMatrix[r] = new Array(numCols).fill(veryLowHeight);
    }

    for (const hexInfo of allHexInfo) {
        const r = hexInfo.j - paddedMinJ;
        const c = hexInfo.i - paddedMinI;
        if (r >= 0 && r < numRows && c >= 0 && c < numCols) {
            const physicsHeight = hexInfo.materialType === 'grass' ? 0 : hexInfo.height;
            heightfieldMatrix[r][c] = physicsHeight;
        }
    }

    const dummy = new THREE.Object3D();
    for (const hexInfo of allHexInfo) {
        const { i: tileX, j: tileY, position: currentPosition, height: currentHeight, materialType } = hexInfo;

        if (!groupedInstanceData[materialType]) {
            console.warn("Skipping hex due to unknown material type:", materialType, "at", tileX, tileY);
            continue;
        }

        dummy.position.set(currentPosition.x, currentHeight * 0.5, currentPosition.y);
        dummy.scale.set(1, Math.max(0.01, currentHeight), 1);
        dummy.updateMatrix();

        const perGroupInstanceId = groupedInstanceData[materialType].length;
        groupedInstanceData[materialType].push({
            matrix: dummy.matrix.clone(),
            tileX,
            tileY,
            worldPos: currentPosition.clone(),
            baseHeight: currentHeight,
            perGroupInstanceId
        });

        hexDataMap.set(`${tileX},${tileY}`, {
            tileX,
            tileY,
            worldPos: currentPosition.clone(),
            baseHeight: currentHeight,
            materialType,
            perGroupInstanceId
        });
    }

    if (heightfieldMatrix.length > 0 && heightfieldMatrix[0].length > 0 && numCols > 0 && numRows > 0) {
        const elementSizeForHeightfield = 0.5;
        const heightfieldShape = new CANNON.Heightfield(heightfieldMatrix, { elementSize: elementSizeForHeightfield });
        const hfBody = new CANNON.Body({ mass: 0, material: defaultMaterial });

        const quaternion = new CANNON.Quaternion();
        quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        hfBody.addShape(heightfieldShape, new CANNON.Vec3(), quaternion);

        const paddedMinCornerWorldPos = tileToPosition(paddedMinI, paddedMinJ);

        const hfWidth = (numCols - 1) * elementSizeForHeightfield;
        const hfDepth = (numRows - 1) * elementSizeForHeightfield;

        hfBody.position.set(
            paddedMinCornerWorldPos.x + hfWidth * 0.5,
            0,
            paddedMinCornerWorldPos.y + hfDepth * 0.5
        );
        world.addBody(hfBody);
        console.log("Heightfield added at", hfBody.position);
    }

    const baseHexGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);

    for (const type in groupedInstanceData) {
        const instances = groupedInstanceData[type];
        if (instances.length > 0) {
            let material: THREE.Material;
            if (type === "grass") {
                const grassMaterials = textures.grass.map(tex => createHexMaterial(tex, envmap, textures.grassNormal));
                material = grassMaterials[0];
            } else if (textures[type]) {
                const texture = Array.isArray(textures[type]) ? textures[type][0] : textures[type];
                material = createHexMaterial(texture, envmap);
            } else {
                console.warn(`No texture found for material type: ${type}. Skipping InstancedMesh creation.`);
                const fallbackTexture = Array.isArray(textures["sand"]) ? textures["sand"][0] : textures["sand"];
                if (fallbackTexture) {
                    material = createHexMaterial(fallbackTexture, envmap);
                } else {
                    material = new THREE.MeshStandardMaterial({ color: 0x808080 }); // Fallback gray material
                }
            }

            const instancedHexMesh = new THREE.InstancedMesh(baseHexGeo, material, instances.length);
            instancedHexMesh.castShadow = true;
            instancedHexMesh.receiveShadow = true;
            instancedHexMesh.userData.materialType = type;
            instancedHexMesh.frustumCulled = false;
            instancedMeshes[type] = instancedHexMesh;

            instances.forEach((instanceData, i) => {
                instancedHexMesh.setMatrixAt(i, instanceData.matrix);
            });
            instancedHexMesh.instanceMatrix.needsUpdate = true;

            scene.add(instancedHexMesh);
            allHexMeshes.push(instancedHexMesh);
        }
    }

    // --- Strategic Control Zones: Draw outlines and overlays ---
    // Load zones from loadedMapData if present
    const zones = loadedMapData && loadedMapData.strategic_control_zones ? loadedMapData.strategic_control_zones : {};
    // For each zone
    for (const zoneId in zones) {
        const zone = zones[zoneId];
        const color = zone.color_hint || '#FF00FF';
        // Outlines for all_hexes
        if (zone.all_hexes) {
            for (const coord of zone.all_hexes) {
                const hex = hexDataMap.get(coord);
                if (!hex) continue;
                // Draw outline
                const corners = getHexCorners(hex.worldPos, 1); // radius 1
                const points = corners.map((c: THREE.Vector2) => new THREE.Vector3(c.x, hex.baseHeight + 0.01, c.y));
                points.push(points[0].clone()); // close the loop
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = new THREE.LineBasicMaterial({ color, linewidth: 2 });
                const line = new THREE.Line(geometry, material);
                line.frustumCulled = false;
                scene.add(line);
                // Draw transparent overlay for all_hexes (less opaque than key_hexes)
                const shape = new THREE.Shape(corners.map((c: THREE.Vector2) => new THREE.Vector2(c.x, c.y)));
                const overlayGeometry = new THREE.ShapeGeometry(shape);
                const overlayMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
                const overlayMesh = new THREE.Mesh(overlayGeometry, overlayMaterial);
                overlayMesh.position.set(0, hex.baseHeight + 0.015, 0); // slightly above the hex
                overlayMesh.frustumCulled = false;
                scene.add(overlayMesh);
            }
        }
        // Filled overlay for key_hexes (more opaque)
        if (zone.key_hexes) {
            for (const coord of zone.key_hexes) {
                const hex = hexDataMap.get(coord);
                if (!hex) continue;
                const corners = getHexCorners(hex.worldPos, 1);
                const shape = new THREE.Shape(corners.map((c: THREE.Vector2) => new THREE.Vector2(c.x, c.y)));
                const geometry = new THREE.ShapeGeometry(shape);
                geometry.translate(0, 0, 0); // already in world coords
                const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(0, hex.baseHeight + 0.02, 0); // slightly above the hex
                mesh.frustumCulled = false;
                scene.add(mesh);
            }
        }
    }
}

// Returns the 6 corners of a hex centered at position (Vector2), with optional radius (default 1)
function getHexCorners(position: THREE.Vector2, radius = 1): THREE.Vector2[] {
    const corners: THREE.Vector2[] = [];
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i;
        corners.push(new THREE.Vector2(
            position.x + radius * Math.cos(angle),
            position.y + radius * Math.sin(angle)
        ));
    }
    return corners;
}