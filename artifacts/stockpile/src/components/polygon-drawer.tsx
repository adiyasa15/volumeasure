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
import { Trash2, Undo2, CheckCircle2 } from "lucide-react";

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
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const map = useMapEvents({});

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

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
 * Fixes Leaflet sizing inside a dialog and flies to the job's orthophoto bounds.
 * Must be rendered inside a MapContainer.
 */
function FitOnOpen({ jobId }: { jobId: string }) {
  const map = useMap();

  useEffect(() => {
    // Wait for the dialog open animation before correcting map size
    const timer = setTimeout(async () => {
      map.invalidateSize();
      try {
        const res = await fetch(`/api/jobs/${jobId}/tilejson`, { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { bounds?: [number, number, number, number] };
        if (!data?.bounds) return;
        const [west, south, east, north] = data.bounds;
        map.flyToBounds(
          [[south, west], [north, east]],
          { padding: [32, 32], maxZoom: 20, animate: true, duration: 1.0 },
        );
      } catch {
        // fallback: just invalidate size so the map renders correctly
      }
    }, 300);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  center: [number, number] | null;
  onMeasure: (coords: number[][]) => void;
  isSaving?: boolean;
};

export function PolygonDrawer({
  open,
  onOpenChange,
  jobId,
  center,
  onMeasure,
  isSaving,
}: Props) {
  const [vertices, setVertices] = useState<LatLng[]>([]);
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
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar — always visible above the map */}
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
          <div className="flex-1" />
          <span className="text-[11px] font-mono text-muted-foreground">
            {vertices.length === 0 && "Click the map to start drawing"}
            {vertices.length > 0 && vertices.length < 3 && `${3 - vertices.length} more point${3 - vertices.length > 1 ? "s" : ""} needed`}
            {vertices.length >= 3 && <span className="text-primary">Polygon ready</span>}
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
              <TileLayer
                attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxNativeZoom={19}
                maxZoom={23}
              />
              <FitOnOpen jobId={jobId} />
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
