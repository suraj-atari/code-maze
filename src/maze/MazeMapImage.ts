import type { MazeData } from './MazeData';

/** Classic top-down maze palette: green hedges, sandy corridors, red player, bright exit. */
export const MAP_COLORS = {
  wall: '#3f7d3a',
  floor: '#b27a3d',
  player: '#c8201e',
  exit: '#fff35c',
  exitGlow: 'rgba(255, 243, 92, 0.45)',
} as const;

export interface MazeMapOptions {
  /** Pixels per maze cell. */
  readonly cellPx: number;
  /** Draw the player and exit markers. */
  readonly markers?: boolean;
}

/**
 * Draws a MazeData as a flat 2D map (cell (x, y) → pixel (x, y) · cellPx) into `canvas`,
 * resizing it to fit. Used by the menu preview and the intro cinematic's map texture.
 */
export function drawMazeMap(canvas: HTMLCanvasElement, maze: MazeData, options: MazeMapOptions): void {
  const px = Math.max(1, Math.floor(options.cellPx));
  canvas.width = maze.width * px;
  canvas.height = maze.height * px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = MAP_COLORS.floor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = MAP_COLORS.wall;
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (maze.isWall(x, y)) ctx.fillRect(x * px, y * px, px, px);
    }
  }
  if (options.markers === false) return;

  // Exit: a glowing bright cell.
  const ex = maze.cellX(maze.exitCell) * px;
  const ey = maze.cellY(maze.exitCell) * px;
  ctx.fillStyle = MAP_COLORS.exitGlow;
  ctx.fillRect(ex - px * 0.5, ey - px * 0.5, px * 2, px * 2);
  ctx.fillStyle = MAP_COLORS.exit;
  ctx.fillRect(ex, ey, px, px);

  // Player: a small red critter, like the classic maze sprite.
  const sx = maze.cellX(maze.startCell) * px;
  const sy = maze.cellY(maze.startCell) * px;
  const u = px / 8;
  ctx.fillStyle = MAP_COLORS.player;
  ctx.fillRect(sx + 2 * u, sy + 1 * u, 4 * u, 4 * u);
  ctx.fillRect(sx + 1 * u, sy + 2 * u, 6 * u, 2 * u);
  ctx.fillRect(sx + 1 * u, sy + 5 * u, 2 * u, 2 * u);
  ctx.fillRect(sx + 5 * u, sy + 5 * u, 2 * u, 2 * u);
}
