import { useEffect, useRef } from "react";
import * as THREE from "https://cdn.skypack.dev/three@0.137";

import { OrbitControls } from "https://cdn.skypack.dev/three-stdlib@2.8.5/controls/OrbitControls";
import { RGBELoader } from "https://cdn.skypack.dev/three-stdlib@2.8.5/loaders/RGBELoader";
import { mergeBufferGeometries } from "https://cdn.skypack.dev/three-stdlib@2.8.5/utils/BufferGeometryUtils";
import SimplexNoise from "https://cdn.skypack.dev/simplex-noise@3.0.0";
const ASSETS = {
  dirt: "/assets/dirt.png",
  dirt2: "/assets/dirt2.jpg",
  envmap: "/assets/envmap.hdr",
  grass: "/assets/grass.jpg",
  sand: "/assets/sand.jpg",
  water: "/assets/water.jpg",
  stone: "/assets/stone.png",
};

const MAX_HEIGHT = 10;
const STONE_HEIGHT = MAX_HEIGHT * 0.8;
const DIRT_HEIGHT = MAX_HEIGHT * 0.7;
const GRASS_HEIGHT = MAX_HEIGHT * 0.5;
const SAND_HEIGHT = MAX_HEIGHT * 0.3;
const DIRT2_HEIGHT = MAX_HEIGHT * 0;

function tileToPosition(tileX, tileY) {
  return new THREE.Vector2((tileX + (tileY % 2) * 0.5) * 1.77, tileY * 1.535);
}

function hexGeometry(height, position) {
  let geo = new THREE.CylinderGeometry(1, 1, height, 6, 1, false);
  geo.translate(position.x, height * 0.5, position.y);
  return geo;
}

function tree(height, position) {
  const treeHeight = Math.random() * 1 + 1.25;
  const geo = new THREE.CylinderGeometry(0, 1.5, treeHeight, 3);
  geo.translate(position.x, height + treeHeight * 0 + 1, position.y);
  const geo2 = new THREE.CylinderGeometry(0, 1.15, treeHeight, 3);
  geo2.translate(position.x, height + treeHeight * 0.6 + 1, position.y);
  const geo3 = new THREE.CylinderGeometry(0, 0.8, treeHeight, 3);
  geo3.translate(position.x, height + treeHeight * 1.25 + 1, position.y);
  return mergeBufferGeometries([geo, geo2, geo3]);
}

function stone(height, position) {
  const px = Math.random() * 0.4;
  const pz = Math.random() * 0.4;
  const geo = new THREE.SphereGeometry(Math.random() * 0.3 + 0.1, 7, 7);
  geo.translate(position.x + px, height, position.y + pz);
  return geo;
}

function App() {
  const mountRef = useRef();

  useEffect(() => {
    let animationId;
    let renderer;
    let pmrem;
    // container will be mountRef.current, which is stable

    async function setupScene() {
      // Ensure mountRef.current is available before proceeding
      if (!mountRef.current) {
        console.error("Mount point not found at effect run time");
        return () => {}; // Return an empty cleanup function
      }
      const container = mountRef.current;

      let scene, camera, controls, envmap;
      let stoneGeo = new THREE.BoxGeometry(0, 0, 0);
      let dirtGeo = new THREE.BoxGeometry(0, 0, 0);
      let dirt2Geo = new THREE.BoxGeometry(0, 0, 0);
      let sandGeo = new THREE.BoxGeometry(0, 0, 0);
      let grassGeo = new THREE.BoxGeometry(0, 0, 0);
      let hexagonData = []; // Moved here to be accessible in onCanvasClick and cleanup

      // Declare onCanvasClick here so it's in scope for the cleanup function
      let onCanvasClick;

      let width = container.clientWidth;
      let height = container.clientHeight;

      scene = new THREE.Scene();
      scene.background = new THREE.Color("#FFEECC");
      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(-17, 31, 33);

      renderer = new THREE.WebGLRenderer({ antialias: true }); // Assign to higher scope renderer
      renderer.setSize(width, height);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.physicallyCorrectLights = true;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      const light = new THREE.PointLight(
        new THREE.Color("#FFCB8E").convertSRGBToLinear().convertSRGBToLinear(),
        80,
        200
      );
      light.position.set(10, 20, 10);
      light.castShadow = true;
      light.shadow.mapSize.width = 1024;
      light.shadow.mapSize.height = 1024;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 500;
      scene.add(light);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.dampingFactor = 0.05;
      controls.enableDamping = true;

      pmrem = new THREE.PMREMGenerator(renderer); // Assign to higher scope pmrem
      pmrem.compileEquirectangularShader();

      const loadingManager = new THREE.LoadingManager();
      const textureLoader = new THREE.TextureLoader(loadingManager);
      let textures = {};

      try {
        console.log("Attempting to load HDR envmap via loadAsync...");
        const hdrTexture = await new RGBELoader().loadAsync(ASSETS.envmap);
        textures.envmap = hdrTexture;
        console.log(
          "HDR envmap loaded successfully via loadAsync:",
          textures.envmap
        );
      } catch (error) {
        console.error("Failed to load HDR envmap with loadAsync:", error);
        // HDR load failed, critical error, potentially stop here or use fallback
        // For now, the check below will catch it and prevent further errors.
      }

      // This function will be called when all non-HDR textures are loaded
      const onRegularTexturesLoaded = () => {
        if (
          !textures.envmap ||
          typeof textures.envmap.mapping === "undefined"
        ) {
          console.error(
            "HDR envmap (expected from loadAsync) not loaded or invalid at scene setup:",
            textures.envmap
          );
          return; // Stop if HDR map is not ready
        }
        envmap = pmrem.fromEquirectangular(textures.envmap).texture;

        // ... (rest of your scene setup, terrain generation, mesh creation, etc.)
        const simplex = new SimplexNoise();
        for (let i = -45; i <= 45; i++) {
          for (let j = -45; j <= 45; j++) {
            let position = tileToPosition(i, j);
            if (position.length() > 36) continue;
            let noiseVal = (simplex.noise2D(i * 0.1, j * 0.1) + 1) * 0.5;
            noiseVal = Math.pow(noiseVal, 1.5);
            let hexHeight = noiseVal * MAX_HEIGHT;
            // let currentHexGeo = hexGeometry(hexHeight, position); // Create it here for data // REMOVE THIS LINE

            let materialType = "unknown";
            let currentHexGeo; // Declare here, define in branches

            if (hexHeight > STONE_HEIGHT) {
              currentHexGeo = hexGeometry(hexHeight, position);
              stoneGeo = mergeBufferGeometries([currentHexGeo, stoneGeo]);
              materialType = "stone";
              if (Math.random() > 0.8) {
                stoneGeo = mergeBufferGeometries([
                  stoneGeo,
                  stone(hexHeight, position),
                ]);
              }
            } else if (hexHeight > DIRT_HEIGHT) {
              currentHexGeo = hexGeometry(hexHeight, position);
              dirtGeo = mergeBufferGeometries([currentHexGeo, dirtGeo]);
              materialType = "dirt";
              if (Math.random() > 0.8) {
                // TODO: Review tree logic - currently adds to grassGeo, consider separate treeGeo or merge with dirtGeo
                grassGeo = mergeBufferGeometries([
                  grassGeo,
                  tree(hexHeight, position),
                ]);
              }
            } else if (hexHeight > GRASS_HEIGHT) {
              currentHexGeo = hexGeometry(hexHeight, position);
              grassGeo = mergeBufferGeometries([currentHexGeo, grassGeo]);
              materialType = "grass";
            } else if (hexHeight > SAND_HEIGHT) {
              currentHexGeo = hexGeometry(hexHeight, position);
              sandGeo = mergeBufferGeometries([currentHexGeo, sandGeo]);
              materialType = "sand";
              if (Math.random() > 0.8 && stoneGeo) {
                stoneGeo = mergeBufferGeometries([
                  stoneGeo,
                  stone(hexHeight, position),
                ]);
              }
            } else {
              // Covers hexHeight <= SAND_HEIGHT (e.g., DIRT2_HEIGHT which is 0, and potentially negative if noise was unconstrained)
              let geomHeight = Math.max(hexHeight, 0.01); // Ensure minimum 0.01 height for geometry
              currentHexGeo = hexGeometry(geomHeight, position); // Use geomHeight for the actual cylinder
              dirt2Geo = mergeBufferGeometries([currentHexGeo, dirt2Geo]);
              materialType = "dirt2"; // Classify as dirt2
            }

            // Store data for this hexagon, using the original logical hexHeight
            // materialType will always be assigned now for hexes within the radius
            hexagonData.push({
              gridX: i,
              gridY: j,
              worldPosition: position.clone(),
              height: hexHeight, // Store the original logical height for game logic
              materialType: materialType,
              id: `hex_${i}_${j}`, // Unique ID for each hex
              // Keep a reference to the geometry for precise Y, or use height for center
              // For A*, we need to find neighbors easily using gridX, gridY
            });
          }
        }

        function hexMesh(geo, map) {
          if (map && typeof map.mapping === "undefined") {
            console.warn(
              "hexMesh received an invalid map object that is not a Texture:",
              map
            );
            // Optionally, use a fallback or don't assign the map
            // For now, we'll proceed, but this indicates a problem with texture loading/assignment for this specific map.
          }
          let mat = new THREE.MeshPhysicalMaterial({
            envMap: envmap,
            envMapIntensity: 0.135,
            flatShading: true,
            map: map instanceof THREE.Texture ? map : undefined,
          });
          let mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          return mesh;
        }

        let stoneMesh = hexMesh(textures.stone && stoneGeo, textures.stone);
        let grassMesh = hexMesh(textures.grass && grassGeo, textures.grass);
        let dirt2Mesh = hexMesh(textures.dirt2 && dirt2Geo, textures.dirt2);
        let dirtMesh = hexMesh(textures.dirt && dirtGeo, textures.dirt);
        let sandMesh = hexMesh(textures.sand && sandGeo, textures.sand);
        scene.add(stoneMesh, dirtMesh, dirt2Mesh, sandMesh, grassMesh);

        let seaTexture = textures.water;
        seaTexture.repeat = new THREE.Vector2(1, 1);
        seaTexture.wrapS = THREE.RepeatWrapping;
        seaTexture.wrapT = THREE.RepeatWrapping;
        let seaMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(17, 17, MAX_HEIGHT * 0.2, 50),
          new THREE.MeshPhysicalMaterial({
            envMap: envmap,
            color: new THREE.Color("#55aaff")
              .convertSRGBToLinear()
              .multiplyScalar(3),
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

        let mapContainer = new THREE.Mesh(
          new THREE.CylinderGeometry(
            17.1,
            17.1,
            MAX_HEIGHT * 0.25,
            50,
            1,
            true
          ),
          new THREE.MeshPhysicalMaterial({
            envMap: envmap,
            map: textures.dirt,
            envMapIntensity: 0.2,
            side: THREE.DoubleSide,
          })
        );
        mapContainer.receiveShadow = true;
        mapContainer.rotation.y = -Math.PI * 0.333 * 0.5;
        mapContainer.position.set(0, MAX_HEIGHT * 0.125, 0);
        scene.add(mapContainer);

        let mapFloor = new THREE.Mesh(
          new THREE.CylinderGeometry(18.5, 18.5, MAX_HEIGHT * 0.1, 50),
          new THREE.MeshPhysicalMaterial({
            envMap: envmap,
            map: textures.dirt2,
            envMapIntensity: 0.1,
            side: THREE.DoubleSide,
          })
        );
        mapFloor.receiveShadow = true;
        mapFloor.position.set(0, -MAX_HEIGHT * 0.05, 0);
        scene.add(mapFloor);

        function clouds() {
          let geo = new THREE.SphereGeometry(0, 0, 0);
          let count = Math.floor(Math.pow(Math.random(), 0.45) * 4);
          for (let i = 0; i < count; i++) {
            const puff1 = new THREE.SphereGeometry(1.2, 7, 7);
            const puff2 = new THREE.SphereGeometry(1.5, 7, 7);
            const puff3 = new THREE.SphereGeometry(0.9, 7, 7);
            puff1.translate(-1.85, Math.random() * 0.3, 0);
            puff2.translate(0, Math.random() * 0.3, 0);
            puff3.translate(1.85, Math.random() * 0.3, 0);
            const cloudGeo = mergeBufferGeometries([puff1, puff2, puff3]);
            cloudGeo.translate(
              Math.random() * 20 - 10,
              Math.random() * 7 + 7,
              Math.random() * 20 - 10
            );
            cloudGeo.rotateY(Math.random() * Math.PI * 2);
            geo = mergeBufferGeometries([geo, cloudGeo]);
          }
          const mesh = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({
              envMap: envmap,
              envMapIntensity: 0.75,
              flatShading: true,
            })
          );
          scene.add(mesh);
        }
        clouds();

        // Big Stone Sprite Initialization
        let bigStoneSprite = null;
        let bigStonePath = []; // Path for the big stone (array of Vector3)
        let bigStoneHexDataPath = []; // Path for the big stone (array of hex data objects)
        let bigStoneProgress = 0;
        const bigStoneSpeed = 0.05; // << INCREASED SPEED
        let bigStoneCurrentPathSegment = 0;
        let currentBigStoneHex = null; // The hex the big stone is currently on or was last on

        // Create the big stone sprite
        const bigSpriteGeo = new THREE.SphereGeometry(0.8, 12, 10); // Larger stone
        const bigSpriteMat = new THREE.MeshStandardMaterial({
          color: 0x6c757d,
          roughness: 0.7,
          metalness: 0.3,
        });
        bigStoneSprite = new THREE.Mesh(bigSpriteGeo, bigSpriteMat);
        bigStoneSprite.castShadow = true;
        bigStoneSprite.name = "bigStoneSprite"; // For debugging

        // Initial placement (e.g., on the first hex if available)
        if (hexagonData.length > 0) {
          currentBigStoneHex = hexagonData[0];
          bigStoneSprite.position.set(
            currentBigStoneHex.worldPosition.x,
            currentBigStoneHex.height + 0.8,
            currentBigStoneHex.worldPosition.y
          );
          scene.add(bigStoneSprite);
        } else {
          console.warn("No hexagons available to place the big stone sprite.");
          bigStoneSprite = null; // Can't use if no hexes
        }

        // Remove or comment out the small stone sprite logic for now to avoid confusion
        // let stoneSprite = null;
        // ... (rest of small stone sprite logic) ...

        // Raycasting and click handling (modified for big stone target)
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        // Ensure interactiveMeshes are defined after they are created
        let interactiveMeshes = [
          stoneMesh,
          dirtMesh,
          dirt2Mesh,
          sandMesh,
          grassMesh,
        ].filter(
          (mesh) => mesh && mesh.geometry && mesh.geometry.index !== null
        );

        // Define onCanvasClick (it was declared in the outer scope)
        onCanvasClick = (event) => {
          const rect = renderer.domElement.getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(interactiveMeshes);

          if (intersects.length > 0) {
            const intersectionPoint = intersects[0].point;
            let closestHex = null;
            let minDistanceSq = Infinity;

            hexagonData.forEach((hex) => {
              const dx = hex.worldPosition.x - intersectionPoint.x;
              const dz = hex.worldPosition.y - intersectionPoint.z;
              const distanceSq = dx * dx + dz * dz;

              if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                closestHex = hex;
              }
            });

            if (closestHex && minDistanceSq < 2 * 2) {
              console.log("Target Hexagon Selected:", closestHex);
              if (
                bigStoneSprite &&
                currentBigStoneHex &&
                currentBigStoneHex.id !== closestHex.id
              ) {
                const returnedPath = findPathAStar(
                  currentBigStoneHex,
                  closestHex,
                  hexagonData
                );
                if (returnedPath && returnedPath.length > 0) {
                  bigStoneHexDataPath = returnedPath; // Store the array of hex data objects
                  bigStonePath = bigStoneHexDataPath.map(
                    (hex) =>
                      new THREE.Vector3(
                        hex.worldPosition.x,
                        hex.height + 0.8,
                        hex.worldPosition.y
                      )
                  );
                  bigStoneProgress = 0;
                  bigStoneCurrentPathSegment = 0;
                  console.log(
                    "A* Path for big stone found, target:",
                    closestHex.id,
                    "Path length:",
                    bigStoneHexDataPath.length
                  );
                } else {
                  console.log("No path found or target is current hex.");
                  bigStonePath = [];
                  bigStoneHexDataPath = [];
                }
              }
            }
          }
        };
        if (renderer && renderer.domElement) {
          // Ensure renderer.domElement exists
          renderer.domElement.addEventListener("click", onCanvasClick);
        }

        function animate() {
          controls.update();

          if (
            bigStoneSprite &&
            bigStonePath.length > 0 &&
            bigStoneCurrentPathSegment < bigStonePath.length - 1
          ) {
            const currentSegmentStart =
              bigStonePath[bigStoneCurrentPathSegment];
            const currentSegmentEnd =
              bigStonePath[bigStoneCurrentPathSegment + 1];

            bigStoneProgress += bigStoneSpeed;

            if (bigStoneProgress >= 1.0) {
              bigStoneProgress = 0;
              bigStoneCurrentPathSegment++;

              // Update currentBigStoneHex from the stored hex data path
              if (bigStoneHexDataPath[bigStoneCurrentPathSegment]) {
                currentBigStoneHex =
                  bigStoneHexDataPath[bigStoneCurrentPathSegment];
              } else {
                // This case should ideally not be hit if path logic is correct
                // but as a fallback, try to find from Vector3 path's last point if at end
                if (
                  bigStoneCurrentPathSegment >= bigStonePath.length - 1 &&
                  bigStonePath.length > 0
                ) {
                  const lastPathPoint = bigStonePath[bigStonePath.length - 1];
                  currentBigStoneHex = hexagonData.find(
                    (h) =>
                      h.worldPosition.x === lastPathPoint.x &&
                      h.worldPosition.y === lastPathPoint.z
                  );
                }
              }

              if (bigStoneCurrentPathSegment >= bigStonePath.length - 1) {
                console.log(
                  "Big stone reached destination:",
                  currentBigStoneHex ? currentBigStoneHex.id : "Unknown"
                );
                bigStonePath = [];
                bigStoneHexDataPath = [];
              }
            }

            if (
              bigStonePath.length > 0 &&
              bigStoneCurrentPathSegment < bigStonePath.length - 1
            ) {
              bigStoneSprite.position.lerpVectors(
                currentSegmentStart,
                currentSegmentEnd,
                bigStoneProgress
              );

              // Y-Positioning via downward raycast
              const downRaycaster = new THREE.Raycaster(
                new THREE.Vector3(
                  bigStoneSprite.position.x,
                  MAX_HEIGHT + 1,
                  bigStoneSprite.position.z
                ),
                new THREE.Vector3(0, -1, 0)
              );
              const terrainIntersects = downRaycaster.intersectObjects(
                interactiveMeshes,
                false
              );
              if (terrainIntersects.length > 0) {
                bigStoneSprite.position.y = terrainIntersects[0].point.y + 0.8; // 0.8 is bigStoneSprite radius
              } else {
                // Log when the raycast misses, to help debug blinking
                console.warn(
                  "Downward raycast for Y-positioning missed terrain at XZ:",
                  bigStoneSprite.position.x,
                  bigStoneSprite.position.z,
                  "Maintaining Y from lerp/previous."
                );
              }
            } else if (
              bigStonePath.length > 0 &&
              bigStoneCurrentPathSegment === bigStonePath.length - 1
            ) {
              bigStoneSprite.position.copy(
                bigStonePath[bigStoneCurrentPathSegment]
              );
              // Ensure Y is correct on the final hex as well
              const finalHexYRaycaster = new THREE.Raycaster(
                new THREE.Vector3(
                  bigStoneSprite.position.x,
                  MAX_HEIGHT + 1,
                  bigStoneSprite.position.z
                ),
                new THREE.Vector3(0, -1, 0)
              );
              const finalTerrainIntersects =
                finalHexYRaycaster.intersectObjects(interactiveMeshes, false);
              if (finalTerrainIntersects.length > 0) {
                bigStoneSprite.position.y =
                  finalTerrainIntersects[0].point.y + 0.8;
              } else {
                console.warn(
                  "Downward raycast for Y-positioning (FINAL HEX) missed terrain at XZ:",
                  bigStoneSprite.position.x,
                  bigStoneSprite.position.z
                );
              }

              // currentBigStoneHex should already be set to the final hex by the logic above when segment increments
              if (
                !currentBigStoneHex ||
                currentBigStoneHex.worldPosition.x !==
                  bigStonePath[bigStoneCurrentPathSegment].x ||
                currentBigStoneHex.worldPosition.y !==
                  bigStonePath[bigStoneCurrentPathSegment].z
              ) {
                // Fallback if currentBigStoneHex wasn't updated correctly to the last segment's end point
                const lastPathPoint = bigStonePath[bigStoneCurrentPathSegment];
                currentBigStoneHex = hexagonData.find(
                  (h) =>
                    h.worldPosition.x === lastPathPoint.x &&
                    h.worldPosition.y === lastPathPoint.z
                );
              }
              console.log(
                "Big stone snapped to final destination:",
                currentBigStoneHex ? currentBigStoneHex.id : "Unknown"
              );
              bigStonePath = [];
              bigStoneHexDataPath = [];
            }
          }
          // ... (rest of small stone sprite animation, if kept) ...

          renderer.render(scene, camera);
          animationId = requestAnimationFrame(animate);
        }
        animate();

        // --- A* Pathfinding Implementation ---
        function getHexNeighbors(currentHex, allHexData) {
          const neighbors = [];
          // Directions for "odd-r" or "even-r" axial coordinates.
          // This needs to match your tileToPosition logic for how gridX, gridY relate.
          // Assuming "odd-r" (y-axis corresponds to rows, x-axis to columns)
          // For an even row (gridY % 2 === 0):
          // (x+1, y), (x-1, y), (x, y+1), (x, y-1), (x-1, y+1), (x-1, y-1)
          // For an odd row (gridY % 2 !== 0):
          // (x+1, y), (x-1, y), (x, y+1), (x, y-1), (x+1, y+1), (x+1, y-1)

          const directions =
            currentHex.gridY % 2 === 0
              ? [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                  [-1, 1],
                  [-1, -1], // Even rows
                ]
              : [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                  [1, 1],
                  [1, -1], // Odd rows
                ];

          for (const [dx, dy] of directions) {
            const nx = currentHex.gridX + dx;
            const ny = currentHex.gridY + dy;
            const neighbor = allHexData.find(
              (h) => h.gridX === nx && h.gridY === ny
            );
            if (neighbor) {
              neighbors.push(neighbor);
            }
          }
          return neighbors;
        }

        function heuristic(hexA, hexB) {
          // Manhattan distance on hex grid (approximate)
          // A more accurate hex distance based on cube coordinates is better if available.
          // For axial (gridX, gridY), an adaptation is needed.
          // Simple Euclidean distance for now on world positions for simplicity, good enough for A*
          const dx = hexA.worldPosition.x - hexB.worldPosition.x;
          const dy = hexA.worldPosition.y - hexB.worldPosition.y; // This is XZ plane distance
          return Math.sqrt(dx * dx + dy * dy);
        }

        function findPathAStar(startHex, endHex, allHexData) {
          let openSet = [startHex];
          const cameFrom = new Map(); // Stores the previous hex in the optimal path

          const gScore = new Map(); // Cost from start to current hex
          allHexData.forEach((hex) => gScore.set(hex.id, Infinity));
          gScore.set(startHex.id, 0);

          const fScore = new Map(); // Total cost (gScore + heuristic)
          allHexData.forEach((hex) => fScore.set(hex.id, Infinity));
          fScore.set(startHex.id, heuristic(startHex, endHex));

          while (openSet.length > 0) {
            // Find hex in openSet with the lowest fScore
            openSet.sort((a, b) => fScore.get(a.id) - fScore.get(b.id));
            let current = openSet.shift(); // Get the hex with the lowest fScore

            if (current.id === endHex.id) {
              // Reconstruct path
              const totalPath = [current];
              while (cameFrom.has(current.id)) {
                current = cameFrom.get(current.id);
                totalPath.unshift(current);
              }
              return totalPath;
            }

            getHexNeighbors(current, allHexData).forEach((neighbor) => {
              // Assuming cost to move to a neighbor is 1
              const tentativeGScore = gScore.get(current.id) + 1;
              if (tentativeGScore < gScore.get(neighbor.id)) {
                cameFrom.set(neighbor.id, current);
                gScore.set(neighbor.id, tentativeGScore);
                fScore.set(
                  neighbor.id,
                  tentativeGScore + heuristic(neighbor, endHex)
                );
                if (!openSet.some((h) => h.id === neighbor.id)) {
                  openSet.push(neighbor);
                }
              }
            });
          }
          return null; // No path found
        }
      };

      loadingManager.onLoad = onRegularTexturesLoaded;

      // Start loading non-HDR assets
      textureLoader.load(ASSETS.dirt, (t) => (textures.dirt = t));
      textureLoader.load(ASSETS.dirt2, (t) => (textures.dirt2 = t));
      textureLoader.load(ASSETS.grass, (t) => (textures.grass = t));
      textureLoader.load(ASSETS.sand, (t) => (textures.sand = t));
      textureLoader.load(ASSETS.water, (t) => (textures.water = t));
      textureLoader.load(ASSETS.stone, (t) => (textures.stone = t));

      // Return the actual cleanup function for useEffect
      return () => {
        console.log("Cleaning up scene...");
        // Now onCanvasClick is in scope for removal, ensure it and renderer.domElement exist
        if (
          renderer &&
          renderer.domElement &&
          typeof onCanvasClick === "function"
        ) {
          renderer.domElement.removeEventListener("click", onCanvasClick);
        }
        if (animationId) cancelAnimationFrame(animationId);
        if (renderer) {
          renderer.dispose();
          if (renderer.domElement && renderer.domElement.parentElement) {
            renderer.domElement.parentElement.removeChild(renderer.domElement);
          }
        }
        if (pmrem) pmrem.dispose();
        // Geometries and materials will be garbage collected if not referenced elsewhere
      };
    }

    let cleanupFunction = () => {};
    setupScene()
      .then((returnedCleanup) => {
        if (typeof returnedCleanup === "function") {
          cleanupFunction = returnedCleanup;
        }
      })
      .catch((error) => {
        console.error("Error in setupScene promise chain:", error);
      });

    return () => {
      cleanupFunction();
    };
  }, []); // Empty dependency array: runs once on mount, cleans up on unmount

  return <div ref={mountRef} style={{ width: "100vw", height: "100vh" }} />;
}

export default App;
