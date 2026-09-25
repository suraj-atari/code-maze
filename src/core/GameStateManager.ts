export const GameState = {
  Loading: 'loading',
  MainMenu: 'menu',
  Playing: 'playing',
  Paused: 'paused',
  GameOver: 'gameover',
  LevelComplete: 'complete',
} as const;

export type GameState = (typeof GameState)[keyof typeof GameState];

const TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
  loading: ['menu'],
  menu: ['playing'],
  playing: ['paused', 'gameover', 'complete', 'menu'],
  paused: ['playing', 'menu'],
  gameover: ['playing', 'menu'],
  complete: ['playing', 'menu'],
};

export type StateChangeListener = (next: GameState, previous: GameState) => void;

/** Single source of truth for the application state, with an explicit transition table. */
export class GameStateManager {
  private state: GameState = GameState.Loading;
  private readonly listeners: StateChangeListener[] = [];

  get current(): GameState {
    return this.state;
  }

  is(state: GameState): boolean {
    return this.state === state;
  }

  canTransition(next: GameState): boolean {
    return TRANSITIONS[this.state].includes(next);
  }

  transition(next: GameState): boolean {
    if (!this.canTransition(next)) {
      if (import.meta.env.DEV) console.warn(`[GameState] invalid transition ${this.state} -> ${next}`);
      return false;
    }
    const previous = this.state;
    this.state = next;
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i]!(next, previous);
    return true;
  }

  onChange(listener: StateChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }
}
