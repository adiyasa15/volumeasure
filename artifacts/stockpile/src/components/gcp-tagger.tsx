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
import { Label } from "@/components/ui/label";
import { Trash2, MapPin, Save, Plus, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, Circle } from "lucide-react";

export type GcpSourceImage = {
  name: string;
  file: File;
};

type GcpDefinition = {
  id: string;
  label: string;
  x: string;
  y: string;
  z: string;
};

type GcpTag = {
  id: string;
  gcpLabel: string;
  imageName: string;
  imX: number;
  imY: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: GcpSourceImage[];
  onExport: (filename: string, content: string) => void;
};

const PROJECTION_PRESETS = [
  "EPSG:4326",
  "+proj=longlat +datum=WGS84 +no_defs",
  "EPSG:32601",
  "EPSG:32610",
  "EPSG:32614",
  "EPSG:32633",
  "EPSG:32648",
  "EPSG:32650",
  "EPSG:32654",
  "EPSG:32655",
  "EPSG:32748",
  "EPSG:32750",
  "EPSG:32754",
  "EPSG:32755",
  "+proj=utm +zone=48 +south +datum=WGS84 +units=m +no_defs",
  "+proj=utm +zone=50 +south +datum=WGS84 +units=m +no_defs",
];

function isGeographic(proj: string) {
  return proj.includes("4326") || proj.includes("longlat");
}

export function GcpTagger({ open, onOpenChange, images, onExport }: Props) {
  const [step, setStep] = useState<"define" | "tag">("define");
  const [projection, setProjection] = useState("EPSG:4326");
  const [defs, setDefs] = useState<GcpDefinition[]>([
    { id: "d1", label: "GCP-1", x: "", y: "", z: "" },
    { id: "d2", label: "GCP-2", x: "", y: "", z: "" },
    { id: "d3", label: "GCP-3", x: "", y: "", z: "" },
  ]);
  const [tags, setTags] = useState<GcpTag[]>([]);

  // Step 2 state
  const [activeGcpLabel, setActiveGcpLabel] = useState<string>("");
  const [imageIndex, setImageIndex] = useState(0);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset image dims when image changes
  const prevImageIndex = useRef(imageIndex);
  useEffect(() => {
    if (prevImageIndex.current !== imageIndex) {
      setImageDims(null);
      prevImageIndex.current = imageIndex;
    }
  }, [imageIndex]);

  useEffect(() => {
    if (!open) return;
    if (defs.length > 0 && !activeGcpLabel) setActiveGcpLabel(defs[0].label);
  }, [open, defs, activeGcpLabel]);

  // Reset to step 1 when closed
  useEffect(() => {
    if (!open) { setStep("define"); setImageIndex(0); }
  }, [open]);

  const activeImage = images[imageIndex] ?? null;
  const objectUrl = useMemo(
    () => (activeImage ? URL.createObjectURL(activeImage.file) : null),
    [activeImage],
  );
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);

  const currentImageName = activeImage?.name ?? "";
  const visibleTags = tags.filter((t) => t.imageName === currentImageName);

  // ── Step 1 helpers ─────────────────────────────────────────────────────────
  const addDef = () => {
    const n = defs.length + 1;
    setDefs((prev) => [...prev, { id: `d${Date.now()}`, label: `GCP-${n}`, x: "", y: "", z: "" }]);
  };
  const updateDef = (id: string, field: keyof GcpDefinition, value: string) => {
    setDefs((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };
  const removeDef = (id: string) => {
    const label = defs.find((d) => d.id === id)?.label ?? "";
    setDefs((prev) => prev.filter((d) => d.id !== id));
    setTags((prev) => prev.filter((t) => t.gcpLabel !== label));
  };
  const defsValid = defs.length >= 3 && defs.every((d) => {
    const x = parseFloat(d.x), y = parseFloat(d.y), z = parseFloat(d.z);
    return d.label.trim() && !isNaN(x) && !isNaN(y) && !isNaN(z);
  });

  const geo = isGeographic(projection);
  const xLabel = geo ? "Longitude" : "Easting (m)";
  const yLabel = geo ? "Latitude" : "Northing (m)";
  const xPlaceholder = geo ? "e.g. 106.8456" : "e.g. 432500.0";
  const yPlaceholder = geo ? "e.g. -6.2146" : "e.g. 9312400.0";

  // ── Step 2 helpers ─────────────────────────────────────────────────────────
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !imageDims || !activeGcpLabel || !currentImageName) return;
    const rect = imgRef.current.getBoundingClientRect();
    const imX = Math.round(((e.clientX - rect.left) / rect.width) * imageDims.w);
    const imY = Math.round(((e.clientY - rect.top) / rect.height) * imageDims.h);
    // One tag per GCP+image — replace if already exists
    setTags((prev) => [
      ...prev.filter((t) => !(t.imageName === currentImageName && t.gcpLabel === activeGcpLabel)),
      { id: `${Date.now()}`, gcpLabel: activeGcpLabel, imageName: currentImageName, imX, imY },
    ]);
  };

  const removeTag = (tagId: string) => setTags((prev) => prev.filter((t) => t.id !== tagId));

  const prevImage = () => setImageIndex((i) => Math.max(0, i - 1));
  const nextImage = () => setImageIndex((i) => Math.min(images.length - 1, i + 1));

  // ── File content builder ───────────────────────────────────────────────────
  const buildContent = () => {
    const defMap = Object.fromEntries(defs.map((d) => [d.label, d]));
    const lines = tags
      .map((t) => {
        const d = defMap[t.gcpLabel];
        if (!d) return null;
        return `${d.x} ${d.y} ${d.z} ${t.imX} ${t.imY} ${t.imageName} ${t.gcpLabel}`;
      })
      .filter(Boolean);
    return [projection, ...lines].join("\n") + "\n";
  };

  // Need ≥3 tags total AND every defined GCP must appear in ≥2 images
  const gcpCoverage = defs.map((d) => ({
    label: d.label,
    count: tags.filter((t) => t.gcpLabel === d.label).length,
  }));
  const allGcpCovered = gcpCoverage.every((g) => g.count >= 2);
  const canExport = defsValid && allGcpCovered;

  const handleExport = () => {
    if (!canExport) return;
    onExport("gcp_list.txt", buildContent());
    onOpenChange(false);
  };

  // Active GCP tag in the current image (for "already tagged" indicator)
  const activeTagInCurrentImage = tags.find(
    (t) => t.gcpLabel === activeGcpLabel && t.imageName === currentImageName,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase">Tag Ground Control Points</DialogTitle>
          <DialogDescription className="text-xs">
            {step === "define"
              ? "Step 1 — Enter the real-world surveyed coordinates for each GCP marker."
              : "Step 2 — Select a GCP from the list, navigate images, then click where it appears."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step indicator ── */}
        <div className="flex items-center gap-2 px-1">
          <div className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full border ${step === "define" ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
            <span className="font-bold">1</span> Define GCPs
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <div className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full border ${step === "tag" ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
            <span className="font-bold">2</span> Tag in Images
          </div>
        </div>

        {images.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Upload images first, then come back to tag GCPs.
          </div>
        ) : step === "define" ? (

          /* ══════════════════════════════════════════════════════════════════
             STEP 1 — Define GCP real-world coordinates
             ══════════════════════════════════════════════════════════════════ */
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-[10px] font-mono uppercase text-muted-foreground">Coordinate System</Label>
              <div className="relative">
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
              <p className="text-[10px] text-muted-foreground">
                Must match the CRS of your surveyed GCP coordinates.
                <span className="text-amber-400 ml-1">+proj=cartesian not accepted by NodeODM.</span>
              </p>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_2fr_2fr_1.5fr_auto] gap-2 px-1">
                <span className="text-[10px] font-mono uppercase text-muted-foreground">Label</span>
                <span className="text-[10px] font-mono uppercase text-muted-foreground">{xLabel}</span>
                <span className="text-[10px] font-mono uppercase text-muted-foreground">{yLabel}</span>
                <span className="text-[10px] font-mono uppercase text-muted-foreground">Altitude (m)</span>
                <span />
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {defs.map((d) => (
                  <div key={d.id} className="grid grid-cols-[1fr_2fr_2fr_1.5fr_auto] gap-2 items-center p-2 rounded border border-border/50 bg-background/50">
                    <Input value={d.label} onChange={(e) => updateDef(d.id, "label", e.target.value)} className="h-7 font-mono text-xs" placeholder="GCP-1" />
                    <Input value={d.x} onChange={(e) => updateDef(d.id, "x", e.target.value)} className="h-7 font-mono text-xs" placeholder={xPlaceholder} type="number" step="any" />
                    <Input value={d.y} onChange={(e) => updateDef(d.id, "y", e.target.value)} className="h-7 font-mono text-xs" placeholder={yPlaceholder} type="number" step="any" />
                    <Input value={d.z} onChange={(e) => updateDef(d.id, "z", e.target.value)} className="h-7 font-mono text-xs" placeholder="e.g. 12.5" type="number" step="any" />
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/20 hover:text-destructive" onClick={() => removeDef(d.id)} disabled={defs.length <= 3}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="font-mono text-xs h-7" onClick={addDef}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add GCP
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground font-mono">
              Coordinates must come from a real-world survey (GPS receiver, total station, or RTK).
              At least 3 GCPs required, each visible in ≥2 images.
            </p>
          </div>

        ) : (

          /* ══════════════════════════════════════════════════════════════════
             STEP 2 — Tag GCPs in images
             ══════════════════════════════════════════════════════════════════ */
          <div className="flex gap-4 min-h-[480px]">

            {/* ── Left: GCP list ──────────────────────────────────────────── */}
            <div className="w-44 shrink-0 flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1">GCP Markers</span>
              {defs.map((d) => {
                const count = tags.filter((t) => t.gcpLabel === d.label).length;
                const isActive = d.label === activeGcpLabel;
                const taggedHere = tags.some((t) => t.gcpLabel === d.label && t.imageName === currentImageName);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setActiveGcpLabel(d.label)}
                    className={`w-full text-left px-2 py-2 rounded border text-[11px] font-mono transition-colors ${
                      isActive
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/40 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-bold truncate">{d.label}</span>
                      {count >= 2 ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                      ) : count === 1 ? (
                        <AlertCircle className="h-3 w-3 text-amber-400 shrink-0" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                      )}
                    </div>
                    <div className="text-[9px] text-muted-foreground truncate">{d.x}, {d.y}</div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className={`text-[9px] ${count >= 2 ? "text-emerald-400" : count === 1 ? "text-amber-400" : "text-muted-foreground/50"}`}>
                        {count} image{count !== 1 ? "s" : ""}
                      </span>
                      {taggedHere && (
                        <span className="text-[9px] text-primary">✓ here</span>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Legend */}
              <div className="mt-auto pt-3 space-y-1 border-t border-border/30">
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-mono">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" /> ≥2 images — ready
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-mono">
                  <AlertCircle className="h-2.5 w-2.5 text-amber-400" /> 1 image — need more
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-mono">
                  <Circle className="h-2.5 w-2.5 text-muted-foreground/40" /> not tagged yet
                </div>
              </div>
            </div>

            {/* ── Right: Image viewer ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col gap-2 min-w-0">

              {/* Active GCP + image navigation bar */}
              <div className="flex items-center justify-between gap-3">
                {/* Active GCP banner */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-primary/40 bg-primary/10 min-w-0">
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" fill="currentColor" />
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-bold text-primary">{activeGcpLabel}</span>
                    <span className="font-mono text-[10px] text-muted-foreground ml-2">
                      {(() => {
                        const d = defs.find((d) => d.label === activeGcpLabel);
                        return d ? `${d.x}, ${d.y}, ${d.z}m` : "";
                      })()}
                    </span>
                  </div>
                  {activeTagInCurrentImage && (
                    <span className="ml-auto text-[10px] font-mono text-emerald-400 shrink-0">
                      ✓ tagged at {activeTagInCurrentImage.imX},{activeTagInCurrentImage.imY}
                    </span>
                  )}
                </div>

                {/* Image navigation */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={prevImage} disabled={imageIndex === 0}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap px-1">
                    {imageIndex + 1} / {images.length}
                  </span>
                  <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={nextImage} disabled={imageIndex === images.length - 1}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Image name */}
              <p className="text-[10px] font-mono text-muted-foreground truncate px-0.5">{currentImageName}</p>

              {/* Image canvas */}
              <div className="relative flex-1 bg-background border border-border/50 rounded overflow-hidden min-h-[300px]">
                {objectUrl && (
                  <img
                    ref={imgRef}
                    src={objectUrl}
                    alt={currentImageName}
                    key={currentImageName}
                    onClick={handleImageClick}
                    onLoad={(e) => {
                      const t = e.currentTarget;
                      setImageDims({ w: t.naturalWidth, h: t.naturalHeight });
                    }}
                    className="block w-full h-auto cursor-crosshair select-none"
                    draggable={false}
                  />
                )}

                {/* Overlay all tagged GCPs in this image */}
                {imageDims && visibleTags.map((t) => {
                  const left = (t.imX / imageDims.w) * 100;
                  const top  = (t.imY / imageDims.h) * 100;
                  const isActive = t.gcpLabel === activeGcpLabel;
                  return (
                    <div
                      key={t.id}
                      className="absolute -translate-x-1/2 -translate-y-full pointer-events-none"
                      style={{ left: `${left}%`, top: `${top}%` }}
                    >
                      <div className="flex flex-col items-center">
                        <span className={`text-[10px] font-mono font-bold px-1 rounded border mb-0.5 ${
                          isActive
                            ? "bg-primary/90 text-primary-foreground border-primary"
                            : "bg-background/90 text-muted-foreground border-border/60"
                        }`}>
                          {t.gcpLabel}
                        </span>
                        <MapPin
                          className={`h-5 w-5 drop-shadow-md ${isActive ? "text-primary" : "text-amber-400/70"}`}
                          fill="currentColor"
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Instruction overlay when no image loaded */}
                {!imageDims && (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs font-mono">
                    Loading image…
                  </div>
                )}
              </div>

              {/* Hint */}
              <p className="text-[10px] font-mono text-muted-foreground">
                {activeTagInCurrentImage
                  ? `Click again to move ${activeGcpLabel} — or use Prev/Next to go to another image.`
                  : `Click on the image where ${activeGcpLabel} is visible. Use Prev/Next to navigate images.`}
              </p>

              {/* Tag summary table */}
              {tags.length > 0 && (
                <div className="border border-border/40 rounded overflow-hidden">
                  <div className="grid text-[10px] font-mono bg-secondary/30 border-b border-border/40"
                    style={{ gridTemplateColumns: "auto 1fr auto auto" }}>
                    <span className="px-2 py-1 text-muted-foreground font-bold">GCP</span>
                    <span className="px-2 py-1 text-muted-foreground font-bold">Image</span>
                    <span className="px-2 py-1 text-muted-foreground font-bold">Pixel</span>
                    <span className="px-2 py-1" />
                  </div>
                  <div className="max-h-28 overflow-y-auto">
                    {tags.map((t) => (
                      <div key={t.id}
                        className="grid text-[10px] font-mono border-b border-border/20 last:border-0 hover:bg-secondary/20"
                        style={{ gridTemplateColumns: "auto 1fr auto auto" }}>
                        <span className="px-2 py-1 text-primary font-bold">{t.gcpLabel}</span>
                        <span className="px-2 py-1 text-muted-foreground truncate max-w-[180px]">{t.imageName}</span>
                        <span className="px-2 py-1 text-muted-foreground whitespace-nowrap">{t.imX}, {t.imY}</span>
                        <button
                          type="button"
                          onClick={() => removeTag(t.id)}
                          className="px-2 py-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-border/30">
          <Button type="button" variant="outline" className="font-mono uppercase text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {step === "define" ? (
            <Button type="button" className="font-mono uppercase text-xs" disabled={!defsValid} onClick={() => { setStep("tag"); setImageIndex(0); setActiveGcpLabel(defs[0]?.label ?? ""); }}>
              Next — Tag in Images <ChevronRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" className="font-mono uppercase text-xs" onClick={() => setStep("define")}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
              <Button type="button" className="font-mono uppercase text-xs" disabled={!canExport} onClick={handleExport}>
                <Save className="h-3.5 w-3.5 mr-2" />
                {canExport
                  ? `Export gcp_list.txt (${tags.length} tags)`
                  : `Need each GCP in ≥2 images (${gcpCoverage.filter((g) => g.count < 2).length} remaining)`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
