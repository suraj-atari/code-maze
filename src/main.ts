import './ui/styles.css';
import { gameConfig } from './config/GameConfig';
import { Game } from './core/Game';

const container = document.getElementById('game-root');
if (!container) throw new Error('#game-root not found');

const game = new Game(gameConfig, container, new URLSearchParams(window.location.search));
game.init().catch((err: unknown) => {
  console.error(err);
  game.showFatal(
    err instanceof Error
      ? `${err.message}. Your browser may not support WebGL2 / WebAssembly.`
      : 'Failed to start the game.',
  );
});
