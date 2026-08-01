import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  disabled: boolean("disabled").notNull().default(false),
  ...timestamps,
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamps.createdAt,
});

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizerId: uuid("organizer_id").notNull().references(() => users.id),
  codeHash: text("code_hash").notNull().unique(),
  state: text("state").notNull().default("LOBBY"),
  playerCount: integer("player_count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const roomParticipants = pgTable("room_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  nickname: text("nickname"),
  seat: integer("seat"),
  tokenHash: text("token_hash").notNull().unique(),
  connected: boolean("connected").notNull().default(false),
  createdAt: timestamps.createdAt,
});

export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  engineVersion: text("engine_version").notNull(),
  contentVersion: text("content_version").notNull(),
  encryptedSeed: text("encrypted_seed").notNull(),
  status: text("status").notNull(),
  ...timestamps,
});

export const gameEvents = pgTable(
  "game_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    publicPayload: jsonb("public_payload").notNull(),
    encryptedPrivatePayload: text("encrypted_private_payload"),
    commandId: text("command_id").notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    uniqueIndex("game_events_game_seq_unique").on(table.gameId, table.seq),
    uniqueIndex("game_events_game_command_unique").on(table.gameId, table.commandId),
  ],
);

export const gameSnapshots = pgTable(
  "game_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    encryptedState: text("encrypted_state").notNull(),
    checksum: text("checksum").notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [uniqueIndex("game_snapshots_game_seq_unique").on(table.gameId, table.seq)],
);
