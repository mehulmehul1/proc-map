// interaction.ts
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { JUMP_FORCE } from './config.ts';
import { aStarPathfinding, worldPointToHex } from './pathfinding.ts';
import { startHexLift, startSpherePath } from './animation.ts';
import { Sphere } from './physicsObjects.ts';
import { AnimationState } from './types/index.ts';

interface HexData {
    materialType: string;
    perGroupInstanceId: number;
    worldPos: THREE.Vector2;
    baseHeight: number;
    tileX: number;
    tileY: number;
}

type PlayerSphere = Sphere;

let isRightMouseDown: boolean = false; // Module-level state for jump logic

export function setupMouseControls(
    rendererDomElement: HTMLElement,
    camera: THREE.Camera,
    world: CANNON.World,
    allHexMeshesFromMap: THREE.InstancedMesh[],
    hexDataMapFromMap: Map<string, HexData>,
    instancedMeshesFromMap: Record<string, THREE.InstancedMesh>,
    playerSphere: PlayerSphere,
    animationState: AnimationState
): void {
    const mouse: THREE.Vector2 = new THREE.Vector2();

    rendererDomElement.addEventListener('mousedown', (event: MouseEvent) => 
        onMouseDown(event, camera, world, allHexMeshesFromMap, hexDataMapFromMap, instancedMeshesFromMap, playerSphere, animationState, mouse), false);
    rendererDomElement.addEventListener('mouseup', onMouseUp, false);
    rendererDomElement.addEventListener('contextmenu', (event: MouseEvent) => event.preventDefault());
}

function onMouseUp(event: MouseEvent): void {
    if (event.button === 2) { // Right mouse button released
        isRightMouseDown = false;
    }
}

function onMouseDown(
    event: MouseEvent,
    camera: THREE.Camera,
    world: CANNON.World,
    allHexMeshes: THREE.InstancedMesh[],
    hexDataMap: Map<string, HexData>,
    instancedMeshes: Record<string, THREE.InstancedMesh>,
    playerSphere: PlayerSphere,
    animationState: AnimationState,
    mouse: THREE.Vector2
): void {
    event.preventDefault();

    if (event.button === 0) { // Left mouse button
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

        const threeRaycaster: THREE.Raycaster = new THREE.Raycaster();
        threeRaycaster.setFromCamera(mouse, camera);
        const intersects: THREE.Intersection[] = threeRaycaster.intersectObjects(allHexMeshes, false);

        let finalClickedHexData: HexData | null = null;
        if (intersects.length > 0) {
            const intersection: THREE.Intersection = intersects[0];
            if (intersection.object instanceof THREE.InstancedMesh && intersection.instanceId !== undefined) {
                const hitInstancedMesh: THREE.InstancedMesh = intersection.object as THREE.InstancedMesh;
                const clickedInstanceId: number = intersection.instanceId;
                const materialType: string = hitInstancedMesh.userData.materialType;
                
                for (const data of hexDataMap.values()) {
                    if (data.materialType === materialType && data.perGroupInstanceId === clickedInstanceId) {
                        finalClickedHexData = data;
                        break;
                    }
                }
            }
        }

        if (finalClickedHexData && !animationState.isHexLifting && !animationState.isSphereAnimating) {
            const sphereCurrentHex = worldPointToHex(new THREE.Vector3(playerSphere.body.position.x, playerSphere.body.position.y, playerSphere.body.position.z), hexDataMap);
            let allowHexLift: boolean = true;
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
                    startSpherePath(world, path, playerSphere.body, animationState);
                }
            }
        }

    } else if (event.button === 2 && !isRightMouseDown) { // Right mouse button for jump
        isRightMouseDown = true;
        const sphereBody: CANNON.Body = playerSphere.body;
        const sphereRadius: number = (sphereBody.shapes[0] as CANNON.Sphere).radius;
        const rayFrom: CANNON.Vec3 = new CANNON.Vec3().copy(sphereBody.position);
        const rayTo: CANNON.Vec3 = new CANNON.Vec3(sphereBody.position.x, sphereBody.position.y - sphereRadius - 0.1, sphereBody.position.z);
        const result: CANNON.RaycastResult = new CANNON.RaycastResult();
        
        world.raycastClosest(rayFrom, rayTo, { collisionFilterGroup: 1, collisionFilterMask: 1 }, result);

        if (result.hasHit && result.body !== sphereBody) {
            sphereBody.applyImpulse(new CANNON.Vec3(0, JUMP_FORCE, 0), sphereBody.position);
            if (sphereBody.sleepState === CANNON.Body.SLEEPING) {
                sphereBody.wakeUp();
            }
        }
    }
}