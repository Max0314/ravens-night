export class RoomError extends Error {
  constructor(readonly errorCode: string, message: string, readonly status = 409, readonly refreshRequired = true, readonly details?: {joinTicketConsumed:false;profile?:unknown}) {
    super(message);
    this.name = "RoomError";
  }
}

export const ONLINE_MS = 30_000;
export const HOST_CLAIM_MS = 300_000;
export const TICKET_MS = 600_000;
export const COMMAND_RECEIPT_LIMIT = 256;
export const PUBLICATION_TICK_MS = 500;
