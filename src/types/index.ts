import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export interface AnimationState {
    isHexLifting: boolean;
    liftedHexInfo: LiftedHexInfo | null;
    isSphereAnimating: boolean;
    sphereAnimationStartTime: number;
    sphereAnimationStartPos: CANNON.Vec3;
    sphereAnimationTargetPos: CANNON.Vec3;
    currentPath: PathNode[];
    currentPathIndex: number;
}

export interface LiftedHexInfo {
    instancedMesh: THREE.InstancedMesh;
    instanceId: number;
    originalMatrix: THREE.Matrix4;
    liftStartTime: number;
    yOffset: number;
}

export interface PathNode {
    tileCoords: { q: number; r: number };
    worldPos: THREE.Vector2;
    baseHeight: number;
}

export interface HexData {
    materialType: string;
    perGroupInstanceId: number;
    worldPos: THREE.Vector2;
    baseHeight: number;
}

export interface Core {
    scene: THREE.Scene;
    world: CANNON.World;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any; // Replace with actual controls type
    pmrem: THREE.PMREMGenerator;
    defaultMaterial: THREE.Material;
}

export interface SphereObject {
    body: CANNON.Body;
    mesh: THREE.Mesh;
    isPlayer?: boolean;
}

export interface Assets {
    envmap: THREE.Texture;
    textures: {
        dirt: THREE.Texture;
        dirt2: THREE.Texture;
        grass: THREE.Texture[];
        grassNormal: THREE.Texture;
        sand: THREE.Texture;
        water: THREE.Texture;
        stone: THREE.Texture;
    };
    loadedMapData: any; // Replace with actual map data type
} 