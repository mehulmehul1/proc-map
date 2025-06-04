// main.ts
import * as THREE from 'three'; // For Vector3 etc. if needed directly
import * as CANNON from 'cannon-es';
import Stats from 'stats.js';

import { TIME_STEP, RANDOM_MOVEMENT_PROBABILITY, RANDOM_IMPULSE_STRENGTH } from './config.ts';
import { initCore } from './setup.js';
import { loadAssets } from './assetLoader.ts';
import { createMap, hexDataMap, allHexMeshes, instancedMeshes as mapInstancedMeshes } from './mapGenerator.ts';
import { createSpheres, Sphere } from './physicsObjects.ts';
import { setupMouseControls } from './interaction.ts';
import { updateHexLiftAnimation, updateSpherePathAnimation } from './animation.ts';
import { worldPointToHex } from './pathfinding.ts';

interface Core {
    scene: THREE.Scene;
    world: CANNON.World;
    camera: THREE.Camera;
    renderer: THREE.WebGLRenderer;
    controls: any;
    pmrem: THREE.PMREMGenerator;
    defaultMaterial: CANNON.Material;
}

interface Assets {
    loadedMapData: any;
    textures: any;
    envmap: THREE.Texture;
}

interface AnimationState {
    isHexLifting: boolean;
    liftedHexInfo: any | null;
    isSphereAnimating: boolean;
    sphereAnimationStartTime: number;
    sphereAnimationStartPos: CANNON.Vec3;
    sphereAnimationTargetPos: CANNON.Vec3;
    currentPath: any[];
    currentPathIndex: number;
}

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

let core: Core;
let assets: Assets;
let allPhysicalSpheres: Sphere[];
let playerSphere: Sphere | undefined;
let lastCallTime: number;

const animationState: AnimationState = {
    isHexLifting: false,
    liftedHexInfo: null,
    isSphereAnimating: false,
    sphereAnimationStartTime: 0,
    sphereAnimationStartPos: new CANNON.Vec3(),
    sphereAnimationTargetPos: new CANNON.Vec3(),
    currentPath: [],
    currentPathIndex: 0,
};

async function main(): Promise<void> {
    core = initCore();
    assets = await loadAssets(core.pmrem);

    console.log(assets);

    createMap(core.scene, core.world, assets.loadedMapData, assets.textures, assets.envmap, core.defaultMaterial);

    allPhysicalSpheres = createSpheres(core.scene, core.world, assets.envmap, core.defaultMaterial);
    playerSphere = allPhysicalSpheres.find(s => s.isPlayer);

    console.log(allPhysicalSpheres, "allPhysicalSpheres");

    if (playerSphere) {
        setupMouseControls(core.renderer.domElement, core.camera, core.world, allHexMeshes, hexDataMap, mapInstancedMeshes, playerSphere, animationState);
    }

    core.renderer.setAnimationLoop(animate);
}

let prevFloorY: number;

function animate(): void {
    stats.begin();
    const time = performance.now() / 1000;
    const currentTimeMs = performance.now();

    const maxSubSteps = 10;
    if (!lastCallTime) {
        core.world.step(TIME_STEP, TIME_STEP, maxSubSteps);
    } else {
        const dt = time - lastCallTime;
        core.world.step(TIME_STEP, dt, maxSubSteps);
    }
    lastCallTime = time;

    updateHexLiftAnimation(currentTimeMs, animationState, mapInstancedMeshes);
    if (playerSphere) {
        updateSpherePathAnimation(core.world, animationState, playerSphere.body, hexDataMap);
    }

    const surfaceHeight = 3;
    const sphereRadius = playerSphere ? (playerSphere.body.shapes[0] as CANNON.Sphere).radius : 1;

    allPhysicalSpheres.forEach(sphereObj => {
        let floorY = surfaceHeight;
        const currentHex = worldPointToHex(new THREE.Vector3(sphereObj.body.position.x, sphereObj.body.position.y, sphereObj.body.position.z), hexDataMap);
   
        if (prevFloorY) {
            floorY = prevFloorY;
        }
        if (currentHex) {
            floorY = currentHex.baseHeight;
            prevFloorY = floorY;
        } 

        const visualYMinimum = floorY + sphereRadius;
      
        const sphereBodyPosition = sphereObj.body.position;
        sphereObj.mesh.position.y = sphereObj.mesh.position.y < visualYMinimum ? visualYMinimum : sphereObj.mesh.position.y;
        sphereBodyPosition.y = sphereBodyPosition.y < visualYMinimum ? visualYMinimum : sphereBodyPosition.y;

        sphereObj.mesh.position.copy(sphereBodyPosition);
        sphereObj.mesh.quaternion.copy(sphereObj.body.quaternion);

        if (sphereObj.mesh.position.y < visualYMinimum && !animationState.isSphereAnimating) {
            sphereObj.mesh.position.y = sphereObj.mesh.position.y < visualYMinimum ? visualYMinimum : sphereObj.mesh.position.y;
        }

        if (!sphereObj.isPlayer) {
            if (Math.random() < RANDOM_MOVEMENT_PROBABILITY && sphereObj.body.sleepState !== CANNON.Body.SLEEPING) {
                const impulse = new CANNON.Vec3(
                    (Math.random() - 0.5) * 2 * RANDOM_IMPULSE_STRENGTH,
                    Math.random() * RANDOM_IMPULSE_STRENGTH * 0.2,
                    (Math.random() - 0.5) * 2 * RANDOM_IMPULSE_STRENGTH
                );
                sphereObj.body.applyImpulse(impulse, sphereObj.body.position);
                if (sphereObj.body.sleepState === CANNON.Body.SLEEPY) {
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