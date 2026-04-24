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
import { MapContainer, TileLayer, Polygon, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Trash2,
  Undo2,
  CheckCircle2,
  Loader2,
  Mountain,
  Ruler,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";

// Make Leaflet available globally so georaster-layer-for-leaflet can find it
(window as any).L = L;

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

// ── Map fit on open ───────────────────────────────────────────────────────────

function FitOnOpen({
  jobId,
  open,
  tilesReady,
}: {
  jobId: string;
  open: boolean;
  tilesReady: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      map.invalidateSize();
      if (tilesReady) return; // OrthophotoLayer will fly to real bounds

      try {
        const res = await fetch(`/api/jobs/${jobId}/tilejson`, { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { bounds?: [number, number, number, number] };
        if (!data?.bounds) return;
        const [west, south, east, north] = data.bounds;
        map.flyToBounds([[south, west], [north, east]], {
          padding: [32, 32],
          maxZoom: 20,
          animate: true,
          duration: 1.0,
        });
      } catch {
        // silent
      }
    }, 300);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId, tilesReady]);

  return null;
}

// ── Orthophoto overlay layer ──────────────────────────────────────────────────

function OrthophotoLayer({
  jobId,
  opacity,
  onLoadChange,
  onError,
}: {
  jobId: string;
  opacity: number; // 0–100
  onLoadChange?: (loading: boolean) => void;
  onError?: () => void;
}) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  // Dynamically update CSS opacity when slider changes (no re-fetch)
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    // GeoRasterLayer renders into a canvas pane container
    const container: HTMLElement | undefined =
      layer._container ?? layer._levels?.[Object.keys(layer._levels)[0]]?.el;
    if (container) {
      container.style.opacity = String(opacity / 100);
    }
  }, [opacity]);

  useEffect(() => {
    let cancelled = false;
    onLoadChange?.(true);

    (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/orthophoto`, { credentials: "include" });
        if (!res.ok || cancelled) {
          onError?.();
          return;
        }

        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;

        const georaster = await parseGeoraster(arrayBuffer);
        if (cancelled) return;

        const layer = new GeoRasterLayer({
          georaster,
          opacity: opacity / 100,
          resolution: 256,
        });

        layerRef.current = layer;
        layer.addTo(map);

        const { xmin, ymin, xmax, ymax } = georaster;
        if (xmin != null && ymin != null && xmax != null && ymax != null) {
          map.flyToBounds([[ymin, xmin], [ymax, xmax]], {
            padding: [32, 32],
            maxZoom: 22,
            animate: true,
            duration: 1.0,
          });
        }
      } catch (err) {
        console.error("[OrthophotoLayer] Failed to load orthophoto:", err);
        onError?.();
      } finally {
        if (!cancelled) onLoadChange?.(false);
      }
    })();

    return () => {
      cancelled = true;
      const layer = layerRef.current;
      if (layer) {
        try { map.removeLayer(layer); } catch { /**/ }
        layerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, map]);

  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  center: [number, number] | null;
  tilesReady?: boolean;
  /** Called with the full updated job after volume is saved. */
  onComplete?: (result: DrawerVolumeResult) => void;
  isSaving?: boolean;
  /** Legacy: called with raw coords. Use onComplete for full result. */
  onMeasure?: (coords: number[][]) => void;
};

export function PolygonDrawer({
  open,
  onOpenChange,
  jobId,
  center,
  tilesReady = false,
  onComplete,
  onMeasure,
  isSaving: externalSaving = false,
}: Props) {
  const [vertices, setVertices] = useState<LatLng[]>([]);
  const [orthophotoLoading, setOrthophotoLoading] = useState(false);
  const [orthophotoError, setOrthophotoError] = useState(false);
  const [opacity, setOpacity] = useState(80);
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<DrawerVolumeResult | null>(null);

  const defaultCenter: LatLng = center ?? [0, 0];
  const isSaving = externalSaving || isCalculating;

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setVertices([]);
      setResult(null);
      setOrthophotoError(false);
      setOrthophotoLoading(false);
    }
  }, [open]);

  const handleClick = (latlng: LatLng) => {
    if (result) return; // lock map after result shown
    setVertices((prev) => [...prev, latlng]);
  };

  const undo = () => setVertices((prev) => prev.slice(0, -1));
  const reset = () => { setVertices([]); setResult(null); };

  const handleMeasure = useCallback(async () => {
    if (vertices.length < 3) return;
    const coords = vertices.map((v) => [v[0], v[1]]);

    // If parent uses legacy onMeasure, delegate to it
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
      // surface error to user
      console.error("Volume calculation failed");
    } finally {
      setIsCalculating(false);
    }
  }, [vertices, jobId, onMeasure, onComplete]);

  const polyPositions: LatLng[] = vertices.length >= 2 ? [...vertices, vertices[0]] : vertices;

  // Build ESRI static satellite banner URL from the job center coordinates
  const esriBannerUrl = (() => {
    if (!center) return null;
    const [lat, lng] = center;
    const buf = 0.004; // ~400 m buffer
    const west  = (lng - buf).toFixed(6);
    const east  = (lng + buf).toFixed(6);
    const south = (lat - buf * 0.5).toFixed(6);
    const north = (lat + buf * 0.5).toFixed(6);
    return (
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export` +
      `?bbox=${west},${south},${east},${north}&bboxSR=4326&size=760,120&imageSR=4326&format=jpg&f=image`
    );
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">

        {/* ── ESRI satellite banner ──────────────────────────────────── */}
        {esriBannerUrl && (
          <div className="relative w-full h-[90px] overflow-hidden shrink-0 bg-muted/20">
            <img
              src={esriBannerUrl}
              alt="Satellite overview"
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
            {/* gradient overlay so text above is readable */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-transparent" />
            <div className="absolute inset-x-0 top-0 px-6 pt-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/70">
                Esri World Imagery · Site Overview
              </p>
              {center && (
                <p className="text-[10px] font-mono text-white/50 mt-0.5">
                  {center[0].toFixed(5)}°, {center[1].toFixed(5)}°
                </p>
              )}
            </div>
          </div>
        )}

        <DialogHeader className="px-6 pt-4 pb-3">
          <DialogTitle className="font-mono uppercase tracking-wider">
            Draw Measurement Polygon
          </DialogTitle>
          <DialogDescription className="text-xs">
            Click on the map to place vertices around your stockpile. Place at least 3 points,
            then click Calculate Volume.
            {tilesReady && !orthophotoError && " Your drone orthophoto is overlaid below."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap px-6 py-2 border-b border-border/40 bg-card/30">
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

          {/* Opacity control — only when orthophoto is available */}
          {tilesReady && !orthophotoError && (
            <div className="flex items-center gap-2 ml-2 border-l border-border/40 pl-3">
              <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                Overlay {opacity}%
              </span>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[opacity]}
                onValueChange={([v]) => setOpacity(v)}
                className="w-24"
              />
              {orthophotoLoading && (
                <Loader2 className="h-3 w-3 animate-spin text-amber-400 shrink-0" />
              )}
            </div>
          )}

          <div className="flex-1" />

          {/* Vertex hint */}
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

        {/* ── Map ─────────────────────────────────────────────────────── */}
        <div className="relative flex-1 min-h-0" style={{ height: "400px" }}>
          {center ? (
            <MapContainer
              center={defaultCenter}
              zoom={18}
              maxZoom={23}
              scrollWheelZoom
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxNativeZoom={19}
                maxZoom={23}
              />

              {tilesReady && open && !orthophotoError && (
                <OrthophotoLayer
                  jobId={jobId}
                  opacity={opacity}
                  onLoadChange={setOrthophotoLoading}
                  onError={() => setOrthophotoError(true)}
                />
              )}

              <FitOnOpen jobId={jobId} open={open} tilesReady={tilesReady && !orthophotoError} />
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

        {/* ── Result panel ────────────────────────────────────────────── */}
        {result && (
          <div className="px-6 py-4 border-t border-border/40 bg-card/50">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-mono uppercase text-emerald-400 tracking-wider font-bold">
                Volume Calculated
                {result.method === "dsm" && " · DSM Cut/Fill"}
                {result.method === "geometric" && " · Geometric Estimate"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Net volume */}
              <div className="bg-background/60 rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase mb-1">
                  <Mountain className="h-3 w-3" /> Net Volume
                </div>
                <div className="text-lg font-bold font-mono">
                  {result.volumeM3.toLocaleString()}
                  <span className="text-xs font-normal text-muted-foreground ml-1">m³</span>
                </div>
              </div>

              {/* Cut */}
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

              {/* Fill */}
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

              {/* Area */}
              <div className="bg-background/60 rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase mb-1">
                  <Ruler className="h-3 w-3" /> Area
                </div>
                <div className="text-lg font-bold font-mono">
                  {result.areaSqm.toLocaleString()}
                  <span className="text-xs font-normal text-muted-foreground ml-1">m²</span>
                </div>
              </div>

              {/* Geometric fallback — show placeholder cut/fill cards */}
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

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-3 border-t border-border/40 bg-card/20">
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
