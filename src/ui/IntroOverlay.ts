import type { IntroOverlayModel } from '../intro/IntroCinematic';

function byId(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`[UI] missing #${id}`);
  return e;
}

/** Title, objective and the YOU / EXIT labels drawn over the level intro. Click, tap or key skips. */
export class IntroOverlay {
  private readonly root = byId('intro-overlay');
  private readonly text = this.root.querySelector<HTMLElement>('.intro-text')!;
  private readonly title = this.root.querySelector<HTMLElement>('.intro-title')!;
  private readonly sub = this.root.querySelector<HTMLElement>('.intro-sub')!;
  private readonly defaultTitle = this.title.textContent ?? '';
  private readonly defaultSub = this.sub.innerHTML;
  private readonly you = byId('intro-you');
  private readonly exit = byId('intro-exit');
  private readonly fade = byId('intro-fade');

  constructor(onSkip: () => void) {
    this.root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onSkip();
    });
    document.addEventListener('keydown', (e) => {
      if (this.root.classList.contains('hidden')) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') onSkip();
    });
  }

  /** Title and objective for this intro; null restores the new-run text. */
  setText(title: string | null, subtitle: string | null): void {
    this.title.textContent = title ?? this.defaultTitle;
    if (subtitle === null) this.sub.innerHTML = this.defaultSub;
    else this.sub.textContent = subtitle;
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  update(m: Readonly<IntroOverlayModel>): void {
    this.text.style.opacity = m.titleAlpha.toFixed(3);
    this.fade.style.opacity = m.fadeAlpha.toFixed(3);
    place(this.you, m.youX, m.youY, m.labelAlpha);
    place(this.exit, m.exitX, m.exitY, m.labelAlpha);
  }
}

function place(el: HTMLElement, x: number, y: number, alpha: number): void {
  // Off-screen (or behind the camera) labels just fade out.
  const onScreen = x > -0.1 && x < 1.1 && y > -0.1 && y < 1.1;
  el.style.opacity = (onScreen ? alpha : 0).toFixed(3);
  el.style.left = `${(x * 100).toFixed(2)}%`;
  el.style.top = `${(y * 100).toFixed(2)}%`;
}
