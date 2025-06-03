// pathfinding.js
// hexDataMap will be imported or passed to relevant functions
// For simplicity, assuming it's imported if mapGenerator exports it,
// or it's passed from main.js which gets it from mapGenerator.

function getHexNode(tileX, tileY, hexDataMap) {
    return hexDataMap.get(`${tileX},${tileY}`);
}

function heuristic(a, b) { // a, b are {tileX, tileY}
    const dX = Math.abs(a.tileX - b.tileX);
    const dY = Math.abs(a.tileY - b.tileY);
    // Using a more accurate axial distance heuristic
    // Convert to cube: x=q, z=r, y=-q-r
    // Or use simpler axial distance: (abs(dq) + abs(dr) + abs(dq+dr))/2 if q,r are axial.
    // For offset (current):
    return (Math.abs(a.tileX - b.tileX) + Math.abs(a.tileY - b.tileY) + Math.abs( (a.tileX - a.tileY) - (b.tileX - b.tileY) )) / 2;
    // return dX + dY; // Simpler, less accurate
}

function getHexNeighbors(tileX, tileY) {
    const neighbors = [];
    const isEvenRow = tileY % 2 === 0;
    // Offset coordinates for "pointy top"
    const directions = [
        // [col, row] changes based on current `tileToPosition` which implies "odd-r" or "even-r"
        // Assuming "odd-r" like layout where odd rows are shifted right. Let's check tileToPosition:
        // (tileX + (tileY % 2) * 0.5) -> if tileY is odd, tileX is shifted. So it's "odd-r"
        // Directions for "odd-r" (q, r) where q=col, r=row:
        // (1,0), (-1,0), (0,-1), (0,1)
        // if odd row: (1,-1), (1,1)
        // if even row: (-1,-1), (-1,1)

        // Let's use simpler axial-like logic for neighbors based on your existing directions that account for parity.
        // This seems to be for "pointy-top" with axial-like indexing.
        { dX:  1, dY:  0 }, { dX: -1, dY:  0 },
        { dX: isEvenRow ?  0 :  1, dY: -1 }, { dX: isEvenRow ? -1 :  0, dY: -1 },
        { dX: isEvenRow ?  0 :  1, dY:  1 }, { dX: isEvenRow ? -1 :  0, dY:  1 }
    ];

    for (const dir of directions) {
        neighbors.push({ tileX: tileX + dir.dX, tileY: tileY + dir.dY });
    }
    return neighbors;
}

function reconstructPath(targetNode) {
    const path = [];
    let currentNode = targetNode;
    while (currentNode) {
        path.push({
            tileX: currentNode.tileX,
            tileY: currentNode.tileY,
            worldPos: currentNode.worldPos, // This is Vector2 from tileToPosition
            baseHeight: currentNode.baseHeight
        });
        currentNode = currentNode.parent;
    }
    return path.reverse();
}

export function aStarPathfinding(startCoords, targetCoords, hexDataMap) {
    const openSet = new Map();
    const closedSet = new Set();

    const startNodeData = getHexNode(startCoords.tileX, startCoords.tileY, hexDataMap);
    if (!startNodeData) return [];
    const targetNodeData = getHexNode(targetCoords.tileX, targetCoords.tileY, hexDataMap);
    if (!targetNodeData) return [];

    const startKey = `${startCoords.tileX},${startCoords.tileY}`;
    openSet.set(startKey, {
        ...startNodeData,
        gCost: 0,
        hCost: heuristic(startCoords, targetCoords),
        fCost: heuristic(startCoords, targetCoords),
        parent: null
    });

    while (openSet.size > 0) {
        let currentNodeEntry = null;
        for (const entry of openSet.entries()) {
            if (currentNodeEntry === null || entry[1].fCost < currentNodeEntry[1].fCost ||
               (entry[1].fCost === currentNodeEntry[1].fCost && entry[1].hCost < currentNodeEntry[1].hCost)) { // Tie-breaking
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

            const neighborNodeData = getHexNode(neighborCoords.tileX, neighborCoords.tileY, hexDataMap);
            if (!neighborNodeData) continue; // No path through this non-existent hex

            // Add cost for height difference if desired
            // const heightDiff = Math.abs(currentNode.baseHeight - neighborNodeData.baseHeight);
            // const movementCost = 1 + heightDiff * 0.5; // Example: preference for flatter paths
            const movementCost = 1;
            const gCostToNeighbor = currentNode.gCost + movementCost;

            let neighborNodeInOpenSet = openSet.get(neighborKey);
            if (!neighborNodeInOpenSet || gCostToNeighbor < neighborNodeInOpenSet.gCost) {
                if (!neighborNodeInOpenSet) {
                    neighborNodeInOpenSet = { ...neighborNodeData };
                }
                neighborNodeInOpenSet.parent = currentNode;
                neighborNodeInOpenSet.gCost = gCostToNeighbor;
                neighborNodeInOpenSet.hCost = heuristic(neighborCoords, targetCoords);
                neighborNodeInOpenSet.fCost = neighborNodeInOpenSet.gCost + neighborNodeInOpenSet.hCost;
                openSet.set(neighborKey, neighborNodeInOpenSet);
            }
        }
    }
    return []; // Path not found
}

// Helper to find the hex coordinates a world point (like sphere's C.Vec3 position) is currently on
export function worldPointToHex(worldPointVec3, hexDataMap) {
  let closestHex = null;
  let minDistanceSq = Infinity;

  for (const [key, hexData] of hexDataMap) {
    // hexData.worldPos is a THREE.Vector2 (x, y) where y is world Z
    const dx = worldPointVec3.x - hexData.worldPos.x;
    const dz = worldPointVec3.z - hexData.worldPos.y;
    const distanceSq = dx * dx + dz * dz;

    if (distanceSq < minDistanceSq) {
      minDistanceSq = distanceSq;
      closestHex = hexData;
    }
  }
  // Threshold to be considered "on" the hex. Approx radius of hex is 1.
  if (closestHex && minDistanceSq < (1.0 * 1.0)) {
      return { tileX: closestHex.tileX, tileY: closestHex.tileY, ...closestHex };
  }
  return null;
}