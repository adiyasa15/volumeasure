import { jsPDF } from "jspdf";
import type { Job } from "@workspace/api-client-react";
import parseGeoraster from "georaster";

function formatBytes(bytes?: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

/**
 * Renders the calculated polygon (lat/lng pairs) onto an off-screen canvas and
 * returns the resulting data URL so the PDF report can embed an image of the
 * exact area that was measured.
 */
function renderPolygon(coords: number[][] | null | undefined): string | null {
  if (!coords || coords.length < 3) return null;
  const size = 480;
  const padding = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const lats = coords.map((p) => p[0]);
  const lngs = coords.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = Math.max(1e-9, maxLat - minLat);
  const spanLng = Math.max(1e-9, maxLng - minLng);
  const scale = Math.min(
    (size - padding * 2) / spanLng,
    (size - padding * 2) / spanLat,
  );

  ctx.fillStyle = "#0b0e13";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const project = (lat: number, lng: number): [number, number] => {
    const x = padding + (lng - minLng) * scale;
    const y = size - padding - (lat - minLat) * scale;
    return [x, y];
  };

  ctx.beginPath();
  coords.forEach((p, i) => {
    const [x, y] = project(p[0], p[1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(234, 88, 12, 0.25)";
  ctx.fill();
  ctx.strokeStyle = "#ea580c";
  ctx.lineWidth = 2;
  ctx.stroke();

  coords.forEach((p) => {
    const [x, y] = project(p[0], p[1]);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ea580c";
    ctx.fill();
  });

  return canvas.toDataURL("image/png");
}

/**
 * Fetches the NodeODM orthophoto GeoTIFF through the API, renders all RGB bands
 * to an off-screen canvas, and returns a JPEG data URL for PDF embedding.
 * Returns null if the orthophoto is not available or the fetch fails.
 */
async function fetchOrthophotoDataUrl(jobId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/jobs/${jobId}/orthophoto`, { credentials: "include" });
    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    const georaster = await parseGeoraster(arrayBuffer);

    const { width, height, values, noDataValue } = georaster;
    if (!values || values.length < 3) return null;

    const OUT = 512;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const imageData = ctx.createImageData(OUT, OUT);
    const bands = values as number[][][];

    for (let py = 0; py < OUT; py++) {
      const gy = Math.min(height - 1, Math.floor((py / OUT) * height));
      for (let px = 0; px < OUT; px++) {
        const gx = Math.min(width - 1, Math.floor((px / OUT) * width));
        const idx = (py * OUT + px) * 4;
        const r = bands[0]?.[gy]?.[gx] ?? 0;
        const g = bands[1]?.[gy]?.[gx] ?? 0;
        const b = bands[2]?.[gy]?.[gx] ?? 0;
        const a = bands[3]?.[gy]?.[gx] ?? 255;
        const isNoData =
          noDataValue != null && (r === noDataValue || a === 0);
        imageData.data[idx]     = isNoData ? 0 : Math.max(0, Math.min(255, r));
        imageData.data[idx + 1] = isNoData ? 0 : Math.max(0, Math.min(255, g));
        imageData.data[idx + 2] = isNoData ? 0 : Math.max(0, Math.min(255, b));
        imageData.data[idx + 3] = isNoData ? 0 : Math.max(0, Math.min(255, a));
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    return null;
  }
}

export async function generateJobReport(job: Job): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PILEMETRIC TECHNICAL AUDIT REPORT", margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
  y += 22;
  doc.setTextColor(20);

  doc.setDrawColor(220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(job.name, margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const details: [string, string][] = [
    ["Material", job.materialType.toUpperCase()],
    ["Precision", job.precisionLevel.toUpperCase()],
    ["Status", job.status.toUpperCase()],
    [
      "Volume",
      job.volumeM3 != null ? `${job.volumeM3.toLocaleString()} m³` : "—",
    ],
    [
      "Area",
      job.areaSqm != null ? `${job.areaSqm.toLocaleString()} m²` : "—",
    ],
    ["GCP Enabled", job.gcpEnabled ? "Yes" : "No"],
  ];
  details.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 90, y);
    y += 14;
  });
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("CAPTURE METADATA", margin, y);
  y += 14;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const capture: [string, string][] = [
    [
      "Capture Date",
      job.captureDate
        ? new Date(job.captureDate).toLocaleString()
        : new Date(job.createdAt).toLocaleString(),
    ],
    [
      "Location",
      job.captureLocation ??
        (job.latitude != null && job.longitude != null
          ? `${job.latitude.toFixed(5)}, ${job.longitude.toFixed(5)}`
          : "—"),
    ],
    [
      "Coordinates",
      job.latitude != null && job.longitude != null
        ? `${job.latitude.toFixed(6)}° / ${job.longitude.toFixed(6)}°`
        : "—",
    ],
  ];
  capture.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 90, y);
    y += 14;
  });
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("PHOTO STATISTICS", margin, y);
  y += 14;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const photoStats: [string, string][] = [
    ["Total Photos", `${job.imageCount}`],
    ["Accepted", `${job.acceptedImageCount}`],
    ["Rejected", `${job.imageCount - job.acceptedImageCount}`],
    ["Total File Size", formatBytes(job.totalFileSizeBytes)],
    [
      "Combined",
      `${job.imageCount} Photos / ${formatBytes(job.totalFileSizeBytes)}`,
    ],
  ];
  photoStats.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 90, y);
    y += 14;
  });
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("PROCESSING TIMELINE", margin, y);
  y += 14;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const timeline: [string, string][] = [
    [
      "Started",
      job.processingStartedAt
        ? new Date(job.processingStartedAt).toLocaleString()
        : new Date(job.createdAt).toLocaleString(),
    ],
    [
      "Completed",
      job.completedAt ? new Date(job.completedAt).toLocaleString() : "—",
    ],
    ["Duration", formatDuration(job.processingDurationSeconds)],
  ];
  timeline.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 90, y);
    y += 14;
  });
  y += 14;

  const polygonImg = renderPolygon(job.polygonCoordinates);
  if (polygonImg) {
    if (y > 520) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("MEASURED FOOTPRINT (POLYGON CROP)", margin, y);
    y += 14;
    const imgSize = 240;
    doc.addImage(polygonImg, "PNG", margin, y, imgSize, imgSize);
    y += imgSize + 12;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.setFont("helvetica", "normal");
    doc.text(
      "Boundary computed from photogrammetry results. Coordinates are WGS84 lat/lng.",
      margin,
      y,
    );
    doc.setTextColor(20);
    y += 16;
  }

  // ── Orthophoto page ────────────────────────────────────────────────────────
  const orthophotoDataUrl = await fetchOrthophotoDataUrl(job.id);
  if (orthophotoDataUrl) {
    doc.addPage();
    y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text("ORTHOPHOTO — AERIAL RECONSTRUCTION", margin, y);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      "RGB orthophoto generated by NodeODM photogrammetry pipeline from uploaded drone imagery.",
      margin,
      y,
    );
    y += 6;
    doc.text(
      "Projection: WGS84. Resolution depends on flight altitude and camera settings.",
      margin,
      y,
    );
    doc.setTextColor(20);
    y += 14;

    // Fit image to available width while preserving aspect ratio (it's square from our canvas)
    const maxW = pageWidth - margin * 2;
    const imgPx = 512;
    const printSize = Math.min(maxW, 460); // max 460pt wide

    // Draw a thin border around the image
    doc.setDrawColor(180);
    doc.setLineWidth(0.5);
    doc.rect(margin - 1, y - 1, printSize + 2, printSize + 2);

    doc.addImage(orthophotoDataUrl, "JPEG", margin, y, printSize, printSize);
    y += printSize + 12;

    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Source: NodeODM Lightning photogrammetry · ${imgPx}×${imgPx}px preview · Rendered ${new Date().toISOString()}`,
      margin,
      y,
    );
    doc.setTextColor(20);
    y += 16;
  }

  // ── Source images page ─────────────────────────────────────────────────────
  doc.addPage();
  y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("ORIGINAL DATA SOURCE", margin, y);
  y += 14;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(
    `${job.imageCount} source images submitted (${formatBytes(job.totalFileSizeBytes)} total). Filenames listed below.`,
    margin,
    y,
  );
  doc.setTextColor(20);
  y += 16;

  const cols = 2;
  const colWidth = (pageWidth - margin * 2) / cols;
  let col = 0;
  let rowY = y;
  doc.setFontSize(8);
  doc.setFont("courier", "normal");
  job.images.forEach((img, idx) => {
    if (rowY > 780) {
      doc.addPage();
      rowY = margin;
      col = 0;
    }
    const x = margin + col * colWidth;
    const status = img.accepted ? "OK" : "SKIP";
    const line = `${(idx + 1).toString().padStart(3, "0")} [${status}] ${img.name.slice(0, 38)}`;
    doc.text(line, x, rowY);
    col++;
    if (col >= cols) {
      col = 0;
      rowY += 12;
    }
  });

  doc.save(`pilemetric-${job.name.replace(/\s+/g, "_")}-report.pdf`);
}
