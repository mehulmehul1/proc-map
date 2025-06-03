// interaction.js
import * as THREE from 'https://cdn.skypack.dev/three@0.137';
import * as CANNON from 'cannon-es';
import { JUMP_FORCE, MAX_HEIGHT } from './config.js';
import { aStarPathfinding, worldPointToHex } from './pathfinding.js';
import { startHexLift, startSpherePath } from './animation.js';

let isRightMouseDown = false; // Module-level state for jump logic

export function setupMouseControls(rendererDomElement, camera, world, allHexMeshesFromMap, hexDataMapFromMap, instancedMeshesFromMap, playerSphere, animationState) {
    const mouse = new THREE.Vector2();

    rendererDomElement.addEventListener('mousedown', (event) => onMouseDown(event, camera, world, allHexMeshesFromMap, hexDataMapFromMap, instancedMeshesFromMap, playerSphere, animationState, mouse), false);
    rendererDomElement.addEventListener('mouseup', onMouseUp, false);
    rendererDomElement.addEventListener('contextmenu', (event) => event.preventDefault());
}

function onMouseUp(event) {
    if (event.button === 2) { // Right mouse button released
        isRightMouseDown = false;
    }
}

function onMouseDown(event, camera, world, allHexMeshes, hexDataMap, instancedMeshes, playerSphere, animationState, mouse) {
    event.preventDefault();

    if (event.button === 0) { // Left mouse button
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

        const threeRaycaster = new THREE.Raycaster();
        threeRaycaster.setFromCamera(mouse, camera);
        const intersects = threeRaycaster.intersectObjects(allHexMeshes, false); // allHexMeshes is array of InstancedMesh

        let finalClickedHexData = null;
        if (intersects.length > 0) {
            const intersection = intersects[0];
            if (intersection.object.isInstancedMesh && intersection.instanceId !== undefined) {
                const hitInstancedMesh = intersection.object;
                const clickedInstanceId = intersection.instanceId;
                const materialType = hitInstancedMesh.userData.materialType;
                // Find the corresponding hex data
                for (const data of hexDataMap.values()) {
                    if (data.materialType === materialType && data.perGroupInstanceId === clickedInstanceId) {
                        finalClickedHexData = data;
                        break;
                    }
                }
            }
        }

        if (finalClickedHexData && !animationState.isHexLifting && !animationState.isSphereAnimating) {
            const sphereCurrentHex = worldPointToHex(playerSphere.body.position, hexDataMap);
            let allowHexLift = true;
            if (sphereCurrentHex && sphereCurrentHex.tileX === finalClickedHexData.tileX && sphereCurrentHex.tileY === finalClickedHexData.tileY) {
                allowHexLift = false; // Don't lift hex player is on
            }

            if (allowHexLift) {
                startHexLift(finalClickedHexData, instancedMeshes, animationState);
            }

            if (sphereCurrentHex) {
                const targetHexCoords = { tileX: finalClickedHexData.tileX, tileY: finalClickedHexData.tileY };
                const path = aStarPathfinding(sphereCurrentHex, targetHexCoords, hexDataMap);
                if (path.length > 0) {
                    startSpherePath(world, path, playerSphere.body, animationState, hexDataMap);
                }
            }
        }

    } else if (event.button === 2 && !isRightMouseDown) { // Right mouse button for jump
        isRightMouseDown = true;
        const sphereBody = playerSphere.body;
        const sphereRadius = sphereBody.shapes[0].radius;
        const rayFrom = new CANNON.Vec3().copy(sphereBody.position);
        const rayTo = new CANNON.Vec3(sphereBody.position.x, sphereBody.position.y - sphereRadius - 0.1, sphereBody.position.z);
        const result = new CANNON.RaycastResult();
        // Ensure raycasting against the heightfield or other ground objects
        world.raycastClosest(rayFrom, rayTo, { collisionFilterGroup: 1, collisionFilterMask: 1 }, result);

        if (result.hasHit && result.body !== sphereBody) {
            sphereBody.applyImpulse(new CANNON.Vec3(0, JUMP_FORCE, 0), sphereBody.position);
            if (sphereBody.sleepState === CANNON.Body.SLEEPING) {
                sphereBody.wakeUp();
            }
        }
    }
}