import { useLocation, useParams } from "wouter";
import { useGetJob, useDeleteJob, useRefreshJob, useSetJobPolygon, getGetJobQueryKey } from "@workspace/api-client-react";
import { PolygonDrawer } from "@/components/polygon-drawer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mountain, Ruler, RefreshCw, Trash2, Calendar, Camera, Pickaxe, MapPin, Target, AlertCircle, CheckCircle2, ChevronLeft, Image as ImageIcon, Map as MapIcon, Loader2, FileDown } from "lucide-react";
import { generateJobReport } from "@/lib/report";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Fix leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function JobDetail() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Custom polling logic based on status
  const { data: job, isLoading, error } = useGetJob(id, {
    query: {
      refetchInterval: (query: { state: { data?: { status?: string } } }) => {
        const currentJob = query.state.data;
        if (currentJob?.status === 'queued' || currentJob?.status === 'running') {
          return 5000;
        }
        return false;
      },
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const deleteJob = useDeleteJob();
  const refreshJob = useRefreshJob();
  const setPolygon = useSetJobPolygon();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [polygonDrawerOpen, setPolygonDrawerOpen] = useState(false);

  // If job doesn't exist or error
  useEffect(() => {
    if (error) {
      toast({
        title: "Error loading job",
        description: "The measurement job could not be found or you don't have access.",
        variant: "destructive"
      });
      setLocation("/jobs");
    }
  }, [error, setLocation, toast]);

  const handleDelete = async () => {
    try {
      await deleteJob.mutateAsync({ id });
      toast({
        title: "Job deleted",
        description: "The measurement job has been permanently removed."
      });
      setLocation("/jobs");
    } catch (err) {
      toast({
        title: "Failed to delete",
        description: "An error occurred while deleting the job.",
        variant: "destructive"
      });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshJob.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(id) });
      toast({
        title: "Status Refreshed",
        description: "Successfully fetched latest status."
      });
    } catch (err) {
      toast({
        title: "Refresh Failed",
        description: "Could not fetch latest status.",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading || !job) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-64 md:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const isProcessing = job.status === 'queued' || job.status === 'running';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';

  const needsManualPolygon =
    isCompleted &&
    job.polygonMode === "manual" &&
    job.volumeM3 == null;

  const handleManualMeasure = async (coords: number[][]) => {
    try {
      const updated = await setPolygon.mutateAsync({
        id,
        data: { polygonCoordinates: coords },
      });
      queryClient.setQueryData(getGetJobQueryKey(id), updated);
      setPolygonDrawerOpen(false);
      toast({
        title: "Volume calculated",
        description: `Measured area: ${updated.areaSqm?.toLocaleString()} m² — Volume: ${updated.volumeM3?.toLocaleString()} m³`,
      });
    } catch {
      toast({
        title: "Failed to calculate volume",
        description: "An error occurred while saving the polygon.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {needsManualPolygon && (
        <div className="flex flex-col gap-3 px-4 py-4 rounded-lg border border-primary/50 bg-primary/10">
          <div>
            <p className="font-mono uppercase text-sm font-bold text-primary tracking-wide">Draw Measurement Polygon</p>
            <p className="text-xs text-muted-foreground mt-1">
              Processing is complete. Draw your stockpile boundary on the map below to calculate volume and area.
            </p>
          </div>
          <Button
            size="default"
            variant="default"
            className="font-mono uppercase text-xs w-full sm:w-auto self-start"
            onClick={() => setPolygonDrawerOpen(true)}
          >
            Draw Polygon &amp; Measure Volume
          </Button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/jobs")} className="shrink-0 rounded-full">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-mono truncate max-w-xl">{job.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground font-mono">
              <span className="flex items-center uppercase">
                <Pickaxe className="mr-1 h-3.5 w-3.5" /> {job.materialType}
              </span>
              <span>•</span>
              <span className="flex items-center">
                <Calendar className="mr-1 h-3.5 w-3.5" /> {format(new Date(job.createdAt), "MMM d, yyyy HH:mm")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto ml-12 sm:ml-0">
          <Button 
            variant="outline" 
            size="sm" 
            className="font-mono uppercase text-xs" 
            onClick={handleRefresh}
            disabled={isRefreshing || deleteJob.isPending || refreshJob.isPending}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isRefreshing || refreshJob.isPending ? 'animate-spin' : ''}`} /> 
            Refresh
          </Button>

          {isCompleted && (
            <Button
              variant="outline"
              size="sm"
              className="font-mono uppercase text-xs"
              onClick={() => generateJobReport(job)}
            >
              <FileDown className="mr-2 h-3.5 w-3.5" /> Report
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="font-mono uppercase text-xs" disabled={deleteJob.isPending}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-border/50 bg-background">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-mono uppercase">Delete Measurement Job?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the job and all associated imagery and measurements.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="font-mono uppercase">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground font-mono uppercase">
                  {deleteJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="font-mono uppercase font-bold text-sm text-muted-foreground">Status</h3>
                {isCompleted ? (
                  <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 font-mono uppercase">
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Completed
                  </Badge>
                ) : isProcessing ? (
                  <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30 font-mono uppercase">
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> {job.status}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="font-mono uppercase bg-destructive/20 text-destructive border-destructive/30">
                    <AlertCircle className="mr-1.5 h-3.5 w-3.5" /> Failed
                  </Badge>
                )}
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-mono">
                  <span>Processing Progress</span>
                  <span>{job.progress}%</span>
                </div>
                <Progress 
                  value={job.progress} 
                  className="h-2" 
                  
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:w-1/2">
              <div className="bg-background/50 rounded-lg p-4 border border-border/50 flex flex-col justify-center">
                <div className="text-xs text-muted-foreground font-mono uppercase mb-1 flex items-center">
                  <Mountain className="mr-1.5 h-3.5 w-3.5" /> Volume
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono">
                  {job.volumeM3 !== null && job.volumeM3 !== undefined ? (
                    <>{job.volumeM3.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">m³</span></>
                  ) : (
                    <span className="text-muted-foreground/50">--</span>
                  )}
                </div>
              </div>
              <div className="bg-background/50 rounded-lg p-4 border border-border/50 flex flex-col justify-center">
                <div className="text-xs text-muted-foreground font-mono uppercase mb-1 flex items-center">
                  <Ruler className="mr-1.5 h-3.5 w-3.5" /> Area
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono">
                  {job.areaSqm !== null && job.areaSqm !== undefined ? (
                    <>{job.areaSqm.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">m²</span></>
                  ) : (
                    <span className="text-muted-foreground/50">--</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
        <div className="md:col-span-2 lg:col-span-3 space-y-6">
          {/* Map or Orthophoto View */}
          <Card className="bg-card/50 border-border/50 overflow-hidden flex flex-col">
            <CardHeader className="py-4">
              <CardTitle className="font-mono uppercase text-sm flex items-center">
                <MapIcon className="mr-2 h-4 w-4" /> Spatial Data
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-[400px] relative bg-secondary/20">
              {job.latitude && job.longitude ? (
                <div className="absolute inset-0">
                  <MapContainer
                    center={[job.latitude, job.longitude]}
                    zoom={18}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%', zIndex: 1 }}
                  >
                    <TileLayer
                      attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    />
                    {job.orthophotoUrl === "tiles_ready" && job.webodmTaskId && isCompleted && (
                      <TileLayer
                        url={`/api/jobs/${job.id}/tiles/{z}/{x}/{y}`}
                        attribution="Orthophoto &copy; PileMetric"
                        opacity={0.9}
                        crossOrigin="use-credentials"
                      />
                    )}
                    <Marker position={[job.latitude, job.longitude]}>
                      <Popup className="font-mono">
                        {job.name}<br/>
                        Lat: {job.latitude.toFixed(6)}<br/>
                        Lng: {job.longitude.toFixed(6)}
                      </Popup>
                    </Marker>
                  </MapContainer>
                  {job.orthophotoUrl === "tiles_ready" && isCompleted && (
                    <div className="absolute bottom-4 left-4 z-[400] bg-background/90 backdrop-blur border border-primary/30 px-2 py-1 rounded text-[10px] font-mono uppercase text-primary pointer-events-none">
                      Processed Orthophoto
                    </div>
                  )}
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                  <MapPin className="h-12 w-12 mb-4 opacity-20" />
                  <p className="font-mono uppercase text-sm font-bold">No Spatial Data</p>
                  <p className="text-sm mt-1 max-w-sm">
                    {isProcessing
                      ? "Orthophoto will be available once processing completes."
                      : "No GPS coordinates were found in the uploaded imagery and none were provided manually."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Images List */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="py-4 border-b border-border/50 flex flex-row items-center justify-between">
              <CardTitle className="font-mono uppercase text-sm flex items-center">
                <ImageIcon className="mr-2 h-4 w-4" /> Source Imagery
              </CardTitle>
              <Badge variant="secondary" className="font-mono">{job.acceptedImageCount} / {job.imageCount}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[300px] overflow-y-auto">
                <div className="divide-y divide-border/50">
                  {job.images?.map((img, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 text-sm hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-3 overflow-hidden">
                        {img.accepted ? (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                        <div className="truncate">
                          <p className="truncate font-mono text-xs">{img.name}</p>
                          {!img.accepted && img.rejectionReason && (
                            <p className="text-[10px] text-destructive truncate mt-0.5">{img.rejectionReason}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        {img.sharpnessScore && (
                          <span className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border/50" title="Sharpness score">
                            S:{Math.round(img.sharpnessScore)}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-muted-foreground min-w-[50px] text-right">
                          {(img.sizeBytes / 1024 / 1024).toFixed(1)} MB
                        </span>
                      </div>
                    </div>
                  ))}
                  {(!job.images || job.images.length === 0) && (
                    <div className="p-8 text-center text-muted-foreground font-mono text-sm">
                      No images metadata recorded
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-1 space-y-6">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="py-4">
              <CardTitle className="font-mono uppercase text-sm">Job Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                <div>
                  <div className="text-xs text-muted-foreground font-mono uppercase mb-1">Material</div>
                  <div className="font-mono uppercase font-medium">{job.materialType}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-mono uppercase mb-1">Source</div>
                  <div className="font-mono uppercase font-medium flex items-center">
                    <Camera className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> {job.sourceType}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-mono uppercase mb-1">Precision</div>
                  <div className="font-mono uppercase font-medium flex items-center">
                    <Target className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> {job.precisionLevel}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-mono uppercase mb-1">Job ID</div>
                  <div className="font-mono uppercase font-medium text-xs truncate" title={job.id}>{job.id.substring(0, 8)}...</div>
                </div>
              </div>
              
              {job.notes && (
                <div className="pt-2 border-t border-border/50">
                  <div className="text-xs text-muted-foreground font-mono uppercase mb-1">Operator Notes</div>
                  <p className="text-sm bg-background/50 p-2 rounded border border-border/50 whitespace-pre-wrap">
                    {job.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="py-4">
              <CardTitle className="font-mono uppercase text-sm">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="relative pl-4 border-l-2 border-border/50 space-y-4">
                <div className="relative">
                  <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-muted-foreground ring-4 ring-background"></div>
                  <div className="text-xs text-muted-foreground font-mono uppercase mb-0.5">Created</div>
                  <div className="font-mono">{format(new Date(job.createdAt), "MMM d, yyyy HH:mm:ss")}</div>
                </div>
                
                <div className="relative">
                  <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-background ${isProcessing || isCompleted ? 'bg-blue-500' : 'bg-muted-foreground'}`}></div>
                  <div className="text-xs text-muted-foreground font-mono uppercase mb-0.5">Last Updated</div>
                  <div className="font-mono">{format(new Date(job.updatedAt), "MMM d, yyyy HH:mm:ss")}</div>
                </div>

                {job.completedAt && (
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background"></div>
                    <div className="text-xs text-muted-foreground font-mono uppercase mb-0.5">Completed</div>
                    <div className="font-mono">{format(new Date(job.completedAt), "MMM d, yyyy HH:mm:ss")}</div>
                    
                    <div className="mt-1 text-xs text-muted-foreground">
                      Duration: {Math.round((new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()) / 60000)} minutes
                    </div>
                  </div>
                )}
                
                {isFailed && (
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-destructive ring-4 ring-background"></div>
                    <div className="text-xs text-muted-foreground font-mono uppercase mb-0.5">Failed</div>
                    <div className="font-mono">{format(new Date(job.updatedAt), "MMM d, yyyy HH:mm:ss")}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PolygonDrawer
        open={polygonDrawerOpen}
        onOpenChange={setPolygonDrawerOpen}
        center={
          job.latitude != null && job.longitude != null
            ? [job.latitude, job.longitude]
            : null
        }
        onMeasure={handleManualMeasure}
        isSaving={setPolygon.isPending}
      />
    </div>
  );
}