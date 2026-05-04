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

function img(filename: string): Buffer | null {
  const p = path.join(SCREENSHOTS, filename);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

// ── helpers ────────────────────────────────────────────────────
const h1 = (text: string) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 480, after: 200 },
});

const h2 = (text: string) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 320, after: 160 },
});

const h3 = (text: string) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 240, after: 100 },
});

const p = (text: string, bold = false) => new Paragraph({
  children: [new TextRun({ text, bold, size: 22, font: "Calibri" })],
  spacing: { before: 80, after: 80 },
});

const li = (text: string, level = 0) => new Paragraph({
  children: [new TextRun({ text, size: 22, font: "Calibri" })],
  bullet: { level },
  spacing: { before: 60, after: 60 },
});

const num = (text: string) => new Paragraph({
  children: [new TextRun({ text, size: 22, font: "Calibri" })],
  numbering: { reference: "steps", level: 0 },
  spacing: { before: 80, after: 80 },
});

const note = (text: string) => new Paragraph({
  children: [
    new TextRun({ text: "Catatan: ", bold: true, size: 20, color: "E85D04", font: "Calibri" }),
    new TextRun({ text, size: 20, italics: true, font: "Calibri" }),
  ],
  spacing: { before: 120, after: 120 },
  indent: { left: convertInchesToTwip(0.3) },
  border: { left: { color: "E85D04", style: BorderStyle.SINGLE, size: 12, space: 8 } },
});

const important = (text: string) => new Paragraph({
  children: [
    new TextRun({ text: "PENTING: ", bold: true, size: 22, color: "CC0000", font: "Calibri" }),
    new TextRun({ text, bold: true, size: 22, font: "Calibri" }),
  ],
  spacing: { before: 160, after: 160 },
  indent: { left: convertInchesToTwip(0.3) },
  border: { left: { color: "CC0000", style: BorderStyle.SINGLE, size: 20, space: 8 } },
});

const code = (text: string) => new Paragraph({
  children: [new TextRun({ text, size: 18, font: "Courier New" })],
  spacing: { before: 60, after: 60 },
  indent: { left: convertInchesToTwip(0.5) },
});

const gap = () => new Paragraph({ text: "", spacing: { before: 80, after: 80 } });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

function screenshot(buf: Buffer, caption: string) {
  return [
    new Paragraph({
      children: [new ImageRun({ data: buf, transformation: { width: 540, height: 304 }, type: "jpg" })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 140, after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({ text: caption, size: 18, italics: true, color: "666666", font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
    }),
  ];
}

function twoColTable(rows: [string, string][], headerBg = "F0F0F0") {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([a, b]) => new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: a, bold: true, size: 20, font: "Calibri" })] })],
          width: { size: 38, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: headerBg },
          margins: { top: 80, bottom: 80, left: 120, right: 80 },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: b, size: 20, font: "Calibri" })] })],
          width: { size: 62, type: WidthType.PERCENTAGE },
          margins: { top: 80, bottom: 80, left: 120, right: 80 },
        }),
      ],
    })),
  });
}

function threeColTable(headers: [string, string, string], rows: [string, string, string][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h) => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, color: "FFFFFF", font: "Calibri" })] })],
          shading: { type: ShadingType.SOLID, color: "E85D04" },
          margins: { top: 80, bottom: 80, left: 100, right: 80 },
        })),
      }),
      ...rows.map(([a, b, c]) => new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: a, bold: true, size: 19, font: "Calibri" })] })],
            shading: { type: ShadingType.SOLID, color: "F5F5F5" },
            margins: { top: 60, bottom: 60, left: 100, right: 80 },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: b, size: 19, font: "Courier New" })] })],
            margins: { top: 60, bottom: 60, left: 100, right: 80 },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: c, size: 19, font: "Calibri" })] })],
            margins: { top: 60, bottom: 60, left: 100, right: 80 },
          }),
        ],
      })),
    ],
  });
}

// ── Images ─────────────────────────────────────────────────────
const landingImg = img("00-home.jpg");
const signinImg  = img("02-signin.jpg");

// ══════════════════════════════════════════════════════════════════
// DOCUMENT CONTENT
// ══════════════════════════════════════════════════════════════════
const children = [

  // ── COVER ────────────────────────────────────────────────────
  gap(), gap(), gap(),
  new Paragraph({
    children: [new TextRun({ text: "PILEMETRIC", bold: true, size: 80, color: "E85D04", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: "Panduan Pengguna", size: 44, color: "333333", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Sistem Pengukuran Volume Tumpukan Material", size: 28, italics: true, color: "666666", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 600 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Versi 1.1  |  2026", size: 22, color: "999999", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
  }),
  pageBreak(),

  // ── BAB 1: PENDAHULUAN ───────────────────────────────────────
  h1("1. Pendahuluan"),
  p("PileMetric adalah sistem pengukuran volume tumpukan material berbasis fotogrametri. Aplikasi ini memungkinkan operator tambang dan quarry mengukur volume material secara akurat menggunakan foto dari drone, DSLR, atau smartphone."),
  gap(),
  h2("1.1 Alur Kerja Pengukuran"),
  twoColTable([
    ["Langkah 1", "Pasang titik GCP di lapangan dan ukur koordinatnya (Longitude, Latitude, Altitude)"],
    ["Langkah 2", "Ambil foto tumpukan dari berbagai sudut menggunakan drone/DSLR"],
    ["Langkah 3", "Ekstrak koordinat GPS dari foto menggunakan menu EXIF Extractor"],
    ["Langkah 4", "Buat file gcp_list.txt menggunakan alat Penanda GCP di aplikasi"],
    ["Langkah 5", "Unggah foto + file GCP, sistem memproses fotogrametri otomatis"],
    ["Langkah 6", "Lihat hasil volume (m³) dan unduh laporan PDF"],
  ]),
  gap(),
  important("Penggunaan Ground Control Points (GCP) adalah WAJIB untuk akurasi pengukuran yang optimal. Tanpa GCP, hasil volume dapat memiliki kesalahan hingga 5–10% atau lebih."),
  pageBreak(),

  // ── BAB 2: MASUK KE APLIKASI ─────────────────────────────────
  h1("2. Masuk ke Aplikasi"),
  p("Buka aplikasi melalui browser Anda. Halaman beranda PileMetric akan tampil seperti berikut:"),
  gap(),
  ...(landingImg ? screenshot(landingImg, "Gambar 2.1 – Halaman Beranda PileMetric") : [note("Screenshot halaman beranda tidak tersedia.")]),
  num("Klik tombol \"Get Started\" atau \"Sign In\" pada halaman beranda."),
  num("Pilih metode masuk:"),
  li("Google SSO: Klik \"Continue with Google\" untuk masuk menggunakan akun Google.", 1),
  li("Admin/Staf: Klik bagian \"Admin / Staff Login\", masukkan Username dan Password.", 1),
  num("Setelah berhasil masuk, Anda akan diarahkan ke Dasbor utama."),
  gap(),
  ...(signinImg ? screenshot(signinImg, "Gambar 2.2 – Halaman Masuk PileMetric") : [note("Screenshot halaman login tidak tersedia.")]),
  note("Akun baru via Google memerlukan persetujuan administrator sebelum dapat mengakses sistem."),
  pageBreak(),

  // ── BAB 3: PERSIAPAN GCP ─────────────────────────────────────
  h1("3. Persiapan Ground Control Points (GCP)"),
  important("GCP adalah kewajiban mutlak untuk akurasi pengukuran optimal. Selalu siapkan GCP sebelum pengambilan foto di lapangan."),
  gap(),
  p("Ground Control Point (GCP) adalah titik fisik di lapangan yang ditandai dengan tanda khusus (cat mencolok, papan, atau patok survei) dan koordinatnya diketahui secara presisi menggunakan alat survei (GPS RTK, Total Station, atau GNSS)."),
  gap(),

  h2("3.1 Pemasangan Titik GCP di Lapangan"),
  num("Siapkan minimal 3 titik GCP — disarankan 5–10 titik untuk area besar."),
  num("Tempatkan GCP di sekitar tumpukan material, bukan di atasnya."),
  num("Buat tanda yang mudah terlihat dari udara: cat putih/kuning/oranye ukuran minimal 50×50 cm."),
  num("Sebarkan titik GCP secara merata mengelilingi area pengukuran."),
  num("Pastikan setiap GCP terlihat dalam minimal 2–5 foto drone."),
  gap(),
  twoColTable([
    ["Jumlah minimum GCP", "3 titik (wajib)"],
    ["Jumlah yang disarankan", "5–10 titik untuk akurasi maksimal"],
    ["Penempatan", "Di sekitar (bukan di atas) tumpukan, tersebar merata"],
    ["Ukuran tanda", "Minimal 50×50 cm, warna kontras (putih/kuning/oranye)"],
    ["Alat pengukur", "GPS RTK, Total Station, atau GNSS receiver"],
  ]),
  gap(),

  h2("3.2 Mengukur Koordinat Longitude, Latitude, dan Altitude"),
  p("Ukur koordinat setiap titik GCP menggunakan salah satu metode berikut:"),
  gap(),
  h3("Metode A — GPS RTK (Paling Akurat)"),
  num("Pasang receiver GPS RTK tepat di atas tanda GCP."),
  num("Tunggu status Fixed RTK (akurasi ≤2 cm)."),
  num("Catat nilai Longitude, Latitude, dan Altitude (Ellipsoidal Height) setiap titik."),
  num("Ulangi untuk semua titik GCP."),
  gap(),
  h3("Metode B — Aplikasi GPS Smartphone (Akurasi Menengah)"),
  num("Gunakan aplikasi GPS presisi tinggi (misal: GPS Logger, SW Maps)."),
  num("Berdiri di atas tanda GCP selama 1–3 menit untuk rata-rata koordinat."),
  num("Catat Longitude, Latitude, dan Altitude (meter di atas permukaan laut)."),
  gap(),
  p("Contoh format pencatatan koordinat GCP:"),
  gap(),
  twoColTable([
    ["Nama GCP", "GCP-1"],
    ["Longitude (X)", "106.8456789"],
    ["Latitude (Y)", "-6.2146321"],
    ["Altitude / Z (m)", "45.320"],
  ], "FFF3E0"),
  gap(),

  h2("3.3 Menggunakan Menu EXIF Extractor"),
  p("Menu EXIF Extractor membaca koordinat GPS yang tersimpan otomatis di dalam foto drone/DSLR. Gunakan menu ini untuk memverifikasi data GPS foto dan mendapatkan referensi koordinat awal."),
  gap(),
  p("Tampilan menu EXIF Extractor (Tools > EXIF GPS Extractor):"),
  gap(),
  twoColTable([
    ["Kolom Filename", "Nama file foto"],
    ["Kolom Longitude", "Koordinat bujur dalam derajat desimal"],
    ["Kolom Latitude", "Koordinat lintang dalam derajat desimal"],
    ["Kolom Altitude", "Ketinggian dalam meter di atas permukaan laut"],
    ["Tombol Copy (per baris)", "Salin koordinat satu foto ke clipboard"],
    ["Tombol Copy All", "Salin seluruh koordinat dalam format tabel"],
  ]),
  gap(),
  h3("Cara Menggunakan EXIF Extractor:"),
  num("Masuk ke aplikasi, klik menu \"Tools\" di navigasi kiri."),
  num("Pilih \"EXIF GPS Extractor\"."),
  num("Seret dan lepas (drag & drop) foto-foto drone ke area unggah, ATAU klik area tersebut."),
  num("Sistem membaca EXIF otomatis dan menampilkan tabel Longitude, Latitude, Altitude."),
  num("Gunakan tombol \"Copy All\" untuk menyalin semua koordinat sekaligus."),
  gap(),
  note("EXIF Extractor berguna untuk memverifikasi apakah foto sudah mengandung GPS, dan sebagai referensi awal sebelum memasukkan koordinat GCP survei yang lebih presisi."),
  gap(),

  h2("3.4 Membuat File gcp_list.txt dengan Alat Penanda GCP"),
  p("File gcp_list.txt berisi koordinat GCP beserta posisi piksel GCP di setiap foto. File ini wajib dibuat dan dilampirkan sebelum mengirim pekerjaan."),
  gap(),
  h3("Format File gcp_list.txt:"),
  p("Baris pertama: sistem koordinat. Baris berikutnya: satu baris per penandaan GCP di foto."),
  gap(),
  code("EPSG:4326"),
  code("106.8456789 -6.2146321 45.320 1234 876 DJI_0001.JPG GCP-1"),
  code("106.8456789 -6.2146321 45.320 1187 901 DJI_0002.JPG GCP-1"),
  code("106.8512345 -6.2198765 44.150 2341 654 DJI_0001.JPG GCP-2"),
  code("106.8512345 -6.2198765 44.150 2298 672 DJI_0003.JPG GCP-2"),
  gap(),
  threeColTable(
    ["Kolom", "Contoh Nilai", "Keterangan"],
    [
      ["Baris 1 (proyeksi)", "EPSG:4326", "Sistem koordinat yang digunakan"],
      ["Kolom 1 (X)", "106.8456789", "Longitude titik GCP (desimal)"],
      ["Kolom 2 (Y)", "-6.2146321", "Latitude titik GCP (desimal)"],
      ["Kolom 3 (Z)", "45.320", "Altitude dalam meter"],
      ["Kolom 4 (imX)", "1234", "Posisi X titik di gambar (piksel)"],
      ["Kolom 5 (imY)", "876", "Posisi Y titik di gambar (piksel)"],
      ["Kolom 6", "DJI_0001.JPG", "Nama file gambar"],
      ["Kolom 7", "GCP-1", "Label nama titik GCP"],
    ]
  ),
  gap(),

  h3("Cara Membuat gcp_list.txt di Aplikasi (Tahap demi Tahap):"),
  p("Alat Penanda GCP diakses dari halaman New Job setelah foto diunggah."),
  gap(),
  p("TAHAP 1 — Definisikan Titik GCP:", true),
  num("Klik tombol \"Open GCP Tagger\" pada halaman New Job (setelah foto diunggah)."),
  num("Pilih sistem koordinat dari dropdown (default: EPSG:4326 untuk WGS84 Lon/Lat)."),
  num("Isi kolom untuk setiap titik GCP: Label, Longitude (X), Latitude (Y), Altitude (Z)."),
  li("Contoh: Label=GCP-1, X=106.8456789, Y=-6.2146321, Z=45.320", 1),
  num("Klik \"Add GCP\" untuk menambah titik (minimal 3 titik wajib diisi)."),
  num("Setelah semua koordinat terisi, klik tombol \"Next\" untuk ke Tahap 2."),
  gap(),
  p("Tampilan Alat Penanda GCP — Tahap 1 (Definisi Koordinat GCP):"),
  gap(),
  twoColTable([
    ["Kolom Label", "Nama titik GCP (contoh: GCP-1, GCP-2, GCP-3)"],
    ["Kolom X (Longitude)", "Koordinat bujur dari hasil survei lapangan"],
    ["Kolom Y (Latitude)", "Koordinat lintang dari hasil survei lapangan"],
    ["Kolom Z (Altitude)", "Ketinggian titik dalam meter dari hasil survei"],
    ["Tombol Add GCP", "Tambah baris titik GCP baru"],
    ["Tombol Next", "Lanjut ke Tahap 2 (Penandaan di foto)"],
  ]),
  gap(),
  p("TAHAP 2 — Tandai GCP di Foto:", true),
  num("Pilih nama GCP dari daftar di sisi kiri panel (misal: GCP-1)."),
  num("Foto pertama dari daftar foto yang diunggah ditampilkan di layar."),
  num("Klik tepat pada posisi tanda GCP yang terlihat di foto."),
  num("Sistem mencatat koordinat piksel (x, y) dari posisi klik tersebut."),
  num("Pindah ke foto berikutnya menggunakan tombol panah (< >) di bawah foto."),
  num("Ulangi penandaan di semua foto yang menampilkan tanda GCP yang sama."),
  num("Setiap GCP wajib ditandai minimal di 2 foto berbeda (disarankan 3–5 foto)."),
  num("Perhatikan indikator status di panel kiri:"),
  li("○ (abu-abu) = belum ditandai di foto manapun", 1),
  li("⚠ (kuning)  = baru 1 foto — perlu minimal 1 foto lagi", 1),
  li("✓ (hijau)   = sudah ≥2 foto — siap untuk ekspor", 1),
  num("Setelah semua GCP berstatus ✓ (hijau), klik \"Export gcp_list.txt\"."),
  gap(),
  twoColTable([
    ["Tampilan foto", "Foto aktif ditampilkan besar di tengah panel"],
    ["Panel GCP kiri", "Daftar GCP dengan indikator status ○ / ⚠ / ✓"],
    ["Klik pada foto", "Menandai posisi GCP aktif di foto tersebut"],
    ["Tombol < >", "Navigasi ke foto sebelumnya / berikutnya"],
    ["Tombol Export", "Aktif hanya jika semua GCP berstatus ✓ (hijau)"],
  ]),
  gap(),
  important("Setiap GCP WAJIB ditandai minimal di 2 foto berbeda. Jika ada GCP dengan status ⚠ (1 foto), tombol Export tidak akan aktif."),
  note("File gcp_list.txt dibuat otomatis oleh aplikasi — Anda tidak perlu mengeditnya secara manual."),
  pageBreak(),

  // ── BAB 4: MEMBUAT PEKERJAAN BARU ────────────────────────────
  h1("4. Membuat Pengukuran Baru"),
  p("Setelah GCP siap, ikuti langkah-langkah berikut untuk membuat pekerjaan pengukuran:"),
  gap(),

  h2("4.1 Mengisi Informasi Pekerjaan"),
  num("Klik menu \"Jobs\" lalu klik \"New Measurement\", atau klik tombol \"+\" di dasbor."),
  num("Isi formulir pengukuran:"),
  gap(),
  twoColTable([
    ["Nama Pekerjaan", "Contoh: \"Tumpukan Pasir Area A – Mei 2026\""],
    ["Jenis Material", "Pasir (Sand), Tanah (Soil), atau Batu Bara (Coal)"],
    ["Sumber Foto", "Drone, Smartphone, atau Kamera DSLR"],
    ["Tingkat Presisi", "Low (cepat) / Medium (seimbang) / High (paling akurat)"],
    ["Mode Poligon", "Automatic (otomatis) atau Manual (gambar sendiri)"],
    ["Koordinat GPS", "Opsional — Latitude/Longitude lokasi tumpukan"],
  ]),
  gap(),

  h2("4.2 Mengunggah Foto"),
  num("Klik area unggah atau tombol \"Select Images\"."),
  num("Pilih semua foto tumpukan (minimal 20 foto, disarankan 50–150)."),
  num("Pastikan foto memenuhi syarat:"),
  li("Melingkari seluruh tumpukan dari berbagai sudut", 1),
  li("Overlap antar foto minimal 70%", 1),
  li("Format JPG/JPEG, resolusi minimal 8 MP", 1),
  li("Mengandung data GPS/EXIF", 1),
  gap(),

  h2("4.3 Mengunggah File GCP (WAJIB)"),
  important("Langkah ini wajib dilakukan. Jangan kirim pekerjaan tanpa file GCP."),
  num("Setelah foto diunggah, klik tombol \"Open GCP Tagger\"."),
  num("Selesaikan proses pendefinisian dan penandaan GCP seperti di Bab 3.4."),
  num("Klik \"Export gcp_list.txt\" — file otomatis terlampir ke pekerjaan ini."),
  gap(),

  h2("4.4 Mengirim Pekerjaan"),
  num("Periksa kembali semua informasi: nama, jenis material, foto, dan file GCP."),
  num("Klik tombol \"Submit Job\" untuk mengirim pekerjaan ke sistem pemrosesan."),
  num("Anda akan diarahkan ke halaman detail untuk memantau progres."),
  pageBreak(),

  // ── BAB 5: MEMANTAU PROGRES ───────────────────────────────────
  h1("5. Memantau Progres Pengukuran"),
  p("Setelah pekerjaan dikirim, sistem memproses data secara otomatis. Halaman detail memperbarui status setiap 15 detik."),
  gap(),
  h2("5.1 Status Pekerjaan"),
  twoColTable([
    ["Queued",    "Dalam antrian, menunggu giliran diproses"],
    ["Running",   "Sedang diproses oleh sistem fotogrametri"],
    ["Completed", "Selesai — hasil volume tersedia"],
    ["Failed",    "Gagal — periksa kualitas foto dan file GCP"],
  ]),
  gap(),
  h2("5.2 Estimasi Waktu Pemrosesan"),
  twoColTable([
    ["Low (Rendah)",   "15 – 30 menit"],
    ["Medium (Sedang)", "30 – 90 menit"],
    ["High (Tinggi)",  "1 – 4 jam"],
  ]),
  gap(),
  note("Waktu aktual bervariasi tergantung jumlah foto dan kondisi server."),
  pageBreak(),

  // ── BAB 6: HASIL PENGUKURAN ───────────────────────────────────
  h1("6. Melihat dan Mengunduh Hasil"),
  p("Setelah status pekerjaan menjadi \"Completed\", hasil pengukuran tersedia di halaman detail."),
  gap(),
  h2("6.1 Informasi Hasil Pengukuran"),
  twoColTable([
    ["Volume (m³)",   "Total volume material dalam meter kubik"],
    ["Luas Area (m²)", "Luas permukaan tumpukan dalam meter persegi"],
    ["Lokasi GPS",    "Koordinat lokasi pada peta"],
    ["Tanggal Proses", "Waktu pemrosesan selesai"],
    ["Durasi Proses", "Total waktu yang dibutuhkan"],
  ]),
  gap(),
  h2("6.2 Mengunduh Laporan PDF"),
  num("Buka halaman detail pekerjaan yang sudah selesai."),
  num("Klik tombol \"Download Report\" (ikon PDF)."),
  num("Laporan PDF diunduh otomatis — berisi volume, luas area, peta lokasi, dan info pekerjaan."),
  gap(),
  h2("6.3 Mengunduh Data Mentah"),
  num("Klik tombol \"Download Results\" pada halaman detail pekerjaan."),
  num("File ZIP (point cloud, DSM, ortofoto) akan diunduh ke perangkat Anda."),
  note("File hasil mentah dapat berukuran besar (puluhan–ratusan MB). Pastikan koneksi stabil."),
  gap(),
  h2("6.4 Menggambar Ulang Poligon"),
  num("Klik tombol \"Draw Polygon\" pada halaman detail jika area otomatis kurang tepat."),
  num("Gambar batas area tumpukan pada peta yang ditampilkan."),
  num("Sistem menghitung ulang volume berdasarkan poligon baru."),
  pageBreak(),

  // ── BAB 7: TIPS FOTO ──────────────────────────────────────────
  h1("7. Tips Pengambilan Foto"),
  h2("7.1 Foto Drone"),
  li("Terbang dengan ketinggian konsisten di atas tumpukan."),
  li("Buat jalur penerbangan grid (kisi-kisi) menutupi seluruh area."),
  li("Overlap antar foto minimal 70% depan-belakang dan 60% kiri-kanan."),
  li("Tambahkan jalur orbit mengelilingi tumpukan dari sudut 45°."),
  li("Hindari terbang saat angin kencang atau cahaya ekstrem."),
  gap(),
  h2("7.2 Foto DSLR / Smartphone"),
  li("Kelilingi tumpukan secara merata dari semua sisi."),
  li("Ambil foto dari beberapa ketinggian berbeda."),
  li("Pastikan setiap bagian tumpukan muncul di minimal 3 foto."),
  li("Aktifkan GPS pada kamera/smartphone."),
  gap(),
  h2("7.3 Yang Harus Dihindari"),
  li("Foto dari satu sisi saja — wajib melingkari seluruh tumpukan."),
  li("Foto buram, terlalu gelap, atau over-exposure."),
  li("Orang atau kendaraan bergerak di area tumpukan saat pemotretan."),
  li("Pengambilan foto saat hujan atau berkabut."),
  pageBreak(),

  // ── BAB 8: PEMECAHAN MASALAH ──────────────────────────────────
  h1("8. Pemecahan Masalah"),
  gap(),
  twoColTable([
    ["Pekerjaan status \"Failed\"",
     "Periksa: jumlah foto ≥20, kualitas baik, file GCP benar, setiap GCP ditandai ≥2 foto. Coba kirim ulang."],
    ["Volume tidak akurat",
     "Pastikan file GCP dilampirkan dan koordinat diukur dengan alat survei presisi (RTK/Total Station)."],
    ["Error pada file GCP",
     "Pastikan sistem koordinat sesuai (EPSG:4326). Setiap GCP harus ditandai di minimal 2 foto berbeda."],
    ["Proses terlalu lama",
     "Mode High Precision membutuhkan waktu lama. Gunakan Medium untuk keseimbangan kecepatan dan akurasi."],
    ["Tidak bisa masuk",
     "Pastikan akun Google sudah disetujui administrator. Hubungi admin sistem."],
    ["Foto tidak ter-upload",
     "Periksa koneksi internet. Format harus JPG/JPEG. Coba upload beberapa foto dahulu."],
  ]),
  pageBreak(),

  // ── BAB 9: INFO SISTEM ────────────────────────────────────────
  h1("9. Informasi Sistem"),
  gap(),
  twoColTable([
    ["Sistem",           "PileMetric v1.1"],
    ["Platform",         "Berbasis web — akses melalui browser"],
    ["Teknologi",        "Fotogrametri berbasis NodeODM / WebODM"],
    ["Format GCP",       "gcp_list.txt (NodeODM compatible)"],
    ["Sistem Koordinat", "WGS84 (EPSG:4326) atau UTM"],
  ]),
  gap(), gap(),
  new Paragraph({
    children: [new TextRun({ text: "© 2026 PileMetric. Semua hak dilindungi.", size: 18, italics: true, color: "999999", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
  }),
];

// ── Build document ─────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [{
      reference: "steps",
      levels: [{
        level: 0,
        format: NumberFormat.DECIMAL,
        text: "%1.",
        alignment: AlignmentType.LEFT,
      }],
    }],
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
        run: { size: 24, bold: true, color: "444444", font: "Calibri" },
        paragraph: { spacing: { before: 200, after: 100 } },
      },
    ],
  },
  sections: [{
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [new TextRun({ text: "PileMetric — Panduan Pengguna v1.1", size: 18, color: "999999", font: "Calibri" })],
          alignment: AlignmentType.RIGHT,
          border: { bottom: { color: "DDDDDD", style: BorderStyle.SINGLE, size: 4, space: 4 } },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: "© 2026 PileMetric  |  Halaman ", size: 18, color: "999999", font: "Calibri" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "999999", font: "Calibri" }),
          ],
          alignment: AlignmentType.CENTER,
          border: { top: { color: "DDDDDD", style: BorderStyle.SINGLE, size: 4, space: 4 } },
        })],
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
    children,
  }],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(OUTPUT, buf);
console.log(`✓ Berhasil: ${OUTPUT}`);
console.log(`  Ukuran: ${(buf.length / 1024).toFixed(1)} KB`);
