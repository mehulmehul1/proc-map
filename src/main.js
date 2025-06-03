// main.js
import * as THREE from 'https://cdn.skypack.dev/three@0.137'; // For Vector3 etc. if needed directly
import * as CANNON from 'cannon-es';
import Stats from 'stats.js';

import { TIME_STEP, MAX_HEIGHT, RANDOM_MOVEMENT_PROBABILITY, RANDOM_IMPULSE_STRENGTH } from './config.js';
import { initCore } from './setup.js';
import { loadAssets } from './assetLoader.js';
import { createMap, hexDataMap, allHexMeshes, instancedMeshes as mapInstancedMeshes } from './mapGenerator.js';
import { createSpheres } from './physicsObjects.js';
import { setupMouseControls } from './interaction.js';
import { updateHexLiftAnimation, updateSpherePathAnimation } from './animation.js';
import { worldPointToHex } from './pathfinding.js';


const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

let core, assets, allPhysicalSpheres, playerSphere;
let lastCallTime;

// Animation state needs to be managed here or in a dedicated state module
const animationState = {
    isHexLifting: false,
    liftedHexInfo: null, // { instancedMesh, instanceId, originalMatrix, liftStartTime }
    isSphereAnimating: false,
    sphereAnimationStartTime: 0,
    sphereAnimationStartPos: new CANNON.Vec3(),
    sphereAnimationTargetPos: new CANNON.Vec3(),
    currentPath: [],
    currentPathIndex: 0,
};

async function main() {
    core = initCore();
    assets = await loadAssets(core.pmrem);

    createMap(core.scene, core.world, assets.loadedMapData, assets.textures, assets.envmap, core.defaultMaterial);

    allPhysicalSpheres = createSpheres(core.scene, core.world, assets.envmap, core.defaultMaterial);
    playerSphere = allPhysicalSpheres.find(s => s.isPlayer); // Get the player sphere

    // Pass necessary state and objects to interaction setup
    setupMouseControls(core.renderer.domElement, core.camera, core.world, allHexMeshes, hexDataMap, mapInstancedMeshes, playerSphere, animationState);

    core.renderer.setAnimationLoop(animate);
}

function animate() {
    stats.begin();
    const time = performance.now() / 1000; // Current time in seconds
    const currentTimeMs = performance.now(); // Current time in milliseconds

    // Physics update
    const maxSubSteps = 10;
    if (!lastCallTime) {
        core.world.step(TIME_STEP, TIME_STEP, maxSubSteps); // Initialize with fixed step
    } else {
        const dt = time - lastCallTime;
        core.world.step(TIME_STEP, dt, maxSubSteps);
    }
    lastCallTime = time;

    // Update animations
    updateHexLiftAnimation(currentTimeMs, animationState, mapInstancedMeshes);
    if (playerSphere) { // Ensure playerSphere is defined
      updateSpherePathAnimation(core.world, animationState, playerSphere.body, hexDataMap);
    }


    // Sync visual meshes with physics bodies for all spheres
    const surfaceHeight = 0; // Define a minimum surface height if needed for clamping
    const sphereRadius = playerSphere ? playerSphere.body.shapes[0].radius : 1; // Get radius dynamically or use default

    allPhysicalSpheres.forEach(sphereObj => {
        sphereObj.mesh.position.copy(sphereObj.body.position);
        sphereObj.mesh.quaternion.copy(sphereObj.body.quaternion);

        // Visual clamping for player and additional spheres
        const currentHex = worldPointToHex(sphereObj.body.position, hexDataMap);
        let floorY = surfaceHeight; // Default floor
        if (currentHex) {
            floorY = currentHex.baseHeight; // Height of the hex's surface
        }
        
        // Ensure visual mesh y is at least radius above its hex or surfaceHeight
        const visualYMinimum = floorY + sphereRadius;
        if (sphereObj.mesh.position.y < visualYMinimum && !animationState.isSphereAnimating) { // Don't clamp during path animation
             // sphereObj.mesh.position.y = visualYMinimum; //This was causing visual jitter for falling spheres.
                                                    // Physics should handle collision and visual just follows.
                                                    // Clamping for purely visual elements might be ok.
        }


        // Random movement for non-player spheres
        if (!sphereObj.isPlayer) {
            if (Math.random() < RANDOM_MOVEMENT_PROBABILITY && sphereObj.body.sleepState !== CANNON.Body.SLEEPING) {
                const impulse = new CANNON.Vec3(
                    (Math.random() - 0.5) * 2 * RANDOM_IMPULSE_STRENGTH,
                    Math.random() * RANDOM_IMPULSE_STRENGTH * 0.2,
                    (Math.random() - 0.5) * 2 * RANDOM_IMPULSE_STRENGTH
                );
                sphereObj.body.applyImpulse(impulse, sphereObj.body.position);
                if (sphereObj.body.sleepState === CANNON.Body.SLEEPING) {
                    sphereObj.body.wakeUp();
                }
            }
        }
    });


    core.controls.update();
    core.renderer.render(core.scene, core.camera);
    stats.end();
}

main().catch(console.error);