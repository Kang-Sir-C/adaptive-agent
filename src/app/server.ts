import "dotenv/config";
import express from "express";
import { createRouter } from "./routes.js";
import { Orchestrator } from "../core/orchestrator/orchestrator.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const orchestrator = new Orchestrator();

app.use(express.json({ limit: "2mb" }));
app.use(createRouter(orchestrator));

app.listen(port, () => {
  console.log(`Adaptive Agent server listening on port ${port}`);
});
