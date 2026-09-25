import type { RobotStateId } from '../core/types';
import type { RobotContext } from './RobotContext';
import type { State, StateMachine } from './RobotStateMachine';
import { ChaseState } from './states/ChaseState';
import { InvestigateState } from './states/InvestigateState';
import { PatrolState } from './states/PatrolState';
import { ReturnState } from './states/ReturnState';
import { SearchState } from './states/SearchState';

export type RobotStateMachine = StateMachine<RobotContext, RobotStateId>;

/**
 * Defines which states a robot type has. States are stateless and shared by all robots of
 * this behaviour. To create a new robot type (e.g. a stationary sentry), make another
 * behaviour with a different state set — the machine and robot code stay unchanged.
 */
export class RobotBehaviour {
  readonly initialState: RobotStateId = 'patrol';
  private readonly states: ReadonlyArray<State<RobotContext, RobotStateId>> = [
    new PatrolState(),
    new InvestigateState(),
    new ChaseState(),
    new SearchState(),
    new ReturnState(),
  ];

  install(machine: RobotStateMachine): void {
    for (const s of this.states) machine.register(s);
  }
}
