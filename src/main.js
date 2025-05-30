import {
  WebGLRenderer, ACESFilmicToneMapping, sRGBEncoding,
  Color, CylinderGeometry,
  RepeatWrapping, DoubleSide, BoxGeometry, Mesh, PointLight, MeshPhysicalMaterial, PerspectiveCamera,
  Scene, PMREMGenerator, PCFSoftShadowMap,
  Vector2, TextureLoader, SphereGeometry, MeshStandardMaterial, Raycaster, Vector3, Object3D
} from 'https://cdn.skypack.dev/three@0.137';
import * as THREE from 'https://cdn.skypack.dev/three@0.137';
import { OrbitControls } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/controls/OrbitControls';
import { RGBELoader } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/loaders/RGBELoader';
import { mergeBufferGeometries } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/utils/BufferGeometryUtils';
import SimplexNoise from 'https://cdn.skypack.dev/simplex-noise@3.0.0';
import * as CANNON from 'cannon-es';
import Stats from 'stats.js';
// envmap https://polyhaven.com/a/herkulessaulen

const scene = new Scene();
scene.background = new Color("#FFEECC");

const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0), // m/s²
});
world.allowSleep = true; // Allow bodies to sleep
world.solver.iterations = 20; // Set iterations on the default solver
world.solver.tolerance = 0.01; // Decrease solver tolerance for stricter contacts

// Define a default contact material
const defaultMaterial = new CANNON.Material("default");
const defaultContactMaterial = new CANNON.ContactMaterial(
  defaultMaterial,
  defaultMaterial,
  {
    friction: 0.7,
    restitution: 0.05,
    contactEquationStiffness: 1e10, // Significantly increased for "harder" contact
    contactEquationRelaxation: 3,
    frictionEquationStiffness: 1e10, // Significantly increased for "harder" friction
    frictionEquationRelaxation: 3
  }
);
world.defaultContactMaterial = defaultContactMaterial;

const camera = new PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(-17,31,33);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputEncoding = sRGBEncoding;
renderer.physicallyCorrectLights = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
document.querySelector("#app").appendChild(renderer.domElement);

const light = new PointLight( new Color("#FFCB8E").convertSRGBToLinear().convertSRGBToLinear(), 80, 200 );
light.position.set(10, 20, 10);

light.castShadow = true;
light.shadow.mapSize.width = 512;
light.shadow.mapSize.height = 512;
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 500;
scene.add( light );

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0,0,0);
controls.dampingFactor = 0.05;
controls.enableDamping = true;

let pmrem = new PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

const timeStep = 1 / 60; // seconds
let lastCallTime;

let envmap;

const groundBody = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Plane(),
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // make it face up
world.addBody(groundBody);

const MAX_HEIGHT = 10;

const physicalBodies = [];
const visualMeshes = [];

const allHexMeshes = []; // To store individual hex meshes for raycasting
const hexDataMap = new Map(); // To store hex data for pathfinding: 'x,y' => { mesh -> instanceId, tileX, tileY, worldPos, baseHeight }

const TILE_X_RANGE = 100;
const TILE_Y_RANGE = 100;
const allHexInfo = []; // To store raw data for hexes
const groupedInstanceData = {
  stone: [],
  dirt: [],
  grass: [],
  sand: [],
  dirt2: []
  // Add other types if necessary
};
const instancedMeshes = {}; // To store references to our InstancedMesh objects by type

const dummy = new Object3D(); // Declare dummy Object3D helper here, before the loop that uses it

(async function() {
  const surfaceHeight = 3;

  let envmapTexture = await new RGBELoader().loadAsync("assets/envmap.hdr");
  let rt = pmrem.fromEquirectangular(envmapTexture);
  envmap = rt.texture;

  let textures = {
    dirt: await new TextureLoader().loadAsync("assets/dirt.png"),
    dirt2: await new TextureLoader().loadAsync("assets/dirt2.jpg"),
    grass: await new TextureLoader().loadAsync("assets/grass.jpg"),
    sand: await new TextureLoader().loadAsync("assets/sand.jpg"),
    water: await new TextureLoader().loadAsync("assets/water.jpg"),
    stone: await new TextureLoader().loadAsync("assets/stone.png"),
  };

  const simplex = new SimplexNoise();

  const heightfieldMatrix = [];
  let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;

  // First pass: collect all positions and heights for the actual hex grid
  for(let i = -TILE_X_RANGE; i <= TILE_X_RANGE; i++) {
    for(let j = -TILE_Y_RANGE; j <= TILE_Y_RANGE; j++) {
      let position = tileToPosition(i, j);
      if(position.length() > 50) continue;
      minI = Math.min(minI, i);
      maxI = Math.max(maxI, i);
      minJ = Math.min(minJ, j);
      maxJ = Math.max(maxJ, j);
      let noise = (simplex.noise2D(i * 0.1, j * 0.1) + 1) * 0.5;
      noise = Math.pow(noise, 1.5);
      let currentHeight = noise * MAX_HEIGHT;
      allHexInfo.push({ i, j, position, height: currentHeight });
    }
  }

  // Determine matrix dimensions WITH PADDING (1 unit border around the actual data)
  const paddedMinI = minI - 1;
  const paddedMaxI = maxI + 1;
  const paddedMinJ = minJ - 1;
  const paddedMaxJ = maxJ + 1;

  const numRows = paddedMaxJ - paddedMinJ + 1;
  const numCols = paddedMaxI - paddedMinI + 1;
  const veryLowHeight = -MAX_HEIGHT * 2; // A height well below any actual terrain

  for (let r = 0; r < numRows; r++) {
    heightfieldMatrix[r] = new Array(numCols).fill(veryLowHeight); // Initialize padded matrix with low height
  }

  // Populate the central part of the heightfield matrix with actual hex data
  for (const hexInfo of allHexInfo) {
    // Offset row and col by 1 due to padding
    const r = hexInfo.j - paddedMinJ;
    const c = hexInfo.i - paddedMinI;
    if (r >= 0 && r < numRows && c >= 0 && c < numCols) { // Bounds check just in case
        // If this is a grass hex, set height to 0 in the heightfield matrix
        let isGrass = false;
        let tempHeight = hexInfo.height;
        if (tempHeight > GRASS_HEIGHT && tempHeight <= DIRT_HEIGHT) {
          isGrass = true;
        }
        heightfieldMatrix[r][c] = isGrass ? 0 : hexInfo.height;
    }

    // Instance data collection remains the same, based on original hexInfo
    let currentHeight = hexInfo.height;
    const currentPosition = hexInfo.position;
    const tileX = hexInfo.i;
    const tileY = hexInfo.j;
    let materialType = null;
    if (currentHeight > STONE_HEIGHT) materialType = "stone";
    else if (currentHeight > DIRT_HEIGHT) materialType = "dirt";
    else if (currentHeight > GRASS_HEIGHT) materialType = "grass";
    else if (currentHeight > SAND_HEIGHT) materialType = "sand";
    else if (currentHeight > DIRT2_HEIGHT) materialType = "dirt2";
    else continue;
    // Force all grass hexes to height 0
    if (materialType === "grass") {
      currentHeight = surfaceHeight;
    }
    if (materialType === "dirt") {
      currentHeight = surfaceHeight;
    }
    if (materialType === "dirt2") {
      currentHeight = surfaceHeight;
    }
    if (materialType === "sand") {
      currentHeight = surfaceHeight - 0.2;
    }
    if (materialType === "stone") {
      currentHeight = surfaceHeight + 3;
    }
    if (materialType === "water") {
      currentHeight = 1;
    }
    dummy.position.set(currentPosition.x, currentHeight * 0.5, currentPosition.y);
    const baseGeometryHeight = 1;
    dummy.scale.set(1, currentHeight / baseGeometryHeight, 1);
dummy.updateMatrix();
    if (groupedInstanceData[materialType]) {
      // Store the per-group instance ID when pushing data
      const perGroupInstanceId = groupedInstanceData[materialType].length;
      groupedInstanceData[materialType].push({
        matrix: dummy.matrix.clone(),
        tileX: tileX, tileY: tileY,
        worldPos: currentPosition.clone(),
        baseHeight: currentHeight,
        perGroupInstanceId: perGroupInstanceId // Store this ID
      });

      // Populate hexDataMap
      const mapKey = `${tileX},${tileY}`;
      hexDataMap.set(mapKey, {
        tileX: tileX, tileY: tileY,
        worldPos: currentPosition.clone(),
        baseHeight: currentHeight,
        materialType: materialType,
        perGroupInstanceId: perGroupInstanceId // Store for linkage
      });
    } else {
      // console.warn("Unknown material type for instancing:", materialType);
      continue;
    }
  }

  // Create Heightfield using the PADDED matrix
  if (heightfieldMatrix.length > 0 && heightfieldMatrix[0].length > 0 && numCols > 0 && numRows > 0) {
    const elementSizeForHeightfield = 0.5;
    const heightfieldShape = new CANNON.Heightfield(heightfieldMatrix, { elementSize: elementSizeForHeightfield });
    const hfBody = new CANNON.Body({ mass: 0, material: defaultMaterial });
    const quaternion = new CANNON.Quaternion();
    quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    hfBody.addShape(heightfieldShape, new CANNON.Vec3(), quaternion);

    // Positioning needs to be based on the world position of the paddedMinI, paddedMinJ corner
    const paddedMinCornerWorldPos = tileToPosition(paddedMinI, paddedMinJ);
    const totalWidth = (numCols - 1) * elementSizeForHeightfield;
    const totalDepth = (numRows - 1) * elementSizeForHeightfield;
    hfBody.position.set(
      paddedMinCornerWorldPos.x + totalWidth * 0.5,
      0,
      paddedMinCornerWorldPos.y + totalDepth * 0.5
    );
    world.addBody(hfBody);
    // console.log("Padded Heightfield Body Added. Matrix size:", numCols, "x", numRows);
  }

  // Create InstancedMesh(es) - one for each material type
  const baseHexGeo = new CylinderGeometry(1, 1, 1, 6, 1, false); // Unit height = 1

  for (const type in groupedInstanceData) {
    const instances = groupedInstanceData[type];
    if (instances.length > 0) {
      const material = hexMeshMaterial(textures[type], envmap); // Get specific material
      const instancedHexMesh = new THREE.InstancedMesh(baseHexGeo, material, instances.length);
      instancedHexMesh.castShadow = true;
      instancedHexMesh.receiveShadow = true;
      instancedHexMesh.userData.materialType = type; // For easier identification if needed
      instancedMeshes[type] = instancedHexMesh; // Store reference to the InstancedMesh

      for (let i = 0; i < instances.length; i++) {
        instancedHexMesh.setMatrixAt(i, instances[i].matrix);
      }
      instancedHexMesh.instanceMatrix.needsUpdate = true;
      scene.add(instancedHexMesh);
      allHexMeshes.push(instancedHexMesh); // Add to list for raycasting
      // console.log(`Created InstancedMesh for type '${type}' with ${instances.length} instances.`);
    }
  }

  let seaTexture = textures.water;
  seaTexture.repeat = new Vector2(1, 1);
  seaTexture.wrapS = RepeatWrapping;
  seaTexture.wrapT = RepeatWrapping;

  let seaMesh = new Mesh(
    new CylinderGeometry(34, 34, MAX_HEIGHT * 0.2, 50),
    new MeshPhysicalMaterial({
      envMap: envmap,
      color: new Color("#55aaff").convertSRGBToLinear().multiplyScalar(3),
      ior: 1.4,
      transmission: 1,
      transparent: true,
      thickness: 1.5,
      envMapIntensity: 0.2,
      roughness: 1,
      metalness: 0.025,
      roughnessMap: seaTexture,
      metalnessMap: seaTexture,
    })
  );
  seaMesh.receiveShadow = true;
  seaMesh.rotation.y = -Math.PI * 0.333 * 0.5;
  seaMesh.position.set(0, MAX_HEIGHT * 0.1, 0);
  scene.add(seaMesh);


  let mapContainer = new Mesh(
    new CylinderGeometry(34.1, 34.1, MAX_HEIGHT * 0.25, 50, 1, true),
    new MeshPhysicalMaterial({
      envMap: envmap,
      map: textures.dirt,
      envMapIntensity: 0.2,
      side: DoubleSide,
    })
  );
  mapContainer.receiveShadow = true;
  mapContainer.rotation.y = -Math.PI * 0.333 * 0.5;
  mapContainer.position.set(0, MAX_HEIGHT * 0.125, 0);
  scene.add(mapContainer);

  let mapFloor = new Mesh(
    new CylinderGeometry(37, 37, MAX_HEIGHT * 0.1, 50),
    new MeshPhysicalMaterial({
      envMap: envmap,
      map: textures.dirt2,
      envMapIntensity: 0.1,
      side: DoubleSide,
    })
  );
  mapFloor.receiveShadow = true;
  mapFloor.position.set(0, -MAX_HEIGHT * 0.05, 0);
  scene.add(mapFloor);

  // clouds(); // Removed clouds

  // Create a sphere body
  const radius = 1; // m
  const sphereBody = new CANNON.Body({
    mass: 5, // kg
    shape: new CANNON.Sphere(radius),
    material: defaultMaterial,
    angularDamping: 0.8,
    linearDamping: 0.5, // Increased linear damping
    collisionResponse: true,
  });
  sphereBody.sleepSpeedLimit = 0.2;
  sphereBody.sleepTimeLimit = 0.5;
  // Start the sphere just above the highest possible hex + radius + small buffer
  sphereBody.position.set(0, Math.max(MAX_HEIGHT + radius + 0.2, surfaceHeight), 0);

  sphereBody.ccdSpeedThreshold = 10;
  sphereBody.ccdSweptSphereRadius = radius * 0.9;
  world.addBody(sphereBody);

  // Create the visual sphere
  const sphereGeometry = new SphereGeometry(radius);
  const baseSphereMaterial = new MeshStandardMaterial({
    color: 0xff0000,
    envMap: envmap,
  });
  const sphereMesh = new Mesh(sphereGeometry, baseSphereMaterial.clone());
  sphereMesh.castShadow = true;
  sphereMesh.receiveShadow = true;
  scene.add(sphereMesh);

  // Arrays and count for additional spheres
  const NUM_ADDITIONAL_SPHERES = 4;
  const additionalSphereBodies = [];
  const additionalSphereMeshes = [];

  // Create additional spheres
  for (let i = 0; i < NUM_ADDITIONAL_SPHERES; i++) {
    const additionalRadius = radius; // Same radius for now
    const body = new CANNON.Body({
      mass: 5, // kg
      shape: new CANNON.Sphere(additionalRadius),
      material: defaultMaterial,
      angularDamping: 0.8,
      linearDamping: 0.5,
      collisionResponse: true,
    });
    body.sleepSpeedLimit = 0.2;
    body.sleepTimeLimit = 0.5;

    // Distribute them in a circle, slightly offset from the center, at the safe height
    const angle = (i / NUM_ADDITIONAL_SPHERES) * Math.PI * 2;
    const xOffset = Math.cos(angle) * 4; // 4 units away
    const zOffset = Math.sin(angle) * 4;
    body.position.set(xOffset, Math.max(MAX_HEIGHT + additionalRadius + 0.2, surfaceHeight), zOffset);

    body.ccdSpeedThreshold = 10;
    body.ccdSweptSphereRadius = additionalRadius * 0.9;
    world.addBody(body);
    additionalSphereBodies.push(body);

    // Use the same geometry and material as the red ball, but random color
    const mesh = new Mesh(sphereGeometry, baseSphereMaterial.clone());
    mesh.material.color.setHex(Math.random() * 0xffffff);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    additionalSphereMeshes.push(mesh);
  }

  let isSphereAnimating = false;
  let sphereAnimationStartTime = 0;
  const sphereAnimationDuration = 300; // ms, e.g., 0.3 seconds for animation between two hexes
  let sphereAnimationStartPos = new CANNON.Vec3();
  let sphereAnimationTargetPos = new CANNON.Vec3();
  let currentPath = []; // To store the A* path being traversed
  let currentPathIndex = 0; // To track the current segment of the path

  // Variables for hex lift animation
  let isHexLifting = false;
  let liftedHexInfo = null; // { instancedMesh, instanceId, originalMatrix, liftStartTime, liftAmount, liftDuration }
  const HEX_LIFT_AMOUNT = 0.5; // How much to lift the hex
  const HEX_LIFT_DURATION = 150; // Duration for lift up, and then for lift down (total 2*duration)

  const JUMP_FORCE = 30; // Magnitude of the jump impulse
  let isRightMouseDown = false; // To track right mouse button state for single jump

  const mouse = new Vector2();

  renderer.domElement.addEventListener('mousedown', onMouseDown, false);
  renderer.domElement.addEventListener('mouseup', onMouseUp, false); // Add mouseup listener
  renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault()); // Prevent context menu on right click

  function onMouseUp(event) {
    if (event.button === 2) { // Right mouse button released
      isRightMouseDown = false;
    }
  }

  function onMouseDown(event) {
    event.preventDefault();

    if (event.button === 0) { // Left mouse button
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

      const threeRaycaster = new Raycaster();
      threeRaycaster.setFromCamera(mouse, camera);
      const intersects = threeRaycaster.intersectObjects(allHexMeshes, false);

      let finalClickedHexData = null;
      if (intersects.length > 0) {
        const intersection = intersects[0];
        if (intersection.object.isInstancedMesh && intersection.instanceId !== undefined) {
          const hitInstancedMesh = intersection.object;
          const clickedInstanceId = intersection.instanceId;
          const materialType = hitInstancedMesh.userData.materialType;
          for (const [key, data] of hexDataMap) {
            if (data.materialType === materialType && data.perGroupInstanceId === clickedInstanceId) {
              finalClickedHexData = data;
              break;
            }
          }
        }
      }

      if (finalClickedHexData && !isHexLifting && !isSphereAnimating) {
        const { materialType, perGroupInstanceId, worldPos, baseHeight, tileX, tileY } = finalClickedHexData;
        const targetInstancedMesh = instancedMeshes[materialType];
        if (targetInstancedMesh && perGroupInstanceId !== undefined) {
          const sphereCurrentHex = getSphereCurrentHexCoords(sphereBody.position);
          let allowHexLift = true;
          if (sphereCurrentHex && sphereCurrentHex.tileX === tileX && sphereCurrentHex.tileY === tileY) {
            allowHexLift = false;
          }
          if (allowHexLift) {
            isHexLifting = true;
            const originalMatrix = new THREE.Matrix4();
            targetInstancedMesh.getMatrixAt(perGroupInstanceId, originalMatrix);
            liftedHexInfo = {
              instancedMesh: targetInstancedMesh, instanceId: perGroupInstanceId,
              originalMatrix: originalMatrix, liftStartTime: performance.now(), yOffset: 0
            };
          }
          const startHexCoords = getSphereCurrentHexCoords(sphereBody.position);
          const targetHexCoords = { tileX: tileX, tileY: tileY };
          if (startHexCoords) {
            currentPath = aStarPathfinding(startHexCoords, targetHexCoords);
            if (currentPath.length > 0) {
              currentPathIndex = 0;
              const firstStepNode = currentPath[currentPathIndex];
              sphereAnimationStartPos.copy(sphereBody.position);
              const sphereRadiusInternal = sphereBody.shapes[0].radius; // Use internal for clarity
              const targetHexWorldPos = firstStepNode.worldPos;
              const rayFromCannonForLanding = new CANNON.Vec3(targetHexWorldPos.x, MAX_HEIGHT + sphereRadiusInternal + 5, targetHexWorldPos.y);
              const rayToCannonForLanding = new CANNON.Vec3(targetHexWorldPos.x, -MAX_HEIGHT, targetHexWorldPos.y);
              const cannonResultForLanding = new CANNON.RaycastResult();
              world.raycastClosest(rayFromCannonForLanding, rayToCannonForLanding, { checkCollisionResponse: false }, cannonResultForLanding);
              let targetY = firstStepNode.baseHeight + sphereRadiusInternal + 0.075;
              if (cannonResultForLanding.hasHit) {
                targetY = cannonResultForLanding.hitPointWorld.y + sphereRadiusInternal + 0.075;
              }
              sphereAnimationTargetPos.set(firstStepNode.worldPos.x, targetY, firstStepNode.worldPos.y);
              isSphereAnimating = true;
              sphereAnimationStartTime = performance.now();
            }
          }
        }
      } else if (finalClickedHexData) {
        // console.log("Hex identified by THREE.js raycast, but sphere/hex is already animating:", finalClickedHexData);
      } else {
        // console.log("No specific hex identified by THREE.js click.");
      }
    } else if (event.button === 2 && !isRightMouseDown) { // Right mouse button for jump
      isRightMouseDown = true; // Prevent continuous jump if button is held
      // Check if sphere is on the ground
      const spherePos = sphereBody.position;
      const rayFrom = new CANNON.Vec3(spherePos.x, spherePos.y, spherePos.z);
      const rayTo = new CANNON.Vec3(spherePos.x, spherePos.y - radius - 0.1, spherePos.z); // Ray slightly longer than radius
      const result = new CANNON.RaycastResult();
      world.raycastClosest(rayFrom, rayTo, { collisionFilterGroup: 1, collisionFilterMask: 1 }, result);

      if (result.hasHit && result.body !== sphereBody) { // Check if it hit something, and that it's not itself (though ray direction should prevent this)
        // console.log("Sphere is grounded, attempting jump.");
        sphereBody.applyImpulse(new CANNON.Vec3(0, JUMP_FORCE, 0), sphereBody.position);
        // Wake up the sphere if it was sleeping
        if(sphereBody.sleepState === CANNON.Body.SLEEPING) {
          sphereBody.wakeUp();
        }
      } else {
        // console.log("Sphere not grounded, cannot jump.");
      }
    }
  }

  renderer.setAnimationLoop(() => {
    controls.update();
    stats.begin();
    const time = performance.now() / 1000;
    const currentTimeMs = performance.now();

    const maxSubSteps = 10; // Maximum number of physics sub-steps per frame
    if (!lastCallTime) {
      // For the first frame, step with a fixed small dt to initialize, or just the timeStep
      world.step(timeStep, timeStep, maxSubSteps);
    } else {
      const dt = time - lastCallTime;
      world.step(timeStep, dt, maxSubSteps); // Pass fixed timeStep, actual deltaTime, and maxSubSteps
    }
    lastCallTime = time;

    // Hex lift animation logic
    if (isHexLifting && liftedHexInfo) {
      const elapsedTime = currentTimeMs - liftedHexInfo.liftStartTime;
      let liftProgress = elapsedTime / HEX_LIFT_DURATION;
      let currentYOffset;

      if (liftProgress <= 1) { // Lifting up phase
        currentYOffset = HEX_LIFT_AMOUNT * liftProgress;
      } else if (liftProgress <= 2) { // Moving down phase
        currentYOffset = HEX_LIFT_AMOUNT * (1 - (liftProgress - 1));
      } else { // Animation finished
        currentYOffset = 0;
        isHexLifting = false;
        // Ensure final matrix is the original one
        liftedHexInfo.instancedMesh.setMatrixAt(liftedHexInfo.instanceId, liftedHexInfo.originalMatrix);
        liftedHexInfo.instancedMesh.instanceMatrix.needsUpdate = true;
        liftedHexInfo = null;
        // console.log("Hex restore complete");
      }

      if (liftedHexInfo) { // Check if not nullified by completion
        const tempMatrix = liftedHexInfo.originalMatrix.clone();
        const translation = new THREE.Vector3(0, currentYOffset, 0);
        tempMatrix.multiply(new THREE.Matrix4().makeTranslation(translation.x, translation.y, translation.z));
        // Instead of multiplying, we should decompose, add to Y, then recompose or directly apply to position component of matrix
        // For simplicity with full matrix: extract position, add offset, recompose (more robust approach for complex original matrices)
        // Decompose original matrix
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion(); // THREE is defined
        const scale = new THREE.Vector3();
        liftedHexInfo.originalMatrix.decompose(position, quaternion, scale);
        position.y += currentYOffset; // Add the lift
        const newMatrix = new THREE.Matrix4().compose(position, quaternion, scale);
        liftedHexInfo.instancedMesh.setMatrixAt(liftedHexInfo.instanceId, newMatrix);
        liftedHexInfo.instancedMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // Sphere animation logic (existing)
    if (isSphereAnimating) {
      const elapsedTime = performance.now() - sphereAnimationStartTime;
      let progress = elapsedTime / sphereAnimationDuration;

      if (progress >= 1) {
        progress = 1;
        isSphereAnimating = false;
        // Clamp sphere Y to surfaceHeight
        let clampedY = Math.max(sphereAnimationTargetPos.y, surfaceHeight);
        sphereBody.position.set(sphereAnimationTargetPos.x, clampedY, sphereAnimationTargetPos.z); // Land at calculated target
        sphereBody.velocity.set(0,0,0); // Stop motion completely after segment
        sphereBody.angularVelocity.set(0,0,0);

        currentPathIndex++;
        if (currentPath.length > 0 && currentPathIndex < currentPath.length) {
          const nextStepNode = currentPath[currentPathIndex];
          sphereAnimationStartPos.copy(sphereBody.position);
          const sphereRadius = sphereBody.shapes[0].radius;

          // Raycast for next step's Y position
          const nextHexWorldPos = nextStepNode.worldPos;
          const rayFromNext = new CANNON.Vec3(nextHexWorldPos.x, MAX_HEIGHT + sphereRadius + 5, nextHexWorldPos.y);
          const rayToNext = new CANNON.Vec3(nextHexWorldPos.x, -MAX_HEIGHT, nextHexWorldPos.y);
          const resultNext = new CANNON.RaycastResult();
          world.raycastClosest(rayFromNext, rayToNext, { checkCollisionResponse: false }, resultNext);

          let nextTargetY = nextStepNode.baseHeight + sphereRadius;
          if (resultNext.hasHit) {
            nextTargetY = resultNext.hitPointWorld.y + sphereRadius + 0.075;
          }

          sphereAnimationTargetPos.set(nextStepNode.worldPos.x, nextTargetY, nextStepNode.worldPos.y);
          isSphereAnimating = true;
          sphereAnimationStartTime = performance.now();
        } else {
          // console.log("Full A* path traversed.");
          currentPath = []; // Clear the path once done
          currentPathIndex = 0;
        }
      } else {
        const newX = sphereAnimationStartPos.x + (sphereAnimationTargetPos.x - sphereAnimationStartPos.x) * progress;
        let newY = sphereAnimationStartPos.y + (sphereAnimationTargetPos.y - sphereAnimationStartPos.y) * progress;
        newY = Math.max(newY, surfaceHeight);
        const newZ = sphereAnimationStartPos.z + (sphereAnimationTargetPos.z - sphereAnimationStartPos.z) * progress;
        sphereBody.position.set(newX, newY, newZ);
      }
      // Keep sphere kinematic during animation
      sphereBody.velocity.set(0, 0, 0);
      sphereBody.angularVelocity.set(0, 0, 0);
    }

    sphereMesh.position.copy(sphereBody.position);
    // Clamp sphere visual y to the top of the hex it is over
    const sphereHex = getSphereCurrentHexCoords(sphereBody.position);
    if (sphereHex) {
      const hexNode = getHexNode(sphereHex.tileX, sphereHex.tileY);
      if (hexNode) {
        const topY = hexNode.baseHeight + radius;
        if (sphereMesh.position.y < topY) {
          sphereMesh.position.y = topY;
        }
      }
    }

    // Update additional spheres and apply random movement
    for (let i = 0; i < additionalSphereMeshes.length; i++) {
      const body = additionalSphereBodies[i];
      const mesh = additionalSphereMeshes[i];

      if (body && mesh) {
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);

        // Clamp additional ball y to at least surfaceHeight and top of hex
        const ballHex = getSphereCurrentHexCoords(body.position);
        if (ballHex) {
          const hexNode = getHexNode(ballHex.tileX, ballHex.tileY);
          if (hexNode) {
            const topY = Math.max(surfaceHeight, hexNode.baseHeight + radius);
            if (mesh.position.y < topY) {
              mesh.position.y = topY;
            }
          }
        }

        // Random movement logic
        const RANDOM_MOVEMENT_PROBABILITY = 0.005; // Adjust for more/less frequent changes
        const RANDOM_IMPULSE_STRENGTH = 5;    // Adjust for stronger/weaker pushes

        if (Math.random() < RANDOM_MOVEMENT_PROBABILITY) {
          const randomForce = new CANNON.Vec3(
            (Math.random() - 0.5) * 2 * RANDOM_IMPULSE_STRENGTH, // Random X
            Math.random() * RANDOM_IMPULSE_STRENGTH * 0.2,         // Slight random Y (small hops)
            (Math.random() - 0.5) * 2 * RANDOM_IMPULSE_STRENGTH  // Random Z
          );
          body.applyImpulse(randomForce, body.position); // Apply impulse at the center of the body
          if (body.sleepState === CANNON.Body.SLEEPING) {
            body.wakeUp();
          }
        }
      }
    }

    renderer.render(scene, camera);
    stats.end();
  });
})();

function tileToPosition(tileX, tileY) {
  return new Vector2((tileX + (tileY % 2) * 0.5) * 1.77, tileY * 1.535);
}

function hexGeometry(height, position) {
  let geo  = new CylinderGeometry(1, 1, height, 6, 1, false);
  geo.translate(position.x, height * 0.5, position.y);

  return geo;
}

const STONE_HEIGHT = MAX_HEIGHT * 0.8;
const DIRT_HEIGHT = MAX_HEIGHT * 0.7;
const GRASS_HEIGHT = MAX_HEIGHT * 0.5;
const SAND_HEIGHT = MAX_HEIGHT * 0.3;
const DIRT2_HEIGHT = MAX_HEIGHT * 0.15;

function hex(height, position, tileX, tileY, textures, envmap) {
  let baseGeo = hexGeometry(height, position);
  let textureType = "";
  let finalGeo = baseGeo;
  let material;

  // Determine material and merge additional geometries (trees, stones)
  if (height > STONE_HEIGHT) {
    textureType = "stone";
    material = hexMeshMaterial(textures.stone, envmap);
    if (Math.random() > 0.8) {
      finalGeo = mergeBufferGeometries([finalGeo, stone(height, position)]);
    }
  } else if (height > DIRT_HEIGHT) {
    textureType = "dirt";
    material = hexMeshMaterial(textures.dirt, envmap);
    if (Math.random() > 0.8) {
      finalGeo = mergeBufferGeometries([finalGeo, tree(height, position)]);
    }
  } else if (height > GRASS_HEIGHT) {
    textureType = "grass";
    material = hexMeshMaterial(textures.grass, envmap);
  } else if (height > SAND_HEIGHT) {
    textureType = "sand";
    material = hexMeshMaterial(textures.sand, envmap);
    if (Math.random() > 0.8) {
      const stoneScatterGeo = stone(height, position);
      if (stoneScatterGeo) finalGeo = mergeBufferGeometries([finalGeo, stoneScatterGeo]);
    }
  } else if (height > DIRT2_HEIGHT) {
    textureType = "dirt2";
    material = hexMeshMaterial(textures.dirt2, envmap);
  } else {
    return; // No hex to create
  }

  const mesh = new Mesh(finalGeo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  mesh.userData = {
    isHexTile: true,
    tileX: tileX,
    tileY: tileY,
    noiseHeight: height,
    worldPosition: position.clone(), // Store a copy
    textureType: textureType,
    baseHexHeight: height // The height parameter passed to hexGeometry
  };

  // Now that hexBody is initialized, add to scene and map
  scene.add(mesh);
  allHexMeshes.push(mesh); // Add to array for raycasting

  // Store hex data for pathfinding
  const mapKey = `${tileX},${tileY}`;
  hexDataMap.set(mapKey, {
    mesh: mesh,
    // body: hexBody, // REMOVED - No individual physics body for hexes anymore
    tileX: tileX,
    tileY: tileY,
    worldPos: position.clone(),
    baseHeight: height,
  });

  // REMOVED Individual hexBody creation and linking:
  // const hexShape = new CANNON.Cylinder(1, 1, height, 6);
  // const hexBody = new CANNON.Body({
  //   mass: 0,
  //   material: defaultMaterial
  // });
  // hexBody.addShape(hexShape);
  // hexBody.position.set(position.x, height * 0.5, position.y);
  // hexBody.userData = { threeMesh: mesh }; // Link C.Body to THREE.Mesh
  // world.addBody(hexBody); // Add to world after setup
}

// Renamed hexMesh to hexMeshMaterial to avoid confusion and return only material
function hexMeshMaterial(map, envmap) { // Added envmap parameter
  return new MeshPhysicalMaterial({
    envMap: envmap, // Use passed envmap
    envMapIntensity: 0.135,
    flatShading: true,
    map
  });
}

function tree(height, position) {
  const treeHeight = Math.random() * 1 + 1.25;

  const geo = new CylinderGeometry(0, 1.5, treeHeight, 3);
  geo.translate(position.x, height + treeHeight * 0 + 1, position.y);

  const geo2 = new CylinderGeometry(0, 1.15, treeHeight, 3);
  geo2.translate(position.x, height + treeHeight * 0.6 + 1, position.y);

  const geo3 = new CylinderGeometry(0, 0.8, treeHeight, 3);
  geo3.translate(position.x, height + treeHeight * 1.25 + 1, position.y);

  return mergeBufferGeometries([geo, geo2, geo3]);
}

function stone(height, position) {
  const px = Math.random() * 0.4;
  const pz = Math.random() * 0.4;

  const geo = new SphereGeometry(Math.random() * 0.3 + 0.1, 7, 7);
  geo.translate(position.x + px, height, position.y + pz);

  return geo;
}

/* // Removed clouds function
function clouds() {
  let geo = new SphereGeometry(0, 0, 0);
  let count = 1;

  for(let i = 0; i < count; i++) {
    const puff1 = new SphereGeometry(1.2, 7, 7);
    const puff2 = new SphereGeometry(1.5, 7, 7);
    const puff3 = new SphereGeometry(0.9, 7, 7);

    puff1.translate(-1.85, Math.random() * 0.3, 0);
    puff2.translate(0,     Math.random() * 0.3, 0);
    puff3.translate(1.85,  Math.random() * 0.3, 0);

    const cloudGeo = mergeBufferGeometries([puff1, puff2, puff3]);
    cloudGeo.translate(
      Math.random() * 20 - 10,
      Math.random() * 7 + 7,
      Math.random() * 20 - 10
    );
    cloudGeo.rotateY(Math.random() * Math.PI * 2);

    geo = mergeBufferGeometries([geo, cloudGeo]);
  }

  const mesh = new Mesh(
    geo,
    new MeshStandardMaterial({
      envMap: envmap,
      envMapIntensity: 0.75,
      flatShading: true,
      // transparent: true,
      // opacity: 0.85,
    })
  );

  scene.add(mesh);
}
*/

// Helper function to get a hex node for A*
function getHexNode(tileX, tileY) {
  return hexDataMap.get(`${tileX},${tileY}`);
}

// Helper to find the hex coordinates the sphere is currently on
function getSphereCurrentHexCoords(sphereBodyPos) {
  let closestHex = null;
  let minDistanceSq = Infinity;

  for (const [key, hexData] of hexDataMap) {
    const dx = sphereBodyPos.x - hexData.worldPos.x;
    // For y, we might want to check if it's reasonably above the hex, but for 2D grid mapping, x and z are primary.
    const dz = sphereBodyPos.z - hexData.worldPos.y; // Note: hexData.worldPos.y is used for Z in tileToPosition
    const distanceSq = dx * dx + dz * dz;

    if (distanceSq < minDistanceSq) {
      minDistanceSq = distanceSq;
      closestHex = hexData;
    }
  }
  return closestHex ? { tileX: closestHex.tileX, tileY: closestHex.tileY } : null;
}

// --- A* Pathfinding Logic ---
function aStarPathfinding(startCoords, targetCoords) {
  const openSet = new Map(); // Using Map for easier node updates: 'x,y' => node
  const closedSet = new Set(); // 'x,y' strings

  const startNode = getHexNode(startCoords.tileX, startCoords.tileY);
  if (!startNode) return []; // Start node not found

  const targetNode = getHexNode(targetCoords.tileX, targetCoords.tileY);
  if (!targetNode) return []; // Target node not found

  const startKey = `${startCoords.tileX},${startCoords.tileY}`;
  openSet.set(startKey, {
    ...startNode,
    gCost: 0,
    hCost: heuristic(startCoords, targetCoords),
    fCost: heuristic(startCoords, targetCoords),
    parent: null
  });

  while (openSet.size > 0) {
    let currentNodeEntry = null;
    for (const entry of openSet.entries()) { // Find node with lowest fCost
      if (currentNodeEntry === null || entry[1].fCost < currentNodeEntry[1].fCost) {
        currentNodeEntry = entry;
      }
    }

    const currentKey = currentNodeEntry[0];
    const currentNode = currentNodeEntry[1];

    if (currentKey === `${targetCoords.tileX},${targetCoords.tileY}`) {
      return reconstructPath(currentNode);
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    for (const neighborCoords of getHexNeighbors(currentNode.tileX, currentNode.tileY)) {
      const neighborKey = `${neighborCoords.tileX},${neighborCoords.tileY}`;
      if (closedSet.has(neighborKey)) continue;

      const neighborNodeData = getHexNode(neighborCoords.tileX, neighborCoords.tileY);
      if (!neighborNodeData) continue; // Neighbor doesn't exist or is an obstacle (TODO)

      const gCostToNeighbor = currentNode.gCost + 1; // Assuming cost of 1 to move to any neighbor

      let neighborNode = openSet.get(neighborKey);
      if (!neighborNode || gCostToNeighbor < neighborNode.gCost) {
        if (!neighborNode) {
          neighborNode = { ...neighborNodeData }; // Create new node if not in openSet
        }
        neighborNode.parent = currentNode;
        neighborNode.gCost = gCostToNeighbor;
        neighborNode.hCost = heuristic(neighborCoords, targetCoords);
        neighborNode.fCost = neighborNode.gCost + neighborNode.hCost;
        openSet.set(neighborKey, neighborNode);
      }
    }
  }
  return []; // Path not found
}

function heuristic(a, b) { // Hex-adapted Manhattan distance
  // This is a simplified heuristic for axial coordinates.
  // For true hex grid distance (cube coordinates): (abs(ax-bx) + abs(ay-by) + abs(az-bz)) / 2
  // Our tileX, tileY are more like axial, so we can use a variation.
  const dX = Math.abs(a.tileX - b.tileX);
  const dY = Math.abs(a.tileY - b.tileY);
  // A common axial distance heuristic: (abs(q1-q2) + abs(q1+r1 - q2-r2) + abs(r1-r2)) / 2
  // Simpler for now:
  return dX + dY; // This is not perfect for hex but a starting point.
  // A better heuristic: (Math.abs(a.tileX - b.tileX) + Math.abs(a.tileY - b.tileY) + Math.abs( (a.tileX - a.tileY) - (b.tileX - b.tileY) )) / 2;
  // Or using cube coordinates if we convert them.
}

function getHexNeighbors(tileX, tileY) {
  const neighbors = [];
  // Directions for even/odd rows in "pointy top" hex grid (based on tileToPosition logic)
  const isEvenRow = tileY % 2 === 0;
  const directions = [
    // [q, r] axial changes
    { tileX:  1, tileY:  0 }, { tileX: -1, tileY:  0 }, // Right, Left
    { tileX: isEvenRow ?  0 :  1, tileY: -1 }, { tileX: isEvenRow ? -1 :  0, tileY: -1 }, // UpperRight, UpperLeft
    { tileX: isEvenRow ?  0 :  1, tileY:  1 }, { tileX: isEvenRow ? -1 :  0, tileY:  1 }  // LowerRight, LowerLeft
  ];

  for (const dir of directions) {
    neighbors.push({ tileX: tileX + dir.tileX, tileY: tileY + dir.tileY });
  }
  return neighbors;
}

function reconstructPath(targetNode) {
  const path = [];
  let currentNode = targetNode;
  while (currentNode) {
    path.push({ tileX: currentNode.tileX, tileY: currentNode.tileY, worldPos: currentNode.worldPos, baseHeight: currentNode.baseHeight });
    currentNode = currentNode.parent;
  }
  return path.reverse();
}

// --- End A* Pathfinding Logic ---

const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: memory
document.body.appendChild(stats.dom);

function worldPointToHexCoords(worldPoint) {
  let closestHexData = null;
  let minDistanceSq = Infinity;
  const pX = worldPoint.x;
  const pZ = worldPoint.z; // Assuming worldPoint.z is the ground plane Z

  for (const [key, hexData] of hexDataMap) {
    // hexData.worldPos is a THREE.Vector2 where .y represents the Z in world space
    const dx = pX - hexData.worldPos.x;
    const dz = pZ - hexData.worldPos.y;
    const distanceSq = dx * dx + dz * dz;

    if (distanceSq < minDistanceSq) {
      minDistanceSq = distanceSq;
      closestHexData = hexData;
    }
  }

  // Threshold to ensure the click is reasonably close to a hex center.
  // The value 1.77 is based on hex spacing, (elementSize * 0.5)^2 might be more robust if elementSize is accurate.
  // A hex cell's approximate radius is 1 (since CylinderGeometry has radius 1).
  // So, if the hit is within roughly 1 world unit of a hex center, it's a match.
  if (closestHexData && minDistanceSq < (1.0 * 1.0)) {
    return { tileX: closestHexData.tileX, tileY: closestHexData.tileY };
  }
  return null; // No hex found within threshold
}