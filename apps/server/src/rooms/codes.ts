import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function createRoomCode(length = 6): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "");
}
