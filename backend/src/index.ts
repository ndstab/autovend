import "./env.js"; // must be first — loads .env before any other imports
import express from "express";
import cors from "cors";
import { buildRouter } from "./routes/build.js";
import { apisRouter } from "./routes/apis.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { initDb } from "./db/schema.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize database
initDb();

// Routes
app.use("/api/build", buildRouter);
app.use("/api/apis", apisRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/webhooks", webhooksRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "autovend" });
});

app.listen(PORT, () => {
  console.log(`AutoVend backend running on port ${PORT}`);
});
