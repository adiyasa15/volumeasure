import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { desc, eq } from "drizzle-orm";
import { db, jobsTable } from "@workspace/db";

interface AuthedRequest extends Request {
  userId?: string;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const userId = (auth?.sessionClaims as { userId?: string } | undefined)?.userId || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}

const router: IRouter = Router();
router.use(requireAuth);

router.get("/summary", async (req: AuthedRequest, res) => {
  const rows = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.userId, req.userId!));

  const totalJobs = rows.length;
  const completed = rows.filter((r) => r.status === "completed");
  const totalVolumeM3 =
    Math.round(
      completed.reduce((sum, r) => sum + (r.volumeM3 ?? 0), 0) * 100,
    ) / 100;
  const completedJobs = completed.length;
  const activeJobs = rows.filter(
    (r) => r.status === "queued" || r.status === "running",
  ).length;
  const averageVolumeM3 =
    completedJobs > 0
      ? Math.round((totalVolumeM3 / completedJobs) * 100) / 100
      : null;

  const materials: ("sand" | "soil" | "coal")[] = ["sand", "soil", "coal"];
  const byMaterial = materials.map((m) => {
    const items = rows.filter((r) => r.materialType === m);
    const v = items
      .filter((r) => r.status === "completed")
      .reduce((s, r) => s + (r.volumeM3 ?? 0), 0);
    return {
      materialType: m,
      jobCount: items.length,
      totalVolumeM3: Math.round(v * 100) / 100,
    };
  });

  const statuses: ("queued" | "running" | "completed" | "failed")[] = [
    "queued",
    "running",
    "completed",
    "failed",
  ];
  const byStatus = statuses.map((s) => ({
    status: s,
    count: rows.filter((r) => r.status === s).length,
  }));

  res.json({
    totalJobs,
    totalVolumeM3,
    completedJobs,
    activeJobs,
    averageVolumeM3,
    byMaterial,
    byStatus,
  });
});

router.get("/recent-activity", async (req: AuthedRequest, res) => {
  const rows = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.userId, req.userId!))
    .orderBy(desc(jobsTable.updatedAt))
    .limit(10);

  res.json(
    rows.map((r) => ({
      id: r.id,
      jobId: r.id,
      jobName: r.name,
      materialType: r.materialType as "sand" | "soil" | "coal",
      status: r.status as "queued" | "running" | "completed" | "failed",
      volumeM3: r.volumeM3 ?? null,
      createdAt: r.updatedAt.toISOString(),
    })),
  );
});

export default router;
