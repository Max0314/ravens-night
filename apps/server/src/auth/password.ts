import { Algorithm, hash, verify } from "@node-rs/argon2";

const options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error("Password must contain at least 12 characters");
  }
  return hash(password, options);
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  try {
    return await verify(encodedHash, password, options);
  } catch {
    return false;
  }
}
