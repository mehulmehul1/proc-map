// setup.js
import * as THREE from 'https://cdn.skypack.dev/three@0.137';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/controls/OrbitControls';
import { ACESFilmicToneMapping, sRGBEncoding, PCFSoftShadowMap, PMREMGenerator } from 'https://cdn.skypack.dev/three@0.137';
import {
    PHYSICS_SOLVER_ITERATIONS, PHYSICS_SOLVER_TOLERANCE,
    FRICTION, RESTITUTION
} from './config.js';

export function initCore() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#FFEECC");

    const world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    world.allowSleep = true;
    world.solver.iterations = PHYSICS_SOLVER_ITERATIONS;
    world.solver.tolerance = PHYSICS_SOLVER_TOLERANCE;

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
    world.addContactMaterial(defaultContactMaterial); // Make sure it's added

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(-25.5, 46.5, 49.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.outputEncoding = sRGBEncoding;
    renderer.physicallyCorrectLights = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    document.querySelector("#app").appendChild(renderer.domElement);

    const light = new THREE.PointLight(new THREE.Color("#FFCB8E").convertSRGBToLinear(), 80, 200);
    light.position.set(10, 20, 10);
    light.castShadow = true;
    light.shadow.mapSize.width = 512;
    light.shadow.mapSize.height = 512;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 500;
    scene.add(light);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(20, 0, 20);
    controls.dampingFactor = 0.05;
    controls.enableDamping = true;

    const pmrem = new PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    // Ground plane for physics (if not using heightfield exclusively for ground)
    // const groundBody = new CANNON.Body({
    //   type: CANNON.Body.STATIC,
    //   shape: new CANNON.Plane(),
    //   material: defaultMaterial // Important for contact properties
    // });
    // groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    // world.addBody(groundBody);


    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, world, camera, renderer, light, controls, pmrem, defaultMaterial };
}