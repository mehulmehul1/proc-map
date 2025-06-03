// pathfinding.ts
import * as THREE from 'three';
import { HexData } from './mapGenerator';

interface Coord {
    tileX: number;
    tileY: number;
}

interface PathNode extends HexData {
    gCost: number;
    hCost: number;
    fCost: number;
    parent: PathNode | null;
}

interface NeighborCoord {
    tileX: number;
    tileY: number;
}

interface PathPoint {
    tileX: number;
    tileY: number;
    worldPos: THREE.Vector2;
    baseHeight: number;
}

function getHexNode(tileX: number, tileY: number, hexDataMap: Map<string, HexData>): HexData | undefined {
    return hexDataMap.get(`${tileX},${tileY}`);
}

function heuristic(a: Coord, b: Coord): number {
    const dX = Math.abs(a.tileX - b.tileX);
    const dY = Math.abs(a.tileY - b.tileY);
    return (Math.abs(a.tileX - b.tileX) + Math.abs(a.tileY - b.tileY) + Math.abs((a.tileX - a.tileY) - (b.tileX - b.tileY))) / 2;
}

function getHexNeighbors(tileX: number, tileY: number): NeighborCoord[] {
    const neighbors: NeighborCoord[] = [];
    const isEvenRow = tileY % 2 === 0;
    const directions = [
        { dX: 1, dY: 0 }, { dX: -1, dY: 0 },
        { dX: isEvenRow ? 0 : 1, dY: -1 }, { dX: isEvenRow ? -1 : 0, dY: -1 },
        { dX: isEvenRow ? 0 : 1, dY: 1 }, { dX: isEvenRow ? -1 : 0, dY: 1 }
    ];

    for (const dir of directions) {
        neighbors.push({ tileX: tileX + dir.dX, tileY: tileY + dir.dY });
    }
    return neighbors;
}

function reconstructPath(targetNode: PathNode): PathPoint[] {
    const path: PathPoint[] = [];
    let currentNode: PathNode | null = targetNode;
    while (currentNode) {
        path.push({
            tileX: currentNode.tileX,
            tileY: currentNode.tileY,
            worldPos: currentNode.worldPos,
            baseHeight: currentNode.baseHeight
        });
        currentNode = currentNode.parent;
    }
    return path.reverse();
}

export function aStarPathfinding(startCoords: Coord, targetCoords: Coord, hexDataMap: Map<string, HexData>): PathPoint[] {
    const openSet = new Map<string, PathNode>();
    const closedSet = new Set<string>();

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
        let currentNodeEntry: [string, PathNode] | null = null;
        for (const entry of openSet.entries()) {
            if (currentNodeEntry === null || entry[1].fCost < currentNodeEntry[1].fCost ||
                (entry[1].fCost === currentNodeEntry[1].fCost && entry[1].hCost < currentNodeEntry[1].hCost)) {
                currentNodeEntry = entry;
            }
        }

        if (!currentNodeEntry) break;
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
            if (!neighborNodeData) continue;

            const movementCost = 1;
            const gCostToNeighbor = currentNode.gCost + movementCost;

            let neighborNodeInOpenSet = openSet.get(neighborKey);
            if (!neighborNodeInOpenSet || gCostToNeighbor < neighborNodeInOpenSet.gCost) {
                if (!neighborNodeInOpenSet) {
                    neighborNodeInOpenSet = { ...neighborNodeData } as PathNode;
                }
                neighborNodeInOpenSet.parent = currentNode;
                neighborNodeInOpenSet.gCost = gCostToNeighbor;
                neighborNodeInOpenSet.hCost = heuristic(neighborCoords, targetCoords);
                neighborNodeInOpenSet.fCost = neighborNodeInOpenSet.gCost + neighborNodeInOpenSet.hCost;
                openSet.set(neighborKey, neighborNodeInOpenSet);
            }
        }
    }
    return [];
}

export function worldPointToHex(worldPointVec3: THREE.Vector3, hexDataMap: Map<string, HexData>): (HexData & Coord) | null {
    let closestHex: HexData | null = null;
    let minDistanceSq = Infinity;

    for (const [key, hexData] of hexDataMap) {
        const dx = worldPointVec3.x - hexData.worldPos.x;
        const dz = worldPointVec3.z - hexData.worldPos.y;
        const distanceSq = dx * dx + dz * dz;

        if (distanceSq < minDistanceSq) {
            minDistanceSq = distanceSq;
            closestHex = hexData;
        }
    }

    if (closestHex && minDistanceSq < (1.0 * 1.0)) {
        return { tileX: closestHex.tileX, tileY: closestHex.tileY, ...closestHex };
    }
    return null;
}