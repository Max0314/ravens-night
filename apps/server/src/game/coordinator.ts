import { decide, reduce, replay, type EngineCommand, type EngineEvent, type GameState } from "@ravens/game-engine";
import type { EventStore } from "./event-store.js";

export class RoomCoordinator {
  #state: GameState;
  #tail: Promise<void> = Promise.resolve();

  constructor(initialState: GameState, readonly store: EventStore) {
    this.#state = structuredClone(initialState);
  }

  static async recover(initialState: GameState, store: EventStore): Promise<RoomCoordinator> {
    const commands = await store.load();
    const state = replay(initialState, commands.flatMap((command) => command.events));
    return new RoomCoordinator(state, store);
  }

  getState(): GameState {
    return structuredClone(this.#state);
  }

  submit(commandId: string, command: EngineCommand): Promise<EngineEvent[]> {
    return new Promise<EngineEvent[]>((resolve, reject) => {
      this.#tail = this.#tail
        .then(async () => {
          const duplicate = await this.store.findByCommandId(commandId);
          if (duplicate) {
            resolve(duplicate.events);
            return;
          }
          const events = decide(this.#state, command);
          const stored = await this.store.append(commandId, events);
          this.#state = stored.events.reduce(reduce, this.#state);
          resolve(stored.events);
        })
        .catch(reject);
    });
  }
}
