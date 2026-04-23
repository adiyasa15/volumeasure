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
import { MapContainer, TileLayer, Polygon, useMapEvents } from "react-leaflet";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  center: [number, number] | null;
  onMeasure: (coords: number[][]) => void;
  isSaving?: boolean;
};

export function PolygonDrawer({
  open,
  onOpenChange,
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

        <div className="relative flex-1 min-h-[440px] rounded overflow-hidden border border-border/50">
          {center ? (
            <MapContainer
              center={defaultCenter}
              zoom={18}
              scrollWheelZoom
              style={{ height: "100%", width: "100%", zIndex: 1 }}
              className="absolute inset-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
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

          <div className="absolute bottom-3 left-3 z-10 bg-background/90 backdrop-blur border border-border/50 rounded px-3 py-2 text-[11px] font-mono text-muted-foreground space-y-1">
            <div>Vertices: <span className="text-foreground font-bold">{vertices.length}</span></div>
            {vertices.length >= 3 && (
              <div className="text-primary">Polygon ready — click Measure Volume</div>
            )}
            {vertices.length > 0 && vertices.length < 3 && (
              <div>Need {3 - vertices.length} more point{3 - vertices.length > 1 ? "s" : ""}</div>
            )}
            {vertices.length === 0 && (
              <div>Click the map to start drawing</div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2">
          <div className="flex gap-2 flex-1">
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
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Reset
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono uppercase text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
