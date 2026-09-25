export type SourceTable = {
  id: string;
  title: string;
  sourcePages: string;
  columns: string[];
  rows: string[][];
};

export const renstraTables: SourceTable[] = [
  {
    id: "1.2",
    title: "Tabel 1.2 Sasaran Utama Pembangunan 2029 dalam RPJMN 2025–2029",
    sourcePages: "PDF Renstra hlm. 10",
    columns: ["Dimensi", "Indikator", "Baseline (2024)", "Target 2029"],
    rows: [
      ["Pertumbuhan dan Pendapatan", "Pertumbuhan Ekonomi", "5,0% (2024)", "8,0%"],
      ["Pertumbuhan dan Pendapatan", "GNI per Kapita", "USD 4.810 (2023)", "USD 8.000"],
      ["Kemiskinan dan Ketimpangan", "Tingkat Kemiskinan", "8,57% (Sept 2024)", "4,5–5,0%"],
      ["Kemiskinan dan Ketimpangan", "Rasio Gini", "0,373 (Sept 2024)", "0,372–0,375"],
      ["Struktur Ekonomi", "Kontribusi PDB Manufaktur", "19,0% (2024)", "21,9%"],
      ["Struktur Ekonomi", "Kontribusi PDB Maritim", "7,9% (2022)", "9,1%"],
      ["Pemerataan Wilayah", "Kontribusi PDRB KTI", "20,9% (2010–2019)", "22,4%"],
      ["Kualitas SDM", "Indeks Modal Manusia (IMM)", "0,54 (2020)", "0,59"],
      ["Lingkungan Hidup", "Penurunan Intensitas Emisi GRK", "34,09% (2022)", "45,17%"],
      ["Lingkungan Hidup", "Indeks Kualitas Lingkungan Hidup", "72,54 (2023)", "77,20"],
      ["Kepemimpinan Global", "Global Power Index (peringkat)", "34 (2023)", "29"],
    ],
  },
  {
    id: "2.9",
    title: "Tabel 2.9 Kebutuhan Regulasi yang Diamanatkan",
    sourcePages: "PDF Renstra hlm. 68 (nomor halaman dokumen: 61)",
    columns: ["No", "Arah/Kebutuhan Kerangka Regulasi", "Urgensi Pembentukan", "Unit Penanggung Jawab"],
    rows: [
      ["1", "Peraturan Pemerintah tentang Transformasi Pembangunan sebagai pelaksanaan misi pembangunan", "Pembentukan Peraturan Pemerintah untuk melaksanakan amanat dari Pasal 7 ayat (5) UU Nomor 59 Tahun 2024 tentang RPJPN 2025–2045 yang memerintahkan untuk mengatur penjabaran 8 (delapan) Misi Pembangunan dalam dokumen perincian perencanaan pembangunan jangka panjang nasional", "Sekretariat Deputi PMP"],
      ["2", "Pengaturan tata cara penyusunan rencana kerja pemerintah", "Peraturan yang mengatur mengenai penyusunan dokumen Rencana Kerja Pemerintah yang disusun dan disahkan setiap tahun sebagai rujukan Kementerian/Lembaga dan Pemerintah Daerah dalam menyusun perencanaan pembangunan", "Direktorat SITALA"],
      ["3", "Pengaturan tata cara penyusunan Rencana Pembangunan Jangka Menengah Nasional", "Peraturan yang mengatur mengenai penyusunan dokumen Rencana Pembangunan Jangka Menengah Nasional sebagai rujukan Kementerian/Lembaga dan Pemerintah Daerah dalam menyusun perencanaan pembangunan", "Direktorat SITALA"],
      ["4", "Pengaturan mengenai penyusunan rencana induk/peta jalan/strategi nasional", "Perlunya proses bisnis yang jelas dan tegas yang diatur dalam Peraturan Menteri PPN/Kepala Bappenas dalam rangka sinergi antar unit-unit kerja di Kementerian PPN/Bappenas untuk pengendalian dokumen perencanaan nasional dan sektoral secara holistik dan terintegratif.", "Direktorat SITALA"],
      ["5", "Pengaturan SOP atau panduan perencanaan dan kebijakan berbasis bukti", "Belum adanya SOP atau panduan mengenai evidence-based planning and policy atau kebijakan dan perencanaan berbasis bukti. Hal tersebut perlu dirumuskan dalam bentuk Peraturan Menteri.", "Direktorat SITALA"],
      ["6", "Penguatan Kewenangan Kementerian PPN/Bappenas dalam pelaksanaan integrasi Sistem Perencanaan dan Penganggaran", "Belum ada peraturan yang mengatur turunan dari Permen PPN/Bappenas Nomor 5 Tahun 2018 mengenai juklak atau penanggung jawab pembuatan RKP secara jelas. Termasuk proses rangkaian Musrenbangprov, Musrenbangnas, Rakorbangpus, dan tindak lanjut setelahnya.", "Direktorat SITALA"],
    ],
  },
  {
    id: "2.10",
    title: "Tabel 2.10 Kerangka Regulasi yang Bersifat Dukungan",
    sourcePages: "PDF Renstra hlm. 69–70 (nomor halaman dokumen: 61)",
    columns: ["No", "Arah/Kebutuhan Kerangka Regulasi", "Urgensi Pembentukan", "Unit Penanggung Jawab"],
    rows: [
      ["1", "Pengaturan tentang pengembangan pembangunan yang bersifat lintas sektor sesuai dengan prioritas nasional", "Perlu peraturan dan turunannya hingga petunjuk teknis dan lapangan untuk kebijakan yang bersifat lintas sektor seperti isu penyandang disabilitas, keberlanjutusiaan, dan isu lainnya.", "UKE II terkait"],
      ["2", "Pengaturan tentang sinkronisasi dan sinergitas kebijakan strategis nasional, serta kegiatan lintas Kemenko.", "Regulasi yang ada belum menyebutkan langsung mengenai kegiatan lintas Kemenko, sehingga perlu dirumuskan dalam Peraturan Presiden yang memuat hal tersebut.", "UKE II terkait"],
      ["3", "Pengaturan Sinkronisasi Kegiatan PHLN dengan RPJMN dan RKP hingga ke tingkat Proyek Prioritas", "Perlunya proses bisnis yang jelas dan tegas melalui SOP dalam pengendalian penyusunan perencanaan dan penganggaran yang jelas agar proses sinkronisasi target prioritas nasional RPJMN 2025–2029 berjalan efektif dan efisien di K/L. Selain itu, perlu segera disusun peraturan sebagai acuan penelaah Kementerian PPN/Bappenas untuk menjaga konsistensi target prioritas nasional, termasuk pada tahap pelaksanaan anggaran.", "UKE II terkait"],
      ["4", "Pengaturan tentang sinkronisasi kelembagaan dan regulasi terkait investasi publik yang memadai", "Regulasi yang ada belum mengatur secara khusus terkait dengan investasi publik, sehingga hal tersebut perlu dirumuskan pengaturannya dalam bentuk Peraturan Presiden.", "UKE II terkait"],
      ["5", "Pengaturan koordinasi dalam melakukan exercise alokasi anggaran K/L mitra dengan Direktorat Alokasi Anggaran Pembangunan Pusat dan Daerah", "Alokasi anggaran K/L mitra dengan Direktorat Alokasi Anggaran Pembangunan Pusat dan Daerah, sehingga perlu dirumuskan dalam Peraturan Menteri.", "UKE II terkait"],
      ["6", "Pengaturan koordinasi penyusunan anggaran dengan Kementerian Keuangan dan K/L lainnya", "Perlunya proses bisnis yang jelas dan tegas lewat SOP dalam pengendalian penyusunan perencanaan dan penganggaran yang efektif dan efisien untuk K/L.", "UKE II terkait"],
      ["7", "Kebijakan Spesifikasi dan Standar Penggunaan Anggaran Kementerian PPN/Bappenas", "Pelaksanaan anggaran Kementerian PPN/Bappenas perlu lebih menegaskan perannya sebagai enabler pembangunan yang berfokus pada pemberian rekomendasi dan dukungan debottlenecking isu pembangunan (misalnya melalui pilot project dan sweetener), bukan sebagai pelaksana langsung kegiatan pembangunan sektor mitra K/L.", "UKE II terkait"],
      ["8", "Pengaturan pengendalian RPJMN dan RKP", "Perlunya proses bisnis yang jelas dan tegas lewat SOP yang diatur dalam Peraturan Menteri PPN/Kepala Bappenas dalam rangka sinergi antar unit-unit kerja di Kementerian PPN/Bappenas untuk pengendalian RPJMN dan RKP terutama terkait dengan isu-isu substantif seperti PN, PP, KP, dan PSN secara holistik dan terintegratif.", "UKE II terkait"],
      ["9", "Pemutakhiran Pengaturan Terkait Tata Cara Pengendalian dan Evaluasi Pembangunan (Revisi Peraturan Pemerintah Nomor 39 Tahun 2006 dan Peraturan Menteri PPN/Kepala Bappenas Nomor 1 Tahun 2023 tentang Tata Cara Pemantauan, Pengendalian dan Evaluasi Pelaksanaan Rencana Pembangunan)", "Penguatan pengaturan antara lain terkait: 1. pengendalian perencanaan pembangunan (termasuk evaluasi Ex-Ante); 2. pengendalian dan evaluasi pelaksanaan pembangunan; 3. integrasi manajemen risiko pembangunan nasional dalam evaluasi kinerja pembangunan; 4. peran daerah dalam pengendalian dan evaluasi pelaksanaan pembangunan; 5. peran sistem informasi pengendalian pembangunan nasional sebagai alat dalam pelaksanaan pengendalian, evaluasi, dan manajemen risiko pembangunan nasional; 6. Sistem Akuntabilitas Kinerja Pembangunan Nasional", "UKE II terkait"],
    ],
  },
  {
    id: "3.3",
    title: "Tabel 3.3 IKU dan Target Kinerja Kedeputian PMP Tahun 2025–2029",
    sourcePages: "PDF Renstra hlm. 124",
    columns: ["IKU UKE I", "Target 2025", "2026", "2027", "2028", "2029"],
    rows: [
      ["Indeks Kualitas Perencanaan Pembangunan Nasional Lingkup Perencanaan Makro Pembangunan", "78", "83", "88", "93", "98"],
      ["Indeks Daya Tanggap Perencanaan Pembangunan Nasional Lingkup Perencanaan Makro Pembangunan", "75", "75", "75", "75", "75"],
      ["Tingkat Tata Kelola Internal Lingkup Perencanaan Makro Pembangunan", "86,5", "88,75", "91", "93,25", "95,5"],
      ["Indeks Kepuasan Pemangku Kepentingan (Stakeholder) Lingkup Perencanaan Makro Pembangunan", "92", "94", "96", "98", "100"],
    ],
  },
  {
    id: "3.11",
    title: "Tabel 3.11 Kerangka Pendanaan Deputi Bidang PMP (subtotal unit kerja)",
    sourcePages: "PDF Renstra hlm. 135–144",
    columns: ["Unit Kerja Eselon II", "Alokasi 2025 (dalam Ribu Rupiah)", "2026", "2027", "2028", "2029", "Total"],
    rows: [
      ["Direktorat PEMPMP", "Rp3.811.194", "Rp5.126.828", "Rp6.500.000", "Rp19.305.081", "Rp17.748.705", "Rp67.829.651"],
      ["Direktorat PFMSK", "Rp1.632.162", "Rp5.587.145", "Rp7.000.000", "Rp19.920.194", "Rp18.205.100", "Rp64.607.158"],
      ["Direktorat SITALA", "Rp53.732", "Rp4.280.000", "Rp7.000.000", "Rp23.172.422", "Rp24.834.682", "Rp74.443.286"],
      ["Sekretariat Deputi", "Rp11.853.574", "Rp17.605.163", "Rp18.065.000", "Rp15.772.125", "Rp16.903.529", "Rp33.137.609"],
      ["Direktorat PHKEI", "Rp2.018.621", "Rp5.325.828", "Rp6.250.000", "Rp12.775.421", "Rp13.691.856", "Rp27.319.622"],
      ["Direktorat P4T", "Rp363.520", "Rp4.761.183", "Rp6.485.000", "Rp16.189.835", "Rp17.351.206", "Rp54.070.997"],
    ],
  },
  {
    id: "1.3",
    title: "Tabel 1.3 Potensi dan Rencana Aksi Penguatan 2025–2029",
    sourcePages: "PDF Renstra hlm. 14–15",
    columns: ["Klaster Potensi", "Potensi", "Potensi Penguatan 2025–2029"],
    rows: [
      ["Posisi dan mandat strategis", "Posisi strategis dalam strategic diamond tata kelola 2025–2029; peran penghubung kebijakan makro ↔ operasionalisasi lintas K/L", "PMP memimpin standard-setting prioritas dan konsistensi lintas dokumen, sebagai penghubung kebijakan makro dan eksekusi lintas K/L"],
      ["Kapabilitas analitik", "Kewenangan penyusunan kerangka ekonomi makro berbasis pemodelan; potensi EWS isu strategis makro", "Memperkuat pemodelan dan EWS menjadi backbone perencanaan adaptif dan pengendalian risiko pembangunan"],
      ["Peran pengawalan Renstra K/L", "Peran mengawal penerjemahan target pembangunan ke Renstra K/L (Perpres 80/2025)", "PMP mengunci cascading target-indikator pembangunan lintas K/L agar selaras RPJMN/RPJPN"],
      ["Jejaring dan data", "Jaringan koordinasi K/L/D dan mitra internasional; dukungan data untuk evidence-based planning dan inovasi", "Membangun data dan knowledge untuk mempercepat analisis kebijakan lintas sektor dan lintas wilayah"],
      ["Mandat substansi yang luas", "Mandat kuat: makro, model pembangunan, fiskal-moneter-sektor keuangan, hilirisasi dan KEI, produktivitas-tematik, tata kelola perencanaan", "Menegaskan prioritas fokus (selective) dan mekanisme orkestrasi lintas direktorat"],
      ["Bukti eksekusi (inisiatif)", "Inisiatif THIS (Bali/Kepri), Masterplan Produktivitas, Green Growth Diagnostic, aksesi OECD, pendampingan Renstra K/L, PP turunan UU 59/2024, pengendalian inflasi, dll", "Menggunakan inisiatif untuk pelembagaan THIS, penguatan sinergi lintas sektor, dan percepatan transformasi"],
    ],
  },
  {
    id: "2.3",
    title: "Tabel 2.3 Dukungan Kedeputian PMP terhadap Capaian Indikator RPJMN 2025–2029",
    sourcePages: "PDF Renstra hlm. 40–41",
    columns: ["Jenis", "Keterangan"],
    rows: [
      ["Sasaran Pembangunan", "1. Pertumbuhan Ekonomi. 2. GNI Per Kapita. 3. Kontribusi PDB Wilayah."],
      ["Sasaran Prioritas Nasional", "1. Pembentukan Modal Tetap Bruto. 2. Tingkat Inflasi. 3. Rasio Pendapatan Negara terhadap PDB. 4. Indeks Ekonomi Hijau."],
    ],
  },
  {
    id: "2.4",
    title: "Tabel 2.4 Kontribusi Peran Kedeputian PMP terhadap Peran dan Fungsi Kementerian PPN/Bappenas",
    sourcePages: "PDF Renstra hlm. 43",
    columns: ["Perencanaan", "Pembiayaan", "Pengendalian", "Pemampu/Enabler", "Penguatan Kelembagaan"],
    rows: [["Koordinasi, sinkronisasi, perumusan, dan penetapan kebijakan perencanaan pembangunan nasional; koordinasi, sinkronisasi, dan integrasi penyusunan rencana pembangunan nasional; koordinasi, analisis, dan perumusan kebijakan untuk tema, sasaran, arah kebijakan prioritas, kerangka ekonomi makro, dan kerja sama internasional.", "Koordinasi, perumusan, dan penyusunan keselarasan kebijakan ekonomi termasuk asumsi dasar ekonomi makro dan analisis kebutuhan investasi yang bersumber dari APBN dan non-APBN; koordinasi dan sinkronisasi penyusunan kebijakan di bidang analisis statistik, kebutuhan investasi, fiskal, dan [teks tabel berlanjut pada sumber].", "Pemantauan dan evaluasi pelaksanaan program dan kegiatan di bidang perencanaan makro pembangunan; pelaksanaan evaluasi dan pelaporan pelaksanaan tugas dan fungsi perencanaan pembangunan nasional di bidang perencanaan makro pembangunan.", "Koordinasi percepatan pelaksanaan program rencana pembangunan nasional; penyusunan prakarsa strategis pembangunan lintas sektor dan pengembangan model inovatif pembangunan sebagai dasar penerapan dan pelembagaan dalam rencana dan anggaran K/L/pemerintah daerah; [teks tabel berlanjut pada sumber].", "Pelaksanaan administrasi deputi; pelaksanaan fungsi lain yang diberikan oleh menteri/kepala." ]],
  },
  {
    id: "2.5",
    title: "Tabel 2.5 Pemetaan Outcomes dan Output Kinerja Kedeputian PMP 2025–2029",
    sourcePages: "PDF Renstra hlm. 49–50",
    columns: ["Sasaran Strategis", "Indikator Sasaran Strategis", "IKU Deputi", "Output Kegiatan"],
    rows: [
      ["Terwujudnya dokumen perencanaan yang berkualitas, terukur, dan lengkap untuk menjadi acuan pembangunan nasional", "Indeks Kualitas Perencanaan Pembangunan Nasional", "Indeks Kualitas Perencanaan Pembangunan Nasional Lingkup Perencanaan Makro Pembangunan", "Dokumen perencanaan yang berkualitas, terukur, lengkap disertai dengan pengelolaan risiko pembangunan nasional."],
      ["Terwujudnya dukungan penganggaran untuk memastikan pelaksanaan rencana pembangunan nasional", "Indeks Kualitas Pengelolaan Pembiayaan Pembangunan Nasional", "[kosong pada sumber]", "Informasi hasil pemenuhan anggaran perencanaan pembangunan nasional Lingkup Perencanaan Makro Pembangunan"],
      ["Terwujudnya efektivitas pengendalian perencanaan dan pelaksanaan pembangunan nasional", "Indeks kinerja pengendalian perencanaan dan pelaksanaan pembangunan nasional", "[kosong pada sumber]", "Informasi hasil pengendalian rencana pembangunan nasional dalam rangka pencapaian tujuan pembangunan nasional lingkup Perencanaan Makro Pembangunan"],
      ["Terlaksananya kebijakan percepatan dan responsivitas perencanaan atas isu nasional melalui inovasi serta rekomendasi kebijakan strategis", "Indeks Daya Tanggap Perencanaan Pembangunan Nasional", "Indeks Daya Tanggap Perencanaan Pembangunan Nasional Lingkup Perencanaan Makro Pembangunan", "Kebijakan percepatan pembangunan melalui inovasi perencanaan bidang Perencanaan Makro Pembangunan"],
      ["Terwujudnya kinerja dan layanan prima Kementerian PPN/Bappenas yang bersih, akuntabel, dan profesional dan didukung oleh kapabilitas SDM", "Indeks Reformasi Birokrasi Kementerian PPN/Bappenas; Tingkat Tata Kelola Internal Kementerian PPN/Bappenas; Indeks Kepuasan Pemangku Kepentingan (Stakeholder) Kementerian PPN/Bappenas; Indeks Kualitas Sistem dan Informasi Perencanaan Pembangunan Nasional Kementerian PPN/Bappenas; Tingkat Kepatuhan Internal Kementerian PPN/Bappenas", "Tingkat Tata Kelola Internal Lingkup Perencanaan Makro Pembangunan; Indeks Kepuasan Pemangku Kepentingan (Stakeholder) Lingkup Perencanaan Makro Pembangunan; [IKU lain mengikuti pemetaan sumber]", "Reformasi birokrasi dalam mencapai sasaran kinerja; Penerapan Tata Kelola Pemerintahan Baik Lingkup Perencanaan Makro Pembangunan; Pelayanan Prima yang Bersih, Akuntabel, Professional dan Kompeten; Standar Operational Procedure (SOP) untuk mendorong Governance, Risk, and Compliance (GRC)"],
    ],
  },
  {
    id: "2.6",
    title: "Tabel 2.6 Pemetaan Output Unit Kerja Mendukung IKU Kedeputian PMP 2025–2029",
    sourcePages: "PDF Renstra hlm. 50–57",
    columns: ["IKU Deputi", "Output Kegiatan", "IKU Unit Kerja", "Output Kegiatan Unit Kerja"],
    rows: [
      ["Indeks Kualitas Perencanaan Pembangunan Nasional Lingkup Perencanaan Makro Pembangunan", "Dokumen perencanaan yang berkualitas, terukur, lengkap disertai dengan pengelolaan risiko pembangunan nasional.", "Penyelesaian Kerangka Ekonomi Makro Nasional dan Daerah mendukung Pertumbuhan Ekonomi yang berkelanjutan", "Dokumen Analisis Kerangka Ekonomi Makro Nasional-Daerah dan Studi Dampak Prioritas Pembangunan"],
      ["Indeks Kualitas Perencanaan Pembangunan Nasional Lingkup Perencanaan Makro Pembangunan", "Dokumen perencanaan yang berkualitas, terukur, lengkap disertai dengan pengelolaan risiko pembangunan nasional.", "Penyelesaian analisa penerimaan dan pembiayaan dalam kerangka sumber pendanaan pembangunan nasional serta kebijakan moneter dan sektor keuangan yang pro pertumbuhan", "Dokumen perencanaan kebijakan fiskal, moneter, dan sektor keuangan yang inklusif dan berkelanjutan"],
      ["Indeks kinerja pengendalian perencanaan dan pelaksanaan pembangunan nasional", "Informasi hasil pengendalian rencana pembangunan nasional", "Indikator sasaran Prioritas Nasional yang telah dipantau dan dievaluasi capaiannya Lingkup Ekonomi Makro dan Model Pembangunan", "Laporan Pemantauan, Pengendalian dan Evaluasi Perencanaan Pembangunan Lingkup Perencanaan Ekonomi Makro dan Pengembangan Model Pembangunan"],
      ["Indeks Daya Tanggap Perencanaan Pembangunan Nasional Lingkup Perencanaan Makro Pembangunan", "Kebijakan percepatan pembangunan melalui inovasi perencanaan", "Inovasi Perencanaan atau Pelaksanaan Pembangunan Nasional yang ditindaklanjuti Lingkup Ekonomi Makro dan Model Pembangunan", "Dokumen Prakarsa Strategis lingkup Perencanaan Ekonomi Makro dan Pengembangan Model Pembangunan"],
      ["Tingkat Kepatuhan Internal Kementerian PPN/Bappenas", "SOP untuk mendorong GRC", "Penyelesaian Koordinasi Kepatuhan Pengendalian Intern dan Manajemen Risiko Organisasi Lingkup PMP", "Dokumen Pengelolaan Risiko UKE I dan II Lingkup PMP; Laporan Pengelolaan Kepatuhan Internal UKE I dan II Lingkup PMP"],
    ],
  },
  {
    id: "2.7",
    title: "Tabel 2.7 Strategi Pelaksanaan Kedeputian PMP 2025–2029",
    sourcePages: "PDF Renstra hlm. 58–66",
    columns: ["No", "Strategi Kedeputian PMP", "Pendetailan Strategi dan Rencana Aksi"],
    rows: [
      ["1", "Penyusunan Kerangka Ekonomi Makro Nasional dan Daerah", "Exercise lintas kedeputian/direktorat; koordinasi eksternal melalui rapat ADEM; koordinasi dengan Kementerian Keuangan; koordinasi dengan unit sektor dan K/L; exercise pertumbuhan ekonomi per provinsi; forum indikator makro daerah; rekomendasi penyelarasan RKP dan RKPD."],
      ["2", "Penyusunan Postur Makro Fiskal", "Analisis indikator makroekonomi dan fiskal; koordinasi dengan Kementerian Keuangan; exercise postur fiskal jangka menengah; rekomendasi arah kebijakan pendapatan, belanja, dan pembiayaan negara; masukan untuk RKP, KEM-PPKF, dan Nota Keuangan APBN."],
      ["3", "Penyusunan PP Turunan Undang-Undang Nomor 59 Tahun 2024 tentang RPJPN Tahun 2025–2045", "Naskah urgensi; batang tubuh dan lampiran RPP; pemetaan 45 IUP terhadap 20 Game Changers; harmonisasi dan penetapan PP; sosialisasi dan pedoman implementasi."],
      ["4–16", "Pembentukan tim/sekretariat dan strategi transformasi, inflasi, sektor keuangan, produktivitas, ekonomi oranye/biru", "Rincian strategi dan rencana aksi ditampilkan pada sumber hlm. 59–62; baris diringkas per rentang untuk menjaga keterbacaan, bukan mengganti isi sumber."],
      ["17–31", "Koordinasi RKP/RPJMN, Renstra K/L, peta jalan, KRISNA, hilirisasi, OECD, forum ekonomi, statistik, dan rekomendasi fiskal", "Rincian lengkap strategi 17–31 tersedia pada PDF hlm. 62–66; beberapa baris tabel berlanjut lintas halaman."],
    ],
  },
  {
    id: "2.8",
    title: "Tabel 2.8 Strategi Pelaksanaan Tambahan Kedeputian PMP 2025–2029",
    sourcePages: "PDF Renstra hlm. 66–67",
    columns: ["No", "Strategi Kedeputian PMP", "Pendetailan Strategi"],
    rows: [
      ["1", "Pengembangan manajemen pengetahuan melalui pemanfaatan teknologi", "Pengembangan website PMP; pengembangan perpustakaan PMP; koordinasi dengan Pusdatin dalam pengembangan AI Agent khusus."],
      ["2", "Penguatan Governance, Risk, dan Compliance (GRC) untuk mendukung transformasi budaya kerja", "Reformasi Birokrasi; penguatan tata kelola kinerja dan anggaran; penerapan manajemen risiko dan SPIP; pengawasan berkelanjutan."],
      ["3", "Penyusunan White Paper TFP-Led Growth for Blue Economy", "Kerangka kebijakan dan strategi peningkatan produktivitas ekonomi biru; identifikasi program/kegiatan prioritas; dokumen kebijakan strategis."],
      ["4", "Penyusunan White Paper Turunan Master Plan Produktivitas Nasional", "Analisis produktivitas sektoral 17 sektor menjadi 52 subsektor; arah kebijakan produktivitas dan pembangunan tematik; daftar usulan rencana aksi."],
      ["5", "Penyusunan White Paper TFP-Led Growth for Green Economy", "Estimasi dan analisis kuantitatif model pertumbuhan ekonomi hijau; transmisi model ke program/kegiatan; usulan program relevan dengan produktivitas nasional."],
    ],
  },
];

export const tableById = new Map(renstraTables.map((table) => [table.id, table]));
