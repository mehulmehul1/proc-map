// physicsObjects.ts
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MAX_HEIGHT, NUM_ADDITIONAL_SPHERES } from './config.ts';

export interface Sphere {
    body: CANNON.Body;
    mesh: THREE.Mesh;
    isPlayer: boolean;
}

export function createSpheres(
    scene: THREE.Scene,
    world: CANNON.World,
    envmap: THREE.Texture,
    defaultMaterial: CANNON.Material
): Sphere[] {
    const sphereRadius = 1;
    const spheres: Sphere[] = [];
    const surfaceHeight = 3;

    // Main Sphere
    const mainSphereBody = new CANNON.Body({
        mass: 5,
        shape: new CANNON.Sphere(sphereRadius),
        material: defaultMaterial,
        angularDamping: 0.8,
        linearDamping: 0.5,
        collisionResponse: true,
    });
    mainSphereBody.sleepSpeedLimit = 0.2;
    mainSphereBody.sleepTimeLimit = 0.5;
    mainSphereBody.position.set(0, Math.max(MAX_HEIGHT + sphereRadius + 0.2, surfaceHeight), 0); // Start high
    mainSphereBody.ccdSpeedThreshold = 10;
    mainSphereBody.ccdSweptSphereRadius = sphereRadius * 0.9;
    world.addBody(mainSphereBody);

    const sphereGeometry = new THREE.SphereGeometry(sphereRadius);
    const baseSphereMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, envMap: envmap });
    const mainSphereMesh = new THREE.Mesh(sphereGeometry, baseSphereMaterial.clone());
    mainSphereMesh.castShadow = true;
    mainSphereMesh.receiveShadow = true;
    scene.add(mainSphereMesh);
    spheres.push({ body: mainSphereBody, mesh: mainSphereMesh, isPlayer: true });

    // Additional Spheres
    for (let i = 0; i < NUM_ADDITIONAL_SPHERES; i++) {
        const additionalRadius = sphereRadius; // Same radius for now
        const body = new CANNON.Body({
            mass: 5,
            shape: new CANNON.Sphere(sphereRadius),
            material: defaultMaterial,
            angularDamping: 0.8,
            linearDamping: 0.5,
            collisionResponse: true,
        });
        body.sleepSpeedLimit = 0.2;
        body.sleepTimeLimit = 0.5;
        const angle = (i / NUM_ADDITIONAL_SPHERES) * Math.PI * 2;
        const xOffset = Math.cos(angle) * 4;
        const zOffset = Math.sin(angle) * 4;
        body.position.set(xOffset, Math.max(MAX_HEIGHT + additionalRadius + 0.2, surfaceHeight), zOffset);
        body.ccdSpeedThreshold = 10;
        body.ccdSweptSphereRadius = sphereRadius * 0.9;
        console.log(body, xOffset, Math.max(MAX_HEIGHT + additionalRadius + 0.2, surfaceHeight), zOffset);
        world.addBody(body);

        const mesh = new THREE.Mesh(sphereGeometry, baseSphereMaterial.clone());
        mesh.material.color.setHex(Math.random() * 0xffffff);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        console.log(mesh, body);
        scene.add(mesh);
        spheres.push({ body, mesh, isPlayer: false });
    }

    return spheres; // Returns an array of {body, mesh, isPlayer}
}