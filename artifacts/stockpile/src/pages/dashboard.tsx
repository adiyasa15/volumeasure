import { useGetDashboardSummary, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mountain, Box, Pickaxe, CheckCircle2, Activity, Ruler, ArrowRight, Loader2, Plus, Image as ImageIcon, Timer } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

function formatDuration(seconds?: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: recentActivity, isLoading: isLoadingActivity } = useGetRecentActivity();
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono uppercase">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        <Link href="/jobs/new">
          <Button className="font-mono uppercase">
            <Plus className="mr-2 h-4 w-4" /> {t("dashboard.newMeasurement")}
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium font-mono uppercase text-muted-foreground">{t("dashboard.totalJobs")}</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold">{summary?.totalJobs || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium font-mono uppercase text-muted-foreground">{t("dashboard.totalVolume")}</CardTitle>
            <Mountain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-bold">{summary?.totalVolumeM3?.toLocaleString() || 0} <span className="text-lg text-muted-foreground font-normal">m³</span></div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium font-mono uppercase text-muted-foreground">{t("dashboard.activeProcessing")}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold text-primary">{summary?.activeJobs || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium font-mono uppercase text-muted-foreground">{t("dashboard.completed")}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold">{summary?.completedJobs || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium font-mono uppercase text-muted-foreground">{t("dashboard.photosProcessed")}</CardTitle>
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold font-mono">{(summary?.totalImages ?? 0).toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium font-mono uppercase text-muted-foreground">{t("dashboard.avgProcessing")}</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-bold font-mono">{formatDuration(summary?.averageProcessingDurationSeconds)}</div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium font-mono uppercase text-muted-foreground">{t("dashboard.avgVolume")}</CardTitle>
            <Ruler className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-bold font-mono">
                {summary?.averageVolumeM3 != null ? summary.averageVolumeM3.toLocaleString() : "—"}
                <span className="text-lg text-muted-foreground font-normal"> m³</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium font-mono uppercase text-muted-foreground">{t("dashboard.materialTypes")}</CardTitle>
            <Pickaxe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold font-mono">{summary?.byMaterial?.length ?? 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 bg-card/50">
          <CardHeader>
            <CardTitle className="font-mono uppercase text-sm">{t("dashboard.materialBreakdown")}</CardTitle>
            <CardDescription>{t("dashboard.materialBreakdownDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : summary?.byMaterial?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Pickaxe className="h-8 w-8 mb-4 opacity-50" />
                <p>{t("dashboard.noMaterials")}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {summary?.byMaterial?.map((mat) => (
                  <div key={mat.materialType} className="flex items-center">
                    <div className="w-16 font-mono text-sm uppercase">{mat.materialType}</div>
                    <div className="flex-1 px-4">
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.max(5, (mat.totalVolumeM3 / (summary.totalVolumeM3 || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-24 text-right font-mono text-sm">
                      {mat.totalVolumeM3.toLocaleString()} m³
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 bg-card/50">
          <CardHeader>
            <CardTitle className="font-mono uppercase text-sm">{t("dashboard.recentActivity")}</CardTitle>
            <CardDescription>{t("dashboard.recentActivityDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : recentActivity?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Activity className="h-8 w-8 mb-4 opacity-50" />
                <p>{t("dashboard.noActivity")}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentActivity?.map((activity) => (
                  <Link key={activity.id} href={`/jobs/${activity.jobId}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 hover:bg-secondary/50 transition-colors cursor-pointer group mb-2">
                      <div className="space-y-1">
                        <p className="text-sm font-medium font-mono truncate max-w-[150px] sm:max-w-[200px]">
                          {activity.jobName}
                        </p>
                        <div className="flex items-center text-xs text-muted-foreground gap-2 flex-wrap">
                          <span className="uppercase">{activity.materialType}</span>
                          <span>•</span>
                          <span>{format(new Date(activity.createdAt), 'MMM d, HH:mm')}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" />{activity.imageCount}</span>
                          {activity.processingDurationSeconds != null && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1"><Timer className="h-3 w-3" />{formatDuration(activity.processingDurationSeconds)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {activity.status === 'completed' && activity.volumeM3 ? (
                            <span className="text-sm font-mono font-medium">{activity.volumeM3.toLocaleString()} m³</span>
                          ) : activity.status === 'running' || activity.status === 'queued' ? (
                            <span className="flex items-center text-xs text-primary font-mono uppercase">
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              {t("dashboard.processing")}
                            </span>
                          ) : activity.status === 'failed' ? (
                            <span className="text-xs text-destructive font-mono uppercase">{t("dashboard.failed")}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono uppercase">{activity.status}</span>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
