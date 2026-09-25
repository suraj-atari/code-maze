import type { PointName } from './TutorialMap';

/** A line of card text. `{KEY}` renders as a key cap, `*text*` as emphasis. */
export type CardLine = string | { readonly chip: string; readonly color: string; readonly text: string };

export interface TutorialCard {
  readonly title: string;
  readonly body: readonly CardLine[];
  /** Replaces `body` on touch devices (only where the controls differ). */
  readonly touchBody?: readonly CardLine[];
  readonly tone?: 'info' | 'danger' | 'success';
}

export type RobotKey = 'patrol' | 'hammer' | 'grenade';

/** Per-step counters, reset whenever a step starts. */
export interface StepStats {
  look: number;
  sprintTime: number;
  crouchTime: number;
  lampWentOff: boolean;
  swings: number;
  doorOpened: boolean;
  looted: boolean;
}

/** What the script may query or do. Implemented by the TutorialDirector. */
export interface TutorialApi {
  readonly stats: Readonly<StepStats>;
  readonly lampOn: boolean;
  near(point: PointName, radius: number): boolean;
  /** Robot is alive, within `range` metres and not hidden behind a wall. */
  robotInView(key: RobotKey, range: number): boolean;
  robotAlive(key: RobotKey): boolean;
  spawnRobot(key: RobotKey): void;
  /** Tops the player's weapons up to at least these amounts (grenades only when none are in flight). */
  ensureWeapons(grenades: number, hammerHits: number): void;
}

export interface TutorialStep {
  readonly id: string;
  /** Shown one after another (game frozen) when the step starts. */
  readonly cards?: readonly TutorialCard[];
  readonly objective: string;
  readonly touchObjective?: string;
  /** Where the guide beacon stands; 'door' / 'cache' refer to the armory. */
  readonly beacon?: PointName | 'door' | 'cache';
  /** Sneaking lessons: being spotted here triggers the "you've been seen" explanation. */
  readonly stealth?: boolean;
  /** Robots this step fights; caught-tips mention weapons instead of hiding. */
  readonly combat?: boolean;
  onStart?(t: TutorialApi): void;
  /** Called every frame while the step is active (top-ups etc.). */
  onUpdate?(t: TutorialApi): void;
  done(t: TutorialApi): boolean;
}

export const ROBOTS: Readonly<Record<RobotKey, { spawn: PointName; heading: number; route: readonly PointName[] }>> = {
  // Heading convention: forward = (sin h, cos h); -π/2 faces west (-X), +π/2 faces east.
  patrol: { spawn: 'patrolEast', heading: -Math.PI / 2, route: ['patrolWest', 'patrolEast'] },
  hammer: { spawn: 'hammerBot', heading: Math.PI / 2, route: ['hammerBot', 'hammerBotTurn'] },
  grenade: { spawn: 'grenadeBot', heading: Math.PI / 2, route: ['grenadeBot', 'grenadeBotTurn'] },
};

const EYE_COLORS: readonly CardLine[] = [
  { chip: 'CYAN', color: '#2fd8ff', text: 'patrolling — it has not noticed you' },
  { chip: 'YELLOW', color: '#ffd23a', text: 'heard or glimpsed something — coming to check' },
  { chip: 'ORANGE', color: '#ff8a1f', text: 'searching the area where it lost you' },
  { chip: 'RED', color: '#ff1f2f', text: 'it sees you and is *chasing* you' },
];

export const STEPS: readonly TutorialStep[] = [
  {
    id: 'welcome',
    cards: [
      {
        title: 'WELCOME TO TRAINING',
        body: [
          "You're trapped in a research maze patrolled by *sentinel robots*.",
          'Every level has one goal: reach the *green exit gate* without getting caught.',
          'This training teaches every move. The game *pauses* whenever there is something new to learn.',
          'Press {Esc} any time to open the pause menu.',
        ],
        touchBody: [
          "You're trapped in a research maze patrolled by *sentinel robots*.",
          'Every level has one goal: reach the *green exit gate* without getting caught.',
          'This training teaches every move. The game *pauses* whenever there is something new to learn.',
          'Tap {❚❚} (top right) any time to open the pause menu.',
        ],
      },
      {
        title: 'LOOK AROUND',
        body: [
          'Move the *mouse* to look around.',
          "If the view doesn't turn, click the game once to capture the mouse.",
          'Press {V} any time to switch between *first-person* and *third-person* view.',
        ],
        touchBody: [
          'Swipe on the *right half* of the screen to look around.',
          'Tap {VIEW} (top right) any time to switch between *first-person* and *third-person* view.',
        ],
      },
    ],
    objective: 'Look around with the mouse',
    touchObjective: 'Swipe on the right half of the screen to look around',
    done: (t) => t.stats.look > 1.5,
  },
  {
    id: 'move',
    cards: [
      {
        title: 'MOVING',
        body: [
          'Walk with {W} {A} {S} {D} (or the arrow keys).',
          'Head for the glowing *blue beacon*. Beacons always show where to go next.',
        ],
        touchBody: [
          'Put your *left thumb* anywhere on the left half of the screen and drag to walk.',
          'Push the joystick only a little to walk *slowly and quietly*.',
          'Head for the glowing *blue beacon*. Beacons always show where to go next.',
        ],
      },
    ],
    objective: 'Walk to the blue beacon',
    beacon: 'lookBeacon',
    done: (t) => t.near('lookBeacon', 1.3),
  },
  {
    id: 'lamp',
    cards: [
      {
        title: 'YOUR LAMP',
        body: [
          'Press {F} (or the *right mouse button*) to switch your lamp on and off.',
          '*Lamp ON:* you see far, but sentinels also spot you from much further away.',
          '*Lamp OFF:* the maze is dark, but you are almost invisible.',
          'The *LAMP* bar (bottom left) is your battery. It drains while on and recharges while off.',
        ],
        touchBody: [
          'Tap {LAMP} to switch your lamp on and off.',
          '*Lamp ON:* you see far, but sentinels also spot you from much further away.',
          '*Lamp OFF:* the maze is dark, but you are almost invisible.',
          'The *LAMP* bar (top left) is your battery. It drains while on and recharges while off.',
        ],
      },
    ],
    objective: 'Switch the lamp OFF, then ON again ({F})',
    touchObjective: 'Switch the lamp OFF, then ON again ({LAMP})',
    done: (t) => t.stats.lampWentOff && t.lampOn,
  },
  {
    id: 'sprint',
    cards: [
      {
        title: 'SPRINTING',
        body: [
          'Hold {Shift} while moving to *sprint*.',
          'Sprinting is fast but *loud*: sentinels hear running from far away.',
          'It also uses *stamina* (the blue bar). Let it refill before you really need it.',
        ],
        touchBody: [
          'Tap {RUN} to *sprint*. It switches off when you let go of the joystick.',
          'Sprinting is fast but *loud*: sentinels hear running from far away.',
          'It also uses *stamina* (the blue bar). Let it refill before you really need it.',
        ],
      },
    ],
    objective: 'Sprint to the beacon (hold {Shift})',
    touchObjective: 'Sprint to the beacon ({RUN})',
    beacon: 'sprintEnd',
    done: (t) => t.near('sprintEnd', 1.5) && t.stats.sprintTime >= 0.5,
  },
  {
    id: 'sneak',
    cards: [
      {
        title: 'SNEAKING',
        body: [
          'Hold {C} to *crouch* and sneak.',
          'Sneaking is slow but almost *silent*, and sentinels only notice a crouching player up close.',
          'Hear that low hum? *Something is moving up ahead.* Sneak down the corridor.',
        ],
        touchBody: [
          'Tap {SNEAK} to *crouch* (tap again to stand up).',
          'Sneaking is slow but almost *silent*, and sentinels only notice a crouching player up close.',
          'Hear that low hum? *Something is moving up ahead.* Sneak down the corridor.',
        ],
      },
    ],
    objective: 'Sneak to the beacon (hold {C})',
    touchObjective: 'Sneak to the beacon ({SNEAK})',
    beacon: 'sneakEnd',
    stealth: true,
    onStart: (t) => t.spawnRobot('patrol'),
    done: (t) => t.near('sneakEnd', 1.2) && t.stats.crouchTime >= 0.8,
  },
  {
    id: 'spot',
    objective: 'Carefully continue south',
    beacon: 'junction',
    stealth: true,
    done: (t) => t.robotInView('patrol', 16) || t.near('junction', 1),
  },
  {
    id: 'sneak-past',
    cards: [
      {
        title: 'SENTINEL AHEAD!',
        tone: 'danger',
        body: [
          'A *sentinel* patrols the corridor ahead. Its *eye color* tells you what it is thinking:',
          ...EYE_COLORS,
          'The *detection meter* at the top of the screen fills up while a sentinel can see you.',
        ],
      },
      {
        title: 'SNEAK PAST IT',
        body: [
          "You have no weapons yet, so *don't let it see you*:",
          '1. Turn your lamp *OFF* ({F}).',
          '2. *Sneak* ({C}) up to the crossing and watch the sentinel.',
          '3. When it walks *away* from you, sneak across to the corridor on the other side.',
          "Sentinels can't see through walls. If one spots you: run, break line of sight around a corner, then hide.",
        ],
        touchBody: [
          "You have no weapons yet, so *don't let it see you*:",
          '1. Turn your lamp *OFF* ({LAMP}).',
          '2. *Sneak* ({SNEAK}) up to the crossing and watch the sentinel.',
          '3. When it walks *away* from you, sneak across to the corridor on the other side.',
          "Sentinels can't see through walls. If one spots you: run, break line of sight around a corner, then hide.",
        ],
      },
    ],
    objective: 'Lamp off, then sneak across the patrol corridor unseen',
    beacon: 'crossed',
    stealth: true,
    done: (t) => t.near('crossed', 1.3),
  },
  {
    id: 'armory-door',
    cards: [
      {
        title: 'ARMORY',
        tone: 'success',
        body: [
          'Well sneaked! Steel doors with an amber *ARMORY* sign hide weapons.',
          'Walk up to the door and press {E} to open it.',
          'Careful: sentinels can open these doors too.',
        ],
        touchBody: [
          'Well sneaked! Steel doors with an amber *ARMORY* sign hide weapons.',
          'Walk up to the door and tap {USE} to open it.',
          'Careful: sentinels can open these doors too.',
        ],
      },
    ],
    objective: 'Open the armory door ({E})',
    touchObjective: 'Open the armory door ({USE})',
    beacon: 'door',
    stealth: true,
    done: (t) => t.stats.doorOpened,
  },
  {
    id: 'loot',
    objective: 'Walk to the crate to grab the supplies',
    beacon: 'cache',
    stealth: true,
    done: (t) => t.stats.looted,
  },
  {
    id: 'weapons',
    cards: [
      {
        title: 'WEAPONS',
        tone: 'success',
        body: [
          '*HAMMER:* one hit destroys a sentinel, but only up close (about 2 m). It lasts 3 hits. Swing with the *left mouse button* or {Q}.',
          '*GRENADES:* throw with {G}. They bounce off walls and explode after 1.5 s, or *instantly* when they hit a sentinel.',
          'A blast destroys every sentinel nearby that is not behind a wall, and it is *loud*: other sentinels come to look.',
          'Your weapons are shown bottom left. They reset every level.',
        ],
        touchBody: [
          '*HAMMER:* one hit destroys a sentinel, but only up close (about 2 m). It lasts 3 hits. Swing with {SMASH}.',
          '*GRENADES:* throw with {THROW}. They bounce off walls and explode after 1.5 s, or *instantly* when they hit a sentinel.',
          'A blast destroys every sentinel nearby that is not behind a wall, and it is *loud*: other sentinels come to look.',
          'Your weapons are shown top left. They reset every level.',
        ],
      },
    ],
    objective: 'Practice a hammer swing (left click / {Q})',
    touchObjective: 'Practice a hammer swing ({SMASH})',
    done: (t) => t.stats.swings >= 1,
  },
  {
    id: 'to-hammer',
    objective: 'Head south to the next room',
    beacon: 'hammerRoomDoor',
    done: (t) => t.near('hammerRoomDoor', 1.3),
  },
  {
    id: 'hammer-fight',
    cards: [
      {
        title: 'HAMMER TIME',
        tone: 'danger',
        body: [
          'A sentinel guards this room. Time to fight back!',
          'Let it come to you. *Face it* and swing (left click / {Q}) when it is about *2 m away*.',
          "Too early and you miss (a miss doesn't use up a hit). Too late and it catches you.",
          'Tip: keep your lamp ON here so you can see it coming.',
        ],
        touchBody: [
          'A sentinel guards this room. Time to fight back!',
          'Let it come to you. *Face it* and tap {SMASH} when it is about *2 m away*.',
          "Too early and you miss (a miss doesn't use up a hit). Too late and it catches you.",
          'Tip: keep your lamp ON here so you can see it coming.',
        ],
      },
    ],
    objective: 'Destroy the sentinel with the hammer',
    combat: true,
    onStart: (t) => {
      t.ensureWeapons(0, 1);
      t.spawnRobot('hammer');
    },
    onUpdate: (t) => {
      if (t.robotAlive('hammer')) t.ensureWeapons(0, 1);
    },
    done: (t) => !t.robotAlive('hammer'),
  },
  {
    id: 'to-grenade',
    cards: [
      {
        title: 'SENTINEL SMASHED!',
        tone: 'success',
        body: ['That one is scrap metal.', 'Head *west* through the room. One more sentinel stands between you and the exit.'],
      },
    ],
    objective: 'Go west through the room',
    beacon: 'grenadeCorridor',
    done: (t) => t.near('grenadeCorridor', 1.3),
  },
  {
    id: 'grenade-fight',
    cards: [
      {
        title: 'GRENADE',
        tone: 'danger',
        body: [
          'A sentinel blocks the corridor to the exit. Take it out from a distance.',
          'Throw a grenade with {G}. It flies where you look: *aim a little higher* to throw further.',
          'It explodes after 1.5 s, or instantly if it hits the sentinel, so throwing at a *charging* sentinel works too.',
          'Blasts do not go through walls.',
        ],
        touchBody: [
          'A sentinel blocks the corridor to the exit. Take it out from a distance.',
          'Throw a grenade with {THROW}. It flies where you look: *aim a little higher* to throw further.',
          'It explodes after 1.5 s, or instantly if it hits the sentinel, so throwing at a *charging* sentinel works too.',
          'Blasts do not go through walls.',
        ],
      },
    ],
    objective: 'Destroy the sentinel with a grenade ({G})',
    touchObjective: 'Destroy the sentinel with a grenade ({THROW})',
    combat: true,
    onStart: (t) => {
      t.ensureWeapons(2, 0);
      t.spawnRobot('grenade');
    },
    onUpdate: (t) => {
      if (t.robotAlive('grenade')) t.ensureWeapons(1, 0);
    },
    done: (t) => !t.robotAlive('grenade'),
  },
  {
    id: 'exit',
    cards: [
      {
        title: 'THE EXIT',
        tone: 'success',
        body: [
          'The glowing *green gate* ahead is the exit. Walk into it, or press {E} next to it.',
          'In the real game the maze is random and larger, sentinels are already hunting, and weapons only come from armories.',
          'Remember: *lamp off + sneak* to stay hidden, sprint only when chased, fight only when you must.',
        ],
        touchBody: [
          'The glowing *green gate* ahead is the exit. Walk into it, or tap {USE} next to it.',
          'In the real game the maze is random and larger, sentinels are already hunting, and weapons only come from armories.',
          'Remember: *lamp off + sneak* to stay hidden, sprint only when chased, fight only when you must.',
        ],
      },
    ],
    objective: 'Escape through the green exit gate',
    beacon: 'exit',
    done: () => false,
  },
];

export const SPOTTED_CARD: TutorialCard = {
  title: "YOU'VE BEEN SPOTTED!",
  tone: 'danger',
  body: [
    "Its eyes turned *RED*: it's chasing you!",
    '*Sprint* ({Shift}) away and turn corners to break its line of sight.',
    'Once it loses you, *crouch* ({C}) and stay still. It searches for a while, then goes back to its patrol.',
  ],
  touchBody: [
    "Its eyes turned *RED*: it's chasing you!",
    '*Sprint* ({RUN}) away and turn corners to break its line of sight.',
    'Once it loses you, *crouch* ({SNEAK}) and stay still. It searches for a while, then goes back to its patrol.',
  ],
};

export function caughtCard(combat: boolean): TutorialCard {
  return {
    title: 'CAUGHT!',
    tone: 'danger',
    body: [
      'In a real run, getting caught means *game over*.',
      'In training you get another try from the last checkpoint.',
      combat
        ? 'Tip: swing the hammer when the sentinel is about *2 m* away, and throw grenades *before* it reaches you.'
        : 'Tip: with your lamp *off* and *sneaking*, a sentinel only notices you from a few metres away.',
    ],
  };
}
