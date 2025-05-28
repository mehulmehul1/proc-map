import {
  WebGLRenderer, ACESFilmicToneMapping, sRGBEncoding,
  Color, CylinderGeometry,
  RepeatWrapping, DoubleSide, BoxGeometry, Mesh, PointLight, MeshPhysicalMaterial, PerspectiveCamera,
  Scene, PMREMGenerator, PCFSoftShadowMap,
  Vector2, TextureLoader, SphereGeometry, MeshStandardMaterial, Raycaster, Vector3
} from 'https://cdn.skypack.dev/three@0.137';
import { OrbitControls } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/controls/OrbitControls';
import { RGBELoader } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/loaders/RGBELoader';
import { mergeBufferGeometries } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/utils/BufferGeometryUtils';
import SimplexNoise from 'https://cdn.skypack.dev/simplex-noise@3.0.0';
import * as CANNON from 'cannon-es';

// envmap https://polyhaven.com/a/herkulessaulen

const scene = new Scene();
scene.background = new Color("#FFEECC");

const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0), // m/s²
  // Do not pass solver options directly here unless it's a solver instance
});
world.solver.iterations = 20; // Set iterations on the default solver

// Define a default contact material
const defaultMaterial = new CANNON.Material("default");
const defaultContactMaterial = new CANNON.ContactMaterial(
  defaultMaterial,
  defaultMaterial,
  {
    friction: 0.5,      // একটু ঘর্ষণ (a bit of friction)
    restitution: 0.3    // মাঝারি প্রত্যাবর্তন (moderate restitution)
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
const hexDataMap = new Map(); // To store hex data for pathfinding: 'x,y' => { mesh, body, tileX, tileY, worldPos, baseHeight }

(async function() {
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

  const simplex = new SimplexNoise(); // optional seed as a string parameter

  for(let i = -40; i <= 40; i++) {
    for(let j = -40; j <= 40; j++) {
      let position = tileToPosition(i, j);
      if(position.length() > 32) continue;
      let noise = (simplex.noise2D(i * 0.1, j * 0.1) + 1) * 0.5;
      noise = Math.pow(noise, 1.5);
      hex(noise * MAX_HEIGHT, position, i, j, textures, envmap); // Pass textures and envmap
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
    material: defaultMaterial
  });
  sphereBody.position.set(0, 15, 0); // m
  world.addBody(sphereBody);

  // Create the visual sphere
  const sphereGeometry = new SphereGeometry(radius);
  const sphereMaterial = new MeshStandardMaterial({
    color: 0xff0000,
    envMap: envmap,
  });
  const sphereMesh = new Mesh(sphereGeometry, sphereMaterial);
  sphereMesh.castShadow = true;
  sphereMesh.receiveShadow = true;
  scene.add(sphereMesh);

  let isSphereAnimating = false;
  let sphereAnimationStartTime = 0;
  const sphereAnimationDuration = 300; // ms, e.g., 0.3 seconds for animation between two hexes
  let sphereAnimationStartPos = new CANNON.Vec3();
  let sphereAnimationTargetPos = new CANNON.Vec3();
  let currentPath = []; // To store the A* path being traversed
  let currentPathIndex = 0; // To track the current segment of the path

  const mouse = new Vector2();

  renderer.domElement.addEventListener('mousedown', onMouseDown, false);

  function onMouseDown(event) {
    event.preventDefault();

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

    const cameraDirection = new Vector3();
    camera.getWorldDirection(cameraDirection);

    const rayFromThree = new Vector3();
    camera.getWorldPosition(rayFromThree);

    const rayToThree = new Vector3();
    rayToThree.set(mouse.x, mouse.y, 0.5); // NDC Z value between -1 and 1
    rayToThree.unproject(camera); // Convert NDC to world coordinates
    // Now rayToThree is a point in world space on the camera's viewing frustum that corresponds to the mouse click.
    // For cannon-es, we need a direction and a far point.

    const rayDirection = new Vector3().subVectors(rayToThree, rayFromThree).normalize();
    const farPoint = new Vector3().addVectors(rayFromThree, rayDirection.multiplyScalar(1000)); // 1000 is a large distance

    const rayFromCannon = new CANNON.Vec3(rayFromThree.x, rayFromThree.y, rayFromThree.z);
    const rayToCannon = new CANNON.Vec3(farPoint.x, farPoint.y, farPoint.z);

    const result = new CANNON.RaycastResult();
    const rayOptions = {
        checkCollisionResponse: true, // Check if body has collision response
        // collisionFilterGroup: 1, // Optional: ensure ray only hits default group if you use groups
        // collisionFilterMask: -1 // Optional: ensure ray hits everything
    };

    world.raycastClosest(rayFromCannon, rayToCannon, rayOptions, result);

    if (result.hasHit) {
      const hitBody = result.body; // This is the CANNON.Body of the hex
      if (hitBody.userData && hitBody.userData.threeMesh) {
        const clickedHexMesh = hitBody.userData.threeMesh;
        if (clickedHexMesh.userData.isHexTile) {
          // console.log("Clicked Hex Properties (via Cannon-ES Raycast):");
          // console.log("  Tile Coordinates (X, Y):", clickedHexMesh.userData.tileX, ",", clickedHexMesh.userData.tileY);
          // console.log("  Noise Height (generated):", clickedHexMesh.userData.noiseHeight);
          // console.log("  Base Hex Height (geometry):", clickedHexMesh.userData.baseHexHeight);
          // console.log("  Texture Type:", clickedHexMesh.userData.textureType);
          // console.log("  World Position (logical):", clickedHexMesh.userData.worldPosition);
          // console.log("  Mesh Position (actual):", clickedHexMesh.position);
          // console.log("  Hit Cannon Body ID:", hitBody.id);
          // console.log("  Full Mesh userData:", clickedHexMesh.userData);

          // Start animation for the sphere to the clicked hex
          if (!isSphereAnimating) {
            const startHexCoords = getSphereCurrentHexCoords(sphereBody.position);
            const targetHexCoords = { tileX: clickedHexMesh.userData.tileX, tileY: clickedHexMesh.userData.tileY };

            if (startHexCoords) {
              // console.log("Calculating A* path from", startHexCoords, "to", targetHexCoords);
              currentPath = aStarPathfinding(startHexCoords, targetHexCoords); // Store the full path
              // console.log("A* Path:", currentPath);

              if (currentPath.length > 0) {
                currentPathIndex = 0; // Start at the beginning of the path
                // Initiate animation to the first step
                const firstStepNode = currentPath[currentPathIndex];
                sphereAnimationStartPos.copy(sphereBody.position);
                const sphereRadius = sphereBody.shapes[0].radius;
                const targetY = firstStepNode.baseHeight + sphereRadius;
                sphereAnimationTargetPos.set(firstStepNode.worldPos.x, targetY, firstStepNode.worldPos.y); // worldPos.y is Z

                isSphereAnimating = true;
                sphereAnimationStartTime = performance.now();
                // console.log(`Sphere animating to A* step ${currentPathIndex}: x=${firstStepNode.worldPos.x.toFixed(2)}, y=${targetY.toFixed(2)}, z=${firstStepNode.worldPos.y.toFixed(2)}`);
              } else {
                // console.log("A* path not found or empty.");
                currentPath = []; // Clear path if not found
              }
            } else {
              // console.log("Could not determine sphere's current hex.");
            }
          }
        }
      } else {
        // console.log("Cannon-ES Ray hit a body with no linked threeMesh or userData:", hitBody);
      }
    } else {
      // console.log("No hit with Cannon-ES raycast");
    }
  }

  renderer.setAnimationLoop(() => {
    controls.update();

    const time = performance.now() / 1000; // seconds
    if (!lastCallTime) {
      world.step(timeStep);
    } else {
      const dt = time - lastCallTime;
      world.step(timeStep, dt);
    }
    lastCallTime = time;

    if (isSphereAnimating) {
      const elapsedTime = performance.now() - sphereAnimationStartTime;
      let progress = elapsedTime / sphereAnimationDuration;

      if (progress >= 1) {
        progress = 1;
        isSphereAnimating = false; // Current segment finished
        sphereBody.position.copy(sphereAnimationTargetPos);
        // console.log("Sphere animation segment finished.");

        currentPathIndex++; // Move to the next segment
        if (currentPath.length > 0 && currentPathIndex < currentPath.length) {
          // Start animation for the next segment
          const nextStepNode = currentPath[currentPathIndex];
          sphereAnimationStartPos.copy(sphereBody.position); // Start from current position
          const sphereRadius = sphereBody.shapes[0].radius;
          const targetY = nextStepNode.baseHeight + sphereRadius;
          sphereAnimationTargetPos.set(nextStepNode.worldPos.x, targetY, nextStepNode.worldPos.y);

          isSphereAnimating = true;
          sphereAnimationStartTime = performance.now();
          // console.log(`Sphere animating to A* step ${currentPathIndex}: x=${nextStepNode.worldPos.x.toFixed(2)}, y=${targetY.toFixed(2)}, z=${nextStepNode.worldPos.y.toFixed(2)}`);
        } else {
          // console.log("Full A* path traversed.");
          currentPath = []; // Clear the path once done
          currentPathIndex = 0;
        }
      } else {
        const newX = sphereAnimationStartPos.x + (sphereAnimationTargetPos.x - sphereAnimationStartPos.x) * progress;
        const newY = sphereAnimationStartPos.y + (sphereAnimationTargetPos.y - sphereAnimationStartPos.y) * progress;
        const newZ = sphereAnimationStartPos.z + (sphereAnimationTargetPos.z - sphereAnimationStartPos.z) * progress;
        sphereBody.position.set(newX, newY, newZ);
      }
      // Keep sphere kinematic during animation
      sphereBody.velocity.set(0, 0, 0);
      sphereBody.angularVelocity.set(0, 0, 0);
    }

    sphereMesh.position.copy(sphereBody.position);
    sphereMesh.quaternion.copy(sphereBody.quaternion);

    renderer.render(scene, camera);
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
const DIRT2_HEIGHT = MAX_HEIGHT * 0;

function hex(height, position, tileX, tileY, textures, envmap) { // Added textures, envmap parameters
  let baseGeo = hexGeometry(height, position);
  let textureType = "";
  let finalGeo = baseGeo;
  let material;

  // Determine material and merge additional geometries (trees, stones)
  if (height > STONE_HEIGHT) {
    textureType = "stone";
    material = hexMeshMaterial(textures.stone, envmap); // Pass envmap
    if (Math.random() > 0.8) {
      finalGeo = mergeBufferGeometries([finalGeo, stone(height, position)]);
    }
  } else if (height > DIRT_HEIGHT) {
    textureType = "dirt";
    material = hexMeshMaterial(textures.dirt, envmap); // Pass envmap
    if (Math.random() > 0.8) {
      finalGeo = mergeBufferGeometries([finalGeo, tree(height, position)]);
    }
  } else if (height > GRASS_HEIGHT) {
    textureType = "grass";
    material = hexMeshMaterial(textures.grass, envmap); // Pass envmap
  } else if (height > SAND_HEIGHT) {
    textureType = "sand";
    material = hexMeshMaterial(textures.sand, envmap); // Pass envmap
    if (Math.random() > 0.8) {
      // Ensure stone geometry can be added if it's a different type
      const stoneScatterGeo = stone(height, position);
      if (stoneScatterGeo) finalGeo = mergeBufferGeometries([finalGeo, stoneScatterGeo]);
    }
  } else if (height > DIRT2_HEIGHT) {
    textureType = "dirt2";
    material = hexMeshMaterial(textures.dirt2, envmap); // Pass envmap
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

  // Create and setup the physics body FIRST
  const hexShape = new CANNON.Cylinder(1, 1, height, 6);
  const hexBody = new CANNON.Body({
    mass: 0,
    material: defaultMaterial
  });
  hexBody.addShape(hexShape);
  hexBody.position.set(position.x, height * 0.5, position.y);
  hexBody.userData = { threeMesh: mesh }; // Link C.Body to THREE.Mesh
  world.addBody(hexBody); // Add to world after setup

  // Now that hexBody is initialized, add to scene and map
  scene.add(mesh);
  allHexMeshes.push(mesh); // Add to array for raycasting

  const mapKey = `${tileX},${tileY}`;
  hexDataMap.set(mapKey, {
    mesh: mesh,
    body: hexBody, // Now hexBody is initialized
    tileX: tileX,
    tileY: tileY,
    worldPos: position.clone(),
    baseHeight: height,
  });
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