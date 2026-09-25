import type { Random } from '../utils/Random';
import type { MazeData } from './MazeData';

export interface MazeGenerationOptions {
  /** Rooms per side; the grid becomes (2·rooms + 1)². */
  readonly rooms: number;
  readonly cellSize: number;
  /** 0..1 fraction of dead ends to open into loops. */
  readonly braidFactor: number;
}

/**
 * Strategy interface for maze algorithms. Implementations must return a maze whose border is
 * solid wall and whose `startCell` / `exitCell` are walkable and connected.
 */
export interface MazeGenerator {
  readonly id: string;
  generate(options: MazeGenerationOptions, rng: Random): MazeData;
}

type GeneratorFactory = () => MazeGenerator;

const registry = new Map<string, GeneratorFactory>();

export function registerMazeGenerator(id: string, factory: GeneratorFactory): void {
  registry.set(id, factory);
}

export function createMazeGenerator(id: string): MazeGenerator {
  const factory = registry.get(id);
  if (!factory) throw new Error(`[maze] unknown generator "${id}"`);
  return factory();
}
