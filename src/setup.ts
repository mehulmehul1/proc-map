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
    pmrem: THREE.PMREMGenerator;
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
    
    const appElement = document.querySelector("#app");
    if (!appElement) throw new Error("Could not find #app element");
    appElement.appendChild(renderer.domElement);

    const light = new THREE.PointLight(new THREE.Color("#FFCB8E").convertSRGBToLinear(),5000, 5000);
    light.position.set(10, 30, 10);
    light.castShadow = true;
    light.shadow.mapSize.width = 512;
    light.shadow.mapSize.height = 512;
    scene.add(light);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(20, 0, 20);

    const pmrem = new PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, world, camera, renderer, light, controls, pmrem, defaultMaterial };
}