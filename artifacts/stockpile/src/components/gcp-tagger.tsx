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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, MapPin, Save, Plus, ChevronRight } from "lucide-react";

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
  const [activeImageName, setActiveImageName] = useState<string>("");
  const [activeGcpLabel, setActiveGcpLabel] = useState<string>("");
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!open) return;
    if (images.length > 0 && !activeImageName) setActiveImageName(images[0].name);
    if (defs.length > 0 && !activeGcpLabel) setActiveGcpLabel(defs[0].label);
  }, [open, images, defs, activeImageName, activeGcpLabel]);

  const activeImage = images.find((i) => i.name === activeImageName) ?? null;
  const objectUrl = useMemo(
    () => (activeImage ? URL.createObjectURL(activeImage.file) : null),
    [activeImage],
  );
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);

  const visibleTags = tags.filter((t) => t.imageName === activeImageName);

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
    const x = parseFloat(d.x);
    const y = parseFloat(d.y);
    const z = parseFloat(d.z);
    return d.label.trim() && !isNaN(x) && !isNaN(y) && !isNaN(z);
  });

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !imageDims || !activeGcpLabel) return;
    const rect = imgRef.current.getBoundingClientRect();
    const imX = Math.round(((e.clientX - rect.left) / rect.width) * imageDims.w);
    const imY = Math.round(((e.clientY - rect.top) / rect.height) * imageDims.h);
    setTags((prev) => [
      ...prev.filter((t) => !(t.imageName === activeImageName && t.gcpLabel === activeGcpLabel)),
      { id: `${Date.now()}`, gcpLabel: activeGcpLabel, imageName: activeImageName, imX, imY },
    ]);
  };

  const removeTag = (id: string) => setTags((prev) => prev.filter((t) => t.id !== id));

  const buildContent = () => {
    const defMap = Object.fromEntries(defs.map((d) => [d.label, d]));
    const lines = tags.map((t) => {
      const d = defMap[t.gcpLabel];
      if (!d) return null;
      return `${d.x} ${d.y} ${d.z} ${t.imX} ${t.imY} ${t.imageName} ${t.gcpLabel}`;
    }).filter(Boolean);
    return [projection, ...lines].join("\n") + "\n";
  };

  const canExport = defsValid && tags.length >= 3;

  const handleExport = () => {
    if (!canExport) return;
    onExport("gcp_list.txt", buildContent());
    onOpenChange(false);
  };

  const handleReset = () => { setTags([]); };

  const geo = isGeographic(projection);
  const xLabel = geo ? "Longitude" : "Easting (m)";
  const yLabel = geo ? "Latitude" : "Northing (m)";
  const xPlaceholder = geo ? "e.g. 106.8456" : "e.g. 432500.0";
  const yPlaceholder = geo ? "e.g. -6.2146" : "e.g. 9312400.0";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase">Tag Ground Control Points</DialogTitle>
          <DialogDescription className="text-xs">
            {step === "define"
              ? "Step 1 — Enter the real-world surveyed coordinates for each GCP marker."
              : "Step 2 — Select a GCP, then click where it appears in each image."}
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
          /* ══════════════════════════════════════════════════════
             STEP 1 — Define GCP real-world coordinates
             ══════════════════════════════════════════════════════ */
          <div className="space-y-4">
            {/* Projection selector */}
            <div className="space-y-1">
              <Label className="text-[10px] font-mono uppercase text-muted-foreground">
                Coordinate System
              </Label>
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

            {/* GCP definitions table */}
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_2fr_2fr_1.5fr_auto] gap-2 px-1">
                <span className="text-[10px] font-mono uppercase text-muted-foreground">Label</span>
                <span className="text-[10px] font-mono uppercase text-muted-foreground">{xLabel}</span>
                <span className="text-[10px] font-mono uppercase text-muted-foreground">{yLabel}</span>
                <span className="text-[10px] font-mono uppercase text-muted-foreground">Altitude (m)</span>
                <span />
              </div>
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {defs.map((d) => (
                  <div key={d.id} className="grid grid-cols-[1fr_2fr_2fr_1.5fr_auto] gap-2 items-center p-2 rounded border border-border/50 bg-background/50">
                    <Input
                      value={d.label}
                      onChange={(e) => updateDef(d.id, "label", e.target.value)}
                      className="h-7 font-mono text-xs"
                      placeholder="GCP-1"
                    />
                    <Input
                      value={d.x}
                      onChange={(e) => updateDef(d.id, "x", e.target.value)}
                      className="h-7 font-mono text-xs"
                      placeholder={xPlaceholder}
                      type="number"
                      step="any"
                    />
                    <Input
                      value={d.y}
                      onChange={(e) => updateDef(d.id, "y", e.target.value)}
                      className="h-7 font-mono text-xs"
                      placeholder={yPlaceholder}
                      type="number"
                      step="any"
                    />
                    <Input
                      value={d.z}
                      onChange={(e) => updateDef(d.id, "z", e.target.value)}
                      className="h-7 font-mono text-xs"
                      placeholder="e.g. 12.5"
                      type="number"
                      step="any"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:bg-destructive/20 hover:text-destructive"
                      onClick={() => removeDef(d.id)}
                      disabled={defs.length <= 3}
                    >
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
              These coordinates must come from a real-world survey (GPS receiver, total station, or RTK).
              At least 3 GCPs with valid coordinates are required.
            </p>
          </div>
        ) : (
          /* ══════════════════════════════════════════════════════
             STEP 2 — Tag GCPs in images
             ══════════════════════════════════════════════════════ */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Image view */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex gap-2">
                {/* Active GCP selector */}
                <div className="flex-1">
                  <Label className="text-[10px] font-mono uppercase text-muted-foreground">Active GCP</Label>
                  <Select value={activeGcpLabel} onValueChange={setActiveGcpLabel}>
                    <SelectTrigger className="font-mono text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {defs.map((d) => {
                        const count = tags.filter((t) => t.gcpLabel === d.label).length;
                        return (
                          <SelectItem key={d.id} value={d.label} className="font-mono text-xs">
                            {d.label} — {d.x}, {d.y}, {d.z} ({count} tagged)
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {/* Image selector */}
                <div className="flex-1">
                  <Label className="text-[10px] font-mono uppercase text-muted-foreground">Image</Label>
                  <Select value={activeImageName} onValueChange={(v) => { setActiveImageName(v); setImageDims(null); }}>
                    <SelectTrigger className="font-mono text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-52 overflow-y-auto">
                      {images.map((img) => {
                        const count = tags.filter((t) => t.imageName === img.name).length;
                        return (
                          <SelectItem key={img.name} value={img.name} className="font-mono text-xs">
                            {img.name} {count > 0 ? `(${count} pts)` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="relative inline-block w-full bg-background border border-border/50 rounded overflow-hidden">
                {objectUrl && (
                  <img
                    ref={imgRef}
                    src={objectUrl}
                    alt={activeImageName}
                    onClick={handleImageClick}
                    onLoad={(e) => {
                      const t = e.currentTarget;
                      setImageDims({ w: t.naturalWidth, h: t.naturalHeight });
                    }}
                    className="block w-full h-auto cursor-crosshair select-none"
                    draggable={false}
                  />
                )}
                {imageDims && visibleTags.map((t) => {
                  const left = (t.imX / imageDims.w) * 100;
                  const top  = (t.imY / imageDims.h) * 100;
                  const isActive = t.gcpLabel === activeGcpLabel;
                  return (
                    <div
                      key={t.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ left: `${left}%`, top: `${top}%` }}
                    >
                      <div className="flex flex-col items-center">
                        <MapPin
                          className={`h-5 w-5 drop-shadow ${isActive ? "text-primary" : "text-amber-400"}`}
                          fill="currentColor"
                        />
                        <span className="font-mono text-[10px] bg-background/90 px-1 rounded border border-border/50 whitespace-nowrap">
                          {t.gcpLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {imageDims && (
                <p className="text-[10px] font-mono text-muted-foreground">
                  {imageDims.w} × {imageDims.h}px · Click to place <strong>{activeGcpLabel}</strong> · Click again to move it
                </p>
              )}
            </div>

            {/* Tag list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase text-muted-foreground">
                  Tags ({tags.length})
                </span>
                {tags.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] font-mono" onClick={handleReset}>
                    Reset
                  </Button>
                )}
              </div>

              {/* Coverage summary */}
              <div className="space-y-1 mb-2">
                {defs.map((d) => {
                  const count = tags.filter((t) => t.gcpLabel === d.label).length;
                  return (
                    <div key={d.id} className="flex items-center justify-between text-[10px] font-mono">
                      <span className={count >= 2 ? "text-emerald-400" : "text-muted-foreground"}>{d.label}</span>
                      <span className={count >= 2 ? "text-emerald-400" : "text-amber-400"}>
                        {count} image{count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  );
                })}
                <p className="text-[10px] text-muted-foreground mt-1">
                  Each GCP should appear in at least 2 images.
                </p>
              </div>

              {tags.length === 0 ? (
                <div className="border border-dashed border-border/50 rounded p-4 text-center text-xs text-muted-foreground font-mono">
                  Select a GCP above, then click it in the image.
                </div>
              ) : (
                <div className="space-y-1 max-h-[340px] overflow-y-auto pr-1">
                  {tags.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 p-1.5 rounded border border-border/50 bg-background/50">
                      <span className="font-mono text-[10px] text-primary font-bold w-16 truncate">{t.gcpLabel}</span>
                      <span className="font-mono text-[10px] text-muted-foreground flex-1 truncate">{t.imageName}</span>
                      <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">{t.imX},{t.imY}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 hover:bg-destructive/20 hover:text-destructive shrink-0"
                        onClick={() => removeTag(t.id)}
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
          <Button type="button" variant="outline" className="font-mono uppercase text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {step === "define" ? (
            <Button
              type="button"
              className="font-mono uppercase text-xs"
              disabled={!defsValid}
              onClick={() => setStep("tag")}
            >
              Next — Tag in Images <ChevronRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" className="font-mono uppercase text-xs" onClick={() => setStep("define")}>
                ← Back to Definitions
              </Button>
              <Button
                type="button"
                className="font-mono uppercase text-xs"
                disabled={!canExport}
                onClick={handleExport}
              >
                <Save className="h-3.5 w-3.5 mr-2" />
                Export &amp; Use ({tags.length} tags)
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
