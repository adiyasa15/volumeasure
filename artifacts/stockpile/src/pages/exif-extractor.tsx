import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ScanSearch,
  Upload,
  Copy,
  Check,
  Trash2,
  AlertCircle,
  MapPin,
  FileImage,
  ClipboardList,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import exifr from "exifr";

type ExifRow = {
  id: string;
  filename: string;
  longitude: number | null;
  latitude: number | null;
  altitude: number | null;
  error?: string;
};

function fmtCoord(v: number | null, digits = 7): string {
  return v == null ? "—" : v.toFixed(digits);
}

function rowToCopyText(row: ExifRow): string {
  const lng = row.longitude?.toFixed(7) ?? "";
  const lat = row.latitude?.toFixed(7) ?? "";
  const alt = row.altitude?.toFixed(3) ?? "";
  return `${row.filename}\t${lng}\t${lat}\t${alt}`;
}

export default function ExifExtractor() {
  const [rows, setRows] = useState<ExifRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const processFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setProcessing(true);

    const imageFiles = files.filter((f) =>
      /\.(jpe?g|tiff?|heic|png)$/i.test(f.name),
    );

    if (!imageFiles.length) {
      toast({
        title: "No supported images",
        description: "Please select JPEG, TIFF, HEIC or PNG files.",
        variant: "destructive",
      });
      setProcessing(false);
      return;
    }

    const results: ExifRow[] = await Promise.all(
      imageFiles.map(async (file) => {
        const id = `${file.name}-${file.size}-${file.lastModified}`;
        try {
          const gps = await exifr.gps(file);
          if (!gps || (gps.latitude == null && gps.longitude == null)) {
            return {
              id,
              filename: file.name,
              longitude: null,
              latitude: null,
              altitude: null,
              error: "No GPS data in EXIF",
            };
          }

          // exifr returns { latitude, longitude, altitude }
          return {
            id,
            filename: file.name,
            longitude: gps.longitude ?? null,
            latitude: gps.latitude ?? null,
            altitude: gps.altitude ?? null,
          };
        } catch {
          return {
            id,
            filename: file.name,
            longitude: null,
            latitude: null,
            altitude: null,
            error: "Failed to read EXIF",
          };
        }
      }),
    );

    // Merge with existing rows (skip duplicates by id)
    setRows((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      const newRows = results.filter((r) => !existingIds.has(r.id));
      return [...prev, ...newRows];
    });

    setProcessing(false);
  }, [toast]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      processFiles(files);
      e.target.value = "";
    },
    [processFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      processFiles(files);
    },
    [processFiles],
  );

  const copyRow = useCallback((row: ExifRow) => {
    navigator.clipboard.writeText(rowToCopyText(row)).then(() => {
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const copyAll = useCallback(() => {
    const validRows = rows.filter((r) => r.longitude != null);
    if (!validRows.length) return;
    const header = "filename\tlongitude\tlatitude\taltitude";
    const body = validRows.map(rowToCopyText).join("\n");
    navigator.clipboard.writeText(`${header}\n${body}`).then(() => {
      setCopiedAll(true);
      toast({ title: `Copied ${validRows.length} rows to clipboard` });
      setTimeout(() => setCopiedAll(false), 2500);
    });
  }, [rows, toast]);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setRows([]);
  }, []);

  const validCount = rows.filter((r) => r.longitude != null).length;
  const errorCount = rows.filter((r) => r.error).length;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ScanSearch className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold font-mono uppercase tracking-wider">
              EXIF GPS Extractor
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Drop drone or DSLR images to extract GPS coordinates from EXIF
            metadata. Output is formatted as{" "}
            <span className="font-mono text-foreground/80">
              longitude latitude altitude
            </span>{" "}
            — ready to use as GCP reference coordinates.
          </p>
        </div>

        {rows.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyAll}
              disabled={validCount === 0}
              className="font-mono"
            >
              {copiedAll ? (
                <Check className="h-4 w-4 mr-2 text-green-400" />
              ) : (
                <ClipboardList className="h-4 w-4 mr-2" />
              )}
              Copy All ({validCount})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* ── Drop Zone ───────────────────────────────────────────────────── */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-border/60 hover:border-primary/50 rounded-lg p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors bg-card/30 hover:bg-card/50 group"
      >
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          {processing ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <Upload className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="text-center">
          <p className="font-medium text-sm">
            {processing ? "Processing images…" : "Drop images here or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            JPEG, TIFF, HEIC, PNG — multiple files supported
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.jpg,.jpeg,.tiff,.tif,.heic,.heif,.png"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <FileImage className="h-3.5 w-3.5" />
            {rows.length} image{rows.length !== 1 ? "s" : ""} loaded
          </span>
          {validCount > 0 && (
            <Badge variant="outline" className="text-green-400 border-green-400/40 bg-green-400/5 font-mono text-xs">
              <MapPin className="h-3 w-3 mr-1" />
              {validCount} with GPS
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge variant="outline" className="text-yellow-400 border-yellow-400/40 bg-yellow-400/5 font-mono text-xs">
              <AlertCircle className="h-3 w-3 mr-1" />
              {errorCount} no GPS data
            </Badge>
          )}
          <span className="ml-auto text-muted-foreground/60">
            Format: filename · longitude · latitude · altitude (m)
          </span>
        </div>
      )}

      {/* ── Results Table ───────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="font-mono text-xs uppercase tracking-wider w-8 text-center">#</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Filename</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Longitude</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Latitude</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Altitude (m)</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow
                  key={row.id}
                  className={row.error ? "opacity-60" : ""}
                >
                  <TableCell className="text-center text-xs text-muted-foreground font-mono">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[260px]">
                    <div className="truncate" title={row.filename}>
                      {row.filename}
                    </div>
                    {row.error && (
                      <div className="flex items-center gap-1 text-yellow-500/80 mt-0.5">
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        <span className="text-[10px]">{row.error}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {fmtCoord(row.longitude)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {fmtCoord(row.latitude)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {row.altitude != null ? row.altitude.toFixed(3) : "—"}
                  </TableCell>
                  <TableCell className="text-right pr-3">
                    <div className="flex items-center justify-end gap-1">
                      {!row.error && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title="Copy row"
                          onClick={() => copyRow(row)}
                        >
                          {copiedId === row.id ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="Remove"
                        onClick={() => removeRow(row.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Clipboard preview ───────────────────────────────────────────── */}
      {validCount > 0 && (
        <div className="rounded-lg border border-border/40 bg-card/20 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Clipboard Preview — {validCount} row{validCount !== 1 ? "s" : ""}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={copyAll}
              className="h-7 text-xs font-mono"
            >
              {copiedAll ? (
                <Check className="h-3 w-3 mr-1.5 text-green-400" />
              ) : (
                <Copy className="h-3 w-3 mr-1.5" />
              )}
              Copy All
            </Button>
          </div>
          <pre className="text-[11px] font-mono text-muted-foreground leading-relaxed overflow-x-auto whitespace-pre">
            <span className="text-muted-foreground/50">filename{"\t"}longitude{"\t"}latitude{"\t"}altitude{"\n"}</span>
            {rows
              .filter((r) => r.longitude != null)
              .map((r) => rowToCopyText(r))
              .join("\n")}
          </pre>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {rows.length === 0 && !processing && (
        <div className="rounded-lg border border-border/30 bg-card/20 p-8 text-center space-y-2">
          <MapPin className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">
            No images loaded yet. Drop photos above to extract GPS metadata.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Works entirely in-browser — images are never uploaded to the server.
          </p>
        </div>
      )}
    </div>
  );
}
