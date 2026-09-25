export type ProcessMapItem = {
  id: string;
  unit: string;
  pages: string;
  summary: string;
  steps: string[];
  /** Catatan cakupan/transkripsi, mis. diagram yang hanya tersedia sebagai gambar. */
  note?: string;
};

/**
 * Transkripsi terstruktur peta proses bisnis Renstra Deputi Bidang PMP 2025-2029,
 * Bab 2.6 (Gambar 2.6-2.12), PDF file hlm. 77-117 / hlm. dokumen 71-111.
 * Langkah-langkah disusun dari narasi sumber; tidak ada langkah yang ditambahkan
 * di luar teks sumber.
 */
export const processMap: ProcessMapItem[] = [
  {
    id: "fungsi-perencanaan",
    unit: "Berdasarkan fungsi: Perencanaan",
    pages: "77–79 (dokumen 71–73)",
    summary:
      "Proses bisnis perencanaan Kedeputian PMP meliputi koordinasi, perumusan kebijakan, sinkronisasi pelaksanaan kebijakan, pemantauan, evaluasi dan pengendalian, serta penyusunan prakarsa strategis pembangunan lintas sektor dalam bidang perencanaan makro pembangunan nasional.",
    steps: [
      "RPJP Nasional 2025–2045 (periode 20 tahun) memuat arah kebijakan dan upaya pembangunan yang transformatif dan imperatif, termasuk pentahapan rencana pembangunan nasional setiap 5 tahun.",
      "Pentahapan tersebut merupakan RPJM Nasional yang disusun secara teknokratik, lalu disesuaikan dengan Visi, Misi, dan Program pasangan Presiden dan Wakil Presiden terpilih dengan berpedoman pada RPJP Nasional; RPJP Nasional menjadi panduan untuk memastikan harmonisasi RPJM Nasional.",
      "RPJM Nasional Tahun 2025–2029 yang disahkan pada tahun 2025 menjadi acuan penyusunan Renstra Kedeputian PMP 2025–2029; penyusunan Rancangan Awal RPJM Nasional 2030–2034 dimulai pada tahun 2028.",
      "RKP merupakan penjabaran RPJM Nasional untuk periode 1 (satu) tahun dan disusun sebagai kegiatan perencanaan rutin tahunan untuk menentukan tema dan prioritas pembangunan tahun berikutnya.",
      "Berdasarkan Permen PPN/Kepala Bappenas No. 2 Tahun 2025, Direktorat Sinergi dan Tata Kelola Perencanaan Pembangunan berperan sebagai clearing house penyusunan dokumen perencanaan pembangunan nasional: pusat koordinasi, sinkronisasi, dan integrasi dokumen, sekaligus pengawal standar, prosedur, serta konsistensi kebijakan lintas sektor.",
      "Proses bisnis dilaksanakan melalui koordinasi dan keterkaitan kerja antarunit UKE II: Sekretaris Deputi Bidang PMP, Direktorat PEMPMP, Direktorat PFMSK, Direktorat PHKEI, Direktorat P4T, serta Direktorat Sitala Renbang, mulai dari perumusan substansi, penguatan koordinasi, hingga penyelarasan pelaksanaan program dan kegiatan.",
    ],
    note: "Gambar 2.6 (Proses Bisnis Perencanaan) berada pada PDF file hlm. 78 dan tersedia sebagai gambar; uraian langkah di atas diambil dari narasi hlm. 77–79.",
  },
  {
    id: "fungsi-pengendalian",
    unit: "Berdasarkan fungsi: Pengendalian",
    pages: "79–80 (dokumen 73–74)",
    summary:
      "Pengendalian merupakan bagian integral dari siklus pembangunan yang mencakup perencanaan, penganggaran, pelaksanaan, serta pemantauan dan evaluasi, guna memastikan pelaksanaan pembangunan tetap selaras dengan sasaran dan menjadi dasar penyesuaian kebijakan secara tepat waktu.",
    steps: [
      "Pemantauan (a): setiap unit kerja Eselon II melakukan monitoring atas perencanaan pembangunan sektornya masing-masing.",
      "Pemantauan (b): monitoring pelaksanaan pembangunan oleh masing-masing unit kerja Eselon II sesuai lingkup sektor yang menjadi tanggung jawabnya.",
      "Pemantauan (c): penyusunan dan pemutakhiran panduan pemantauan program K/L mitra dan pemerintah daerah.",
      "Pemantauan (d): pelaksanaan pemantauan lapangan untuk menilai kemajuan pencapaian target pembangunan.",
      "Pemantauan (e): penyusunan laporan hasil pemantauan dan rekomendasi kebijakan pada tingkat Eselon II.",
      "Pemantauan (f): penyampaian hasil pemantauan kepada Deputi Bidang PMP sebagai dasar pengendalian dan pengambilan keputusan.",
      "Evaluasi (a): penyusunan indikator evaluasi capaian pelaksanaan pembangunan masing-masing sektor.",
      "Evaluasi (b): penyusunan dan pemutakhiran indikator evaluasi capaian pembangunan pada masing-masing sektor.",
      "Evaluasi (c): pelaksanaan evaluasi terhadap hasil pelaksanaan pembangunan, termasuk melalui verifikasi lapangan.",
      "Evaluasi (d): analisis capaian, identifikasi faktor pendukung dan penghambat, serta perumusan rekomendasi kebijakan.",
      "Evaluasi (e): penyusunan laporan hasil evaluasi pada tingkat Eselon II.",
      "Evaluasi (f): penyampaian hasil evaluasi kepada Deputi Bidang PMP sebagai dasar perbaikan kebijakan dan penyusunan perencanaan berikutnya.",
    ],
    note: "Langkah pemantauan dan evaluasi dikutip berurutan dari daftar a–f pada hlm. 80 sumber. Fungsi pengendalian juga diarahkan pada peran sebagai macro development steering unit.",
  },
  {
    id: "fungsi-enabler",
    unit: "Berdasarkan fungsi: Pemampu/Enabler",
    pages: "80–81 (dokumen 74–75)",
    summary:
      "Sebagai pemampu (enabler), Kedeputian PMP menjembatani proses perencanaan dengan pelaksanaan pembangunan dan menciptakan lingkungan yang kondusif bagi kementerian/lembaga, pemerintah daerah, BUMN, sektor swasta, perguruan tinggi, dan masyarakat.",
    steps: [
      "Mendorong inovasi kebijakan dan terobosan strategis guna mempercepat transformasi ekonomi dan pembangunan.",
      "Memperkuat kapasitas kelembagaan serta koordinasi lintas sektor dan lintas tingkat pemerintahan.",
      "Menyelaraskan arah kebijakan makro dengan kebutuhan implementasi di tingkat sektoral dan kewilayahan.",
      "Memfasilitasi percepatan pelaksanaan program prioritas nasional melalui penguatan sinergi antar pemangku kepentingan.",
      "Mengembangkan berbagai instrumen, kemitraan, dan mekanisme kolaborasi yang mendukung pencapaian target pembangunan.",
      "Contoh penerapan: penguatan tata kelola transformasi pembangunan melalui Sekretariat Transformasi Kerthi Bali — dukungan kebijakan makro, koordinasi lintas K/L dan pemerintah daerah, serta keterlibatan mitra pembangunan.",
    ],
    note: "Ke depan peran pemampu diarahkan tidak hanya pada fasilitasi koordinasi, tetapi juga pada pembangunan ekosistem percepatan transformasi ekonomi.",
  },
  {
    id: "fungsi-tata-kelola",
    unit: "Berdasarkan fungsi: Tata Kelola (GRC)",
    pages: "81–83 (dokumen 75–77)",
    summary:
      "Tata kelola organisasi diperkuat melalui penerapan Governance, Risk, and Compliance (GRC): penyusunan dan penyempurnaan proses bisnis, Standar Operasional Prosedur (SOP), pengelolaan kinerja organisasi, serta pengembangan kapasitas pegawai, dengan memastikan kecukupan sumber daya (man, money, machine).",
    steps: [
      "Governance: memastikan organisasi berjalan efektif, adaptif, dan berorientasi hasil melalui pengelolaan SDM, anggaran, tata laksana, teknologi informasi, dan reformasi birokrasi; didukung knowledge management, budaya kerja, dan agen perubahan.",
      "Risk: mengelola risiko organisasi secara sistematis melalui penerapan Sistem Pengendalian Intern Pemerintah (SPIP) — identifikasi, analisis, mitigasi, pemantauan, dan evaluasi risiko.",
      "Compliance: Sekretariat Deputi memastikan seluruh proses bisnis dan pelaksanaan tugas berjalan sesuai peraturan perundang-undangan, kebijakan internal Kementerian PPN/Bappenas, dan standar tata kelola — melalui penyusunan/pemutakhiran SOP, pengendalian internal, monitoring dan evaluasi, serta tindak lanjut hasil pengawasan.",
      "Arah penguatan: GRC dikembangkan sebagai sistem tata kelola terintegrasi dan berbasis data sehingga Sekretariat berperan sebagai governance enabler, bukan sekadar unit pendukung administratif.",
    ],
  },
  {
    id: "pempmp",
    unit: "Direktorat PEMPMP",
    pages: "83–94 (dokumen 77–88)",
    summary:
      "Direktorat PEMPMP bertugas menyusun dan mengoordinasikan Kerangka Ekonomi Makro (KEM), mencakup perumusan sasaran pertumbuhan ekonomi serta arah kebijakan makro, yang juga menjadi masukan sasaran pembangunan lain seperti Tingkat Kemiskinan, Rasio Gini, TPT, penurunan emisi GRK, dan Indeks Modal Manusia.",
    steps: [
      "Exercise lintas kedeputian dan direktorat dengan mempertimbangkan evaluasi perkembangan ekonomi terkini, prakiraan kondisi ekonomi masa mendatang, asumsi makro lainnya, target, program, dan Direktif Presiden; diperbarui berkala setiap triwulan.",
      "Koordinasi eksternal melalui mekanisme rapat Asumsi Dasar Ekonomi Makro (ADEM) dengan Kementerian Keuangan, Bank Indonesia, Kementerian Koordinator Bidang Perekonomian, Kementerian ESDM, dan SKK Migas, setelah publikasi resmi pertumbuhan ekonomi/PDB oleh BPS pada Februari, Mei, Agustus, dan November.",
      "Rapat ADEM membahas dan menyepakati asumsi makro: pertumbuhan ekonomi, inflasi, nilai tukar, tingkat suku bunga SUN, harga minyak dunia, dan lifting migas sampai tahun 2029.",
      "Koordinasi rutin dengan Kementerian Keuangan untuk memastikan keselarasan perencanaan (KEM RKP) dan penganggaran (KEM-PPKF/Nota Keuangan APBN), termasuk identifikasi dan kesepakatan program prioritas yang menjadi daya ungkit pertumbuhan.",
      "Koordinasi dengan unit kerja sektor di Bappenas bersama K/L sektor terkait (antara lain Kementerian Pertanian, Perindustrian, Perdagangan) untuk membahas kinerja sektoral, tantangan dan potensi sektor, serta menyelaraskan arah kebijakan; hasil bilateral meeting menjadi dasar target pertumbuhan sektoral.",
      "Pengembangan Indeks Pembangunan Ekonomi Inklusif dan Berkelanjutan (IPEI-L) sebagai alat ukur perumusan, pemantauan, dan evaluasi kebijakan pembangunan (dimensi pemerataan, akses manfaat pembangunan, kualitas lingkungan hidup).",
      "Pengembangan Dashboard Economic Intelligence Unit (EIU): diskusi dengan para ekonom untuk mengidentifikasi kebutuhan data/indikator, pengembangan sistem monitoring indikator ekonomi, lalu integrasi model ekonomi (nowcasting dan analisis sensitivitas berbasis skenario) ke dalam dashboard.",
      "Pemanfaatan output model: proyeksi pertumbuhan ekonomi triwulanan dan estimasi perubahan indikator makro berdasarkan skenario, digunakan sebagai bahan analisis penyusunan KEM dan RKP.",
      "Mitra BPS: koordinasi perencanaan dan penganggaran statistik; penyediaan data dan indikator pembangunan (sejak RPJPN, RPJMN, RKP); penyusunan KEM dan analisis perekonomian; serta pemantauan dan evaluasi kegiatan statistik strategis.",
      "Mitra Kementerian Koordinator Bidang Perekonomian: koordinasi penetapan target pembangunan nasional (LPE, GNI per kapita, PMTB) dalam RPJMN dan RKP; koordinasi perumusan kebijakan dan dorongan pertumbuhan ekonomi triwulanan; debottlenecking kebijakan ekonomi melalui Satgas P3M-PPE; serta koordinasi pengembangan Kawasan Ekonomi Khusus (KEK).",
      "Mitra GIZ — proyek Green Economic Recovery: Green Growth Diagnostic Framework (27 Desember 2023–31 Desember 2027) di tingkat nasional dan tiga provinsi percontohan (Bali, Kalimantan Timur, Kepulauan Riau), dengan tiga keluaran utama dan kegiatan nasional (Green IO, peningkatan kapasitas, peer-to-peer learning) serta kegiatan sub-nasional per provinsi.",
      "Mitra ADB: pelatihan Multiregional Input Output (MRIO, basis data 62 negara dan 35 sektor) untuk mengukur integrasi Indonesia dalam Global Value Chain, dan pelatihan nowcasting untuk estimasi indikator makroekonomi periode berjalan.",
    ],
    note: "Gambar 2.7 (Proses Bisnis Penyusunan Kerangka Ekonomi Makro) berada pada PDF file hlm. 85 (dokumen 79) dan hanya tersedia sebagai gambar — tidak ada teks diagram yang dapat diekstrak; seluruh langkah di atas berasal dari narasi hlm. 83–94.",
  },
  {
    id: "pfmsk",
    unit: "Direktorat PFMSK",
    pages: "95–103 (dokumen 89–97)",
    summary:
      "Direktorat PFMSK menyusun dan mengoordinasikan Kerangka Ekonomi Makro di bidang fiskal, moneter, dan sektor keuangan — sasaran dan arah kebijakan fiskal, asumsi moneter, serta pemetaan kondisi sektor keuangan — yang menjadi acuan KEM-PPKF, RAPBN, dan penetapan postur makro fiskal.",
    steps: [
      "Pengumpulan dan pengolahan data makroekonomi terkini secara terintegrasi: sisi fiskal (realisasi penerimaan perpajakan, PNBP, belanja negara, transfer ke daerah, pembiayaan, postur defisit, dan rasio utang terhadap PDB); sisi moneter (inflasi, nilai tukar Rupiah, suku bunga, likuiditas); sisi sektor keuangan (kinerja intermediasi perbankan, pertumbuhan kredit, ketahanan dan inklusi sistem keuangan).",
      "Penyusunan skenario proyeksi berlapis: skenario dasar (baseline), skenario optimis, dan skenario pesimis; metodologi mencakup pemodelan ekonometrik, analisis sensitivitas variabel makro fiskal-moneter, simulasi postur makro fiskal, serta kalibrasi dengan data historis dan konsensus proyeksi lembaga internasional.",
      "Pembaruan skenario secara berkala setiap triwulan dengan mempertimbangkan realisasi terkini dan perkembangan ekonomi.",
      "Koordinasi dengan Kementerian Keuangan: keselarasan KEM RKP dan KEM-PPKF/Nota Keuangan APBN — sasaran penerimaan negara, arah belanja negara, strategi pembiayaan APBN (pengelolaan defisit dan inovasi pembiayaan), serta penyiapan resource envelope.",
      "Koordinasi dengan Bank Indonesia: penyelarasan bauran kebijakan moneter, makroprudensial, dan sistem pembayaran dengan kerangka perencanaan makro (asumsi dasar, efektivitas transmisi ke sektor riil, penguatan intermediasi perbankan pada sektor prioritas dan UMKM); penetapan sasaran inflasi bersama BI dan K/L anggota Tim Pengendalian Inflasi Pusat.",
      "Koordinasi dengan OJK: memastikan kondisi dan arah kebijakan sektor keuangan tercermin dalam KEM — ketahanan sistem keuangan, tren pertumbuhan kredit dan pembiayaan perbankan, peran lembaga keuangan non-bank dan pasar modal, instrumen keuangan berbasis teknologi, serta perluasan inklusi keuangan.",
      "Integrasi seluruh hasil koordinasi menjadi satu kesatuan KEM yang selaras dan terpadu, lalu dituangkan ke dalam dokumen RKP sebagai acuan penyusunan KEM-PPKF dan RAPBN.",
      "Pemantauan dan evaluasi triwulanan realisasi asumsi makro fiskal, moneter, dan sektor keuangan, disertai pemutakhiran skenario (rolling forecast) bila terjadi deviasi signifikan.",
      "Upaya transformatif dan inovatif: eksplorasi pelembagaan Forum Sinergi Makro Pembangunan sebagai ruang dialog otoritas fiskal, moneter, dan sektor keuangan dengan pelibatan Bappenas, didukung dashboard pemantauan berbasis AI, model ekonomi, dan rancangan teknokratik (white paper).",
      "Mitra: Kementerian Keuangan (mitra kerja dan mitra anggaran; penyelarasan Renstra-Renja dengan RPJMN-RKP; koordinasi UU P2SK), Bank Indonesia (forum bauran kebijakan, TPIP, EWS Inflasi, PINISI, insentif likuiditas makroprudensial), Kemenko Perekonomian (Ketua TPIP), OJK, LPS, kantor vertikal K/L di daerah dan pemerintah daerah, serta mitra pembangunan internasional (World Bank, ADB, Prospera).",
    ],
    note: "Gambar 2.8 (Proses Bisnis Direktorat PFMSK) berada pada PDF file hlm. 95 (dokumen 89) dan hanya tersedia sebagai gambar — tidak ada teks diagram yang dapat diekstrak; langkah di atas berasal dari narasi hlm. 96–103.",
  },
  {
    id: "phkei",
    unit: "Direktorat PHKEI",
    pages: "104–108 (dokumen 98–102)",
    summary:
      "Direktorat PHKEI (Permen PPN/Kepala Bappenas No. 2 Tahun 2025) melaksanakan koordinasi dan perumusan kebijakan, sinkronisasi pelaksanaan kebijakan, pemantauan, evaluasi, pengendalian, serta penyusunan prakarsa strategis pembangunan lintas sektor di bidang hilirisasi dan kerja sama ekonomi internasional.",
    steps: [
      "Pelaksanaan fungsi diwujudkan melalui penyusunan arah kebijakan, strategi, dokumen perencanaan pembangunan, prakarsa strategis, koordinasi lintas sektor, serta pemantauan, evaluasi, dan pengendalian pembangunan.",
      "Bidang hilirisasi: penyusunan arah kebijakan dan strategi hilirisasi nasional berbasis pendekatan rantai nilai (value chain) terintegrasi dari hulu hingga hilir; melalui kajian strategis, white paper, analisis sektoral dan lintas sektor, identifikasi komoditas prioritas, serta perumusan rekomendasi kebijakan (investasi, teknologi, infrastruktur, pembiayaan, SDM, kelembagaan, regulasi).",
      "Hasil kajian menjadi masukan substansi dokumen perencanaan pembangunan (RPJMN dan RKP) termasuk Kerangka Ekonomi Makro, serta dasar koordinasi lintas sektor untuk keterpaduan kebijakan hilirisasi.",
      "Bidang kerja sama ekonomi internasional: penyusunan substansi dokumen perencanaan, pengembangan prakarsa strategis dan model inovatif, koordinasi percepatan penyelesaian isu pembangunan, koordinasi kerja sama internasional untuk peningkatan investasi dan perdagangan, serta pemantauan, evaluasi, dan pengendalian pembangunan.",
      "Mekanisme: kerja sama bilateral, regional, dan multilateral; pemanfaatan skema pendanaan pembangunan; kerja sama kelembagaan; partisipasi pada forum kerja sama ekonomi internasional.",
      "Fungsi pengendalian: pemantauan, evaluasi, dan pengendalian bersama K/L pengampu, unit kerja mitra Bappenas, dan mitra pembangunan; hasilnya menjadi umpan balik penyempurnaan dokumen perencanaan, penyusunan prakarsa strategis, penyusunan Lampiran Pidato Kenegaraan Presiden sesuai bidang yang diampu, serta rekomendasi kebijakan.",
      "Inovasi: penyusunan White Paper Komoditas Hilirisasi sebagai instrumen evidence-based planning; pengembangan Masterplan Ekosistem Hilirisasi Nasional; penerapan pendekatan Financial Programming and Policies (FPP); dan pengembangan basis data hilirisasi.",
      "Mitra K/L: Kemenko Perekonomian, Kementerian Perindustrian, Kementerian Investasi dan Hilirisasi/BKPM, Kementerian Perdagangan, Kementerian Luar Negeri, Kementerian ESDM, Kementerian Kelautan dan Perikanan, Kementerian Pertanian, Danantara Indonesia, dan Badan Pengelola Industri Mineral (BIM).",
      "Mitra pembangunan: World Bank, ADB, UNIDO, OECD, FAO, dan IsDB. Mitra bilateral/regional/multilateral: ASEAN, DFAT Australia, Global Affairs Canada, SESRIC, COMCEC, dan OKI.",
    ],
    note: "Gambar 2.9 (Proses Bisnis Hilirisasi dan Kerjasama Ekonomi Internasional) berada pada PDF file hlm. 104 (dokumen 98) dan hanya tersedia sebagai gambar — tidak ada teks diagram yang dapat diekstrak; langkah di atas berasal dari narasi hlm. 105–108.",
  },
  {
    id: "p4t",
    unit: "Direktorat P4T",
    pages: "109–112 (dokumen 103–106)",
    summary:
      "Direktorat P4T (Permen PPN No. 2 Tahun 2025) melaksanakan koordinasi dan perumusan kebijakan, sinkronisasi pelaksanaan kebijakan, pemantauan, evaluasi, serta penyusunan prakarsa strategis lintas sektor dalam rangka peningkatan produktivitas dan pembangunan tematik (ekonomi hijau, biru, dan oranye).",
    steps: [
      "Tahap pertama: identifikasi sasaran utama visi Indonesia, 8 misi pembangunan, 17 arah pembangunan, dan 45 indikator utama pembangunan dalam RPJPN 2025–2045, serta identifikasi dan penelaahan analisis sektoral eksisting dari K/L, pemerintah daerah, dan dokumen kajian relevan.",
      "Tahap kedua: analisis dan pengayaan intervensi dari perspektif Peningkatan Produktivitas dan Pembangunan Tematik melalui pendekatan kuantitatif dan kualitatif untuk mengidentifikasi tantangan, peluang, kesenjangan kebijakan, area prioritas, serta kebutuhan penguatan intervensi.",
      "Tahap ketiga: perumusan intervensi kebijakan strategis untuk menjawab permasalahan dan tantangan pembangunan, termasuk penyusunan rekomendasi program, kegiatan, dan proyek prioritas.",
      "Tahap keempat: integrasi intervensi kebijakan melalui koordinasi dan sinkronisasi dengan K/L terkait sehingga perspektif produktivitas dan pembangunan tematik terakomodasi dalam prioritas, program, kegiatan, dan proyek pembangunan nasional.",
      "Rekomendasi kebijakan menjadi masukan penyusunan dokumen perencanaan (RKP, RPJMN, dan program prioritas lainnya) untuk diimplementasikan melalui mekanisme perencanaan dan penganggaran.",
      "Pemantauan dan evaluasi untuk mengukur efektivitas pelaksanaan, mengidentifikasi hambatan, serta menghasilkan rekomendasi penyempurnaan kebijakan pada periode berikutnya.",
      "Upaya transformatif: penguatan Total Factor Productivity (TFP) dan pengembangan National Innovation System (NIS); koordinasi dengan BRIN untuk menjembatani kebutuhan dunia usaha dengan kapasitas riset dan inovasi; fasilitasi keterhubungan BRIN dengan pelaku usaha dari skala besar hingga mikro.",
      "Mitra K/L: Kemenko Perekonomian, Kemenko Bidang Pangan, KKP, Kementerian Pertanian, Kemendikdasmen, Kementerian Pendidikan Tinggi Sains dan Teknologi, Kementerian Perindustrian, Kementerian Investasi dan Hilirisasi/BKPM, Kementerian Perdagangan, Kementerian ESDM, Kementerian Ekonomi Kreatif/BEKRAF, BPS, dan BRIN.",
      "Mitra pembangunan: Asian Productivity Organization (APO), National Productivity Organization (NPO), dan Prospera.",
    ],
    note: "Gambar 2.10 (Proses Bisnis Direktorat Peningkatan Produktivitas dan Pembangunan Tematik) berada pada PDF file hlm. 109 (dokumen 103) dan hanya tersedia sebagai gambar — tidak ada teks diagram yang dapat diekstrak; langkah di atas berasal dari narasi hlm. 110–112.",
  },
  {
    id: "sitala",
    unit: "Direktorat Sitala Renbang",
    pages: "112–115 (dokumen 106–109)",
    summary:
      "Direktorat Sitala Renbang memastikan pelaksanaan koordinasi, sinkronisasi, dan integrasi penyusunan rencana pembangunan jangka panjang, jangka menengah, dan tahunan sesuai amanat UU Nomor 25 Tahun 2004 tentang Sistem Perencanaan Pembangunan Nasional dan peraturan turunannya.",
    steps: [
      "Penyusunan rencana berjalan sesuai amanat UU 25/2004 melalui proses penyusunan dan penetapan rencana: penyiapan rancangan awal, pendampingan musyawarah perencanaan pembangunan, serta penyusunan rancangan akhir rencana pembangunan.",
      "Menjaga keselarasan dan sinkronisasi antar dokumen perencanaan pembangunan serta memastikan keterlaksanaannya sesuai aturan yang berlaku.",
      "Koordinasi penyusunan Renstra K/L sesuai Perpres Nomor 80 Tahun 2025 tentang Penyusunan Rencana Strategis dan Rencana Kerja K/L: mengawal, memberikan penelaahan atas Renstra yang disusun K/L, dan menjaga keterpaduan serta sinkronisasi antar dokumen perencanaan.",
      "Inovasi — penyusunan Pedoman Penyusunan Peta Jalan sebagai acuan K/L dalam menyusun dokumen strategis (mengatasi tumpang tindih substansi, ketidakselarasan target, dan inkonsistensi antar dokumen perencanaan).",
      "Inovasi — digitalisasi penyusunan RKP melalui platform digital terintegrasi yang memungkinkan K/L dan pemangku kepentingan mengakses dokumen RKP melalui laman Bappenas, meningkatkan transparansi dan keterbukaan data.",
      "Mitra: Kementerian Sekretariat Negara (penetapan dan pengesahan regulasi dokumen perencanaan), Kementerian Dalam Negeri (sinkronisasi perencanaan pusat–daerah: RPJPN, RPJMN, RKP, Renstra K/L, RPJPD, RPJMD, RKPD), Kementerian Hukum (harmonisasi rancangan regulasi), Kementerian Keuangan (sinkronisasi perencanaan dan penganggaran), serta DPR RI (pembahasan dokumen perencanaan).",
    ],
    note: "Gambar 2.11 (Proses Bisnis Direktorat Sitala Renbang) berada pada PDF file hlm. 113 (dokumen 107) dan hanya tersedia sebagai gambar — tidak ada teks diagram yang dapat diekstrak; langkah di atas berasal dari narasi hlm. 112 dan 114–115.",
  },
  {
    id: "sekdep",
    unit: "Sekretariat Deputi PMP",
    pages: "116–117 (dokumen 110–111)",
    summary:
      "Sekretariat Deputi berperan sebagai penguat tata kelola dan transformasi organisasi dalam mendukung fungsi Kedeputian PMP sebagai think tank, enabler, dan pengendali pembangunan, melalui penerapan pendekatan terintegrasi Governance, Risk, Compliance, and Transformation (GRCT).",
    steps: [
      "Penerapan GRCT untuk memastikan sumber daya, proses bisnis, kinerja, risiko, dan perubahan organisasi dikelola secara efektif dalam mendukung pencapaian sasaran strategis Kedeputian.",
      "Governance: pengelolaan SDM, anggaran, tata laksana, dan teknologi informasi, penyempurnaan proses bisnis, penguatan manajemen kinerja, pengembangan kapasitas SDM, serta reformasi birokrasi.",
      "Risk: penerapan Sistem Pengendalian Intern Pemerintah (SPIP) melalui identifikasi, analisis, mitigasi, pemantauan, dan evaluasi risiko organisasi.",
      "Compliance: penyusunan dan pemutakhiran SOP, pengendalian internal, monitoring dan evaluasi, serta tindak lanjut hasil pengawasan agar seluruh unit kerja memiliki pedoman yang jelas dan akuntabel.",
      "Transformation: Sekretariat berperan sebagai governance enabler dengan tata kelola terintegrasi dan berbasis data untuk mendukung keputusan yang lebih cepat, akurat, dan adaptif.",
    ],
    note: "Gambar 2.12 (Proses Bisnis Sekretariat Deputi PMP) berada pada PDF file hlm. 117 (dokumen 111) dan hanya tersedia sebagai gambar dengan teks yang tidak dapat diekstrak; langkah di atas disusun dari narasi hlm. 116 dan uraian GRC hlm. 81–83, bukan dari isi diagram.",
  },
];
