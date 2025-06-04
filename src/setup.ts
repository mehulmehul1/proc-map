// setup.ts
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ACESFilmicToneMapping, PCFSoftShadowMap, PMREMGenerator } from 'three';
import {
    FRICTION, RESTITUTION
} from './config';

interface Core {
    scene: THREE.Scene;
    world: CANNON.World;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    light: THREE.PointLight;
    controls: OrbitControls;
    pmrem: PMREMGenerator;
    defaultMaterial: CANNON.Material;
}

export function initCore(): Core {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#FFEECC");

    const world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    world.allowSleep = true;

    const defaultMaterial = new CANNON.Material("default");
    const defaultContactMaterial = new CANNON.ContactMaterial(
        defaultMaterial, defaultMaterial,
        {
            friction: FRICTION,
            restitution: RESTITUTION,
            contactEquationStiffness: 1e10,
            contactEquationRelaxation: 3,
            frictionEquationStiffness: 1e10,
            frictionEquationRelaxation: 3
        }
    );
    world.defaultContactMaterial = defaultContactMaterial;
    world.addContactMaterial(defaultContactMaterial);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(-25.5, 46.5, 49.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    document.querySelector("#app")?.appendChild(renderer.domElement);

    // Main top light
    const mainLight = new THREE.PointLight(new THREE.Color("#FFCB8E").convertSRGBToLinear(), 80, 200);
    mainLight.position.set(10, 20, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 512;
    mainLight.shadow.mapSize.height = 512;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 500;
    scene.add(mainLight);

    // Additional directional light for more shadows
    const dirLight = new THREE.DirectionalLight(new THREE.Color("#FFCB8E"), 0.5);
    dirLight.position.set(20, 30, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 512;
    dirLight.shadow.mapSize.height = 512;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    scene.add(dirLight);

    // Ambient light for better overall visibility
    const ambientLight = new THREE.AmbientLight(new THREE.Color("#404040"), 1);
    scene.add(ambientLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(20, 0, 20);

    const pmrem = new PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, world, camera, renderer, light: mainLight, controls, pmrem, defaultMaterial };
}