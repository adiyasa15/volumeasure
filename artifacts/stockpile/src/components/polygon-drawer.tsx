import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { MapContainer, TileLayer, ImageOverlay, Polygon, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Trash2,
  Undo2,
  CheckCircle2,
  Loader2,
  Mountain,
  Ruler,
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
} from "lucide-react";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

type LatLng = [number, number];

export type DrawerVolumeResult = {
  volumeM3: number;
  cutVolumeM3: number | null;
  fillVolumeM3: number | null;
  areaSqm: number;
  method: "dsm" | "geometric";
};

// ── Click capture ─────────────────────────────────────────────────────────────

function ClickCapture({ onMapClick }: { onMapClick: (latlng: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMapClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

// ── Dot markers ───────────────────────────────────────────────────────────────

function DotMarkers({ positions }: { positions: LatLng[] }) {
  const markersRef = useRef<L.CircleMarker[]>([]);
  const map = useMapEvents({});

  useEffect(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    positions.forEach((pos, i) => {
      const m = L.circleMarker(pos, {
        radius: 5,
        color: "#ea580c",
        fillColor: i === 0 ? "#fff" : "#ea580c",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
      markersRef.current.push(m);
    });
    return () => {
      markersRef.current.forEach((m) => m.remove());
    };
  }, [positions, map]);

  return null;
}

// ── Map fit + bounds fetch ────────────────────────────────────────────────────

type OrthophotoBounds = [[number, number], [number, number]]; // [[south,west],[north,east]]

function FitOnOpen({
  jobId,
  open,
  onBounds,
}: {
  jobId: string;
  open: boolean;
  onBounds: (b: OrthophotoBounds) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      map.invalidateSize();
      try {
        const res = await fetch(`/api/jobs/${jobId}/tilejson`, { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { bounds?: [number, number, number, number] };
        if (!data?.bounds) return;
        const [west, south, east, north] = data.bounds;
        const leafletBounds: OrthophotoBounds = [[south, west], [north, east]];
        onBounds(leafletBounds);
        // Instant fit — no animation so the user can start drawing immediately
        map.fitBounds(leafletBounds, { padding: [24, 24], maxZoom: 20 });
      } catch {
        // silent
      }
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId]);

  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  center: [number, number] | null;
  tilesReady?: boolean;
  onComplete?: (result: DrawerVolumeResult) => void;
  isSaving?: boolean;
  onMeasure?: (coords: number[][]) => void;
};

export function PolygonDrawer({
  open,
  onOpenChange,
  jobId,
  center,
  onComplete,
  onMeasure,
  isSaving: externalSaving = false,
}: Props) {
  const [vertices, setVertices] = useState<LatLng[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<DrawerVolumeResult | null>(null);
  const [orthoBounds, setOrthoBounds] = useState<OrthophotoBounds | null>(null);
  const [orthoOpacity, setOrthoOpacity] = useState(0.8);

  const defaultCenter: LatLng = center ?? [0, 0];
  const isSaving = externalSaving || isCalculating;

  // The orthophoto JPEG URL — served by our API with auth cookie
  const orthoUrl = `/api/jobs/${jobId}/orthophoto-jpeg`;

  useEffect(() => {
    if (!open) {
      setVertices([]);
      setResult(null);
      setOrthoBounds(null);
    }
  }, [open]);

  const handleClick = (latlng: LatLng) => {
    if (result) return;
    setVertices((prev) => [...prev, latlng]);
  };

  const undo = () => setVertices((prev) => prev.slice(0, -1));
  const reset = () => { setVertices([]); setResult(null); };

  const handleMeasure = useCallback(async () => {
    if (vertices.length < 3) return;
    const coords = vertices.map((v) => [v[0], v[1]]);

    if (onMeasure && !onComplete) {
      onMeasure(coords);
      return;
    }

    setIsCalculating(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/polygon`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ polygonCoordinates: coords }),
      });
      if (!res.ok) throw new Error("API error");
      const updated = await res.json() as {
        volumeM3?: number | null;
        cutVolumeM3?: number | null;
        fillVolumeM3?: number | null;
        areaSqm?: number | null;
      };
      const drawerResult: DrawerVolumeResult = {
        volumeM3:     updated.volumeM3 ?? 0,
        cutVolumeM3:  updated.cutVolumeM3 ?? null,
        fillVolumeM3: updated.fillVolumeM3 ?? null,
        areaSqm:      updated.areaSqm ?? 0,
        method:       updated.cutVolumeM3 != null ? "dsm" : "geometric",
      };
      setResult(drawerResult);
      onComplete?.(drawerResult);
    } catch {
      console.error("Volume calculation failed");
    } finally {
      setIsCalculating(false);
    }
  }, [vertices, jobId, onMeasure, onComplete]);

  const polyPositions: LatLng[] = vertices.length >= 2 ? [...vertices, vertices[0]] : vertices;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[calc(100vw-2rem)] h-[95dvh] flex flex-col gap-0 p-0 overflow-hidden">

        {/* ── Orthophoto banner ──────────────────────────────────────────── */}
        <div className="relative w-full h-[60px] overflow-hidden shrink-0 bg-muted/20">
          <img
            src={orthoUrl}
            alt="NodeODM orthophoto"
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 top-0 px-6 pt-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/70 flex items-center gap-1.5">
              <Layers className="h-2.5 w-2.5" />
              NodeODM Orthophoto · Survey Overview
            </p>
            {center && (
              <p className="text-[10px] font-mono text-white/50 mt-0.5">
                {center[0].toFixed(5)}°, {center[1].toFixed(5)}°
              </p>
            )}
          </div>
        </div>

        <DialogHeader className="px-6 pt-3 pb-2 shrink-0">
          <DialogTitle className="font-mono uppercase tracking-wider">
            Draw Measurement Polygon
          </DialogTitle>
          <DialogDescription className="text-xs">
            Click on the map to place vertices around your stockpile. Place at least 3 points,
            then click Calculate Volume.
          </DialogDescription>
        </DialogHeader>

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap px-6 py-2 border-b border-border/40 bg-card/30 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono uppercase text-xs h-7"
            disabled={vertices.length === 0 || isSaving || !!result}
            onClick={undo}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono uppercase text-xs h-7 hover:bg-destructive/20 hover:text-destructive"
            disabled={vertices.length === 0 || isSaving}
            onClick={reset}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear
          </Button>

          {/* Orthophoto opacity slider */}
          {orthoBounds && (
            <div className="flex items-center gap-2 ml-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] font-mono text-muted-foreground uppercase whitespace-nowrap">
                Ortho
              </span>
              <Slider
                value={[orthoOpacity]}
                onValueChange={([v]) => setOrthoOpacity(v)}
                min={0}
                max={1}
                step={0.05}
                className="w-20"
              />
              <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">
                {Math.round(orthoOpacity * 100)}%
              </span>
            </div>
          )}

          <div className="flex-1" />

          <span className="text-[11px] font-mono text-muted-foreground">
            {result ? (
              <span className="text-emerald-400">Volume calculated</span>
            ) : vertices.length === 0 ? (
              "Click the map to start drawing"
            ) : vertices.length < 3 ? (
              `${3 - vertices.length} more point${3 - vertices.length > 1 ? "s" : ""} needed`
            ) : (
              <span className="text-primary">{vertices.length} vertices — ready</span>
            )}
          </span>

          <Button
            type="button"
            size="sm"
            className="font-mono uppercase text-xs h-7"
            disabled={vertices.length < 3 || isSaving || !!result}
            onClick={handleMeasure}
          >
            {isSaving ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Calculating…</>
            ) : (
              <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Calculate Volume</>
            )}
          </Button>
        </div>

        {/* ── Map ─────────────────────────────────────────────────────────── */}
        <div className="relative flex-1 min-h-0">
          {center ? (
            <MapContainer
              center={defaultCenter}
              zoom={18}
              maxZoom={23}
              scrollWheelZoom
              style={{ height: "100%", width: "100%" }}
            >
              {/* Satellite basemap */}
              <TileLayer
                attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxNativeZoom={19}
                maxZoom={23}
              />

              {/* NodeODM orthophoto overlay — georeferenced over the survey area */}
              {orthoBounds && (
                <ImageOverlay
                  url={orthoUrl}
                  bounds={orthoBounds}
                  opacity={orthoOpacity}
                  zIndex={10}
                />
              )}

              <FitOnOpen jobId={jobId} open={open} onBounds={setOrthoBounds} />
              {!result && <ClickCapture onMapClick={handleClick} />}
              <DotMarkers positions={vertices} />
              {vertices.length >= 3 && (
                <Polygon
                  positions={polyPositions}
                  pathOptions={{
                    color: "#ea580c",
                    fillColor: "#ea580c",
                    fillOpacity: 0.15,
                    weight: 2,
                    dashArray: "5 5",
                  }}
                />
              )}
            </MapContainer>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground font-mono">
              No GPS coordinates available for this job.
            </div>
          )}
        </div>

        {/* ── Result panel ────────────────────────────────────────────────── */}
        {result && (
          <div className="px-6 py-4 border-t border-border/40 bg-card/50 shrink-0 max-h-[220px] overflow-y-auto">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-mono uppercase text-emerald-400 tracking-wider font-bold">
                Volume Calculated
                {result.method === "dsm" && " · DSM Cut/Fill"}
                {result.method === "geometric" && " · Geometric Estimate"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-background/60 rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase mb-1">
                  <Mountain className="h-3 w-3" /> Net Volume
                </div>
                <div className="text-lg font-bold font-mono">
                  {result.volumeM3.toLocaleString()}
                  <span className="text-xs font-normal text-muted-foreground ml-1">m³</span>
                </div>
              </div>

              {result.cutVolumeM3 != null && (
                <div className="bg-orange-500/10 rounded-lg p-3 border border-orange-500/30">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-orange-400 uppercase mb-1">
                    <TrendingUp className="h-3 w-3" /> Cut
                  </div>
                  <div className="text-lg font-bold font-mono text-orange-300">
                    {result.cutVolumeM3.toLocaleString()}
                    <span className="text-xs font-normal text-orange-400/70 ml-1">m³</span>
                  </div>
                </div>
              )}

              {result.fillVolumeM3 != null && (
                <div className="bg-sky-500/10 rounded-lg p-3 border border-sky-500/30">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-sky-400 uppercase mb-1">
                    <TrendingDown className="h-3 w-3" /> Fill
                  </div>
                  <div className="text-lg font-bold font-mono text-sky-300">
                    {result.fillVolumeM3.toLocaleString()}
                    <span className="text-xs font-normal text-sky-400/70 ml-1">m³</span>
                  </div>
                </div>
              )}

              <div className="bg-background/60 rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase mb-1">
                  <Ruler className="h-3 w-3" /> Area
                </div>
                <div className="text-lg font-bold font-mono">
                  {result.areaSqm.toLocaleString()}
                  <span className="text-xs font-normal text-muted-foreground ml-1">m²</span>
                </div>
              </div>

              {result.cutVolumeM3 == null && (
                <>
                  <div className="bg-background/40 rounded-lg p-3 border border-dashed border-border/40 flex flex-col items-center justify-center gap-1">
                    <Minus className="h-4 w-4 text-muted-foreground/40" />
                    <span className="text-[9px] font-mono text-muted-foreground/50 uppercase">
                      Cut — DSM needed
                    </span>
                  </div>
                  <div className="bg-background/40 rounded-lg p-3 border border-dashed border-border/40 flex flex-col items-center justify-center gap-1">
                    <Minus className="h-4 w-4 text-muted-foreground/40" />
                    <span className="text-[9px] font-mono text-muted-foreground/50 uppercase">
                      Fill — DSM needed
                    </span>
                  </div>
                </>
              )}
            </div>

            {result.method === "dsm" && (
              <p className="text-[10px] font-mono text-muted-foreground mt-2">
                Baseline = minimum perimeter elevation. Net = Cut − Fill.
                Results saved to your job automatically.
              </p>
            )}
            {result.method === "geometric" && (
              <p className="text-[10px] font-mono text-amber-400/80 mt-2">
                ⚠ DSM not available — volume estimated geometrically. Upload drone images to get accurate DSM-based cut/fill.
              </p>
            )}
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-3 border-t border-border/40 bg-card/20 shrink-0">
          {result ? (
            <Button
              size="sm"
              className="font-mono uppercase text-xs"
              onClick={() => onOpenChange(false)}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Done
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="font-mono uppercase text-xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
