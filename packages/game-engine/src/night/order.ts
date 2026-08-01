import { ROLE_CATALOG } from "../roles/catalog.js";

export const FIRST_NIGHT_ORDER = [...ROLE_CATALOG]
  .filter((role) => role.firstNightOrder !== undefined)
  .sort((left, right) => left.firstNightOrder! - right.firstNightOrder!)
  .map((role) => role.id);

export const OTHER_NIGHT_ORDER = [...ROLE_CATALOG]
  .filter((role) => role.otherNightOrder !== undefined)
  .sort((left, right) => left.otherNightOrder! - right.otherNightOrder!)
  .map((role) => role.id);
