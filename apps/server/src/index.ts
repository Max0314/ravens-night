import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp();

await app.listen({ host: "0.0.0.0", port });
