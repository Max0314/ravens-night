import { access } from "node:fs/promises";
import { test } from "vitest";

test("a production checkout contains every required deploy artifact", async () => {
  await Promise.all([
    access("deploy/docker-compose.yml"),
    access("deploy/Dockerfile"),
    access(".env.example"),
  ]);
});
