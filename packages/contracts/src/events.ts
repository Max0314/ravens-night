export interface GameEvent<TPayload = Record<string, unknown>> {
  seq: number;
  type: string;
  at: string;
  publicPayload: Record<string, unknown>;
  privatePayload?: TPayload;
}
