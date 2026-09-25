import type { MazeConfig } from './types';

export const mazeConfig: MazeConfig = {
  cellSize: 2.6,
  wallHeight: 3.2,
  chunkCells: 8,
  braidFactor: 0.12,
  generator: 'recursive-backtracker',
};
