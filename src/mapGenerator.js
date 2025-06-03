// mapGenerator.js
import * as THREE from 'https://cdn.skypack.dev/three@0.137';
import * as CANNON from 'cannon-es';
import { tileToPosition, createHexMaterial } from './utils.js';
import { MAX_HEIGHT } from './config.js'; // If needed for default heights

// Hex data storage, managed within this module or passed if needed elsewhere directly
export const hexDataMap = new Map(); // 'x,y' => { mesh->instanceId, tileX, tileY, worldPos, baseHeight, materialType, perGroupInstanceId }
export const allHexMeshes = []; // To store InstancedMesh objects for raycasting

// Store references to InstancedMesh objects by type
export const instancedMeshes = {};

export function createMap(scene, world, loadedMapData, textures, envmap, defaultMaterial) {
    const allHexInfo = [];
    const groupedInstanceData = { stone: [], dirt: [], grass: [], sand: [], dirt2: [] }; // Initialize with known types

    let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;

    if (loadedMapData && loadedMapData.hex_data) {
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
                    console.error(`CRITICAL: Texture for dynamically added material type "${materialType}" is missing.`);
                    // Potentially default to a known type or skip
                    // materialType = "grass"; // Example fallback
                }
            }

            allHexInfo.push({
                i: tileX, j: tileY, position,
                height: tile.elevation,
                materialType: materialType
            });
            minI = Math.min(minI, tileX); maxI = Math.max(maxI, tileX);
            minJ = Math.min(minJ, tileY); maxJ = Math.max(maxJ, tileY);
        }
    } else {
        console.error("Failed to load hex_data or it's missing. Creating a default tile.");
        allHexInfo.push({ i: 0, j: 0, position: tileToPosition(0,0), height: 1, materialType: "grass" });
        minI = 0; maxI = 0; minJ = 0; maxJ = 0;
    }
    
    const heightfieldMatrix = [];
    const paddedMinI = minI - 1; const paddedMaxI = maxI + 1;
    const paddedMinJ = minJ - 1; const paddedMaxJ = maxJ + 1;
    const numRows = paddedMaxJ - paddedMinJ + 1;
    const numCols = paddedMaxI - paddedMinI + 1;
    const veryLowHeight = -MAX_HEIGHT * 2; // Or a more suitable low value

    for (let r = 0; r < numRows; r++) {
        heightfieldMatrix[r] = new Array(numCols).fill(veryLowHeight);
    }

    for (const hexInfo of allHexInfo) {
        const r = hexInfo.j - paddedMinJ;
        const c = hexInfo.i - paddedMinI;
        if (r >= 0 && r < numRows && c >= 0 && c < numCols) {
            const physicsHeight = hexInfo.materialType === 'grass' ? 0 : hexInfo.height; // Example: grass flat for physics
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
        dummy.scale.set(1, Math.max(0.01, currentHeight), 1); // Ensure scale Y is not zero
        dummy.updateMatrix();

        const perGroupInstanceId = groupedInstanceData[materialType].length;
        groupedInstanceData[materialType].push({
            matrix: dummy.matrix.clone(),
            tileX, tileY,
            worldPos: currentPosition.clone(), // THREE.Vector2
            baseHeight: currentHeight,
            perGroupInstanceId
        });

        hexDataMap.set(`${tileX},${tileY}`, {
            tileX, tileY,
            worldPos: currentPosition.clone(), // THREE.Vector2
            baseHeight: currentHeight,
            materialType,
            perGroupInstanceId
        });
    }

    if (heightfieldMatrix.length > 0 && heightfieldMatrix[0].length > 0 && numCols > 0 && numRows > 0) {
        const elementSizeForHeightfield = 0.5; // This needs to match how tileToPosition output relates to matrix indices
        const heightfieldShape = new CANNON.Heightfield(heightfieldMatrix, { elementSize: elementSizeForHeightfield });
        const hfBody = new CANNON.Body({ mass: 0, material: defaultMaterial });
        
        const quaternion = new CANNON.Quaternion();
        quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to be flat
        hfBody.addShape(heightfieldShape, new CANNON.Vec3(), quaternion);

        const paddedMinCornerWorldPos = tileToPosition(paddedMinI, paddedMinJ); // tileToPosition returns Vector2 (x,y for world x,z)

        // Adjust position to align heightfield with visual hexes
        // The Heightfield shape is centered on its local origin by default.
        // Its first point (matrix[0][0]) is at (-width/2, -depth/2) relative to its body position.
        const hfWidth = (numCols -1) * elementSizeForHeightfield;
        const hfDepth = (numRows -1) * elementSizeForHeightfield;

        hfBody.position.set(
            paddedMinCornerWorldPos.x + hfWidth * 0.5, // Center X
            0,                                          // Set Y level for the heightfield. Max height values are relative to this.
            paddedMinCornerWorldPos.y + hfDepth * 0.5   // Center Z (worldPos.y is map Z)
        );
        world.addBody(hfBody);
        console.log("Heightfield added at", hfBody.position);
    }

    const baseHexGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false); // Unit height

    for (const type in groupedInstanceData) {
        const instances = groupedInstanceData[type];
        if (instances.length > 0) {
            let material;
            if (type === "grass") {
                const grassMaterials = textures.grass.map(tex => createHexMaterial(tex, envmap, textures.grassNormal));
                // For simplicity, we'll assign one material to the InstancedMesh
                // and then would need a more complex system if we wanted per-instance material variation within a single InstancedMesh.
                // The current code sets instancedHexMesh.material directly in a loop, effectively using only the last one.
                // A better way for multiple materials on one InstancedMesh is using materialIndex attribute if supported or multiple InstancedMeshes.
                // For now, let's pick one grass material for the InstancedMesh or create separate InstancedMeshes for each grass type.
                // To match original behavior of random assignment (though not truly instanced that way):
                // We'll create one instanced mesh but acknowledge this part of original code was a bit off for instancing.
                // A common approach for variation is vertex colors or a texture atlas.
                // Given the original code, it seems it was trying to assign material per instance which isn't standard for InstancedMesh.
                // Let's use the first grass texture.
                material = grassMaterials[0];
                // If you truly need different materials for different grass instances,
                // you might need to make 'grass1', 'grass2' distinct types in groupedInstanceData
                // or use a shader that can select textures.
            } else if (textures[type]) {
                 material = createHexMaterial(textures[type], envmap);
            } else {
                console.warn(`No texture found for material type: ${type}. Skipping InstancedMesh creation.`);
                continue;
            }

            const instancedHexMesh = new THREE.InstancedMesh(baseHexGeo, material, instances.length);
            instancedHexMesh.castShadow = true;
            instancedHexMesh.receiveShadow = true;
            instancedHexMesh.userData.materialType = type; // For raycasting identification
            instancedMeshes[type] = instancedHexMesh;

            instances.forEach((instanceData, i) => {
                instancedHexMesh.setMatrixAt(i, instanceData.matrix);
                 // If type is grass and you want to randomize, this is where you'd store an attribute for shader
                // e.g., instancedHexMesh.setColorAt(i, new THREE.Color(Math.random(), 1, 1)); // Example
            });
            instancedHexMesh.instanceMatrix.needsUpdate = true;
            // if (type === "grass") instancedHexMesh.instanceColor.needsUpdate = true;


            scene.add(instancedHexMesh);
            allHexMeshes.push(instancedHexMesh);
        }
    }
    // Removed seaMesh, mapContainer, mapFloor for brevity as they were commented out.
    // If you re-add them, their creation logic would go here.
}