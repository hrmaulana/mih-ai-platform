export type Unit = { key: string; name: string; description: string; values: number[] };
export const years = [2025, 2026, 2027, 2028, 2029] as const;
export const units: Unit[] = [
  { key: "setdep", name: "Sekretariat Deputi", description: "Dukungan manajemen, tata kelola internal, dan administrasi kedeputian.", values: [11.85, 17.61, 18.07, 15.77, 16.90] },
  { key: "pempmp", name: "Dit. Ekonomi Makro & Model Pembangunan", description: "Kerangka ekonomi makro nasional-daerah dan pengembangan model pembangunan.", values: [3.81, 5.13, 6.50, 19.31, 17.75] },
  { key: "pfmsk", name: "Dit. Fiskal, Moneter & Sektor Keuangan", description: "Perencanaan kebijakan fiskal, moneter, dan sektor keuangan.", values: [1.63, 5.59, 7.00, 19.92, 18.21] },
  { key: "phkei", name: "Dit. Hilirisasi & Kerja Sama Ekonomi Internasional", description: "Perencanaan hilirisasi pendukung PKPN dan kerja sama ekonomi internasional.", values: [2.02, 5.33, 6.25, 12.78, 13.69] },
  { key: "p4t", name: "Dit. Produktivitas & Pembangunan Tematik", description: "Peningkatan produktivitas dan perencanaan pembangunan tematik.", values: [0.36, 4.76, 6.49, 16.19, 17.35] },
  { key: "sitala", name: "Dit. Sinergi & Tata Kelola Perencanaan", description: "Desain proses dokumen perencanaan, integrasi PKPN, dan manajemen data.", values: [0.05, 4.28, 7.00, 23.17, 24.83] },
];

/** Kekurangan pegawai terbesar menurut Tabel 1.5 (file hlm. 29–30). Total gap 178 pegawai. */
export const sdmGapTotal = 178;
export const sdm = [
  { label: "Perencana Ahli Muda", value: 49 },
  { label: "Perencana Ahli Madya", value: 33 },
  { label: "Jabatan fungsional & pelaksana lainnya", value: 96 },
];

/** Rencana pengembangan SDM 2025–2029 (Renstra file hlm. 32–36). */
export const sdmPlan = [
  {
    title: "Core Value PMP",
    detail: "Pengembangan SDM berlandaskan 2 nilai dasar: ASN BerAKHLAK (Berorientasi Pelayanan, Akuntabel, Kompeten, Harmonis, Loyal, Adaptif, Kolaboratif) dan PMP Standard Competencies.",
  },
  {
    title: "Penataan dan Pemenuhan Kebutuhan SDM",
    detail: "Berdasarkan hasil Analisis Jabatan dan Analisis Beban Kerja dengan memprioritaskan jenis serta jenjang jabatan yang masih mengalami kesenjangan; data kepegawaian dikelola melalui satu kanal informasi (Dashboard). Pemenuhan gap dilakukan melalui pengusulan formasi, penempatan ASN, serta dukungan tenaga non-ASN sesuai SOP yang berlaku.",
  },
  {
    title: "Pengembangan Karier dan Manajemen Talenta",
    detail: "Diarahkan untuk mendukung peningkatan jenjang jabatan, kaderisasi, dan penyiapan pegawai yang mampu menjalankan peran strategis dan koordinatif, didukung penyusunan Individual Development Plan (IDP).",
  },
  {
    title: "Monitoring dan Evaluasi Pengembangan SDM",
    detail: "Menilai kesesuaian kebutuhan organisasi, pemenuhan pegawai, pelaksanaan IDP, peningkatan kompetensi, dan pencapaian kinerja; hasilnya menjadi dasar pembaruan rencana kebutuhan dan program pengembangan SDM.",
  },
  {
    title: "Pendidikan",
    detail: "Prioritas pada bidang ekonomi dan keilmuan relevan (ekonomi makro, ekonomi pembangunan, statistik, pemodelan, analisis data) dengan mempertimbangkan kesenjangan kompetensi, kebutuhan jabatan, dan rencana pengembangan karier.",
  },
  {
    title: "Tenaga non-ASN",
    detail: "Telah dilakukan pengangkatan 31 orang tenaga non-ASN melalui skema konsultan dan tenaga alih daya; keberadaannya merupakan dukungan operasional dan tidak menggantikan kebutuhan formasi ASN berdasarkan Analisis Jabatan dan Analisis Beban Kerja.",
  },
];
