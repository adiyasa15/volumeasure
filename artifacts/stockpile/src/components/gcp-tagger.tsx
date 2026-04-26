import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, MapPin, Save } from "lucide-react";

export type GcpSourceImage = {
  name: string;
  file: File;
};

export type GcpPoint = {
  id: string;
  imageName: string;
  imX: number;
  imY: number;
  label: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: GcpSourceImage[];
  onExport: (filename: string, content: string) => void;
};

const DEFAULT_PROJECTION = "EPSG:4326";

const PROJECTION_PRESETS = [
  // Geographic (lat/lon)
  "EPSG:4326",
  "+proj=longlat +datum=WGS84 +no_defs",
  // UTM North
  "EPSG:32601",
  "EPSG:32610",
  "EPSG:32614",
  "EPSG:32633",
  "EPSG:32648",
  "EPSG:32650",
  "EPSG:32654",
  "EPSG:32655",
  "WGS84 UTM 1N",
  "WGS84 UTM 10N",
  "WGS84 UTM 33N",
  "WGS84 UTM 48N",
  "WGS84 UTM 50N",
  // UTM South
  "EPSG:32748",
  "EPSG:32750",
  "EPSG:32754",
  "EPSG:32755",
  "WGS84 UTM 48S",
  "WGS84 UTM 50S",
  "WGS84 UTM 54S",
  "WGS84 UTM 55S",
  // proj4 strings
  "+proj=utm +zone=1 +datum=WGS84 +units=m +no_defs",
  "+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs",
  "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs",
  "+proj=utm +zone=48 +south +datum=WGS84 +units=m +no_defs",
  "+proj=utm +zone=50 +south +datum=WGS84 +units=m +no_defs",
];

export function GcpTagger({ open, onOpenChange, images, onExport }: Props) {
  const [activeImageName, setActiveImageName] = useState<string>("");
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const [points, setPoints] = useState<GcpPoint[]>([]);
  const [projection, setProjection] = useState(DEFAULT_PROJECTION);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!open) return;
    if (images.length === 0) return;
    if (!activeImageName || !images.find((i) => i.name === activeImageName)) {
      setActiveImageName(images[0].name);
    }
  }, [open, images, activeImageName]);

  const activeImage = images.find((i) => i.name === activeImageName) ?? null;
  const objectUrl = useMemo(
    () => (activeImage ? URL.createObjectURL(activeImage.file) : null),
    [activeImage],
  );
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const visiblePoints = points.filter((p) => p.imageName === activeImageName);

  const handleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !imageDims) return;
    const rect = imgRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;
    const imX = Math.round(xRatio * imageDims.w);
    const imY = Math.round(yRatio * imageDims.h);
    const nextLabel = `GCP-${points.length + 1}`;
    setPoints((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        imageName: activeImageName,
        imX,
        imY,
        label: nextLabel,
      },
    ]);
  };

  const updateLabel = (id: string, label: string) => {
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, label } : p)));
  };
  const removePoint = (id: string) => {
    setPoints((prev) => prev.filter((p) => p.id !== id));
  };

  const buildContent = () => {
    const header = projection;
    const lines = points.map(
      (p) => `0 0 0 ${p.imX} ${p.imY} ${p.imageName} ${p.label}`,
    );
    return [header, ...lines].join("\n") + "\n";
  };

  const handleExport = () => {
    if (points.length < 3) return;
    onExport("gcp_list.txt", buildContent());
    onOpenChange(false);
  };

  const handleReset = () => {
    setPoints([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase">
            Tag Ground Control Points
          </DialogTitle>
          <DialogDescription>
            Click on the image to drop a marker at each known GCP location.
            Add at least 3 points for a usable gcp_list.txt.
          </DialogDescription>
        </DialogHeader>

        {images.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Upload images first, then come back to tag GCPs.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase text-muted-foreground shrink-0">
                    Projection
                  </span>
                  <div className="relative flex-1 min-w-0">
                    <select
                      value={projection}
                      onChange={(e) => setProjection(e.target.value)}
                      className="h-8 w-full appearance-none rounded-md border border-input bg-background pl-2 pr-7 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    >
                      {PROJECTION_PRESETS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Must be a real CRS — EPSG code, WGS84 UTM, or valid proj4.{" "}
                  <span className="text-amber-400">+proj=cartesian is not accepted by NodeODM.</span>
                </p>
                <Select
                  value={activeImageName}
                  onValueChange={(v) => setActiveImageName(v)}
                >
                  <SelectTrigger className="font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-52 overflow-y-auto">
                    {images.map((img) => {
                      const count = points.filter(
                        (p) => p.imageName === img.name,
                      ).length;
                      return (
                        <SelectItem key={img.name} value={img.name} className="font-mono text-xs">
                          {img.name} {count > 0 ? `(${count} pts)` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative inline-block w-full bg-background border border-border/50 rounded overflow-hidden">
                {objectUrl && (
                  <img
                    ref={imgRef}
                    src={objectUrl}
                    alt={activeImageName}
                    onClick={handleClick}
                    onLoad={(e) => {
                      const t = e.currentTarget;
                      setImageDims({
                        w: t.naturalWidth,
                        h: t.naturalHeight,
                      });
                    }}
                    className="block w-full h-auto cursor-crosshair select-none"
                    draggable={false}
                  />
                )}
                {imageDims &&
                  visiblePoints.map((p) => {
                    const left = (p.imX / imageDims.w) * 100;
                    const top = (p.imY / imageDims.h) * 100;
                    return (
                      <div
                        key={p.id}
                        className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ left: `${left}%`, top: `${top}%` }}
                      >
                        <div className="flex flex-col items-center">
                          <MapPin className="h-5 w-5 text-primary drop-shadow" fill="currentColor" />
                          <span className="font-mono text-[10px] bg-background/80 px-1 rounded border border-border/50">
                            {p.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {imageDims && (
                <p className="text-[10px] font-mono text-muted-foreground">
                  Native size: {imageDims.w} × {imageDims.h}px. Click anywhere on the image to drop a marker.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase text-muted-foreground">
                  Tagged Points ({points.length})
                </span>
                {points.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] font-mono"
                    onClick={handleReset}
                  >
                    Reset
                  </Button>
                )}
              </div>
              {points.length === 0 ? (
                <div className="border border-dashed border-border/50 rounded p-4 text-center text-xs text-muted-foreground font-mono">
                  No points yet. Click the image to add markers.
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {points.map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 p-2 rounded border border-border/50 bg-background/50"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground w-6">
                        {idx + 1}
                      </span>
                      <Input
                        value={p.label}
                        onChange={(e) => updateLabel(p.id, e.target.value)}
                        className="h-7 font-mono text-xs flex-1"
                      />
                      <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                        {p.imX},{p.imY}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => removePoint(p.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="font-mono uppercase text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="font-mono uppercase text-xs"
            disabled={points.length < 3}
            onClick={handleExport}
          >
            <Save className="h-3.5 w-3.5 mr-2" />
            Export &amp; Use ({points.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
