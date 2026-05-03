import { useParams, useLocation } from "wouter";
import { useGetJob } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  Download,
  FileArchive,
  Layers,
  Map,
  BarChart3,
  Loader2,
  AlertCircle,
  Box,
} from "lucide-react";
import { getActiveToken } from "@/lib/adminAuth";
import { useTranslation } from "react-i18next";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export default function JobModel() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const { data: job, isLoading } = useGetJob(id);

  const handleDownload = () => {
    const token = getActiveToken();
    if (token) {
      fetch(`${API_BASE}/jobs/${id}/download`, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" })
        .then((r) => { if (r.ok && r.url) window.location.href = r.url; })
        .catch(() => { window.open(`${API_BASE}/jobs/${id}/download`, "_blank"); });
    } else {
      window.open(`${API_BASE}/jobs/${id}/download`, "_blank");
    }
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
          <FileArchive className="h-4 w-4 text-primary" />
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {t("jobModel.processingResults")}
            </p>
            <p className="font-mono font-bold text-sm leading-tight truncate max-w-xs">
              {job.name}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex items-center justify-center p-8">
        {!isCompleted || !hasTask ? (
          <div className="flex flex-col items-center text-muted-foreground gap-4 max-w-sm text-center">
            <AlertCircle className="h-12 w-12 opacity-30" />
            <p className="font-mono uppercase text-sm font-bold">{t("jobModel.resultsNotAvailable")}</p>
            <p className="text-sm">
              {!isCompleted ? t("jobModel.notCompletedDesc") : t("jobModel.noWebodmDesc")}
            </p>
            <Button variant="outline" size="sm" className="font-mono uppercase text-xs"
              onClick={() => setLocation(`/jobs/${id}`)}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1.5" /> {t("common.back")}
            </Button>
          </div>
        ) : (
          <div className="w-full max-w-lg flex flex-col gap-6">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 flex flex-col items-center gap-4 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Box className="h-10 w-10 text-primary" />
              </div>
              <div>
                <p className="font-mono font-bold text-lg uppercase tracking-wide">
                  {t("jobModel.downloadPackage")}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("jobModel.downloadDesc")}
                </p>
              </div>
              <Button
                size="lg"
                className="font-mono uppercase text-sm w-full"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4 mr-2" />
                {t("jobModel.downloadBtn")}
              </Button>
            </div>

            <div className="rounded-xl border border-border/50 bg-card/40 p-5">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">
                {t("jobModel.packageContents")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Layers, label: t("jobModel.pointCloud"), desc: t("jobModel.pointCloudDesc") },
                  { icon: Map, label: t("jobModel.orthophoto"), desc: t("jobModel.orthophotoDesc") },
                  { icon: BarChart3, label: t("jobModel.dsmDtm"), desc: t("jobModel.dsmDtmDesc") },
                  { icon: Box, label: t("jobModel.model3d"), desc: t("jobModel.model3dDesc") },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3 rounded-lg bg-background/50 border border-border/30 p-3">
                    <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="font-mono text-xs font-bold uppercase">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="font-mono uppercase text-xs self-start"
              onClick={() => setLocation(`/jobs/${id}`)}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1.5" />
              {t("common.back")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
