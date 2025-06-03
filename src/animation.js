// animation.js
import * as THREE from 'https://cdn.skypack.dev/three@0.137';
import * as CANNON from 'cannon-es';
import { HEX_LIFT_AMOUNT, HEX_LIFT_DURATION, SPHERE_ANIMATION_DURATION, MAX_HEIGHT } from './config.js';
import { worldPointToHex } from './pathfinding.js'; // For getting current hex of sphere

// --- State Variables for Animations (managed by main.js or passed in) ---
// These would typically be part of a larger state object or managed by the calling module (main.js)
// let isHexLifting = false;
// let liftedHexInfo = null; // { instancedMesh, instanceId, originalMatrix, liftStartTime, yOffset }
// let isSphereAnimating = false;
// let sphereAnimationStartTime = 0;
// let sphereAnimationStartPos = new CANNON.Vec3();
// let sphereAnimationTargetPos = new CANNON.Vec3();
// let currentPath = [];
// let currentPathIndex = 0;
// ---

export function updateHexLiftAnimation(currentTimeMs, animationState, instancedMeshes) {
    if (!animationState.isHexLifting || !animationState.liftedHexInfo) return;

    const { liftedHexInfo } = animationState;
    const elapsedTime = currentTimeMs - liftedHexInfo.liftStartTime;
    let liftProgress = elapsedTime / HEX_LIFT_DURATION;
    let currentYOffset;

    if (liftProgress <= 1) { // Lifting up
        currentYOffset = HEX_LIFT_AMOUNT * liftProgress;
    } else if (liftProgress <= 2) { // Moving down
        currentYOffset = HEX_LIFT_AMOUNT * (1 - (liftProgress - 1));
    } else { // Animation finished
        currentYOffset = 0;
        animationState.isHexLifting = false;
        liftedHexInfo.instancedMesh.setMatrixAt(liftedHexInfo.instanceId, liftedHexInfo.originalMatrix);
        liftedHexInfo.instancedMesh.instanceMatrix.needsUpdate = true;
        animationState.liftedHexInfo = null;
        return;
    }

    // Apply lift by modifying the matrix (decompose, translate, compose is safer)
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    liftedHexInfo.originalMatrix.decompose(position, quaternion, scale);
    position.y += currentYOffset; // Add lift to original Y
    const newMatrix = new THREE.Matrix4().compose(position, quaternion, scale);
    liftedHexInfo.instancedMesh.setMatrixAt(liftedHexInfo.instanceId, newMatrix);
    liftedHexInfo.instancedMesh.instanceMatrix.needsUpdate = true;
}


export function updateSpherePathAnimation(world, animationState, sphereBody, hexDataMap) {
    if (!animationState.isSphereAnimating) return;

    const elapsedTime = performance.now() - animationState.sphereAnimationStartTime;
    let progress = elapsedTime / SPHERE_ANIMATION_DURATION;
    const sphereRadius = sphereBody.shapes[0].radius;

    if (progress >= 1) {
        progress = 1;
        animationState.isSphereAnimating = false;
        sphereBody.position.copy(animationState.sphereAnimationTargetPos);
        sphereBody.velocity.set(0, 0, 0);
        sphereBody.angularVelocity.set(0, 0, 0);

        animationState.currentPathIndex++;
        if (animationState.currentPath.length > 0 && animationState.currentPathIndex < animationState.currentPath.length) {
            const nextStepNode = animationState.currentPath[animationState.currentPathIndex];
            animationState.sphereAnimationStartPos.copy(sphereBody.position);

            // Raycast for accurate landing Y position for the next step
            const nextHexWorldPosVec2 = nextStepNode.worldPos; // This is Vector2 (x, map_z)
            const rayFrom = new CANNON.Vec3(nextHexWorldPosVec2.x, MAX_HEIGHT + sphereRadius + 5, nextHexWorldPosVec2.y);
            const rayTo = new CANNON.Vec3(nextHexWorldPosVec2.x, -MAX_HEIGHT, nextHexWorldPosVec2.y);
            const result = new CANNON.RaycastResult();
            world.raycastClosest(rayFrom, rayTo, { checkCollisionResponse: false }, result);
            
            let nextTargetY = nextStepNode.baseHeight + sphereRadius + 0.075; // Default target Y
            if (result.hasHit) {
                nextTargetY = result.hitPointWorld.y + sphereRadius + 0.075; // More precise Y
            }

            animationState.sphereAnimationTargetPos.set(nextStepNode.worldPos.x, nextTargetY, nextStepNode.worldPos.y);
            animationState.isSphereAnimating = true;
            animationState.sphereAnimationStartTime = performance.now();
        } else {
            animationState.currentPath = [];
            animationState.currentPathIndex = 0;
            // Optional: Make sphere dynamic again if needed
            // sphereBody.type = CANNON.Body.DYNAMIC;
            // sphereBody.wakeUp();
        }
    } else {
        // Interpolate position
        const newX = animationState.sphereAnimationStartPos.x + (animationState.sphereAnimationTargetPos.x - animationState.sphereAnimationStartPos.x) * progress;
        let newY = animationState.sphereAnimationStartPos.y + (animationState.sphereAnimationTargetPos.y - animationState.sphereAnimationStartPos.y) * progress;
        // newY = Math.max(newY, sphereRadius); // Ensure not below ground if surfaceHeight isn't well defined
        const newZ = animationState.sphereAnimationStartPos.z + (animationState.sphereAnimationTargetPos.z - animationState.sphereAnimationStartPos.z) * progress;
        sphereBody.position.set(newX, newY, newZ);

        // Keep sphere kinematic during animation
        sphereBody.velocity.set(0, 0, 0);
        sphereBody.angularVelocity.set(0, 0, 0);
    }
}

export function startHexLift(clickedHexData, instancedMeshes, animationState) {
    const targetInstancedMesh = instancedMeshes[clickedHexData.materialType];
    if (targetInstancedMesh && clickedHexData.perGroupInstanceId !== undefined) {
        animationState.isHexLifting = true;
        const originalMatrix = new THREE.Matrix4();
        targetInstancedMesh.getMatrixAt(clickedHexData.perGroupInstanceId, originalMatrix);
        animationState.liftedHexInfo = {
            instancedMesh: targetInstancedMesh,
            instanceId: clickedHexData.perGroupInstanceId,
            originalMatrix: originalMatrix,
            liftStartTime: performance.now(),
            yOffset: 0 // Not strictly needed here if y is recalculated from originalMatrix
        };
    }
}

export function startSpherePath(world, path, sphereBody, animationState, hexDataMap) {
    animationState.currentPath = path;
    animationState.currentPathIndex = 0;
    const firstStepNode = animationState.currentPath[0];
    const sphereRadius = sphereBody.shapes[0].radius;

    animationState.sphereAnimationStartPos.copy(sphereBody.position);

    const targetHexWorldPosVec2 = firstStepNode.worldPos; // Vector2
    const rayFrom = new CANNON.Vec3(targetHexWorldPosVec2.x, MAX_HEIGHT + sphereRadius + 5, targetHexWorldPosVec2.y);
    const rayTo = new CANNON.Vec3(targetHexWorldPosVec2.x, -MAX_HEIGHT, targetHexWorldPosVec2.y);
    const cannonResult = new CANNON.RaycastResult();
    world.raycastClosest(rayFrom, rayTo, { checkCollisionResponse: false }, cannonResult);
    
    let targetY = firstStepNode.baseHeight + sphereRadius + 0.075;
    if (cannonResult.hasHit) {
        targetY = cannonResult.hitPointWorld.y + sphereRadius + 0.075;
    }

    animationState.sphereAnimationTargetPos.set(firstStepNode.worldPos.x, targetY, firstStepNode.worldPos.y);
    animationState.isSphereAnimating = true;
    animationState.sphereAnimationStartTime = performance.now();
    // Optional: Make sphere kinematic for animation
    // sphereBody.type = CANNON.Body.KINEMATIC;
}