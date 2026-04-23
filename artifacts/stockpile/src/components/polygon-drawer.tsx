import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapContainer, TileLayer, Polygon, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import { Trash2, Undo2, CheckCircle2, Loader2 } from "lucide-react";
import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";

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

type ClickCaptureProps = {
  onMapClick: (latlng: LatLng) => void;
};

function ClickCapture({ onMapClick }: ClickCaptureProps) {
  useMapEvents({
    click(e) {
      onMapClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

type DotMarkerProps = {
  positions: LatLng[];
};

function DotMarkers({ positions }: DotMarkerProps) {
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

/**
 * Fixes Leaflet sizing inside the dialog and flies to GPS-based approximate
 * bounds when the real orthophoto overlay hasn't loaded yet.
 */
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

      // GPS-based fallback via tilejson
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

/**
 * Fetches the orthophoto GeoTIFF from our server proxy, parses it with
 * georaster, and renders it as a Leaflet layer. Automatically flies the map
 * to the orthophoto's geographic extent on load.
 */
function OrthophotoLayer({
  jobId,
  onLoadChange,
}: {
  jobId: string;
  onLoadChange?: (loading: boolean) => void;
}) {
  const map = useMap();

  useEffect(() => {
    let layer: InstanceType<typeof GeoRasterLayer> | null = null;
    let cancelled = false;

    onLoadChange?.(true);

    (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/orthophoto`, {
          credentials: "include",
        });
        if (!res.ok || cancelled) return;

        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;

        const georaster = await parseGeoraster(arrayBuffer);
        if (cancelled) return;

        layer = new GeoRasterLayer({
          georaster,
          opacity: 0.85,
          resolution: 256,
        }) as InstanceType<typeof GeoRasterLayer>;

        layer.addTo(map);

        // Fly to the orthophoto's actual geographic extent
        const { xmin, ymin, xmax, ymax } = georaster;
        if (xmin != null && ymin != null && xmax != null && ymax != null) {
          map.flyToBounds(
            [[ymin, xmin], [ymax, xmax]],
            { padding: [32, 32], maxZoom: 22, animate: true, duration: 1.0 },
          );
        }
      } catch (err) {
        console.error("[OrthophotoLayer] Failed to load orthophoto:", err);
      } finally {
        if (!cancelled) onLoadChange?.(false);
      }
    })();

    return () => {
      cancelled = true;
      if (layer) {
        try { map.removeLayer(layer); } catch { /**/ }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, map]);

  return null;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  center: [number, number] | null;
  tilesReady?: boolean;
  onMeasure: (coords: number[][]) => void;
  isSaving?: boolean;
};

export function PolygonDrawer({
  open,
  onOpenChange,
  jobId,
  center,
  tilesReady = false,
  onMeasure,
  isSaving,
}: Props) {
  const [vertices, setVertices] = useState<LatLng[]>([]);
  const [orthophotoLoading, setOrthophotoLoading] = useState(false);
  const defaultCenter: LatLng = center ?? [0, 0];

  const handleClick = (latlng: LatLng) => {
    setVertices((prev) => [...prev, latlng]);
  };

  const undo = () => setVertices((prev) => prev.slice(0, -1));
  const reset = () => setVertices([]);

  const handleMeasure = () => {
    if (vertices.length < 3) return;
    onMeasure(vertices.map((v) => [v[0], v[1]]));
  };

  const polyPositions: LatLng[] = vertices.length >= 2 ? [...vertices, vertices[0]] : vertices;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase">
            Draw Measurement Polygon
          </DialogTitle>
          <DialogDescription>
            Click on the map to place vertices around your stockpile. Place at
            least 3 points to close the polygon, then click Measure Volume.
            {tilesReady && " The orthophoto from your drone flight is overlaid on the map."}
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono uppercase text-xs"
            disabled={vertices.length === 0}
            onClick={undo}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono uppercase text-xs hover:bg-destructive/20 hover:text-destructive"
            disabled={vertices.length === 0}
            onClick={reset}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear Polygon
          </Button>

          {tilesReady && orthophotoLoading && (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading orthophoto…
            </span>
          )}
          {tilesReady && !orthophotoLoading && (
            <span className="text-[11px] font-mono text-emerald-400">
              Orthophoto overlay active
            </span>
          )}

          <div className="flex-1" />
          <span className="text-[11px] font-mono text-muted-foreground">
            {vertices.length === 0 && "Click the map to start drawing"}
            {vertices.length > 0 && vertices.length < 3 &&
              `${3 - vertices.length} more point${3 - vertices.length > 1 ? "s" : ""} needed`}
            {vertices.length >= 3 && (
              <span className="text-primary">Polygon ready</span>
            )}
          </span>
          <Button
            type="button"
            size="sm"
            className="font-mono uppercase text-xs"
            disabled={vertices.length < 3 || isSaving}
            onClick={handleMeasure}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            {isSaving ? "Calculating..." : `Measure Volume (${vertices.length} pts)`}
          </Button>
        </div>

        <div className="relative flex-1 min-h-[400px] rounded overflow-hidden border border-border/50">
          {center ? (
            <MapContainer
              center={defaultCenter}
              zoom={18}
              maxZoom={23}
              scrollWheelZoom
              style={{ height: "100%", width: "100%", zIndex: 1 }}
              className="absolute inset-0"
            >
              {/* Esri satellite basemap — always shown as base */}
              <TileLayer
                attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxNativeZoom={19}
                maxZoom={23}
              />

              {/* Orthophoto overlay — GeoRaster renders the real NodeODM GeoTIFF */}
              {tilesReady && open && (
                <OrthophotoLayer
                  jobId={jobId}
                  onLoadChange={setOrthophotoLoading}
                />
              )}

              <FitOnOpen jobId={jobId} open={open} tilesReady={tilesReady} />
              <ClickCapture onMapClick={handleClick} />
              <DotMarkers positions={vertices} />
              {vertices.length >= 3 && (
                <Polygon
                  positions={polyPositions}
                  pathOptions={{
                    color: "#ea580c",
                    fillColor: "#ea580c",
                    fillOpacity: 0.2,
                    weight: 2,
                    dashArray: "4 4",
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

        <DialogFooter className="pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono uppercase text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
