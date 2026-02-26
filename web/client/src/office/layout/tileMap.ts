import { TileType } from '../types.js'

/** Check if a tile is walkable (floor, carpet, or doorway, and not blocked by furniture) */
export function isWalkable(
  col: number,
  row: number,
  tileMap: TileType[][],
  blockedTiles: Set<string>,
): boolean {
  const rows = tileMap.length
  const cols = rows > 0 ? tileMap[0].length : 0
  if (row < 0 || row >= rows || col < 0 || col >= cols) return false
  const t = tileMap[row][col]
  if (t === TileType.WALL || t === TileType.VOID) return false
  if (blockedTiles.has(`${col},${row}`)) return false
  return true
}

/** Get walkable tile positions (grid coords) for wandering */
export function getWalkableTiles(
  tileMap: TileType[][],
  blockedTiles: Set<string>,
): Array<{ col: number; row: number }> {
  const rows = tileMap.length
  const cols = rows > 0 ? tileMap[0].length : 0
  const tiles: Array<{ col: number; row: number }> = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isWalkable(c, r, tileMap, blockedTiles)) {
        tiles.push({ col: c, row: r })
      }
    }
  }
  return tiles
}

/** BFS pathfinding on 4-connected grid (no diagonals). Returns path excluding start, including end.
 *
 * Uses integer keys (row * cols + col) and typed arrays instead of string keys
 * and Map/Set for lower GC pressure. Pointer-based dequeue avoids Array.shift() O(n). */
export function findPath(
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  tileMap: TileType[][],
  blockedTiles: Set<string>,
): Array<{ col: number; row: number }> {
  if (startCol === endCol && startRow === endRow) return []

  const rows = tileMap.length
  const cols = rows > 0 ? tileMap[0].length : 0
  if (rows === 0 || cols === 0) return []

  if (!isWalkable(endCol, endRow, tileMap, blockedTiles)) return []

  const startKey = startRow * cols + startCol
  const endKey = endRow * cols + endCol
  const size = rows * cols

  // Flat typed arrays: single allocation, no per-node string/object overhead
  const visited = new Uint8Array(size)
  const parent = new Int32Array(size).fill(-1)
  visited[startKey] = 1

  // Ring buffer queue — BFS visits at most `size` nodes
  const queue = new Int32Array(size)
  let head = 0
  let tail = 0
  queue[tail++] = startKey

  const dc = [0, 0, -1, 1]
  const dr = [-1, 1, 0, 0]

  while (head < tail) {
    const currKey = queue[head++]

    if (currKey === endKey) {
      // Reconstruct: push + reverse avoids unshift's O(path²)
      const path: Array<{ col: number; row: number }> = []
      let k = endKey
      while (k !== startKey) {
        path.push({ col: k % cols, row: (k - k % cols) / cols })
        k = parent[k]
      }
      path.reverse()
      return path
    }

    const currCol = currKey % cols
    const currRow = (currKey - currCol) / cols

    for (let d = 0; d < 4; d++) {
      const nc = currCol + dc[d]
      const nr = currRow + dr[d]
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      const nk = nr * cols + nc
      if (visited[nk]) continue
      if (!isWalkable(nc, nr, tileMap, blockedTiles)) continue

      visited[nk] = 1
      parent[nk] = currKey
      queue[tail++] = nk
    }
  }

  return []
}
