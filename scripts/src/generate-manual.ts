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

function heading1(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    border: {
      bottom: { color: "E85D04", style: BorderStyle.SINGLE, size: 8, space: 4 },
    },
  });
}

function heading2(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 160 },
  });
}

function heading3(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
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

function numbered(text: string, level = 0) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: "Calibri" })],
    numbering: { reference: "main-numbering", level },
    spacing: { before: 80, after: 80 },
  });
}

function note(text: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: "Catatan: ", bold: true, size: 20, color: "E85D04", font: "Calibri" }),
      new TextRun({ text, size: 20, italics: true, font: "Calibri" }),
    ],
    spacing: { before: 120, after: 120 },
    indent: { left: convertInchesToTwip(0.3) },
    border: {
      left: { color: "E85D04", style: BorderStyle.SINGLE, size: 12, space: 8 },
    },
  });
}

function screenshotParagraph(imgBuffer: Buffer, label: string, widthPx = 580) {
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
      children: [
        new TextRun({
          text: label,
          size: 18,
          italics: true,
          color: "666666",
          font: "Calibri",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
    }),
  ];
}

function spacer() {
  return new Paragraph({ text: "", spacing: { before: 100, after: 100 } });
}

function infoTable(rows: [string, string][]) {
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
            shading: { type: ShadingType.SOLID, color: "F5F5F5" },
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

// ── Load images ───────────────────────────────────────────────
const landingImg = readImage("01-landing.jpg");
const signinImg = readImage("02-signin.jpg");

// ── Build document sections ───────────────────────────────────
const coverSection = [
  spacer(),
  spacer(),
  spacer(),
  new Paragraph({
    children: [new TextRun({ text: "PILEMETRIC", bold: true, size: 72, color: "E85D04", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Panduan Pengguna", size: 40, color: "333333", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Sistem Pengukuran Volume Tumpukan Material", size: 28, color: "666666", italics: true, font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 600 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Versi 1.0  |  2026", size: 22, color: "999999", font: "Calibri" })],
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
    "menggunakan foto dari drone, kamera DSLR, atau smartphone — tanpa memerlukan peralatan survei khusus."
  ),
  spacer(),
  heading2("1.1 Fitur Utama"),
  bullet("Unggah foto drone, DSLR, atau smartphone"),
  bullet("Pemrosesan otomatis menggunakan fotogrametri profesional"),
  bullet("Hasil volume dalam meter kubik (m³) dan luas area (m²)"),
  bullet("Laporan PDF yang dapat diunduh"),
  bullet("Dasbor ringkasan dan riwayat pekerjaan"),
  bullet("Dukungan material: Pasir, Tanah, Batu Bara"),
  spacer(),
  heading2("1.2 Persyaratan Sistem"),
  infoTable([
    ["Browser", "Google Chrome, Firefox, atau Edge (versi terbaru)"],
    ["Koneksi Internet", "Diperlukan untuk mengunggah foto dan memproses data"],
    ["Format Foto", "JPG/JPEG dengan data GPS/EXIF (disarankan)"],
    ["Jumlah Foto", "Minimum 20 foto per pengukuran (disarankan 50–150 foto)"],
  ]),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const loginSection = [
  heading1("2. Masuk ke Aplikasi"),
  body(
    "Buka aplikasi melalui browser Anda. Halaman utama akan menampilkan layar beranda PileMetric."
  ),
  spacer(),
  ...(landingImg ? screenshotParagraph(landingImg, "Gambar 2.1 – Halaman Beranda PileMetric") : [
    note("Screenshot halaman beranda tidak tersedia.")
  ]),
  heading2("2.1 Langkah Masuk"),
  numbered("Klik tombol \"Get Started\" atau \"Sign In\" pada halaman beranda."),
  numbered("Halaman login akan terbuka."),
  numbered("Pilih metode masuk yang sesuai:"),
  bullet("Google SSO: Klik tombol \"Continue with Google\" untuk masuk menggunakan akun Google.", 1),
  bullet("Admin/Staf: Klik bagian \"Admin / Staff Login\", masukkan Username dan Password.", 1),
  numbered("Setelah berhasil masuk, Anda akan diarahkan ke Dasbor utama."),
  spacer(),
  ...(signinImg ? screenshotParagraph(signinImg, "Gambar 2.2 – Halaman Masuk PileMetric") : [
    note("Screenshot halaman login tidak tersedia.")
  ]),
  note(
    "Akun baru yang masuk menggunakan Google memerlukan persetujuan dari administrator sebelum dapat mengakses sistem."
  ),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const dashboardSection = [
  heading1("3. Dasbor"),
  body(
    "Setelah berhasil masuk, Anda akan melihat Dasbor yang menampilkan ringkasan aktivitas pengukuran."
  ),
  spacer(),
  heading2("3.1 Tampilan Dasbor"),
  body("Dasbor menampilkan informasi berikut:"),
  spacer(),
  infoTable([
    ["Total Pekerjaan", "Jumlah total pekerjaan pengukuran yang telah dibuat"],
    ["Total Volume", "Akumulasi volume seluruh pengukuran (m³)"],
    ["Pekerjaan Selesai", "Jumlah pengukuran yang telah berhasil diproses"],
    ["Waktu Rata-rata", "Rata-rata waktu pemrosesan per pekerjaan"],
  ]),
  spacer(),
  heading2("3.2 Navigasi Menu"),
  bullet("Dashboard — Halaman ringkasan utama"),
  bullet("Jobs — Daftar semua pekerjaan pengukuran"),
  bullet("New Job — Membuat pengukuran baru"),
  bullet("Tools — Alat bantu tambahan (EXIF Extractor)"),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const newJobSection = [
  heading1("4. Membuat Pengukuran Baru"),
  body(
    "Untuk membuat pengukuran volume baru, ikuti langkah-langkah berikut:"
  ),
  spacer(),
  heading2("4.1 Mengisi Informasi Pekerjaan"),
  numbered("Klik menu \"Jobs\" lalu klik tombol \"New Measurement\" atau langsung klik \"+\" di dasbor."),
  numbered("Isi formulir pengukuran berikut:"),
  spacer(),
  infoTable([
    ["Nama Pekerjaan", "Masukkan nama deskriptif, contoh: \"Tumpukan Pasir - Area A - Mei 2026\""],
    ["Jenis Material", "Pilih jenis material: Pasir (Sand), Tanah (Soil), atau Batu Bara (Coal)"],
    ["Sumber Foto", "Pilih perangkat: Drone, Smartphone, atau Kamera DSLR"],
    ["Tingkat Presisi", "Low (cepat), Medium (seimbang), High (akurat, lebih lama)"],
    ["Mode Poligon", "Automatic (otomatis) atau Manual (gambar area sendiri)"],
    ["Koordinat GPS", "Opsional — masukkan Latitude/Longitude lokasi tumpukan"],
    ["Catatan", "Opsional — keterangan tambahan tentang pekerjaan ini"],
  ]),
  spacer(),
  heading2("4.2 Mengunggah Foto"),
  numbered("Klik area unggah foto atau tombol \"Select Images\"."),
  numbered("Pilih minimal 20 foto dari perangkat Anda. Foto harus:"),
  bullet("Diambil dari berbagai sudut mengelilingi tumpukan material.", 1),
  bullet("Memiliki tumpang tindih (overlap) minimal 70% antar foto.", 1),
  bullet("Format JPG/JPEG dengan resolusi cukup (minimal 8 MP disarankan).", 1),
  bullet("Mengandung data GPS/EXIF untuk hasil lebih akurat.", 1),
  numbered("Sistem akan memproses foto dan menampilkan pratinjau beserta informasi EXIF."),
  numbered("Jika foto tidak memiliki GPS, sistem akan meminta koordinat secara manual."),
  spacer(),
  note("Semakin banyak foto dengan overlap yang baik, semakin akurat hasil pengukuran volume."),
  spacer(),
  heading2("4.3 File GCP (Opsional)"),
  body(
    "Ground Control Points (GCP) adalah titik referensi di lapangan dengan koordinat GPS yang diketahui secara presisi. " +
    "Menambahkan file GCP akan meningkatkan akurasi pengukuran secara signifikan."
  ),
  numbered("Klik tombol \"Upload GCP File\" jika Anda memiliki file GCP."),
  numbered("Unggah file GCP dalam format yang sesuai."),
  numbered("Tandai titik GCP pada foto menggunakan alat GCP Tagger yang tersedia."),
  spacer(),
  heading2("4.4 Mengirim Pekerjaan"),
  numbered("Periksa kembali semua informasi yang telah diisi."),
  numbered("Klik tombol \"Submit Job\" untuk memulai pemrosesan."),
  numbered("Sistem akan mengunggah foto dan memulai proses fotogrametri secara otomatis."),
  numbered("Anda akan diarahkan ke halaman detail pekerjaan untuk memantau progres."),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const monitorSection = [
  heading1("5. Memantau Progres Pengukuran"),
  body(
    "Setelah pekerjaan dikirim, sistem akan memproses foto secara otomatis. Proses ini dapat memakan waktu " +
    "beberapa menit hingga beberapa jam tergantung jumlah foto dan tingkat presisi yang dipilih."
  ),
  spacer(),
  heading2("5.1 Status Pekerjaan"),
  infoTable([
    ["Queued", "Pekerjaan dalam antrian, menunggu giliran diproses"],
    ["Running", "Pekerjaan sedang diproses oleh sistem fotogrametri"],
    ["Completed", "Pekerjaan selesai, hasil volume tersedia"],
    ["Failed", "Pekerjaan gagal — periksa jumlah dan kualitas foto"],
  ]),
  spacer(),
  body(
    "Halaman detail pekerjaan akan memperbarui status secara otomatis setiap 15 detik. " +
    "Anda tidak perlu me-refresh halaman secara manual."
  ),
  spacer(),
  heading2("5.2 Estimasi Waktu Pemrosesan"),
  infoTable([
    ["Low (Rendah)", "15 – 30 menit"],
    ["Medium (Sedang)", "30 – 90 menit"],
    ["High (Tinggi)", "1 – 4 jam"],
  ]),
  note("Waktu aktual dapat bervariasi tergantung jumlah foto dan kondisi server."),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const resultsSection = [
  heading1("6. Melihat Hasil Pengukuran"),
  body(
    "Setelah pekerjaan berstatus \"Completed\", hasil pengukuran volume tersedia di halaman detail pekerjaan."
  ),
  spacer(),
  heading2("6.1 Informasi Hasil"),
  body("Halaman hasil menampilkan data berikut:"),
  spacer(),
  infoTable([
    ["Volume (m³)", "Total volume material dalam meter kubik"],
    ["Luas Area (m²)", "Luas area permukaan tumpukan dalam meter persegi"],
    ["Lokasi GPS", "Koordinat lokasi tumpukan di peta"],
    ["Tanggal Proses", "Waktu pemrosesan selesai"],
    ["Durasi Proses", "Total waktu yang dibutuhkan untuk pemrosesan"],
  ]),
  spacer(),
  heading2("6.2 Mengunduh Laporan PDF"),
  numbered("Buka halaman detail pekerjaan yang sudah selesai."),
  numbered("Klik tombol \"Download Report\" (ikon PDF)."),
  numbered("Laporan PDF akan diunduh secara otomatis ke perangkat Anda."),
  numbered("Laporan berisi: ringkasan volume, luas area, peta lokasi, dan informasi pekerjaan."),
  spacer(),
  heading2("6.3 Mengunduh Data Mentah"),
  numbered("Pada halaman detail pekerjaan, klik tombol \"Download Results\"."),
  numbered("File ZIP akan diunduh berisi data hasil fotogrametri lengkap (point cloud, DSM, ortofoto)."),
  note("File hasil mentah berukuran besar (dapat mencapai ratusan MB). Pastikan koneksi internet stabil."),
  spacer(),
  heading2("6.4 Menggambar Ulang Poligon"),
  body(
    "Jika area yang terdeteksi secara otomatis kurang tepat, Anda dapat menggambar ulang batas area secara manual:"
  ),
  numbered("Klik tombol \"Draw Polygon\" pada halaman detail pekerjaan."),
  numbered("Gambar batas area tumpukan pada peta yang ditampilkan."),
  numbered("Sistem akan menghitung ulang volume berdasarkan poligon yang Anda gambar."),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const tipsSection = [
  heading1("7. Tips Pengambilan Foto"),
  body(
    "Kualitas foto sangat menentukan akurasi hasil pengukuran. Berikut panduan pengambilan foto yang baik:"
  ),
  spacer(),
  heading2("7.1 Foto Drone"),
  bullet("Terbang dengan ketinggian konsisten di atas tumpukan material."),
  bullet("Buat jalur penerbangan grid (kisi-kisi) di atas seluruh area tumpukan."),
  bullet("Overlap antar foto minimal 70% (depan-belakang) dan 60% (kiri-kanan)."),
  bullet("Hindari terbang saat angin kencang atau cahaya sangat terang/kontras."),
  bullet("Tambahkan foto orbit mengelilingi tumpukan dari sudut 45°."),
  spacer(),
  heading2("7.2 Foto Kamera DSLR / Smartphone"),
  bullet("Kelilingi tumpukan secara merata — jangan tinggalkan sisi yang tidak terfoto."),
  bullet("Ambil foto dari beberapa ketinggian yang berbeda."),
  bullet("Pastikan setiap bagian tumpukan muncul di minimal 3 foto berbeda."),
  bullet("Hindari foto buram atau terlalu gelap/terang."),
  bullet("Aktifkan GPS pada kamera/smartphone untuk data lokasi otomatis."),
  spacer(),
  heading2("7.3 Hal yang Perlu Dihindari"),
  bullet("Jangan foto hanya dari satu sisi — harus melingkari seluruh tumpukan."),
  bullet("Hindari foto dengan orang atau kendaraan yang bergerak di sekitar tumpukan."),
  bullet("Jangan gunakan foto dengan resolusi sangat rendah (di bawah 5 MP)."),
  bullet("Hindari pengambilan foto saat hujan atau kabut."),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const troubleshootSection = [
  heading1("8. Pemecahan Masalah"),
  spacer(),
  infoTable([
    ["Pekerjaan berstatus \"Failed\"",
      "Periksa: jumlah foto minimal 20, kualitas foto cukup baik, overlap antar foto memadai. Coba kirim ulang dengan foto yang lebih banyak."],
    ["Volume terlihat tidak akurat",
      "Tambahkan file GCP untuk meningkatkan akurasi. Pastikan foto diambil dari berbagai sudut dan ketinggian."],
    ["Proses terlalu lama",
      "Proses High Precision memang membutuhkan waktu lama. Untuk pengukuran cepat, gunakan tingkat presisi Low atau Medium."],
    ["Tidak bisa masuk ke aplikasi",
      "Pastikan akun Google Anda sudah disetujui oleh administrator. Hubungi admin sistem Anda."],
    ["Foto tidak ter-upload",
      "Periksa koneksi internet. Pastikan format foto adalah JPG/JPEG. Coba upload dengan jumlah foto lebih sedikit."],
    ["Hasil download tidak muncul",
      "Hasil hanya tersedia setelah status pekerjaan \"Completed\". Tunggu proses selesai."],
  ]),
  spacer(),
  new Paragraph({ children: [new PageBreak()] }),
];

const contactSection = [
  heading1("9. Kontak & Dukungan"),
  body("Untuk pertanyaan, laporan masalah, atau permintaan dukungan teknis, hubungi administrator sistem Anda."),
  spacer(),
  infoTable([
    ["Sistem", "PileMetric v1.0"],
    ["Platform", "Berbasis web — dapat diakses melalui browser"],
    ["Teknologi", "Fotogrametri berbasis NodeODM / WebODM"],
  ]),
  spacer(),
  spacer(),
  new Paragraph({
    children: [
      new TextRun({
        text: "© 2026 PileMetric. Semua hak dilindungi.",
        size: 18,
        color: "999999",
        italics: true,
        font: "Calibri",
      }),
    ],
    alignment: AlignmentType.CENTER,
  }),
];

// ── Assemble document ─────────────────────────────────────────
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
          {
            level: 1,
            format: NumberFormat.LOWER_LETTER,
            text: "%2.",
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
        run: { size: 32, bold: true, color: "1A1A2E", font: "Calibri" },
        paragraph: { spacing: { before: 400, after: 200 } },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 26, bold: true, color: "E85D04", font: "Calibri" },
        paragraph: { spacing: { before: 300, after: 160 } },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 24, bold: true, color: "333333", font: "Calibri" },
        paragraph: { spacing: { before: 200, after: 100 } },
      },
    ],
  },
  sections: [
    {
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "PileMetric — Panduan Pengguna", size: 18, color: "999999", font: "Calibri" }),
              ],
              alignment: AlignmentType.RIGHT,
              border: {
                bottom: { color: "DDDDDD", style: BorderStyle.SINGLE, size: 4, space: 4 },
              },
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
              border: {
                top: { color: "DDDDDD", style: BorderStyle.SINGLE, size: 4, space: 4 },
              },
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
        ...dashboardSection,
        ...newJobSection,
        ...monitorSection,
        ...resultsSection,
        ...tipsSection,
        ...troubleshootSection,
        ...contactSection,
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(OUTPUT, buffer);
console.log(`Dokumen berhasil dibuat: ${OUTPUT}`);
console.log(`Ukuran file: ${(buffer.length / 1024).toFixed(1)} KB`);
