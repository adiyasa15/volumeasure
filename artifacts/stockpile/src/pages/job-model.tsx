import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useGetJob } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ExternalLink,
  Box,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { getActiveToken } from "@/lib/adminAuth";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export default function JobModel() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();

  const { data: job, isLoading } = useGetJob(id);

  const [iframeState, setIframeState] = useState<"loading" | "loaded" | "blocked" | "error">("loading");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewerSrc = `${API_BASE}/jobs/${id}/model3d`;

  useEffect(() => {
    setIframeState("loading");
    loadTimerRef.current = setTimeout(() => {
      setIframeState("blocked");
    }, 8000);
    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, [id]);

  const handleIframeLoad = () => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc && doc.body && doc.body.innerHTML.length < 50) {
        setIframeState("blocked");
        return;
      }
    } catch {
      // cross-origin — can't read, assume it loaded OK
    }
    setIframeState("loaded");
  };

  const handleIframeError = () => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    setIframeState("error");
  };

  const openInNewTab = () => {
    const token = getActiveToken();
    const url = token
      ? `${viewerSrc}?auth=${encodeURIComponent(token)}`
      : viewerSrc;
    window.open(url, "_blank", "noopener,noreferrer");
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
          {(iframeState === "blocked" || iframeState === "error") && (
            <Button
              variant="ghost"
              size="sm"
              className="font-mono uppercase text-xs"
              onClick={() => {
                setIframeState("loading");
                if (iframeRef.current) {
                  iframeRef.current.src = viewerSrc;
                }
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="font-mono uppercase text-xs"
            onClick={openInNewTab}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open in WebODM
          </Button>
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
        ) : (
          <>
            {/* Loading overlay */}
            {iframeState === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 z-10 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Loading 3D Model…
                </p>
              </div>
            )}

            {/* Blocked / error fallback */}
            {(iframeState === "blocked" || iframeState === "error") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 z-10 gap-5 p-8">
                <div className="rounded-full bg-primary/10 p-4">
                  <Box className="h-10 w-10 text-primary" />
                </div>
                <div className="text-center max-w-sm">
                  <p className="font-mono uppercase text-sm font-bold text-foreground">
                    Viewer Loaded Externally
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    The WebODM 3D viewer cannot be embedded in this frame due to browser
                    security restrictions. Open it in a new tab for the full experience.
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
            )}

            {/* The viewer iframe */}
            <iframe
              ref={iframeRef}
              src={viewerSrc}
              title="3D Model Viewer"
              className="absolute inset-0 w-full h-full border-0"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              allow="fullscreen"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
          </>
        )}
      </div>
    </div>
  );
}
