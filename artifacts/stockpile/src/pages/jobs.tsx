import { useListJobs, useDeleteJob, getListJobsQueryKey } from "@workspace/api-client-react";
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
  const { profile } = useUserProfile();
  const isElevated = profile?.role === "super_admin" || profile?.role === "admin";
  const isReadOnly = profile?.role === "readonly";

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
      toast({ title: "Report failed", description: "Could not generate the PDF report.", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }, [downloadingId, toast]);

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
    await fetch(`/api/jobs/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
      toast({ title: "Job deleted", description: `"${deleteTarget.name}" has been removed.` });
    } catch {
      toast({ title: "Delete failed", description: "Could not delete the job. Please try again.", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono uppercase">Measurements</h1>
          <p className="text-muted-foreground">All stockpile volumetric analysis jobs.</p>
        </div>
        {isReadOnly ? (
          <Button className="font-mono uppercase" disabled title="Read-only access — contact an admin to create measurements">
            <Plus className="mr-2 h-4 w-4" /> New Measurement
          </Button>
        ) : (
          <Link href="/jobs/new">
            <Button className="font-mono uppercase">
              <Plus className="mr-2 h-4 w-4" /> New Measurement
            </Button>
          </Link>
        )}
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              className="pl-8 bg-background/50 font-mono text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={materialFilter} onValueChange={setMaterialFilter}>
            <SelectTrigger className="w-full sm:w-[180px] bg-background/50 font-mono text-sm uppercase">
              <SelectValue placeholder="Material" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Materials</SelectItem>
              <SelectItem value="sand">Sand</SelectItem>
              <SelectItem value="soil">Soil</SelectItem>
              <SelectItem value="coal">Coal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px] bg-background/50 font-mono text-sm uppercase">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
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
            <h3 className="text-lg font-bold font-mono uppercase mb-1">No jobs found</h3>
            <p className="text-muted-foreground max-w-sm">
              {jobs?.length === 0
                ? "You haven't created any measurement jobs yet."
                : "No jobs match your current search filters."}
            </p>
            {jobs?.length === 0 && !isReadOnly && (
              <Link href="/jobs/new" className="mt-4">
                <Button variant="outline" className="font-mono uppercase">Create Job</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono uppercase text-xs">Name</TableHead>
                  <TableHead className="font-mono uppercase text-xs">Material</TableHead>
                  <TableHead className="font-mono uppercase text-xs">Status</TableHead>
                  <TableHead className="font-mono uppercase text-xs text-right">Volume (m³)</TableHead>
                  {(isElevated || isReadOnly) && (
                    <TableHead className="font-mono uppercase text-xs">Owner</TableHead>
                  )}
                  <TableHead className="font-mono uppercase text-xs text-right">Created</TableHead>
                  <TableHead className="font-mono uppercase text-xs text-center w-[90px]">Report</TableHead>
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
                          {job.status}
                        </span>
                      ) : job.status === 'running' || job.status === 'queued' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          {job.status}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono uppercase bg-destructive/20 text-destructive border border-destructive/30">
                          {job.status}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {job.volumeM3 ? job.volumeM3.toLocaleString() : '-'}
                    </TableCell>
                    {(isElevated || isReadOnly) && (
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

                    {/* ── PDF Report download ── */}
                    <TableCell className="text-center p-2">
                      {job.status === "completed" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                          title="Download PDF report"
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
                          title={`Report available once job is completed (currently ${job.status})`}
                          disabled
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>

                    {/* ── Actions menu (hidden for readonly) ── */}
                    <TableCell className="text-right p-2">
                      {!isReadOnly && (
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
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                              onSelect={() => setDeleteTarget({ id: job.id, name: job.name })}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
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

      {/* ── Edit dialog ── */}
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

      {/* ── Delete confirmation dialog ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="border-border/50 bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono uppercase">Delete Measurement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span> and all
              associated imagery and measurements. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono uppercase">Cancel</AlertDialogCancel>
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
