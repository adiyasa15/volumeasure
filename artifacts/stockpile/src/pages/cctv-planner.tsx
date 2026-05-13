import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// PHOTOGRAMMETRY ENGINE
// Formula reference:
//   d       = H / tan(α)                        jarak horiz kamera ke lantai
//   fw      = 2·d·tan(θH/2)                     lebar FOV di lantai
//   fl      = 2·d·tan(θV/2)                     kedalaman FOV di lantai
//   sweepW  = 2·d·tan(panEff/2)                 lebar sapuan satu kamera
//   step    = θH × (1 − OL_foto%)               step pan maks (deg)
//   nFrames = ⌈panEff / step⌉                   frame per kamera (bukan 360°!)
//   stride  = sweepW × (1 − OL_cam%)            langkah efektif antar kamera
//   nCamL   = ⌈stockL / stride⌉                 kamera per sisi panjang
//   nCamW   = ⌈stockW / stride⌉                 kamera per sisi lebar
//   total   = 2·nCamL + 2·nCamW                total kamera
//   B/Z     = baseline / d                      stereo quality ratio
//   GSD     = (pixPitch/f) × d × 1000          mm/px
//   σZ      = d²·pixPitch / (f·B) × 1000       akurasi Z (mm)
// ─────────────────────────────────────────────────────────────────────────────
const D2R = Math.PI / 180;
function rnd(v: number, dec = 2) { return Math.round(v * 10 ** dec) / 10 ** dec; }

type WallSide = "front" | "back" | "left" | "right";

type ComputeParams = {
  roomL: number; roomW: number; roomH: number;
  stockL: number; stockW: number; stockH: number;
  fovH: number; fovV: number; tilt: number;
  sensorW: number; sensorH: number; focalLen: number; megapix: number;
  panEff: number; olPhoto: number; olCam: number; baseB: number;
  manualTotCams?: number; // if set (≥8), override auto layout; cameras stay on walls
};

function compute(p: ComputeParams) {
  const { roomL, roomW, roomH, stockL, stockW, fovH, fovV, tilt,
    sensorW, sensorH, focalLen, megapix, panEff, olPhoto, olCam, baseB } = p;

  const panUsed = Math.min(panEff, 180);

  // Step 1 — FOV footprint
  const d      = roomH / Math.tan(tilt * D2R);
  const fw     = 2 * d * Math.tan((fovH / 2) * D2R);
  const fl     = 2 * d * Math.tan((fovV / 2) * D2R);
  const sweepW = 2 * d * Math.tan((panUsed / 2) * D2R);

  // Step 2 — Pan step & frames (pan ≤ 180°, NOT 360°)
  const maxStep    = fovH * (1 - olPhoto / 100);
  const nFrames    = Math.ceil(panUsed / maxStep);
  const actStep    = nFrames > 1 ? panUsed / (nFrames - 1) : fovH;
  const actOlPhoto = Math.round((1 - actStep / fovH) * 100);
  const wrong360   = Math.ceil(360 / maxStep);

  // Step 3 — Camera layout (wall-mounted perimeter only, never inside stockpile)
  const stride = sweepW * (1 - olCam / 100);
  let nCamL: number, nCamW: number;
  const isManual = typeof p.manualTotCams === "number" && p.manualTotCams >= 8;
  if (isManual) {
    // Optimal split: minimize max(spacL, spacW) ↔ equalize coverage per metre
    // Derived by setting stockL/(nCamL-1) = stockW/(nCamW-1) with nCamL+nCamW = halfN
    const halfN    = Math.max(4, Math.floor(p.manualTotCams! / 2));
    const rawNcamL = (stockL * (halfN - 1) + stockW) / (stockL + stockW);
    nCamL = Math.max(2, Math.min(halfN - 2, Math.round(rawNcamL)));
    nCamW = Math.max(2, halfN - nCamL);
  } else {
    nCamL = Math.max(2, Math.ceil(stockL / stride));
    nCamW = Math.max(2, Math.ceil(stockW / stride));
  }
  const spacL   = nCamL > 1 ? stockL / (nCamL - 1) : stockL;
  const spacW   = nCamW > 1 ? stockW / (nCamW - 1) : stockW;
  const totCams = 2 * nCamL + 2 * nCamW;
  const actOlCamL = Math.round(((sweepW - spacL) / sweepW) * 100);
  const actOlCamW = Math.round(((sweepW - spacW) / sweepW) * 100);
  const minOlCam  = Math.min(actOlCamL, actOlCamW);

  // Step 4 — B/Z stereo quality
  const Z     = d;
  const BZ    = rnd(baseB / Z, 3);
  const conv  = rnd(2 * Math.atan(baseB / (2 * Z)) / D2R, 1);
  const pxW   = Math.round(Math.sqrt(megapix * 1e6 * (sensorW / sensorH)));
  const pxH   = Math.round(pxW * sensorH / sensorW);
  const pp    = sensorW / pxW;
  const GSD   = rnd((pp / focalLen) * Z * 1000, 2);
  const sigZ  = rnd((Z * Z * pp) / (focalLen * baseB) * 1000, 1);

  // Step 5 — Totals
  const totPhotos = totCams * nFrames;
  const volErr = sigZ < 5 ? "<1%" : sigZ < 15 ? "1–2%" : sigZ < 30 ? "2–5%" : ">5%";
  const bzQual = BZ >= 0.20 ? "ideal" : BZ >= 0.10 ? "cukup" : "lemah";

  // Camera positions (stockpile centered in room, clamped to valid range)
  const ox = Math.max(0, (roomW - stockW) / 2);
  const oy = Math.max(0, (roomL - stockL) / 2);
  const clearL = (roomL - stockL) / 2;  // clearance front/back (m)
  const clearW = (roomW - stockW) / 2;  // clearance left/right (m)
  const cams: { id: number; x: number; y: number; wall: WallSide }[] = [];
  for (let i = 0; i < nCamW; i++) cams.push({ id: cams.length + 1, x: rnd(ox + i * spacW), y: 0, wall: "front" });
  for (let i = 0; i < nCamW; i++) cams.push({ id: cams.length + 1, x: rnd(ox + i * spacW), y: roomL, wall: "back" });
  for (let i = 0; i < nCamL; i++) {
    const y = rnd(oy + i * spacL);
    if (y > 0 && y < roomL) cams.push({ id: cams.length + 1, x: 0, y, wall: "left" });
  }
  for (let i = 0; i < nCamL; i++) {
    const y = rnd(oy + i * spacL);
    if (y > 0 && y < roomL) cams.push({ id: cams.length + 1, x: roomW, y, wall: "right" });
  }

  return {
    d: rnd(d), fw: rnd(fw), fl: rnd(fl), sweepW: rnd(sweepW), panUsed,
    maxStep: rnd(maxStep, 1), nFrames, actStep: rnd(actStep, 2), actOlPhoto, wrong360,
    nCamL, nCamW, totCams, spacL: rnd(spacL), spacW: rnd(spacW), stride: rnd(stride),
    actOlCamL, actOlCamW, minOlCam,
    Z: rnd(Z), BZ, conv, GSD, sigZ_mm: sigZ, pxW, pxH, pp: rnd(pp, 4),
    totPhotos, volErr, bzQual, cameras: cams, inputs: p,
    clearL: rnd(clearL), clearW: rnd(clearW),
    dimOk: stockL < roomL && stockW < roomW,
    isManual,
  };
}

type R = ReturnType<typeof compute>;

// ─────────────────────────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg: "#08090d", bg2: "#0e1019", bg3: "#151820",
  bd: "#1e2235", bd2: "#252a3d",
  tx: "#dde1f0", tx2: "#6b7290", tx3: "#3d4260",
  bl: "#3d7fff", bl2: "#1a5ce8",
  gn: "#1fd980", am: "#f5a623", rd: "#f04040", tl: "#00c9b1", pu: "#9b6dff",
};

const qualColor = (v: number) => v >= 0.20 ? C.gn : v >= 0.10 ? C.am : C.rd;
const olColor   = (act: number, tgt: number) => act >= tgt ? C.gn : C.rd;

// ─────────────────────────────────────────────────────────────────────────────
// SLIDER FIELD
// ─────────────────────────────────────────────────────────────────────────────
function Field({ label, min, max, value, step, unit, onChange }: {
  label: string; min: number; max: number; value: number;
  step: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.tx2, marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ fontFamily: "monospace", fontWeight: 700, color: C.bl, background: "rgba(61,127,255,.1)", padding: "1px 7px", borderRadius: 3 }}>
          {typeof value === "number" ? value.toFixed(step < 1 ? 1 : 0) : value}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: C.bl, cursor: "pointer" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────────────────────────
function KCard({ label, icon, value, unit, color, sub }: {
  label: string; icon: string; value: number | string;
  unit: string; color?: string; sub?: string;
}) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: "10px 11px" }}>
      <div style={{ fontSize: 10, color: C.tx3, fontFamily: "monospace", marginBottom: 3 }}>{icon} {label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || C.tx, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.tx3, fontFamily: "monospace", marginTop: 2 }}>{unit}</div>
      {sub && <div style={{ fontSize: 10, color: color || C.tx2, fontFamily: "monospace", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP CARD
// ─────────────────────────────────────────────────────────────────────────────
function StepCard({ title, rows }: { title: string; rows: [string, string, string?][] }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: "monospace", marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${C.bd}` }}>
        {title}
      </div>
      {rows.map(([k, v, vc], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace", marginBottom: 4, paddingBottom: 3, borderBottom: i < rows.length - 1 ? `1px solid ${C.bd}` : "none" }}>
          <span style={{ color: C.tx2, flex: 1, paddingRight: 6 }}>{k}</span>
          <span style={{ color: vc || C.tx, fontWeight: 600, textAlign: "right" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG TOP VIEW
// ─────────────────────────────────────────────────────────────────────────────
function TopView({ r }: { r: R }) {
  const VW = 700, PX = 52, PY = 46;
  const RW = VW - PX * 2;
  const RH = Math.min(Math.round(RW * r.inputs.roomL / r.inputs.roomW), 300);
  const VH = RH + PY * 2 + 68;
  const scX = RW / r.inputs.roomW, scY = RH / r.inputs.roomL;
  const rx = PX, ry = PY;
  const fwPx = Math.min(r.sweepW * scX, RW);
  const flPx = Math.min(r.fl * scY, RH);
  const ox = (r.inputs.roomW - r.inputs.stockW) / 2;
  const oy = (r.inputs.roomL - r.inputs.stockL) / 2;
  const spx = rx + ox * scX, spy = ry + oy * scY;
  const swPx = r.inputs.stockW * scX, slPx = r.inputs.stockL * scY;

  const wallColors: Record<WallSide, string> = { front: C.bl, back: C.pu, left: C.tl, right: C.am };

  const fovRects = r.cameras.map((c, i) => {
    const cx = rx + c.x * scX, cy = ry + c.y * scY;
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
    if (c.wall === "front")  { x1 = cx - fwPx/2; y1 = cy;          x2 = cx + fwPx/2; y2 = cy + flPx; }
    if (c.wall === "back")   { x1 = cx - fwPx/2; y1 = cy - flPx;   x2 = cx + fwPx/2; y2 = cy; }
    if (c.wall === "left")   { x1 = cx;           y1 = cy - fwPx/2; x2 = cx + flPx;   y2 = cy + fwPx/2; }
    if (c.wall === "right")  { x1 = cx - flPx;    y1 = cy - fwPx/2; x2 = cx;          y2 = cy + fwPx/2; }
    x1 = Math.max(rx, x1); y1 = Math.max(ry, y1);
    x2 = Math.min(rx + RW, x2); y2 = Math.min(ry + RH, y2);
    const col = wallColors[c.wall];
    return x2 > x1 && y2 > y1
      ? <rect key={i} x={x1.toFixed(1)} y={y1.toFixed(1)} width={(x2-x1).toFixed(1)} height={(y2-y1).toFixed(1)} fill={col} fillOpacity={.08} rx={2}/>
      : null;
  });

  const camEls = r.cameras.map((c, i) => {
    const cx = rx + c.x * scX, cy = ry + c.y * scY;
    const col = wallColors[c.wall];
    const dx = c.wall==="left"?1:c.wall==="right"?-1:0;
    const dy = c.wall==="front"?1:c.wall==="back"?-1:0;
    const ll = Math.min(flPx, 50);
    const lx = cx + (c.wall==="left"?-16:c.wall==="right"?16:0);
    const ly = cy + (c.wall==="front"?-14:c.wall==="back"?14:0);
    return (
      <g key={i}>
        <line x1={cx.toFixed(1)} y1={cy.toFixed(1)} x2={(cx+dx*ll).toFixed(1)} y2={(cy+dy*ll).toFixed(1)} stroke={col} strokeWidth={.7} strokeDasharray="4 3" opacity={.5}/>
        <circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={7} fill={C.bl2} stroke={col} strokeWidth={1}/>
        <circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={2.5} fill="#dde1f0"/>
        <text x={lx.toFixed(1)} y={(ly+4).toFixed(1)} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={col}>C{c.id}</text>
      </g>
    );
  });

  const bcBZ = qualColor(r.BZ);

  // spacing annotation (front wall cameras)
  const fc = r.cameras.filter(c => c.wall === "front");
  const dimEl = fc.length >= 2 ? (
    <>
      <line x1={rx + fc[0].x*scX} y1={ry-20} x2={rx + fc[1].x*scX} y2={ry-20} stroke={C.bl} strokeWidth={1}/>
      <text x={((rx+fc[0].x*scX + rx+fc[1].x*scX)/2).toFixed(1)} y={ry-26} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={C.bl}>s={r.spacW}m</text>
    </>
  ) : null;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%" }}>
      <rect x={rx} y={ry} width={RW} height={RH} rx={4} fill={C.bg3} stroke={C.bd} strokeWidth={1.5}/>
      {fovRects}
      <rect x={(spx+swPx*0.15).toFixed(1)} y={spy.toFixed(1)} width={(swPx*0.7).toFixed(1)} height={slPx.toFixed(1)} fill={C.gn} fillOpacity={.08} rx={2}/>
      <rect x={spx.toFixed(1)} y={spy.toFixed(1)} width={swPx.toFixed(1)} height={slPx.toFixed(1)} fill={C.am} fillOpacity={.7} stroke="#d97706" strokeWidth={1.5} rx={4}/>
      <text x={(spx+swPx/2).toFixed(1)} y={(spy+slPx/2-5).toFixed(1)} textAnchor="middle" fontSize={11} fontFamily="monospace" fill={C.bg} fontWeight={700} dominantBaseline="central">stockpile</text>
      <text x={(spx+swPx/2).toFixed(1)} y={(spy+slPx/2+9).toFixed(1)} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={C.bg}>{r.inputs.stockL}×{r.inputs.stockW}m</text>
      {camEls}
      {dimEl}
      <line x1={rx} y1={ry+RH+18} x2={rx+RW} y2={ry+RH+18} stroke={C.tx3} strokeWidth={1}/>
      <text x={(rx+RW/2).toFixed(1)} y={ry+RH+32} textAnchor="middle" fontSize={10} fontFamily="monospace" fill={C.tx3}>W = {r.inputs.roomW} m</text>
      <line x1={rx+RW+18} y1={ry} x2={rx+RW+18} y2={ry+RH} stroke={C.tx3} strokeWidth={1}/>
      <text x={rx+RW+28} y={(ry+RH/2).toFixed(1)} fontSize={10} fontFamily="monospace" fill={C.tx3} dominantBaseline="central">L={r.inputs.roomL}m</text>
      <rect x={rx} y={ry-30} width={200} height={18} rx={3} fill={`${bcBZ}18`} stroke={bcBZ} strokeWidth={.5}/>
      <text x={rx+100} y={ry-17} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={bcBZ}>B/Z={r.BZ} · σZ=±{r.sigZ_mm}mm · GSD={r.GSD}mm/px</text>
      <rect x={rx+RW-170} y={ry-30} width={170} height={18} rx={3} fill={`${C.bl}18`} stroke={C.bl} strokeWidth={.5}/>
      <text x={rx+RW-85} y={ry-17} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={C.bl}>{r.totCams} kamera · {r.totPhotos} foto total</text>
      {/* Legend */}
      <circle cx={rx} cy={ry+RH+52} r={5} fill={C.bl2}/>
      <text x={rx+13} y={ry+RH+56} fontSize={9} fontFamily="monospace" fill={C.tx3}>Kamera</text>
      <rect x={rx+80} y={ry+RH+47} width={9} height={9} fill={C.bl} fillOpacity={.2} rx={2}/>
      <text x={rx+94} y={ry+RH+56} fontSize={9} fontFamily="monospace" fill={C.tx3}>FOV sweep</text>
      <rect x={rx+180} y={ry+RH+47} width={9} height={9} fill={C.gn} fillOpacity={.25} rx={2}/>
      <text x={rx+194} y={ry+RH+56} fontSize={9} fontFamily="monospace" fill={C.tx3}>Overlap zone</text>
      <rect x={rx+300} y={ry+RH+47} width={9} height={9} fill={C.am} fillOpacity={.7} rx={2}/>
      <text x={rx+314} y={ry+RH+56} fontSize={9} fontFamily="monospace" fill={C.tx3}>Stockpile</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG SWEEP VIEW
// ─────────────────────────────────────────────────────────────────────────────
function SweepView({ r }: { r: R }) {
  const CX = 172, CY = 192, RAD = 150;
  const { panUsed, inputs: { fovH } } = r;
  const st = 90 - panUsed / 2, en = 90 + panUsed / 2;

  const frames = Array.from({ length: r.nFrames }, (_, i) =>
    r.nFrames > 1 ? st + i * r.actStep : 90
  );

  const sects = frames.map((mid, i) => {
    const s = mid - fovH / 2, e = mid + fovH / 2;
    const sx = CX + RAD * Math.cos(s*D2R), sy = CY + RAD * Math.sin(s*D2R);
    const ex = CX + RAD * Math.cos(e*D2R), ey = CY + RAD * Math.sin(e*D2R);
    const col = i % 2 === 0 ? C.bl : C.tl;
    return <path key={i} d={`M${CX},${CY} L${sx.toFixed(1)},${sy.toFixed(1)} A${RAD},${RAD} 0 0 1 ${ex.toFixed(1)},${ey.toFixed(1)} Z`} fill={col} fillOpacity={.12} stroke={col} strokeWidth={.5} strokeOpacity={.5}/>;
  });

  const olzones = frames.slice(0, -1).map((mid, i) => {
    const next = frames[i + 1];
    const olS = mid + r.actStep / 2, olE = next - r.actStep / 2;
    if (olE <= olS) return null;
    const r2 = RAD * 0.63;
    const osx = CX + r2 * Math.cos(olS*D2R), osy = CY + r2 * Math.sin(olS*D2R);
    const oex = CX + r2 * Math.cos(olE*D2R), oey = CY + r2 * Math.sin(olE*D2R);
    return <path key={i} d={`M${CX},${CY} L${osx.toFixed(1)},${osy.toFixed(1)} A${r2},${r2} 0 0 1 ${oex.toFixed(1)},${oey.toFixed(1)} Z`} fill={C.gn} fillOpacity={.28}/>;
  });

  const labels = frames.map((mid, i) => {
    const lx = CX + (RAD + 18) * Math.cos(mid*D2R);
    const ly = CY + (RAD + 18) * Math.sin(mid*D2R);
    return <text key={i} x={lx.toFixed(1)} y={(ly+4).toFixed(1)} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={C.tx3}>F{i+1}</text>;
  });

  const IX = CX + RAD + 36, IW = 240;
  const bc = qualColor(r.BZ);
  const oc = olColor(r.actOlPhoto, r.inputs.olPhoto);

  const IRow = ({ y, label, val, vc }: { y: number; label: string; val: string | number; vc?: string }) => (
    <>
      <text x={IX+11} y={y} fontSize={10} fontFamily="monospace" fill={C.tx2}>{label}</text>
      <text x={IX+IW-11} y={y} textAnchor="end" fontSize={10} fontFamily="monospace" fill={vc || C.tx} fontWeight={600}>{val}</text>
    </>
  );

  return (
    <svg viewBox="0 0 720 390" style={{ width: "100%" }}>
      <rect x={CX-RAD-18} y={26} width={RAD*2+36} height={RAD*2+36} rx={7} fill={C.bg3} stroke={C.bd} strokeWidth={.5}/>
      <rect x={CX-RAD-14} y={CY-4} width={RAD*2+28} height={8} rx={3} fill={C.bd}/>
      <text x={CX} y={CY+16} textAnchor="middle" fontSize={10} fontFamily="monospace" fill={C.tx3}>Dinding / tiang kamera</text>
      <circle cx={CX} cy={CY} r={RAD} fill="none" stroke={C.bg2} strokeWidth={.5} strokeDasharray="3 4"/>
      {sects}{olzones}
      <line x1={CX} y1={CY} x2={(CX+(RAD+4)*Math.cos(st*D2R)).toFixed(1)} y2={(CY+(RAD+4)*Math.sin(st*D2R)).toFixed(1)} stroke={C.bd} strokeWidth={1} strokeDasharray="4 3"/>
      <line x1={CX} y1={CY} x2={(CX+(RAD+4)*Math.cos(en*D2R)).toFixed(1)} y2={(CY+(RAD+4)*Math.sin(en*D2R)).toFixed(1)} stroke={C.bd} strokeWidth={1} strokeDasharray="4 3"/>
      {labels}
      <circle cx={CX} cy={CY} r={9} fill={C.bl2} stroke={C.bl} strokeWidth={1}/>
      <circle cx={CX} cy={CY} r={3.5} fill="#dde1f0"/>
      <text x={CX} y={CY+RAD+30} textAnchor="middle" fontSize={10} fontFamily="monospace" fill={C.tx3}>Area belakang dinding tidak direkam — pan efektif max 180°</text>
      <rect x={IX} y={28} width={IW} height={262} rx={7} fill={C.bg3} stroke={C.bd} strokeWidth={.5}/>
      <text x={IX+IW/2} y={50} textAnchor="middle" fontSize={12} fontFamily="monospace" fill={C.tx} fontWeight={700}>Sweep PTZ — 1 Kamera</text>
      <IRow y={70}  label="Pan efektif"       val={`${r.panUsed}°`}/>
      <IRow y={87}  label="Step pan maks"     val={`${r.maxStep}°`}/>
      <IRow y={104} label="Step aktual"       val={`${r.actStep}°`}/>
      <IRow y={121} label="Jumlah frame"      val={`${r.nFrames} foto`}    vc={oc}/>
      <IRow y={138} label="OL foto aktual"    val={`${r.actOlPhoto}%`}     vc={oc}/>
      <line x1={IX+12} y1={150} x2={IX+IW-12} y2={150} stroke={C.bd} strokeWidth={.5}/>
      <IRow y={167} label="⚠ 360° (SALAH!)"  val={`${r.wrong360} foto`}   vc={C.rd}/>
      <IRow y={184} label={`✓ ${r.panUsed}° (BENAR)`} val={`${r.nFrames} foto`} vc={C.gn}/>
      <IRow y={201} label="Hemat"             val={`${r.wrong360 - r.nFrames} foto`} vc={C.gn}/>
      <line x1={IX+12} y1={212} x2={IX+IW-12} y2={212} stroke={C.bd} strokeWidth={.5}/>
      <IRow y={229} label="B/Z ratio"         val={r.BZ}                  vc={bc}/>
      <IRow y={246} label="σZ akurasi"        val={`${r.sigZ_mm} mm`}     vc={bc}/>
      <IRow y={263} label="GSD"               val={`${r.GSD} mm/px`}      vc={C.gn}/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG SIDE VIEW
// ─────────────────────────────────────────────────────────────────────────────
function SideView({ r }: { r: R }) {
  const VW = 700, PL = 52, PT = 38, CH = 256;
  const { roomH, tilt, fovV, stockH } = r.inputs;
  const Z = r.Z, scY = CH / (Z * 1.15);
  const camX = PL + 30, camY = PT + 16, floorY = PT + Z * scY;
  const tR = tilt * D2R, fvR = fovV * D2R;
  const nearX = camX + (Z - stockH * 0.5) * Math.tan(tR - fvR / 3.5) * scY;
  const farX  = camX + Z * Math.tan(tR + fvR / 3.5) * scY;
  const peakX = camX + (Z - stockH) * Math.tan(tR) * scY;
  const peakY = floorY - stockH * scY;
  const IX = PL + VW - PL - 198 - 14, IW = 198;
  const bc = qualColor(r.BZ);

  const IRow = ({ y, label, val, vc }: { y: number; label: string; val: string | number; vc?: string }) => (
    <>
      <text x={IX+11} y={y} fontSize={10} fontFamily="monospace" fill={C.tx2}>{label}</text>
      <text x={IX+IW-11} y={y} textAnchor="end" fontSize={10} fontFamily="monospace" fill={vc || C.tx} fontWeight={600}>{val}</text>
    </>
  );

  return (
    <svg viewBox={`0 0 ${VW} ${CH+PT+50}`} style={{ width: "100%" }}>
      <line x1={PL} y1={floorY} x2={VW-20} y2={floorY} stroke={C.bd} strokeWidth={2}/>
      <text x={PL+4} y={floorY+13} fontSize={9} fontFamily="monospace" fill={C.tx3}>Lantai Z=0 — GCP Total Station wajib</text>
      <polygon points={`${camX},${floorY} ${nearX.toFixed(1)},${peakY.toFixed(1)} ${farX.toFixed(1)},${floorY}`} fill={C.bl} fillOpacity={.08}/>
      <line x1={camX} y1={camY+10} x2={nearX.toFixed(1)} y2={peakY.toFixed(1)} stroke={C.bl} strokeWidth={1.2} strokeDasharray="5 3"/>
      <line x1={camX} y1={camY+10} x2={farX.toFixed(1)} y2={floorY} stroke={C.bl} strokeWidth={1.2} strokeDasharray="5 3"/>
      <rect x={camX-14} y={camY} width={28} height={18} rx={4} fill={C.bl2} stroke={C.bl} strokeWidth={1}/>
      <circle cx={camX-9} cy={camY+9} r={4} fill={C.bl}/>
      <text x={camX} y={camY-8} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={C.bl}>CAM H={roomH}m α={tilt}°</text>
      <ellipse cx={((nearX+farX)/2).toFixed(1)} cy={floorY} rx={((farX-nearX)*0.44).toFixed(1)} ry={9} fill={C.am} fillOpacity={.55} stroke="#d97706" strokeWidth={1}/>
      <polygon points={`${(nearX+12).toFixed(1)},${floorY} ${peakX.toFixed(1)},${peakY.toFixed(1)} ${(farX-12).toFixed(1)},${floorY}`} fill="#d97706" fillOpacity={.45}/>
      <text x={peakX.toFixed(1)} y={(peakY-8).toFixed(1)} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={C.am}>Hs={stockH}m</text>
      <line x1={camX+16} y1={camY+8} x2={camX+16} y2={floorY-2} stroke={C.gn} strokeWidth={1.2} strokeDasharray="3 2"/>
      <text x={camX+24} y={((camY+8+floorY)/2).toFixed(1)} fontSize={9} fontFamily="monospace" fill={C.gn} dominantBaseline="central">Z={r.Z}m</text>
      <rect x={IX} y={PT} width={IW} height={158} rx={7} fill={C.bg3} stroke={C.bd} strokeWidth={.5}/>
      <text x={IX+IW/2} y={PT+20} textAnchor="middle" fontSize={12} fontFamily="monospace" fill={C.tx} fontWeight={700}>Parameter Vertikal</text>
      <IRow y={PT+38} label="H kamera"    val={`${roomH} m`}/>
      <IRow y={PT+54} label="Tilt α"      val={`${tilt}°`}/>
      <IRow y={PT+70} label="d=H/tan(α)"  val={`${r.Z} m`} vc={C.bl}/>
      <IRow y={PT+86} label="FOV vertikal" val={`${fovV}°`}/>
      <IRow y={PT+102} label="GSD"        val={`${r.GSD} mm/px`} vc={C.gn}/>
      <IRow y={PT+118} label="σZ"         val={`${r.sigZ_mm} mm`} vc={bc}/>
      <IRow y={PT+134} label="B/Z"        val={r.BZ} vc={bc}/>
      <IRow y={PT+150} label="OL foto"    val={`${r.actOlPhoto}%`} vc={olColor(r.actOlPhoto, r.inputs.olPhoto)}/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function CctvPlanner() {
  const SENSORS = [
    { label: '1/4" 4.8×3.6mm 4MP (entry)',     sW: 4.8,  sH: 3.6, mp: 4,  fl: 4 },
    { label: '1/3" 6.4×4.8mm 4MP (standard)',  sW: 6.4,  sH: 4.8, mp: 4,  fl: 6 },
    { label: '1/2.8" 7.2×5.4mm 8MP (mid)',     sW: 7.2,  sH: 5.4, mp: 8,  fl: 6 },
    { label: '1/2" 9.6×7.2mm 8MP (premium)',   sW: 9.6,  sH: 7.2, mp: 8,  fl: 8 },
    { label: '1/1.8" 12.8×9.6mm 12MP (high)',  sW: 12.8, sH: 9.6, mp: 12, fl: 10 },
  ];

  const [si, setSi]           = useState(2);
  const [roomL, setRoomL]     = useState(20);
  const [roomW, setRoomW]     = useState(15);
  const [roomH, setRoomH]     = useState(4);
  const [stockL, setStockL]   = useState(8);
  const [stockW, setStockW]   = useState(6);
  const [stockH, setStockH]   = useState(2);
  const [fovH, setFovH]       = useState(90);
  const [fovV, setFovV]       = useState(60);
  const [focalLen, setFocalLen] = useState(6);
  const [tilt, setTilt]       = useState(40);
  const [panEff, setPanEff]   = useState(150);
  const [olPhoto, setOlPhoto] = useState(80);
  const [olCam, setOlCam]     = useState(60);
  const [baseB, setBaseB]     = useState(6);
  const [activeTab, setActiveTab] = useState("top");
  const [manualMode, setManualMode] = useState(false);
  const [manualCams, setManualCams] = useState(12);

  // Auto-clamp stock when room shrinks below it
  const handleRoomL = (v: number) => {
    setRoomL(v);
    if (stockL >= v) setStockL(parseFloat(Math.max(2, v - 1).toFixed(1)));
  };
  const handleRoomW = (v: number) => {
    setRoomW(v);
    if (stockW >= v) setStockW(parseFloat(Math.max(2, v - 1).toFixed(1)));
  };

  const sens = SENSORS[si];
  const r = compute({
    roomL, roomW, roomH, stockL, stockW, stockH,
    fovH, fovV, tilt,
    sensorW: sens.sW, sensorH: sens.sH, focalLen, megapix: sens.mp,
    panEff, olPhoto, olCam, baseB,
    manualTotCams: manualMode ? manualCams : undefined,
  });

  // Dimension validation
  const errStockL = stockL >= roomL;
  const errStockW = stockW >= roomW;
  const dimError  = errStockL || errStockW;
  // Clearance warning: if clearance < 1 m the camera FOV barely reaches stockpile edge
  const warnClearL = !errStockL && r.clearL < 1;
  const warnClearW = !errStockW && r.clearW < 1;
  const clearWarn  = warnClearL || warnClearW;

  const isOk    = !dimError && r.actOlPhoto >= olPhoto && r.BZ >= 0.10 && r.minOlCam >= olCam;
  const isIdeal = !dimError && r.BZ >= 0.20 && isOk;

  const bannerStyle: React.CSSProperties = {
    borderRadius: 6, padding: "8px 12px", fontSize: 11, border: "1px solid",
    fontFamily: "monospace", letterSpacing: ".01em", marginBottom: 12,
    ...(dimError
      ? { background: `${C.rd}0f`, borderColor: `${C.rd}44`, color: C.rd }
      : isIdeal
        ? { background: `${C.gn}0f`, borderColor: `${C.gn}44`, color: C.gn }
        : isOk
          ? { background: `${C.am}0f`, borderColor: `${C.am}44`, color: C.am }
          : { background: `${C.rd}0f`, borderColor: `${C.rd}44`, color: C.rd }),
  };

  const tabStyle = (t: string): React.CSSProperties => ({
    background: activeTab === t ? C.bl2 : C.bg3,
    border: `1px solid ${activeTab === t ? C.bl2 : C.bd}`,
    borderRadius: 5, padding: "3px 10px", fontSize: 10,
    cursor: "pointer", color: activeTab === t ? "#fff" : C.tx2,
    fontFamily: "monospace", transition: "all .15s",
  });

  const wallBadge: Record<WallSide, string> = { front: C.bl, back: C.pu, left: C.tl, right: C.am };

  return (
    <div style={{ background: C.bg, color: C.tx, fontFamily: "'Segoe UI', system-ui, sans-serif", minHeight: "100vh", fontSize: 13, margin: "-2rem" }}>

      {/* ── Header ── */}
      <div style={{ background: C.bg2, borderBottom: `1px solid ${C.bd}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 28, height: 28, background: `linear-gradient(135deg,${C.bl} 0%,${C.tl} 100%)`, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📐</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: ".02em" }}>CCTV Stockpile Planner</div>
          <div style={{ fontSize: 10, color: C.tx2, marginTop: 1, fontFamily: "monospace" }}>photogrammetry placement · 80% overlap · B/Z stereo · 180° pan (wall-mounted)</div>
        </div>
        <div style={{ marginLeft: "auto", background: C.bl2, color: "#fff", fontSize: 9, padding: "3px 9px", borderRadius: 20, fontWeight: 700, fontFamily: "monospace" }}>v1.0</div>
      </div>

      {/* ── Body ── */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", minHeight: "calc(100vh - 52px)" }}>

        {/* ── Sidebar ── */}
        <div style={{ background: C.bg2, borderRight: `1px solid ${C.bd}`, padding: "14px 12px", overflowY: "auto" }}>

          <Section title="Dimensi Ruangan">
            <Field label="Panjang L" min={6} max={60} value={roomL} step={0.5} unit=" m" onChange={handleRoomL}/>
            <Field label="Lebar W" min={6} max={40} value={roomW} step={0.5} unit=" m" onChange={handleRoomW}/>
            <Field label="Tinggi kamera H" min={2} max={10} value={roomH} step={0.1} unit=" m" onChange={setRoomH}/>
          </Section>

          <Section title="Dimensi Stockpile">
            <Field label="Panjang Ls" min={2} max={Math.max(2, roomL - 0.5)} value={stockL} step={0.5} unit=" m" onChange={setStockL}/>
            <Field label="Lebar Ws" min={2} max={Math.max(2, roomW - 0.5)} value={stockW} step={0.5} unit=" m" onChange={setStockW}/>
            <Field label="Tinggi Hs" min={0.5} max={6} value={stockH} step={0.1} unit=" m" onChange={setStockH}/>
            {(errStockL || errStockW) && (
              <div style={{ fontSize: 10, color: C.rd, fontFamily: "monospace", background: `${C.rd}0f`, border: `1px solid ${C.rd}44`, borderRadius: 5, padding: "5px 8px", marginTop: 4 }}>
                ✗ {errStockL ? `Ls (${stockL}m) ≥ L ruangan (${roomL}m)` : ""}
                {errStockL && errStockW ? " · " : ""}
                {errStockW ? `Ws (${stockW}m) ≥ W ruangan (${roomW}m)` : ""}
              </div>
            )}
            {clearWarn && (
              <div style={{ fontSize: 10, color: C.am, fontFamily: "monospace", background: `${C.am}0f`, border: `1px solid ${C.am}44`, borderRadius: 5, padding: "5px 8px", marginTop: 4 }}>
                ⚠ Clearance sempit:{warnClearL ? ` depan/belakang ${r.clearL}m` : ""}{warnClearL && warnClearW ? " ·" : ""}{warnClearW ? ` kiri/kanan ${r.clearW}m` : ""} — tambah ruangan agar kamera bisa cover stockpile
              </div>
            )}
          </Section>

          <Section title="Spesifikasi CCTV PTZ">
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: C.tx2, marginBottom: 3 }}>Sensor preset</div>
              <select value={si} onChange={e => { setSi(+e.target.value); setFocalLen(SENSORS[+e.target.value].fl); }}
                style={{ width: "100%", background: C.bg3, border: `1px solid ${C.bd2}`, borderRadius: 6, color: C.tx, padding: "5px 8px", fontSize: 11 }}>
                {SENSORS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
              </select>
            </div>
            <Field label="FOV horizontal θH" min={30} max={120} value={fovH} step={1} unit="°" onChange={setFovH}/>
            <Field label="FOV vertikal θV" min={20} max={90} value={fovV} step={1} unit="°" onChange={setFovV}/>
            <Field label="Focal length f" min={2} max={25} value={focalLen} step={0.5} unit=" mm" onChange={setFocalLen}/>
            <Field label="Sudut tilt α (ke bawah)" min={15} max={65} value={tilt} step={1} unit="°" onChange={setTilt}/>
          </Section>

          <Section title="Parameter Sistem">
            <div style={{ fontSize: 10, color: C.rd, marginBottom: 4, fontFamily: "monospace" }}>⚠ Pan maks 180° — kamera di dinding</div>
            <Field label="Pan efektif per kamera" min={60} max={180} value={panEff} step={10} unit="°" onChange={setPanEff}/>
            <Field label="Target overlap foto" min={70} max={90} value={olPhoto} step={5} unit="%" onChange={setOlPhoto}/>
            <Field label="Target overlap kamera" min={30} max={70} value={olCam} step={5} unit="%" onChange={setOlCam}/>
            <Field label="Baseline B antar kamera" min={1} max={20} value={baseB} step={0.5} unit=" m" onChange={setBaseB}/>
          </Section>

          <Section title="Jumlah Kamera">
            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {[["Auto","auto"],["Manual","manual"]].map(([label, val]) => {
                const active = manualMode ? val === "manual" : val === "auto";
                return (
                  <button key={val} onClick={() => setManualMode(val === "manual")}
                    style={{ flex: 1, background: active ? C.bl : C.bg3, color: active ? "#fff" : C.tx2,
                      border: `1px solid ${active ? C.bl : C.bd2}`, borderRadius: 5,
                      padding: "5px 0", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {manualMode ? (
              <>
                <Field label="Total kamera" min={8} max={60} value={manualCams} step={2} unit=" kamera" onChange={setManualCams}/>
                <div style={{ fontSize: 10, color: C.tx3, fontFamily: "monospace", marginTop: 6, lineHeight: 1.6 }}>
                  Distribusi optimal:<br/>
                  <span style={{ color: C.bl, fontWeight: 700 }}>{r.nCamL}</span> kamera/sisi L (panjang) ×2<br/>
                  <span style={{ color: C.tl, fontWeight: 700 }}>{r.nCamW}</span> kamera/sisi W (lebar) ×2<br/>
                  <span style={{ color: C.tx2 }}>= {r.totCams} unit total</span>
                </div>
                <div style={{ fontSize: 9, color: "#3d4260", fontFamily: "monospace", marginTop: 5, background: C.bg3, border: `1px solid ${C.bd}`, borderRadius: 4, padding: "4px 7px" }}>
                  Semua kamera di dinding — tidak ada kamera di atas stockpile.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 10, color: C.tx3, fontFamily: "monospace", lineHeight: 1.6 }}>
                Dihitung dari target OL kamera:<br/>
                <span style={{ color: C.bl, fontWeight: 700 }}>{r.nCamL}</span>/sisi L ·{" "}
                <span style={{ color: C.tl, fontWeight: 700 }}>{r.nCamW}</span>/sisi W ·{" "}
                <span style={{ color: C.tx2, fontWeight: 700 }}>total {r.totCams} kamera</span>
              </div>
            )}
          </Section>
        </div>

        {/* ── Main Content ── */}
        <div style={{ padding: 14, overflowY: "auto", background: C.bg }}>

          {/* Status banner */}
          <div style={bannerStyle}>
            {dimError
              ? `✗ DIMENSI TIDAK VALID — stockpile tidak boleh ≥ dimensi ruangan. Kurangi Ls/Ws atau perbesar ruangan.`
              : isIdeal
                ? `✓ OPTIMAL — ${r.totCams} kamera | OL foto ${r.actOlPhoto}% | B/Z ${r.BZ} (ideal) | σZ ±${r.sigZ_mm}mm | GSD ${r.GSD}mm/px`
                : isOk
                  ? `⚠ CUKUP — ${r.totCams} kamera | B/Z ${r.BZ} | perlebar baseline untuk B/Z ideal`
                  : `✗ PERLU PERBAIKAN — OL foto ${r.actOlPhoto}% | B/Z ${r.BZ} | OL kamera ${r.minOlCam}%`}
          </div>

          {/* Clearance advisory (only when valid + tight) */}
          {clearWarn && (
            <div style={{ borderRadius: 6, padding: "7px 12px", fontSize: 10, border: `1px solid ${C.am}44`, fontFamily: "monospace", color: C.am, background: `${C.am}0a`, marginBottom: 12 }}>
              ⚠ CLEARANCE SEMPIT — {warnClearL ? `depan/belakang hanya ${r.clearL} m` : ""}{warnClearL && warnClearW ? " · " : ""}{warnClearW ? `kiri/kanan hanya ${r.clearW} m` : ""}. Kamera di dinding mungkin kesulitan meliput seluruh tepi stockpile. Disarankan clearance ≥ 1 m.
            </div>
          )}

          {/* All calculation output — hidden when dimensions are invalid */}
          {dimError ? (
            <div style={{ background: C.bg2, border: `1px solid ${C.rd}44`, borderRadius: 10, padding: 32, textAlign: "center", color: C.tx3, fontFamily: "monospace" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>⛔</div>
              <div style={{ fontSize: 13, color: C.rd, fontWeight: 700, marginBottom: 6 }}>Dimensi Tidak Valid</div>
              <div style={{ fontSize: 11 }}>Panjang/lebar stockpile harus lebih kecil dari dimensi ruangan.</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Perbesar ruangan atau kurangi ukuran stockpile di sidebar.</div>
            </div>
          ) : (<>
          {/* KPI grid row 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, marginBottom: 7 }}>
            <KCard label="Total Kamera" icon="📷" value={r.totCams} unit="unit" color={C.bl} sub={`${r.nCamL}L × ${r.nCamW}W perimeter`}/>
            <KCard label="Frame/Kamera" icon="🎞" value={r.nFrames} unit="foto" color={olColor(r.actOlPhoto, olPhoto)} sub={`step ${r.actStep}° pan ${r.panUsed}°`}/>
            <KCard label="Total Foto" icon="📁" value={r.totPhotos} unit="foto total" color={C.bl} sub={`${r.totCams} × ${r.nFrames}`}/>
            <KCard label="OL Foto Aktual" icon="🔁" value={`${r.actOlPhoto}%`} unit="aktual" color={olColor(r.actOlPhoto, olPhoto)} sub={`target ${olPhoto}%`}/>
          </div>
          {/* KPI grid row 2 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, marginBottom: 12 }}>
            <KCard label="B/Z Ratio" icon="📐" value={r.BZ} unit="" color={qualColor(r.BZ)} sub={r.BZ >= 0.20 ? "ideal ✓" : r.BZ >= 0.10 ? "cukup ⚠" : "lemah ✗"}/>
            <KCard label="GSD" icon="🔍" value={r.GSD} unit="mm/px" color={r.GSD <= 5 ? C.gn : r.GSD <= 15 ? C.am : C.rd} sub="drone@50m ≈ 30mm/px"/>
            <KCard label="σZ Akurasi" icon="📏" value={`${r.sigZ_mm} mm`} unit="" color={C.gn} sub={`vol.err est. ${r.volErr}`}/>
            <KCard label="OL Kamera" icon="🔗" value={`${r.minOlCam}%`} unit="min" color={olColor(r.minOlCam, olCam)} sub={`target ${olCam}%`}/>
          </div>

          {/* Diagram */}
          <div style={{ background: C.bg2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 13, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>📍 Diagram Penempatan Kamera</span>
              <div style={{ display: "flex", gap: 4 }}>
                {["top","sweep","side"].map(t => (
                  <div key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>
                    {t === "top" ? "Tampak Atas" : t === "sweep" ? "Sweep PTZ" : "Samping"}
                  </div>
                ))}
              </div>
            </div>
            {activeTab === "top"   && <TopView r={r}/>}
            {activeTab === "sweep" && <SweepView r={r}/>}
            {activeTab === "side"  && <SideView r={r}/>}
          </div>

          {/* Formula steps */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <StepCard title="STEP 1 — FOV Footprint di Lantai" rows={[
              ["d = H / tan(α)", `${r.inputs.roomH} / tan(${tilt}°) = ${r.d} m`],
              ["fw = 2·d·tan(θH/2)", `${r.fw} m  (lebar FOV di lantai)`],
              ["fl = 2·d·tan(θV/2)", `${r.fl} m  (kedalaman FOV)`],
              ["sweepW = 2·d·tan(pan/2)", `${r.sweepW} m  (lebar sapuan kamera)`],
            ]}/>
            <StepCard title="STEP 2 — Pan Step & Frame/Kamera" rows={[
              ["step_maks = θH×(1−OL%)", `${fovH}°×${(1-olPhoto/100).toFixed(2)} = ${r.maxStep}°`],
              ["nFrames = ⌈panEff/step⌉", `⌈${r.panUsed}/${r.maxStep}⌉ = ${r.nFrames} foto`],
              ["step_aktual = pan/(n−1)", `${r.actStep}°  (setelah pembulatan)`],
              ["OL foto aktual", `${r.actOlPhoto}%  (target ${olPhoto}%)`],
              ["⚠ 360° SALAH!", `${r.wrong360} foto — tidak perlu!`, C.rd],
              [`✓ ${r.panUsed}° BENAR`, `${r.nFrames} foto — hemat ${r.wrong360 - r.nFrames} frame`, C.gn],
            ]}/>
            <StepCard title="STEP 3 — Jumlah & Jarak Kamera" rows={r.isManual ? [
              ["Mode", "Manual — jumlah kamera ditentukan pengguna"],
              ["Input total kamera", `${manualCams} unit`],
              ["halfN = total/2", `${manualCams}/2 = ${manualCams/2} (nL+nW)`],
              ["nCamL optimal = (Ls·(N−1)+Ws)/(Ls+Ws)", `${r.nCamL} / sisi panjang`],
              ["nCamW = halfN − nCamL", `${r.nCamW} / sisi lebar`],
              ["Total aktual = 2·nL+2·nW", `2·${r.nCamL}+2·${r.nCamW} = ${r.totCams} kamera`],
              ["Jarak sisi L = Ls/(nL−1)", `${r.spacL} m`],
              ["Jarak sisi W = Ws/(nW−1)", `${r.spacW} m`],
              ["⚠ Semua kamera di dinding!", "tidak ada di atas stockpile", C.bl],
            ] : [
              ["stride = sweepW×(1−OL_cam)", `${r.sweepW}×${(1-olCam/100).toFixed(2)} = ${r.stride} m`],
              ["nCamL = ⌈stockL/stride⌉", `⌈${stockL}/${r.stride}⌉ = ${r.nCamL} / sisi panjang`],
              ["nCamW = ⌈stockW/stride⌉", `⌈${stockW}/${r.stride}⌉ = ${r.nCamW} / sisi lebar`],
              ["Total = 2·nL+2·nW", `2·${r.nCamL}+2·${r.nCamW} = ${r.totCams} kamera`],
              ["Jarak sisi L = stockL/(nL−1)", `${r.spacL} m`],
              ["Jarak sisi W = stockW/(nW−1)", `${r.spacW} m`],
              ["⚠ Semua kamera di dinding!", "tidak ada di atas stockpile", C.bl],
            ]}/>
            <StepCard title="STEP 4 — B/Z Ratio & Akurasi Stereo" rows={[
              ["pixelPitch = sensorW/pxW", `${r.pp} mm`],
              ["GSD = (pp/f)×Z×1000", `${r.GSD} mm/px  (drone@50m≈30mm)`],
              ["B/Z = B/Z", `${r.BZ}  (${r.bzQual})`],
              ["konv.α = 2·atan(B/2Z)", `${r.conv}°  (ideal 15°–35°)`],
              ["σZ = Z²·pp/(f·B)×1000", `${r.sigZ_mm} mm  (akurasi kedalaman)`],
              ["Total foto sistem", `${r.totCams} × ${r.nFrames} = ${r.totPhotos} foto`],
            ]}/>
          </div>

          {/* Camera Table */}
          <div style={{ background: C.bg2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 13 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>📋 Tabel Posisi Kamera</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
              <thead>
                <tr>
                  {["#","X (m)","Y (m)","Dinding","Arah pandang","Frame/sweep","Dist. ke center (m)"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "5px 8px", color: C.tx3, borderBottom: `1px solid ${C.bd}`, fontWeight: 600, fontSize: 9, textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.cameras.map(c => {
                  const cx2 = (r.inputs.roomW - r.inputs.stockW)/2 + r.inputs.stockW/2;
                  const cy2 = (r.inputs.roomL - r.inputs.stockL)/2 + r.inputs.stockL/2;
                  const dist = Math.hypot(cx2 - c.x, cy2 - c.y).toFixed(1);
                  const dir: Record<WallSide, string> = { front: "↑ ke dalam", back: "↓ ke dalam", left: "→ ke kanan", right: "← ke kiri" };
                  return (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.bd}` }}>
                      <td style={{ padding: "4px 8px", color: C.tx }}>{c.id}</td>
                      <td style={{ padding: "4px 8px", color: C.tx }}>{c.x}</td>
                      <td style={{ padding: "4px 8px", color: C.tx }}>{c.y}</td>
                      <td style={{ padding: "4px 8px" }}>
                        <span style={{ background: `${wallBadge[c.wall]}22`, color: wallBadge[c.wall], padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>{c.wall}</span>
                      </td>
                      <td style={{ padding: "4px 8px", color: C.tx2 }}>{dir[c.wall]}</td>
                      <td style={{ padding: "4px 8px", color: C.tx }}>{r.nFrames}</td>
                      <td style={{ padding: "4px 8px", color: C.tx }}>{dist}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>)}

        </div>
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#3d4260", textTransform: "uppercase", letterSpacing: ".1em", fontFamily: "monospace", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid #1e2235" }}>
        {title}
      </div>
      {children}
    </div>
  );
}
