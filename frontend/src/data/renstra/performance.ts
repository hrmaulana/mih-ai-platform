export type TreeNode = { id: string; text: string; parent?: string };
export const treeColumns: { title: string; nodes: TreeNode[] }[] = [
 { title: "Sasaran strategis Kementerian", nodes: [
  {id:"k1",text:"Dokumen perencanaan berkualitas, terukur, dan lengkap sebagai acuan pembangunan nasional"},
  {id:"k2",text:"Efektivitas pengendalian perencanaan dan pelaksanaan pembangunan"},
  {id:"k3",text:"Kebijakan percepatan dan responsivitas perencanaan atas isu nasional"},
  {id:"k4",text:"Kinerja dan layanan prima yang bersih, akuntabel, profesional"},
 ]},
 { title: "Indikator Kementerian", nodes: [
  {id:"i1",text:"Indeks Kualitas Perencanaan Pembangunan Nasional",parent:"k1"},
  {id:"i2",text:"Indeks Kinerja Pengendalian Perencanaan dan Pelaksanaan",parent:"k2"},
  {id:"i3",text:"Indeks Daya Tanggap Perencanaan Pembangunan Nasional",parent:"k3"},
  {id:"i4",text:"Tingkat Maturitas Tata Kelola Pemerintahan Baik",parent:"k4"},
  {id:"i5",text:"Indeks Kepuasan Pemangku Kepentingan",parent:"k4"},
 ]},
 { title: "Sasaran strategis Deputi", nodes: [
  {id:"d1",text:"Dokumen perencanaan berkualitas lingkup Perencanaan Makro",parent:"i1"},
  {id:"d2",text:"Kebijakan percepatan dan responsivitas lingkup Perencanaan Makro",parent:"i3"},
  {id:"d3",text:"Kinerja dan layanan prima lingkup Perencanaan Makro",parent:"i4 i5"},
 ]},
 { title: "IKU Deputi PMP", nodes: [
  {id:"q1",text:"Indeks Kualitas Perencanaan Lingkup PMP",parent:"d1"},
  {id:"q2",text:"Indeks Daya Tanggap Perencanaan Lingkup PMP",parent:"d2"},
  {id:"q3",text:"Tingkat Tata Kelola Internal Lingkup PMP",parent:"d3"},
  {id:"q4",text:"Indeks Kepuasan Stakeholder Lingkup PMP",parent:"d3"},
 ]},
];
export const iku = [
 { name:"Indeks Kualitas Perencanaan", values:[78,83,88,93,98], note:"Naik 5 poin per tahun, dari 78 menjadi 98. Program Perencanaan Pembangunan Nasional." },
 { name:"Indeks Daya Tanggap", values:[75,75,75,75,75], note:"Ditargetkan stabil di 75 sepanjang periode. Program Perencanaan Pembangunan Nasional." },
 { name:"Tata Kelola Internal", values:[86.5,88.75,91,93.25,95.5], note:"Naik 2,25 poin per tahun, dari 86,5 menjadi 95,5. Program Dukungan Manajemen." },
 { name:"Kepuasan Stakeholder", values:[92,94,96,98,100], note:"Naik 2 poin per tahun hingga 100 di 2029. Program Dukungan Manajemen." },
];
