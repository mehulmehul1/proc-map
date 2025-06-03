// animation.ts
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { HEX_LIFT_AMOUNT, HEX_LIFT_DURATION, SPHERE_ANIMATION_DURATION, MAX_HEIGHT } from './config.ts';
import { worldPointToHex } from './pathfinding.ts'; // For getting current hex of sphere

interface LiftedHexInfo {
    instancedMesh: THREE.InstancedMesh;
    instanceId: number;
    originalMatrix: THREE.Matrix4;
    liftStartTime: number;
    yOffset: number;
}

interface AnimationState {
    isHexLifting: boolean;
    liftedHexInfo: LiftedHexInfo | null;
    isSphereAnimating: boolean;
    sphereAnimationStartTime: number;
    sphereAnimationStartPos: CANNON.Vec3;
    sphereAnimationTargetPos: CANNON.Vec3;
    currentPath: any[]; // Replace 'any' with your path node type
    currentPathIndex: number;
}

interface HexData {
    materialType: string;
    perGroupInstanceId: number;
    worldPos: THREE.Vector2;
    baseHeight: number;
}

interface InstancedMeshes {
    [key: string]: THREE.InstancedMesh;
}

export function updateHexLiftAnimation(
    currentTimeMs: number, 
    animationState: AnimationState, 
    instancedMeshes: InstancedMeshes
): void {
    if (!animationState.isHexLifting || !animationState.liftedHexInfo) return;
    const { liftedHexInfo } = animationState;
    const elapsedTime = currentTimeMs - liftedHexInfo.liftStartTime;
    let liftProgress = elapsedTime / HEX_LIFT_DURATION;
    let currentYOffset: number;

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

export function updateSpherePathAnimation(
    world: CANNON.World, 
    animationState: AnimationState, 
    sphereBody: CANNON.Body, 
    hexDataMap: Map<string, HexData>
): void {
    if (!animationState.isSphereAnimating) return;

    const elapsedTime = performance.now() - animationState.sphereAnimationStartTime;
    let progress = elapsedTime / SPHERE_ANIMATION_DURATION;
    const sphereRadius = (sphereBody.shapes[0] as CANNON.Sphere).radius;

    if (progress >= 1) {
        progress = 1;
        animationState.isSphereAnimating = false;
        
        // Ensure final position Y is not below 0
        const finalY = Math.max(0, animationState.sphereAnimationTargetPos.y);
        sphereBody.position.set(
            animationState.sphereAnimationTargetPos.x,
            finalY,
            animationState.sphereAnimationTargetPos.z
        );
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
            
            let nextTargetY = Math.max(0, nextStepNode.baseHeight + sphereRadius + 0.075); // Ensure Y is not below 0
            if (result.hasHit) {
                nextTargetY = Math.max(0, result.hitPointWorld.y + sphereRadius + 0.075); // Ensure Y is not below 0
            }

            animationState.sphereAnimationTargetPos.set(nextStepNode.worldPos.x, nextTargetY, nextStepNode.worldPos.y);
            animationState.isSphereAnimating = true;
            animationState.sphereAnimationStartTime = performance.now();
        } else {
            animationState.currentPath = [];
            animationState.currentPathIndex = 0;
            // Make sphere dynamic again and ensure it's awake
            sphereBody.type = CANNON.Body.DYNAMIC;
            sphereBody.wakeUp();
            // Set initial velocity to zero to prevent falling
            sphereBody.velocity.set(0, 0, 0);
            sphereBody.angularVelocity.set(0, 0, 0);
        }
    } else {
        // During animation, keep sphere kinematic
        sphereBody.type = CANNON.Body.KINEMATIC;
        // Interpolate position
        const newX = animationState.sphereAnimationStartPos.x + (animationState.sphereAnimationTargetPos.x - animationState.sphereAnimationStartPos.x) * progress;
        let newY = animationState.sphereAnimationStartPos.y + (animationState.sphereAnimationTargetPos.y - animationState.sphereAnimationStartPos.y) * progress;
        const newZ = animationState.sphereAnimationStartPos.z + (animationState.sphereAnimationTargetPos.z - animationState.sphereAnimationStartPos.z) * progress;
        
        // Ensure Y is not below 2 during animation
        newY = Math.max(2, newY);

        sphereBody.position.set(newX, newY, newZ);

        // Keep velocities at zero during animation
        sphereBody.velocity.set(0, 0, 0);
        sphereBody.angularVelocity.set(0, 0, 0);
    }
}

export function startHexLift(
    clickedHexData: HexData, 
    instancedMeshes: InstancedMeshes, 
    animationState: AnimationState
): void {
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

export function startSpherePath(
    world: CANNON.World, 
    path: any[], // Replace 'any' with your path node type
    sphereBody: CANNON.Body, 
    animationState: AnimationState, 
    hexDataMap: Map<string, HexData>
): void {
    animationState.currentPath = path;
    animationState.currentPathIndex = 0;
    const firstStepNode = animationState.currentPath[0];
    const sphereRadius = (sphereBody.shapes[0] as CANNON.Sphere).radius;

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