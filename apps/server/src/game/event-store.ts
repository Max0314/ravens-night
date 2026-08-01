import type { EngineEvent } from "@ravens/game-engine";

export interface StoredCommandEvents {
  commandId: string;
  events: EngineEvent[];
}

export interface EventStore {
  append(commandId: string, events: EngineEvent[]): Promise<StoredCommandEvents>;
  findByCommandId(commandId: string): Promise<StoredCommandEvents | undefined>;
  load(): Promise<StoredCommandEvents[]>;
}

export class MemoryEventStore implements EventStore {
  readonly #commands: StoredCommandEvents[] = [];

  async append(commandId: string, events: EngineEvent[]): Promise<StoredCommandEvents> {
    const existing = await this.findByCommandId(commandId);
    if (existing) return existing;
    const stored = { commandId, events: structuredClone(events) };
    this.#commands.push(stored);
    return structuredClone(stored);
  }

  async findByCommandId(commandId: string): Promise<StoredCommandEvents | undefined> {
    const found = this.#commands.find((command) => command.commandId === commandId);
    return found ? structuredClone(found) : undefined;
  }

  async load(): Promise<StoredCommandEvents[]> {
    return structuredClone(this.#commands);
  }
}
