import { Router, Request, Response } from "express";
import { getAllApis, getApisByCreator } from "../db/schema.js";

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
