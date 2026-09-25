import type { CardLine } from '../tutorial/TutorialSteps';
import type { TutorialCardView } from '../tutorial/TutorialDirector';

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`[TutorialPanel] missing #${id}`);
  return e;
}

/** Renders `{KEY}` as a key cap and `*text*` as emphasis, without using innerHTML. */
function appendRich(parent: HTMLElement, text: string): void {
  const re = /\{([^}]+)\}|\*([^*]+)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    const node = document.createElement(m[1] !== undefined ? 'kbd' : 'strong');
    node.textContent = m[1] ?? m[2]!;
    parent.append(node);
    last = re.lastIndex;
  }
  if (last < text.length) parent.append(text.slice(last));
}

function renderLine(line: CardLine): HTMLElement {
  const p = document.createElement('p');
  if (typeof line === 'string') {
    appendRich(p, line);
  } else {
    p.className = 'tut-chip-line';
    const chip = document.createElement('span');
    chip.className = 'tut-chip';
    chip.textContent = line.chip;
    chip.style.setProperty('--chip', line.color);
    p.append(chip);
    appendRich(p, line.text);
  }
  return p;
}

/**
 * Tutorial coaching card (shown while the game is frozen) and the live objective banner.
 * Continue: E / Enter / left click on desktop, the CONTINUE button (or USE) on touch.
 */
export class TutorialPanel {
  private readonly card = el('tutorial-card');
  private readonly step = el('tutorial-step');
  private readonly title = el('tutorial-title');
  private readonly body = el('tutorial-body');
  private readonly objective = el('tutorial-objective');
  private readonly objectiveText = el('tutorial-objective-text');
  private readonly objectiveStep = el('tutorial-objective-step');
  onContinue: (() => void) | null = null;

  constructor(touch: boolean) {
    el('tutorial-hint').textContent = touch ? 'Tap CONTINUE' : 'Press E or click to continue';
    // The whole card is clickable (the CONTINUE button inside it is only shown on touch).
    this.card.addEventListener('click', () => this.onContinue?.());
  }

  showCard(c: TutorialCardView): void {
    this.card.dataset['tone'] = c.tone;
    this.step.textContent = c.progress;
    this.title.textContent = c.title;
    this.body.replaceChildren(...c.lines.map(renderLine));
    this.card.classList.remove('hidden');
    document.body.classList.add('tutorial-card-open');
  }

  hideCard(): void {
    this.card.classList.add('hidden');
    document.body.classList.remove('tutorial-card-open');
  }

  setObjective(text: string | null, progress: string): void {
    this.objective.classList.toggle('hidden', text === null);
    if (text === null) return;
    this.objectiveStep.textContent = progress;
    this.objectiveText.replaceChildren();
    appendRich(this.objectiveText, text);
    // Restart the highlight animation for the new objective.
    this.objective.classList.remove('fresh');
    void this.objective.offsetWidth;
    this.objective.classList.add('fresh');
  }
}
