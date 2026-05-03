import { useListJobs, useDeleteJob, getListJobsQueryKey } from "@workspace/api-client-react";
import { getActiveToken } from "@/lib/adminAuth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PolygonDrawer } from "@/components/polygon-drawer";
import { format } from "date-fns";
import { Loader2, Plus, Search, Layers, Pickaxe, Pencil, Trash2, MoreHorizontal, User, FileDown } from "lucide-react";
import { useUserProfile } from "@/context/UserProfileContext";
import { generateJobReport } from "@/lib/report";
import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

type EditTarget = {
  id: string;
  name: string;
  center: [number, number] | null;
  initialVertices: [number, number][];
};

export default function Jobs() {
  const { data: jobs, isLoading } = useListJobs();
  const deleteJob = useDeleteJob();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile, isLocalAdmin } = useUserProfile();
  const { t } = useTranslation();
  const isElevated = profile?.role === "super_admin" || profile?.role === "admin";
  const isReadOnly = profile?.role === "readonly";

  const canMutateJob = (job: NonNullable<typeof jobs>[number]) => {
    if (isReadOnly) return false;
    if (isElevated || isLocalAdmin) return true;
    return (job as any).ownerId === profile?.clerkUserId;
  };

  const showOwnerCol = true;

  const [search, setSearch] = useState("");
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadReport = useCallback(async (job: NonNullable<typeof jobs>[number]) => {
    if (downloadingId) return;
    setDownloadingId(job.id);
    try {
      await generateJobReport(job);
    } catch {
      toast({ title: t("jobs.reportFailed"), description: t("jobs.reportFailedDesc"), variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }, [downloadingId, toast, t]);

  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter((job) => {
      const matchesSearch = job.name.toLowerCase().includes(search.toLowerCase());
      const matchesMaterial = materialFilter === "all" || job.materialType === materialFilter;
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      return matchesSearch && matchesMaterial && matchesStatus;
    });
  }, [jobs, search, materialFilter, statusFilter]);

  const handleSaveName = async (name: string) => {
    if (!editTarget) return;
    const token = getActiveToken();
    await fetch(`/api/jobs/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ name }),
    });
    queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
  };

  const handleEditComplete = () => {
    queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
    setEditTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteJob.mutateAsync({ id: deleteTarget.id });
      queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      toast({ title: t("jobs.jobDeleted"), description: t("jobs.jobDeletedDesc", { name: deleteTarget.name }) });
    } catch {
      toast({ title: t("jobs.deleteFailed"), description: t("jobs.deleteFailedDesc"), variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono uppercase">{t("jobs.title")}</h1>
          <p className="text-muted-foreground">{t("jobs.subtitle")}</p>
        </div>
        {isReadOnly ? (
          <Button className="font-mono uppercase" disabled title="Read-only access — contact an admin to create measurements">
            <Plus className="mr-2 h-4 w-4" /> {t("jobs.newMeasurement")}
          </Button>
        ) : (
          <Link href="/jobs/new">
            <Button className="font-mono uppercase">
              <Plus className="mr-2 h-4 w-4" /> {t("jobs.newMeasurement")}
            </Button>
          </Link>
        )}
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("jobs.searchPlaceholder")}
              className="pl-8 bg-background/50 font-mono text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={materialFilter} onValueChange={setMaterialFilter}>
            <SelectTrigger className="w-full sm:w-[180px] bg-background/50 font-mono text-sm uppercase">
              <SelectValue placeholder={t("jobs.allMaterials")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("jobs.allMaterials")}</SelectItem>
              <SelectItem value="sand">{t("jobs.sand")}</SelectItem>
              <SelectItem value="soil">{t("jobs.soil")}</SelectItem>
              <SelectItem value="coal">{t("jobs.coal")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px] bg-background/50 font-mono text-sm uppercase">
              <SelectValue placeholder={t("jobs.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("jobs.allStatuses")}</SelectItem>
              <SelectItem value="queued">{t("common.queued")}</SelectItem>
              <SelectItem value="running">{t("common.running")}</SelectItem>
              <SelectItem value="completed">{t("common.completed")}</SelectItem>
              <SelectItem value="failed">{t("common.failed")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border/50 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Layers className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-bold font-mono uppercase mb-1">{t("jobs.noJobsFound")}</h3>
            <p className="text-muted-foreground max-w-sm">
              {jobs?.length === 0 ? t("jobs.noJobsYet") : t("jobs.noJobsFilter")}
            </p>
            {jobs?.length === 0 && !isReadOnly && (
              <Link href="/jobs/new" className="mt-4">
                <Button variant="outline" className="font-mono uppercase">{t("jobs.createJob")}</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono uppercase text-xs">{t("jobs.colName")}</TableHead>
                  <TableHead className="font-mono uppercase text-xs">{t("jobs.colMaterial")}</TableHead>
                  <TableHead className="font-mono uppercase text-xs">{t("jobs.colStatus")}</TableHead>
                  <TableHead className="font-mono uppercase text-xs text-right">{t("jobs.colVolume")}</TableHead>
                  {showOwnerCol && (
                    <TableHead className="font-mono uppercase text-xs">{t("jobs.colOwner")}</TableHead>
                  )}
                  <TableHead className="font-mono uppercase text-xs text-right">{t("jobs.colCreated")}</TableHead>
                  <TableHead className="font-mono uppercase text-xs text-center w-[90px]">{t("jobs.colReport")}</TableHead>
                  <TableHead className="w-[48px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => (
                  <TableRow key={job.id} className="hover:bg-secondary/30 transition-colors group">
                    <TableCell>
                      <Link href={`/jobs/${job.id}`} className="font-medium hover:text-primary transition-colors block py-2">
                        {job.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm uppercase text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Pickaxe className="h-3.5 w-3.5" /> {job.materialType}
                      </span>
                    </TableCell>
                    <TableCell>
                      {job.status === 'completed' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono uppercase bg-primary/20 text-primary border border-primary/30">
                          {t("common.completed")}
                        </span>
                      ) : job.status === 'running' || job.status === 'queued' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          {job.status === 'running' ? t("common.running") : t("common.queued")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono uppercase bg-destructive/20 text-destructive border border-destructive/30">
                          {t("common.failed")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {job.volumeM3 ? job.volumeM3.toLocaleString() : '-'}
                    </TableCell>
                    {showOwnerCol && (
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        <span className="flex items-center gap-1.5">
                          <User className="h-3 w-3 shrink-0" />
                          {(job as any).ownerName || (job as any).ownerEmail || <span className="opacity-50">—</span>}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-right text-muted-foreground text-sm font-mono">
                      {format(new Date(job.createdAt), 'MMM d, yyyy')}
                    </TableCell>

                    <TableCell className="text-center p-2">
                      {job.status === "completed" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                          title={t("jobs.downloadReport")}
                          disabled={downloadingId === job.id}
                          onClick={(e) => { e.stopPropagation(); void handleDownloadReport(job); }}
                        >
                          {downloadingId === job.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <FileDown className="h-4 w-4" />}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground/30 cursor-not-allowed"
                          title={t("jobs.reportAvailable", { status: job.status })}
                          disabled
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>

                    <TableCell className="text-right p-2">
                      {canMutateJob(job) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity data-[state=open]:opacity-100"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40 font-mono text-xs">
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer"
                              onSelect={() =>
                                setEditTarget({
                                  id: job.id,
                                  name: job.name,
                                  center:
                                    job.latitude != null && job.longitude != null
                                      ? [job.latitude, job.longitude]
                                      : null,
                                  initialVertices: (job.polygonCoordinates as [number, number][] | null) ?? [],
                                })
                              }
                            >
                              <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                              onSelect={() => setDeleteTarget({ id: job.id, name: job.name })}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {editTarget && (
        <PolygonDrawer
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          jobId={editTarget.id}
          center={editTarget.center}
          mode="edit"
          initialVertices={editTarget.initialVertices}
          initialJobName={editTarget.name}
          onSaveName={handleSaveName}
          onComplete={handleEditComplete}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="border-border/50 bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono uppercase">{t("jobs.deleteMeasurement")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("jobs.deleteDesc", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono uppercase">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono uppercase"
              onClick={handleConfirmDelete}
              disabled={deleteJob.isPending}
            >
              {deleteJob.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
