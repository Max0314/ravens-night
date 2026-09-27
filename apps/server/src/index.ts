import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp();

void app.listen({ host: "0.0.0.0", port }).catch(async (error: unknown) => {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
});
