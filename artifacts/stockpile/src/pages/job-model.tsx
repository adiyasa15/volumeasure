import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useGetJob } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ExternalLink,
  Box,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { getActiveToken } from "@/lib/adminAuth";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export default function JobModel() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();

  const { data: job, isLoading } = useGetJob(id);

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<"loading" | "ready" | "error">("loading");
  const [iframeBlocked, setIframeBlocked] = useState(false);

  useEffect(() => {
    if (!job || job.status !== "completed" || !job.webodmTaskId) return;

    setFetchState("loading");
    setViewerUrl(null);
    setIframeBlocked(false);

    const token = getActiveToken();
    fetch(`${API_BASE}/jobs/${id}/model3d`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ url: string }>;
      })
      .then(({ url }) => {
        setViewerUrl(url);
        setFetchState("ready");
      })
      .catch(() => setFetchState("error"));
  }, [id, job?.status, job?.webodmTaskId]);

  // Detect if iframe gets blocked (X-Frame-Options / CSP) after a timeout
  useEffect(() => {
    if (!viewerUrl) return;
    const timer = setTimeout(() => setIframeBlocked(true), 8000);
    return () => clearTimeout(timer);
  }, [viewerUrl]);

  const openInNewTab = () => {
    if (viewerUrl) window.open(viewerUrl, "_blank", "noopener,noreferrer");
  };

  if (isLoading || !job) {
    return (
      <div className="flex items-center justify-center h-screen bg-background dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isCompleted = job.status === "completed";
  const hasTask = Boolean(job.webodmTaskId);

  return (
    <div className="flex flex-col h-screen bg-background dark overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/60 backdrop-blur shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setLocation(`/jobs/${id}`)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Box className="h-4 w-4 text-primary" />
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              3D Model
            </p>
            <p className="font-mono font-bold text-sm leading-tight truncate max-w-xs">
              {job.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {viewerUrl && (
            <Button
              variant="outline"
              size="sm"
              className="font-mono uppercase text-xs"
              onClick={openInNewTab}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open in WebODM
            </Button>
          )}
        </div>
      </div>

      {/* Main viewer area */}
      <div className="flex-1 relative overflow-hidden">
        {!isCompleted || !hasTask ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-4 p-8">
            <AlertCircle className="h-12 w-12 opacity-30" />
            <div className="text-center">
              <p className="font-mono uppercase text-sm font-bold">
                3D Model Not Available
              </p>
              <p className="text-sm mt-2 max-w-sm text-center">
                {!isCompleted
                  ? "The job must finish processing before the 3D model is available."
                  : "This job was not processed via WebODM and has no 3D model asset."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="font-mono uppercase text-xs"
              onClick={() => setLocation(`/jobs/${id}`)}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1.5" />
              Back to Job
            </Button>
          </div>
        ) : fetchState === "loading" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 z-10 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Loading 3D Model…
            </p>
          </div>
        ) : fetchState === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8">
            <AlertCircle className="h-12 w-12 text-destructive opacity-60" />
            <div className="text-center max-w-sm">
              <p className="font-mono uppercase text-sm font-bold">Failed to Load Viewer</p>
              <p className="text-sm text-muted-foreground mt-2">
                Could not retrieve the 3D viewer URL. The WebODM task may no longer be available.
              </p>
            </div>
            <Button variant="outline" size="sm" className="font-mono uppercase text-xs"
              onClick={() => setLocation(`/jobs/${id}`)}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1.5" />
              Back to Job
            </Button>
          </div>
        ) : iframeBlocked ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 z-10 gap-5 p-8">
            <div className="rounded-full bg-primary/10 p-4">
              <Box className="h-10 w-10 text-primary" />
            </div>
            <div className="text-center max-w-sm">
              <p className="font-mono uppercase text-sm font-bold text-foreground">
                Open in New Tab
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                The WebODM 3D viewer cannot be embedded due to browser security restrictions.
                Open it in a new tab for the full interactive experience.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="default"
                size="sm"
                className="font-mono uppercase text-xs"
                onClick={openInNewTab}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open 3D Viewer
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-mono uppercase text-xs"
                onClick={() => setLocation(`/jobs/${id}`)}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1.5" />
                Back to Job
              </Button>
            </div>
          </div>
        ) : (
          <iframe
            key={viewerUrl}
            src={viewerUrl!}
            title="3D Model Viewer"
            className="absolute inset-0 w-full h-full border-0"
            onLoad={() => setIframeBlocked(false)}
            allow="fullscreen"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        )}
      </div>
    </div>
  );
}
