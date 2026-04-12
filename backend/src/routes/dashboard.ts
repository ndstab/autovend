import { Router, Request, Response } from "express";
import { getDashboardStats, getApisByCreator } from "../db/schema.js";

export const dashboardRouter = Router();

/**
 * GET /api/dashboard/:creatorId
 * Returns earnings summary for a creator
 */
dashboardRouter.get("/:creatorId", (req: Request, res: Response) => {
  const creatorId = req.params.creatorId as string;

  const stats = getDashboardStats(creatorId);
  const apis = getApisByCreator(creatorId);

  res.json({
    stats,
    apis,
  });
});
