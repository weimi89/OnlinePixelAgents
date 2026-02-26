#!/usr/bin/env node
/**
 * Generate a rich default office layout showcasing all 36 furniture types.
 *
 * Grid: 24 cols × 18 rows
 *
 * Layout zones:
 *   Top-left:     Work area (3 workstations with desks, chairs, PCs)
 *   Top-right:    Conference room (meeting table, chairs, large screen)
 *   Middle:       Open corridor connecting all areas
 *   Bottom-left:  Break room (sofa, coffee table, kitchen appliances)
 *   Bottom-right: Server room + Storage (server racks, lockers, filing cabinets)
 *   Walls:        Windows, clocks, paintings, bulletin board, AC, exit signs
 */

const COLS = 24;
const ROWS = 18;

// TileType values
const VOID = 8;
const WALL = 0;
const FLOOR_2 = 2;  // Main floor
const FLOOR_1 = 1;  // Accent (conference/break room)
const FLOOR_6 = 6;  // Accent (server room)

// ── Build tile grid ──────────────────────────────────────────────
const tiles = new Array(COLS * ROWS).fill(VOID);

function setTile(col, row, type) {
  if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
    tiles[row * COLS + col] = type;
  }
}

function fillRect(c1, r1, c2, r2, type) {
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++)
      setTile(c, r, type);
}

// Outer walls
fillRect(1, 1, 22, 1, WALL);   // top wall
fillRect(1, 16, 22, 16, WALL); // bottom wall
fillRect(1, 1, 1, 16, WALL);   // left wall
fillRect(22, 1, 22, 16, WALL); // right wall

// Interior dividing wall (col 12, rows 2-7 and 9-15)
for (let r = 2; r <= 7; r++) setTile(12, r, WALL);
for (let r = 10; r <= 15; r++) setTile(12, r, WALL);

// Top-left work area floor (cols 2-11, rows 2-7)
fillRect(2, 2, 11, 7, FLOOR_2);

// Top-right conference room floor (cols 13-21, rows 2-7)
fillRect(13, 2, 21, 7, FLOOR_1);

// Middle corridor (cols 2-21, rows 8-9)
fillRect(2, 8, 21, 9, FLOOR_2);
// Open the dividing wall at corridor
setTile(12, 8, FLOOR_2);
setTile(12, 9, FLOOR_2);

// Bottom-left break room floor (cols 2-11, rows 10-15)
fillRect(2, 10, 11, 15, FLOOR_1);

// Bottom-right server/storage room floor (cols 13-21, rows 10-15)
fillRect(13, 10, 21, 15, FLOOR_6);

// ── Build tile colors ────────────────────────────────────────────
const tileColors = new Array(COLS * ROWS).fill(null);

// Work area - neutral warm gray
const workColor = { h: 30, s: 20, b: -10, c: 0 };
// Conference room - slightly blue
const confColor = { h: 210, s: 25, b: -5, c: 0 };
// Break room - warm tone
const breakColor = { h: 25, s: 30, b: 0, c: 0 };
// Server room - cool blue-gray
const serverColor = { h: 200, s: 15, b: -20, c: 10 };
// Corridor
const corridorColor = { h: 30, s: 10, b: -5, c: 0 };
// Walls
const wallColor = { h: 220, s: 10, b: -30, c: -10 };

function setTileColor(col, row, color) {
  if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
    tileColors[row * COLS + col] = color;
  }
}

function fillRectColor(c1, r1, c2, r2, color) {
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++)
      setTileColor(c, r, { ...color });
}

// Apply colors
fillRectColor(1, 1, 22, 1, wallColor);   // top wall
fillRectColor(1, 16, 22, 16, wallColor);  // bottom wall
fillRectColor(1, 1, 1, 16, wallColor);    // left wall
fillRectColor(22, 1, 22, 16, wallColor);  // right wall
for (let r = 2; r <= 15; r++) setTileColor(12, r, wallColor); // divider

fillRectColor(2, 2, 11, 7, workColor);
fillRectColor(13, 2, 21, 7, confColor);
fillRectColor(2, 8, 21, 9, corridorColor);
setTileColor(12, 8, corridorColor);
setTileColor(12, 9, corridorColor);
fillRectColor(2, 10, 11, 15, breakColor);
fillRectColor(13, 10, 21, 15, serverColor);

// ── Build furniture ──────────────────────────────────────────────
const furniture = [];
let uidCounter = 0;

function uid() {
  uidCounter++;
  const rand = Math.random().toString(36).substring(2, 6);
  return `f-${Date.now()}-${rand}-${uidCounter}`;
}

function place(type, col, row, color) {
  const item = { uid: uid(), type, col, row };
  if (color) item.color = color;
  furniture.push(item);
}

// ════════════════════════════════════════════════════════════
// TOP-LEFT: Work Area (cols 2-11, rows 2-7)
// ════════════════════════════════════════════════════════════

// Workstation 1: desk at (2,3), chair at (2,5), facing up
place('desk', 2, 2);           // 2x2 desk
place('chair', 3, 4);          // chair facing desk
place('pc', 2, 2);             // PC on desk (surface)
place('lamp', 3, 2);           // Lamp on desk

// Workstation 2: desk at (5,3), chair at (5,5)
place('desk', 5, 2);
place('chair', 6, 4);
place('laptop', 5, 2);         // Laptop on desk
place('coffee_mug', 6, 2);     // Mug on desk

// Workstation 3: desk at (8,3), chair at (8,5)
place('desk', 8, 2);
place('chair', 9, 4);
place('pc', 8, 2);
place('phone', 9, 2);          // Phone on desk
place('paper_stack', 8, 3);    // Papers on desk

// Bookshelf against back wall
place('bookshelf', 4, 2);

// Plant in corner
place('plant', 2, 7);
place('potted_cactus', 11, 2);

// Trash can
place('trash_can', 11, 7);

// Filing cabinet
place('filing_cabinet', 11, 5);

// Wall decorations - work area
place('window', 3, 1);         // Window on top wall (2 wide)
place('window', 7, 1);         // Another window
place('clock', 11, 1);         // Clock on wall
place('ac_unit', 2, 1);        // AC unit

// ════════════════════════════════════════════════════════════
// TOP-RIGHT: Conference Room (cols 13-21, rows 2-7)
// ════════════════════════════════════════════════════════════

// Meeting table in center (2x2)
place('meeting_table', 16, 3);

// Chairs around table
place('chair', 15, 4);         // left
place('chair', 18, 4);         // right
place('chair', 16, 2);         // top
place('chair', 17, 5);         // bottom

// Large screen on wall for presentations
place('large_screen', 15, 1);

// Whiteboard
place('whiteboard', 19, 1);

// Plant decoration
place('plant', 13, 2);
place('potted_cactus', 21, 7);

// Wall decorations
place('window', 13, 1);
place('painting', 21, 1);

// ════════════════════════════════════════════════════════════
// CORRIDOR (cols 2-21, rows 8-9)
// ════════════════════════════════════════════════════════════

// Coat rack near entrance area
place('coat_rack', 2, 8);

// Water cooler in corridor
place('cooler', 11, 8);

// Exit signs
place('exit_sign', 6, 1);
place('fire_extinguisher', 22, 8);

// ════════════════════════════════════════════════════════════
// BOTTOM-LEFT: Break Room (cols 2-11, rows 10-15)
// ════════════════════════════════════════════════════════════

// Sofa (2x1) against wall
place('sofa', 2, 14);

// Coffee table in front of sofa
place('coffee_table', 3, 13);

// Armchairs
place('armchair', 2, 12);
place('armchair', 6, 14);

// Kitchen area (against bottom wall)
place('fridge', 8, 10);        // 1x2 tall
place('coffee_machine', 9, 10);
place('microwave', 10, 10);
place('sink', 11, 10);

// Vending machine
place('vending_machine', 2, 10); // 1x2 tall

// Trash can
place('trash_can', 7, 15);

// Decorations
place('plant', 5, 10);
place('painting', 4, 16);
place('bulletin_board', 6, 16);

// Wall decorations
place('clock', 2, 16);
place('window', 9, 16);
place('ac_unit', 11, 16);

// ════════════════════════════════════════════════════════════
// BOTTOM-RIGHT: Server Room + Storage (cols 13-21, rows 10-15)
// ════════════════════════════════════════════════════════════

// Server racks along back wall (each 1x2)
place('server_rack', 14, 10);
place('server_rack', 15, 10);
place('server_rack', 16, 10);

// Printer
place('printer', 18, 10);

// Lockers (1x2 tall)
place('locker', 20, 10);
place('locker', 21, 10);

// Filing cabinets
place('filing_cabinet', 13, 13);
place('filing_cabinet', 13, 14);

// Desk for server admin
place('desk', 18, 13);
place('chair', 19, 15);
place('laptop', 18, 13);

// Decorations
place('trash_can', 21, 15);

// Wall decorations
place('exit_sign', 13, 16);
place('fire_extinguisher', 17, 16);
place('ac_unit', 21, 16);

// ── Output ───────────────────────────────────────────────────────
const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  tiles,
  furniture,
  tileColors,
};

const json = JSON.stringify(layout, null, 2);
process.stdout.write(json);
