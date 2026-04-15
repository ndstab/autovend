import { Router, Request, Response } from "express";
import { getAllApis, getApisByCreator, getDb } from "../db/schema.js";
import { stopApi } from "../services/executor.js";
import fs from "fs";
import path from "path";

export const apisRouter = Router();

/**
 * GET /api/apis
 * List all live APIs (marketplace)
 */
apisRouter.get("/", (_req: Request, res: Response) => {
  const apis = getAllApis();
  res.json({ apis });
});

/**
 * GET /api/apis/creator/:creatorId
 * List APIs by a specific creator
 */
apisRouter.get("/creator/:creatorId", (req: Request, res: Response) => {
  const creatorId = req.params.creatorId as string;
  const apis = getApisByCreator(creatorId);
  res.json({ apis });
});

/**
 * DELETE /api/apis/:id
 * Delete an API owned by the requesting creator.
 * Stops the running process, removes DB rows, and cleans up files.
 */
apisRouter.delete("/:id", (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { creator_id } = req.body as { creator_id?: string };

  if (!creator_id) {
    res.status(400).json({ error: "creator_id required" });
    return;
  }

  const db = getDb();
  const api = db.prepare("SELECT * FROM apis WHERE id = ?").get(id) as
    | { id: string; creator_id: string; status: string } | undefined;

  if (!api) {
    res.status(404).json({ error: "API not found" });
    return;
  }
  if (api.creator_id !== creator_id) {
    res.status(403).json({ error: "Not your API" });
    return;
  }

  // Stop the process if running
  try { stopApi(id); } catch { /* already stopped */ }

  // Remove DB rows
  db.prepare("DELETE FROM earnings WHERE api_id = ?").run(id);
  db.prepare("DELETE FROM apis WHERE id = ?").run(id);

  // Clean up generated files
  const apisDir = process.env.APIS_DIR || "./data/apis";
  const apiDir = path.resolve(apisDir, id);
  try {
    if (fs.existsSync(apiDir)) {
      fs.rmSync(apiDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[apis] Failed to remove API dir ${apiDir}:`, err);
  }

  console.log(`[apis] Deleted API ${id} by creator ${creator_id}`);
  res.json({ success: true });
});
