import "./env.js"; // must be first — loads .env before any other imports
import express from "express";
import cors from "cors";
import { buildRouter } from "./routes/build.js";
import { apisRouter } from "./routes/apis.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { checkoutRouter } from "./routes/checkout.js";
import { proxyRouter } from "./routes/proxy.js";
import { initDb, getLiveApiIds } from "./db/schema.js";
import { restartLiveApis } from "./services/executor.js";

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
app.use("/api/checkout", checkoutRouter);
app.use("/api/call", proxyRouter);
app.use("/webhooks", webhooksRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "autovend" });
});

app.listen(PORT, async () => {
  console.log(`AutoVend backend running on port ${PORT}`);

  // Restart any APIs that were live before server restart
  const liveIds = getLiveApiIds();
  if (liveIds.length > 0) {
    console.log(`Restarting ${liveIds.length} previously live APIs...`);
    restartLiveApis(liveIds).catch((err) =>
      console.warn("Failed to restart some APIs:", err)
    );
  }
});
