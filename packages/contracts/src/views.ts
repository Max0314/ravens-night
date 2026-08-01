import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const GamePhaseSchema = Type.Union([
  Type.Literal("LOBBY"),
  Type.Literal("TUTORIAL"),
  Type.Literal("ROLE_REVEAL"),
  Type.Literal("FIRST_NIGHT"),
  Type.Literal("DAWN"),
  Type.Literal("DAY_DISCUSSION"),
  Type.Literal("NOMINATION"),
  Type.Literal("VOTING"),
  Type.Literal("EXECUTION"),
  Type.Literal("OTHER_NIGHT"),
  Type.Literal("PAUSED_FOR_RECONNECT"),
  Type.Literal("GAME_OVER"),
  Type.Literal("ABORTED"),
]);

export type GamePhase = Static<typeof GamePhaseSchema>;

export const PublicSeatSchema = Type.Object(
  {
    seat: Type.Integer({ minimum: 1, maximum: 12 }),
    nickname: Type.String({ minLength: 1, maxLength: 24 }),
    alive: Type.Boolean(),
    connected: Type.Boolean(),
    ghostVoteAvailable: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const PublicEventSchema = Type.Object(
  {
    seq: Type.Integer({ minimum: 0 }),
    kind: Type.String({ minLength: 1, maxLength: 64 }),
    message: Type.String({ maxLength: 240 }),
  },
  { additionalProperties: false },
);

export const PublicGameViewSchema = Type.Object(
  {
    roomCode: Type.String({ pattern: "^[A-Z2-9]{6}$" }),
    phase: GamePhaseSchema,
    day: Type.Integer({ minimum: 0 }),
    seats: Type.Array(PublicSeatSchema, { maxItems: 12 }),
    publicEvents: Type.Array(PublicEventSchema),
    countdownEndsAt: Type.Optional(Type.String({ format: "date-time" })),
    nomination: Type.Optional(
      Type.Object(
        {
          nominatorSeat: Type.Integer(),
          nomineeSeat: Type.Integer(),
          votes: Type.Integer({ minimum: 0 }),
          threshold: Type.Integer({ minimum: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export type PublicGameView = Static<typeof PublicGameViewSchema>;

export interface PlayerSecretView {
  roleId: string;
  alignment: "GOOD" | "EVIL";
  abilitySummary: string;
  privateMessages: Array<{ seq: number; text: string }>;
  availableAction?: {
    kind: string;
    legalSeats: number[];
    confirmationRequired: boolean;
  };
}

export interface PlayerGameView {
  public: PublicGameView;
  self: PlayerSecretView;
}

export interface OrganizerLobbyView {
  public: PublicGameView;
  canRemoveUnseatedGuests: boolean;
  canStartTutorial: boolean;
  pendingDisplayIds: string[];
}

export function parsePublicGameView(value: unknown): PublicGameView {
  if (!Value.Check(PublicGameViewSchema, value)) {
    throw new Error("Invalid public view: payload contains missing or hidden fields");
  }
  return value as PublicGameView;
}
