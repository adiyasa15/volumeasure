import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  PageBreak,
  NumberFormat,
  Header,
  Footer,
  PageNumber,
  convertInchesToTwip,
} from "docx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../");
const SCREENSHOTS = path.join(ROOT, "screenshots");
const OUTPUT = path.join(ROOT, "PileMetric-Panduan-Pengguna.docx");

function readImage(filename: string): Buffer | null {
  const p = path.join(SCREENSHOTS, filename);
  if (fs.existsSync(p)) return fs.readFileSync(p);
  return null;
}

// ── Paragraph builders ─────────────────────────────────────────
function heading1(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200 },
    border: {
      bottom: { color: "E85D04", style: BorderStyle.SINGLE, size: 8, space: 4 },
    },
  });
}

function heading2(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
  });
}

function heading3(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 100 },
  });
}

function body(text: string, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text, bold, size: 22, font: "Calibri" })],
    spacing: { before: 80, after: 80 },
  });
}

function bullet(text: string, level = 0) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: "Calibri" })],
    bullet: { level },
    spacing: { before: 60, after: 60 },
  });
}

function numbered(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: "Calibri" })],
    numbering: { reference: "main-numbering", level: 0 },
    spacing: { before: 80, after: 80 },
  });
}

function note(text: string, color = "E85D04") {
  return new Paragraph({
    children: [
      new TextRun({ text: "Catatan: ", bold: true, size: 20, color, font: "Calibri" }),
      new TextRun({ text, size: 20, italics: true, font: "Calibri" }),
    ],
    spacing: { before: 140, after: 140 },
    indent: { left: convertInchesToTwip(0.3) },
    border: {
      left: { color, style: BorderStyle.SINGLE, size: 12, space: 8 },
    },
  });
}

function warning(text: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: "PENTING: ", bold: true, size: 20, color: "CC0000", font: "Calibri" }),
      new TextRun({ text, bold: true, size: 20, font: "Calibri" }),
    ],
    spacing: { before: 160, after: 160 },
    indent: { left: convertInchesToTwip(0.3) },
    border: {
      left: { color: "CC0000", style: BorderStyle.SINGLE, size: 16, space: 8 },
    },
    shading: { type: ShadingType.SOLID, color: "FFF5F5" },
  });
}

function codeBlock(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 18, font: "Courier New", color: "DDDDDD" })],
    spacing: { before: 80, after: 80 },
    indent: { left: convertInchesToTwip(0.4) },
    shading: { type: ShadingType.SOLID, color: "1E2228" },
    border: {
      left: { color: "E85D04", style: BorderStyle.SINGLE, size: 8, space: 8 },
    },
  });
}

function screenshotParagraph(imgBuffer: Buffer, label: string, widthPx = 560) {
  const aspectRatio = 9 / 16;
  const heightPx = Math.round(widthPx * aspectRatio);
  return [
    new Paragraph({
      children: [
        new ImageRun({
          data: imgBuffer,
          transformation: { width: widthPx, height: heightPx },
          type: "jpg",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: label, size: 18, italics: true, color: "666666", font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 220 },
    }),
  ];
}

function spacer(size = 100) {
  return new Paragraph({ text: "", spacing: { before: size, after: size } });
}

function infoTable(rows: [string, string][], headerColor = "F7F7F7") {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: label, bold: true, size: 20, font: "Calibri" })],
            })],
            width: { size: 35, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: headerColor },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: value, size: 20, font: "Calibri" })],
            })],
            width: { size: 65, type: WidthType.PERCENTAGE },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
          }),
        ],
      })
    ),
  });
}

function gcpFormatTable() {
  const headers = ["Kolom", "Contoh Nilai", "Keterangan"];
  const rows2 = [
    ["Baris 1 (proyeksi)", "EPSG:4326", "Sistem koordinat yang digunakan"],
    ["Kolom 1 (X)", "106.8456789", "Longitude titik GCP (desimal)"],
    ["Kolom 2 (Y)", "-6.2146321", "Latitude titik GCP (desimal)"],
    ["Kolom 3 (Z)", "45.320", "Altitude/ketinggian dalam meter"],
    ["Kolom 4 (imX)", "1234", "Koordinat X titik di dalam gambar (piksel)"],
    ["Kolom 5 (imY)", "876", "Koordinat Y titik di dalam gambar (piksel)"],
    ["Kolom 6", "DJI_0001.JPG", "Nama file gambar"],
    ["Kolom 7", "GCP-1", "Label nama titik GCP"],
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h) =>
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: h, bold: true, size: 19, font: "Calibri", color: "FFFFFF" })],
            })],
            shading: { type: ShadingType.SOLID, color: "E85D04" },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          })
        ),
      }),
      ...rows2.map(([col, val, desc]) =>
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: col, size: 19, bold: true, font: "Calibri" })] })],
              shading: { type: ShadingType.SOLID, color: "F5F5F5" },
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: val, size: 19, font: "Courier New" })] })],
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: desc, size: 19, font: "Calibri" })] })],
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
            }),
          ],
        })
      ),
    ],
  });
}

// ── Load images ────────────────────────────────────────────────
const landingImg  = readImage("00-home.jpg");
const signinImg   = readImage("02-signin.jpg");

// ══════════════════════════════════════════════════════════════════
// SECTIONS
// ══════════════════════════════════════════════════════════════════

const coverSection = [
  spacer(600),
  new Paragraph({
    children: [new TextRun({ text: "PILEMETRIC", bold: true, size: 80, color: "E85D04", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Panduan Pengguna", size: 44, color: "333333", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Sistem Pengukuran Volume Tumpukan Material", size: 28, color: "666666", italics: true, font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 600 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Versi 1.1  |  2026", size: 22, color: "999999", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

const introSection = [
  heading1("1. Pendahuluan"),
  body(
    "PileMetric adalah sistem pengukuran volume tumpukan material berbasis fotogrametri. " +
    "Aplikasi ini memungkinkan operator tambang dan quarry untuk mengukur volume material secara akurat " +
    "menggunakan foto dari drone, kamera DSLR, atau smartphone."
  ),
  spacer(),
  heading2("1.1 Alur Kerja Pengukuran"),
  infoTable([
    ["Langkah 1", "Pasang titik GCP di lapangan dan ukur koordinatnya (Longitude, Latitude, Altitude)"],
    ["Langkah 2", "Ambil foto tumpukan material dari berbagai sudut menggunakan drone/DSLR"],
    ["Langkah 3", "Ekstrak koordinat GPS dari foto menggunakan menu EXIF Extractor"],
    ["Langkah 4", "Buat file gcp_list.txt menggunakan alat Penanda GCP di aplikasi"],
    ["Langkah 5", "Unggah foto dan file GCP, proses pengukuran otomatis berjalan"],
    ["Langkah 6", "Lihat hasil volume (m³) dan unduh laporan PDF"],
  ]),
  spacer(),
  warning(
    "Penggunaan Ground Control Points (GCP) adalah WAJIB untuk mendapatkan akurasi pengukuran yang optimal. " +
    "Tanpa GCP, hasil volume dapat memiliki kesalahan hingga 5–10% atau lebih."
  ),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const loginSection = [
  heading1("2. Masuk ke Aplikasi"),
  body("Buka aplikasi melalui browser Anda. Halaman beranda PileMetric akan tampil seperti berikut:"),
  spacer(),
  ...(landingImg ? screenshotParagraph(landingImg, "Gambar 2.1 – Halaman Beranda PileMetric") : [note("Screenshot tidak tersedia.")]),
  numbered("Klik tombol \"Get Started\" atau \"Sign In\" pada halaman beranda."),
  numbered("Pilih metode masuk:"),
  bullet("Google SSO: Klik \"Continue with Google\" untuk masuk menggunakan akun Google.", 1),
  bullet("Admin/Staf: Klik bagian \"Admin / Staff Login\", masukkan Username dan Password.", 1),
  numbered("Setelah berhasil masuk, Anda akan diarahkan ke Dasbor utama."),
  spacer(),
  ...(signinImg ? screenshotParagraph(signinImg, "Gambar 2.2 – Halaman Masuk PileMetric") : [note("Screenshot tidak tersedia.")]),
  note("Akun baru yang mendaftar via Google memerlukan persetujuan administrator sebelum dapat mengakses sistem."),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const gcpPreparationSection = [
  heading1("3. Persiapan Ground Control Points (GCP)"),
  warning(
    "GCP adalah kewajiban mutlak untuk akurasi pengukuran optimal. " +
    "Selalu siapkan GCP sebelum melakukan pengambilan foto di lapangan."
  ),
  spacer(),
  body(
    "Ground Control Point (GCP) adalah titik fisik di lapangan yang ditandai dengan tanda khusus " +
    "(misalnya cat berwarna mencolok, papan, atau patok survei) dan telah diketahui koordinatnya " +
    "secara presisi menggunakan alat survei (GPS RTK, Total Station, atau GNSS)."
  ),
  spacer(),

  heading2("3.1 Pemasangan Titik GCP di Lapangan"),
  numbered("Siapkan minimal 3 titik GCP, disarankan 5–10 titik untuk area besar."),
  numbered("Tempatkan titik GCP di sekitar tumpukan material — bukan di atas tumpukan."),
  numbered("Buat tanda yang mudah terlihat dari udara: cat putih/kuning kontras berukuran 50×50 cm atau lebih."),
  numbered("Sebarkan titik GCP secara merata mengelilingi area pengukuran."),
  numbered("Pastikan setiap titik GCP akan terlihat dalam minimal 2–5 foto drone."),
  spacer(),
  infoTable([
    ["Jumlah minimum GCP", "3 titik (wajib)"],
    ["Jumlah yang disarankan", "5–10 titik untuk akurasi maksimal"],
    ["Penempatan", "Di sekitar (bukan di atas) tumpukan, tersebar merata"],
    ["Ukuran tanda", "Minimal 50×50 cm, warna kontras (putih/kuning/oranye)"],
    ["Alat pengukur", "GPS RTK, Total Station, atau GNSS receiver"],
  ]),
  spacer(),

  heading2("3.2 Mendapatkan Koordinat Longitude, Latitude, dan Altitude"),
  body("Ukur koordinat setiap titik GCP menggunakan salah satu metode berikut:"),
  spacer(),
  heading3("Metode A — GPS RTK (Paling Akurat)"),
  numbered("Pasang receiver GPS RTK di atas tanda GCP yang telah dibuat."),
  numbered("Tunggu hingga status Fixed RTK tercapai (akurasi ≤2 cm)."),
  numbered("Catat nilai Longitude, Latitude, dan Altitude (Ellipsoidal Height) untuk setiap titik."),
  numbered("Ulangi untuk semua titik GCP."),
  spacer(),
  heading3("Metode B — Aplikasi GPS Smartphone (Akurasi Menengah)"),
  numbered("Gunakan aplikasi GPS dengan akurasi tinggi (misal: GPS Logger, SW Maps)."),
  numbered("Berdiri tepat di atas tanda GCP selama 1–3 menit untuk rata-rata koordinat."),
  numbered("Catat Longitude, Latitude, dan Altitude (meter di atas permukaan laut)."),
  spacer(),
  body("Contoh format pencatatan koordinat GCP di lapangan:"),
  spacer(),
  infoTable([
    ["Nama GCP", "GCP-1"],
    ["Longitude", "106.8456789"],
    ["Latitude", "-6.2146321"],
    ["Altitude (m)", "45.320"],
  ], "FFF3E0"),
  spacer(),

  heading2("3.3 Mengekstrak Koordinat GPS dari Foto (EXIF Extractor)"),
  body(
    "Menu EXIF Extractor digunakan untuk membaca koordinat GPS yang tersimpan otomatis di dalam " +
    "file foto drone/DSLR. Hasil ekstraksi ini dapat digunakan sebagai referensi awal koordinat GCP."
  ),
  spacer(),
  heading3("Cara Menggunakan EXIF Extractor:"),
  numbered("Setelah masuk ke aplikasi, klik menu \"Tools\" di navigasi kiri."),
  numbered("Pilih \"EXIF GPS Extractor\"."),
  numbered("Seret dan lepas (drag & drop) foto-foto drone/DSLR ke area unggah, ATAU klik area tersebut untuk memilih file."),
  numbered("Sistem akan membaca data EXIF secara otomatis dan menampilkan tabel berisi:"),
  bullet("Nama file foto", 1),
  bullet("Longitude (derajat desimal)", 1),
  bullet("Latitude (derajat desimal)", 1),
  bullet("Altitude (meter)", 1),
  numbered("Gunakan tombol salin (ikon copy) di setiap baris untuk menyalin koordinat satu foto."),
  numbered("Gunakan tombol \"Copy All\" untuk menyalin seluruh koordinat sekaligus dalam format tabel."),
  spacer(),
  note(
    "Menu EXIF Extractor berguna untuk memverifikasi apakah foto-foto drone Anda sudah memiliki " +
    "data GPS, dan untuk mendapatkan referensi koordinat awal sebelum memasukkan data GCP survei yang lebih presisi."
  ),
  spacer(),

  heading2("3.4 Membuat File gcp_list.txt Menggunakan Alat Penanda GCP"),
  body(
    "File gcp_list.txt adalah file teks yang berisi koordinat GCP beserta posisi titik GCP " +
    "pada setiap foto. File ini wajib dibuat sebelum mengirim pekerjaan pengukuran."
  ),
  spacer(),
  heading3("Format File gcp_list.txt:"),
  body("Baris pertama berisi sistem koordinat, diikuti satu baris per penandaan GCP di foto:"),
  spacer(),
  codeBlock("EPSG:4326"),
  codeBlock("106.8456789 -6.2146321 45.320 1234 876 DJI_0001.JPG GCP-1"),
  codeBlock("106.8456789 -6.2146321 45.320 1187 901 DJI_0002.JPG GCP-1"),
  codeBlock("106.8512345 -6.2198765 44.150 2341 654 DJI_0001.JPG GCP-2"),
  codeBlock("106.8512345 -6.2198765 44.150 2298 672 DJI_0003.JPG GCP-2"),
  spacer(),
  gcpFormatTable(),
  spacer(),
  heading3("Cara Membuat gcp_list.txt di Aplikasi (Langkah demi Langkah):"),
  numbered("Pada halaman New Job, setelah mengunggah foto, klik tombol \"Open GCP Tagger\"."),
  numbered("Jendela Penanda GCP akan terbuka. Ada 2 tahap:"),
  spacer(),
  body("TAHAP 1 — Definisikan Titik GCP:", true),
  bullet("Pilih sistem koordinat dari daftar dropdown (default: EPSG:4326 untuk WGS84 Longitude/Latitude)."),
  bullet("Isi kolom untuk setiap titik GCP: Label, Longitude (X), Latitude (Y), dan Altitude (Z)."),
  bullet("Contoh: Label = GCP-1, X = 106.8456789, Y = -6.2146321, Z = 45.320"),
  bullet("Klik \"Add GCP\" untuk menambah titik GCP lebih banyak (minimal 3 titik wajib)."),
  bullet("Klik \"Next\" untuk melanjutkan ke Tahap 2 setelah semua koordinat terisi."),
  spacer(),
  body("TAHAP 2 — Tandai GCP di Foto:", true),
  bullet("Pilih nama GCP dari daftar di sisi kiri (misal: GCP-1)."),
  bullet("Foto pertama dari daftar foto yang diunggah akan ditampilkan."),
  bullet("Klik tepat pada posisi tanda GCP yang terlihat di foto."),
  bullet("Sistem akan mencatat koordinat piksel (x, y) dari posisi yang diklik."),
  bullet("Pindah ke foto berikutnya menggunakan tombol panah (< >) di bawah foto."),
  bullet("Ulangi penandaan untuk foto yang berisi tanda GCP yang sama."),
  bullet("Setiap GCP wajib ditandai minimal di 2 foto berbeda (disarankan 3–5 foto)."),
  bullet("Indikator status akan berubah: ○ Belum  →  ⚠ 1 foto  →  ✓ Siap (≥2 foto)."),
  bullet("Setelah semua GCP berstatus ✓, klik tombol \"Export gcp_list.txt\"."),
  spacer(),
  warning(
    "Setiap GCP WAJIB ditandai di minimal 2 foto berbeda. Jika ada GCP yang hanya ditandai di 1 foto, " +
    "tombol Export tidak akan aktif dan file tidak dapat dibuat."
  ),
  spacer(),
  infoTable([
    ["Ikon ○ (abu-abu)", "GCP belum ditandai di foto manapun"],
    ["Ikon ⚠ (kuning)", "GCP sudah ditandai di 1 foto — perlu minimal 1 foto lagi"],
    ["Ikon ✓ (hijau)", "GCP sudah ditandai di ≥2 foto — siap untuk ekspor"],
  ]),
  spacer(),
  note(
    "File gcp_list.txt akan dibuat secara otomatis oleh aplikasi setelah Anda menyelesaikan penandaan. " +
    "Anda tidak perlu membuat atau mengedit file ini secara manual."
  ),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const newJobSection = [
  heading1("4. Membuat Pengukuran Baru"),
  body("Setelah GCP siap, ikuti langkah-langkah berikut untuk membuat pekerjaan pengukuran:"),
  spacer(),

  heading2("4.1 Mengisi Informasi Pekerjaan"),
  numbered("Klik menu \"Jobs\" lalu klik tombol \"New Measurement\" atau klik \"+\" di dasbor."),
  numbered("Isi formulir pengukuran:"),
  spacer(),
  infoTable([
    ["Nama Pekerjaan", "Nama deskriptif, contoh: \"Tumpukan Pasir Area A – Mei 2026\""],
    ["Jenis Material", "Pilih: Pasir (Sand), Tanah (Soil), atau Batu Bara (Coal)"],
    ["Sumber Foto", "Pilih: Drone, Smartphone, atau Kamera DSLR"],
    ["Tingkat Presisi", "Low (cepat, kurang akurat) / Medium / High (lambat, paling akurat)"],
    ["Mode Poligon", "Automatic (area terdeteksi otomatis) atau Manual (gambar sendiri)"],
    ["Koordinat GPS", "Opsional — masukkan Latitude/Longitude lokasi tumpukan"],
    ["Catatan", "Opsional — keterangan tambahan"],
  ]),
  spacer(),

  heading2("4.2 Mengunggah Foto"),
  numbered("Klik area unggah foto atau tombol \"Select Images\"."),
  numbered("Pilih semua foto tumpukan material (minimal 20 foto, disarankan 50–150 foto)."),
  numbered("Pastikan foto memenuhi kriteria:"),
  bullet("Diambil melingkari seluruh tumpukan dari berbagai sudut.", 1),
  bullet("Overlap antar foto minimal 70%.", 1),
  bullet("Format JPG/JPEG, resolusi minimal 8 MP.", 1),
  bullet("Mengandung data GPS/EXIF.", 1),
  numbered("Sistem menampilkan pratinjau dan informasi EXIF setiap foto yang diunggah."),
  spacer(),

  heading2("4.3 Mengunggah File GCP (WAJIB)"),
  warning(
    "Langkah ini wajib dilakukan. Jangan kirim pekerjaan tanpa file GCP karena hasil volume tidak akan akurat."
  ),
  numbered("Setelah foto terunggah, klik tombol \"Open GCP Tagger\"."),
  numbered("Selesaikan proses pendefinisian dan penandaan GCP seperti dijelaskan di Bab 3.4."),
  numbered("Klik \"Export gcp_list.txt\" — file akan otomatis terlampir ke pekerjaan ini."),
  numbered("Pastikan muncul konfirmasi bahwa file GCP berhasil ditambahkan."),
  spacer(),

  heading2("4.4 Mengirim Pekerjaan"),
  numbered("Periksa kembali semua informasi: nama, jenis material, foto, dan file GCP."),
  numbered("Klik tombol \"Submit Job\" untuk mengirim pekerjaan ke sistem pemrosesan."),
  numbered("Sistem akan mengunggah semua data dan memulai fotogrametri secara otomatis."),
  numbered("Anda akan diarahkan ke halaman detail pekerjaan untuk memantau progres."),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const monitorSection = [
  heading1("5. Memantau Progres Pengukuran"),
  body(
    "Setelah pekerjaan dikirim, sistem akan memproses data secara otomatis. " +
    "Halaman detail akan memperbarui status setiap 15 detik secara otomatis."
  ),
  spacer(),
  heading2("5.1 Status Pekerjaan"),
  infoTable([
    ["Queued", "Dalam antrian, menunggu giliran diproses"],
    ["Running", "Sedang diproses oleh sistem fotogrametri"],
    ["Completed", "Selesai — hasil volume tersedia"],
    ["Failed", "Gagal — periksa kualitas foto dan file GCP"],
  ]),
  spacer(),
  heading2("5.2 Estimasi Waktu Pemrosesan"),
  infoTable([
    ["Low (Rendah)", "15 – 30 menit"],
    ["Medium (Sedang)", "30 – 90 menit"],
    ["High (Tinggi)", "1 – 4 jam"],
  ]),
  note("Waktu aktual bervariasi tergantung jumlah foto dan kondisi server."),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const resultsSection = [
  heading1("6. Melihat dan Mengunduh Hasil"),
  body("Setelah status pekerjaan menjadi \"Completed\", hasil pengukuran tersedia di halaman detail."),
  spacer(),
  heading2("6.1 Informasi Hasil Pengukuran"),
  infoTable([
    ["Volume (m³)", "Total volume material dalam meter kubik"],
    ["Luas Area (m²)", "Luas permukaan tumpukan dalam meter persegi"],
    ["Lokasi GPS", "Koordinat lokasi ditampilkan pada peta"],
    ["Tanggal Proses", "Waktu pemrosesan selesai"],
    ["Durasi Proses", "Total waktu yang dibutuhkan"],
  ]),
  spacer(),
  heading2("6.2 Mengunduh Laporan PDF"),
  numbered("Buka halaman detail pekerjaan yang sudah selesai."),
  numbered("Klik tombol \"Download Report\" (ikon PDF)."),
  numbered("Laporan PDF diunduh otomatis — berisi: volume, luas area, peta lokasi, dan info pekerjaan."),
  spacer(),
  heading2("6.3 Mengunduh Data Mentah"),
  numbered("Klik tombol \"Download Results\" pada halaman detail pekerjaan."),
  numbered("File ZIP (berisi point cloud, DSM, ortofoto) akan diunduh ke perangkat Anda."),
  note("File hasil mentah dapat berukuran besar (puluhan hingga ratusan MB). Pastikan koneksi internet stabil."),
  spacer(),
  heading2("6.4 Menggambar Ulang Poligon"),
  body("Jika area terdeteksi otomatis kurang tepat, gambar ulang batas area secara manual:"),
  numbered("Klik tombol \"Draw Polygon\" pada halaman detail pekerjaan."),
  numbered("Gambar batas area tumpukan pada peta yang ditampilkan."),
  numbered("Sistem menghitung ulang volume berdasarkan poligon baru."),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const photoTipsSection = [
  heading1("7. Tips Pengambilan Foto"),
  body("Kualitas dan metode pengambilan foto sangat menentukan akurasi volume."),
  spacer(),
  heading2("7.1 Foto Drone"),
  bullet("Terbang dengan ketinggian konsisten di atas tumpukan material."),
  bullet("Buat jalur penerbangan grid (kisi-kisi) menutupi seluruh area."),
  bullet("Overlap antar foto minimal 70% (depan-belakang) dan 60% (kiri-kanan)."),
  bullet("Tambahkan jalur orbit mengelilingi tumpukan dari sudut 45°."),
  bullet("Hindari terbang saat angin kencang atau kondisi cahaya ekstrem."),
  spacer(),
  heading2("7.2 Foto DSLR / Smartphone"),
  bullet("Kelilingi tumpukan secara merata — tidak boleh ada sisi yang kosong."),
  bullet("Ambil foto dari beberapa ketinggian yang berbeda."),
  bullet("Pastikan setiap bagian tumpukan muncul di minimal 3 foto."),
  bullet("Aktifkan GPS pada kamera/smartphone untuk data lokasi otomatis."),
  spacer(),
  heading2("7.3 Yang Harus Dihindari"),
  bullet("Foto dari satu sisi saja — wajib melingkari seluruh tumpukan."),
  bullet("Foto buram, gelap, atau terlalu terang (over/under exposure)."),
  bullet("Foto dengan orang atau kendaraan yang bergerak di area tumpukan."),
  bullet("Pengambilan foto saat hujan atau berkabut."),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const troubleshootSection = [
  heading1("8. Pemecahan Masalah"),
  spacer(),
  infoTable([
    ["Pekerjaan berstatus \"Failed\"",
      "Periksa: (1) jumlah foto minimal 20, (2) kualitas foto baik, (3) file GCP benar dan setiap GCP ditandai di ≥2 foto. Coba kirim ulang."],
    ["Volume tidak akurat",
      "Pastikan file GCP telah dilampirkan dan koordinat GCP diukur menggunakan alat survei presisi (RTK/Total Station)."],
    ["Error pada file GCP",
      "Pastikan sistem koordinat sesuai (EPSG:4326 untuk WGS84). Pastikan setiap GCP ditandai di minimal 2 foto berbeda."],
    ["Proses terlalu lama",
      "Mode High Precision membutuhkan waktu lebih lama. Gunakan Medium untuk keseimbangan kecepatan dan akurasi."],
    ["Tidak bisa masuk",
      "Pastikan akun Google sudah disetujui administrator. Hubungi admin sistem Anda."],
    ["Foto tidak ter-upload",
      "Periksa koneksi internet. Format harus JPG/JPEG. Coba upload beberapa foto dulu untuk uji coba."],
  ]),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const contactSection = [
  heading1("9. Informasi Sistem"),
  spacer(),
  infoTable([
    ["Sistem", "PileMetric v1.1"],
    ["Platform", "Berbasis web — akses melalui browser"],
    ["Teknologi", "Fotogrametri berbasis NodeODM / WebODM"],
    ["GCP Format", "gcp_list.txt (NodeODM compatible)"],
    ["Sistem Koordinat", "WGS84 (EPSG:4326) atau UTM"],
  ]),
  spacer(200),
  new Paragraph({
    children: [new TextRun({ text: "© 2026 PileMetric. Semua hak dilindungi.", size: 18, color: "999999", italics: true, font: "Calibri" })],
    alignment: AlignmentType.CENTER,
  }),
];

// ── Assemble document ──────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      {
        reference: "main-numbering",
        levels: [
          {
            level: 0,
            format: NumberFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
          },
        ],
      },
    ],
  },
  styles: {
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 36, bold: true, color: "1A1A2E", font: "Calibri" },
        paragraph: { spacing: { before: 480, after: 200 } },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 28, bold: true, color: "E85D04", font: "Calibri" },
        paragraph: { spacing: { before: 320, after: 160 } },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 24, bold: true, color: "333333", font: "Calibri" },
        paragraph: { spacing: { before: 240, after: 100 } },
      },
    ],
  },
  sections: [
    {
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [new TextRun({ text: "PileMetric — Panduan Pengguna v1.1", size: 18, color: "999999", font: "Calibri" })],
              alignment: AlignmentType.RIGHT,
              border: { bottom: { color: "DDDDDD", style: BorderStyle.SINGLE, size: 4, space: 4 } },
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "© 2026 PileMetric  |  Halaman ", size: 18, color: "999999", font: "Calibri" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "999999", font: "Calibri" }),
              ],
              alignment: AlignmentType.CENTER,
              border: { top: { color: "DDDDDD", style: BorderStyle.SINGLE, size: 4, space: 4 } },
            }),
          ],
        }),
      },
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.2),
          },
        },
      },
      children: [
        ...coverSection,
        ...introSection,
        ...loginSection,
        ...gcpPreparationSection,
        ...newJobSection,
        ...monitorSection,
        ...resultsSection,
        ...photoTipsSection,
        ...troubleshootSection,
        ...contactSection,
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(OUTPUT, buffer);
console.log(`✓ Dokumen berhasil dibuat: ${OUTPUT}`);
console.log(`  Ukuran file: ${(buffer.length / 1024).toFixed(1)} KB`);
