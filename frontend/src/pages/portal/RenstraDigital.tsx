import { useEffect, useMemo, useRef, useState } from "react";
import { animate } from "animejs";
import { Link } from "react-router-dom";
import { iku, treeColumns } from "../../data/renstra/performance";
import { years, units, sdmGapTotal } from "../../data/renstra/units";
import { tableById } from "../../data/renstra/tables";
import { renstraMeta } from "../../data/renstra/meta";
import "./RenstraDigital.css";

const chapters = [
  ["mandat", "Mandat"], ["titik-berangkat", "Titik berangkat"], ["tantangan", "Tantangan"],
  ["respons", "Respons strategis"], ["pelaksanaan", "Pelaksanaan"], ["hasil", "Hasil"], ["dukungan", "Dukungan"], ["komitmen", "Komitmen"],
] as const;
const fundingRows = tableById.get("3.11")?.rows ?? [];
const parseSourceMoney = (value: string | undefined) => Number(value?.replace(/[^0-9]/g, "") || 0) / 1_000_000;
const fundingSourceRowByUnit: Record<string, string[] | undefined> = {
  setdep: fundingRows.find((row) => row[0].toLowerCase().includes("sekretariat")),
  pempmp: fundingRows.find((row) => row[0].toLowerCase().includes("pempmp")),
  pfmsk: fundingRows.find((row) => row[0].toLowerCase().includes("pfmsk")),
  phkei: fundingRows.find((row) => row[0].toLowerCase().includes("phkei")),
  p4t: fundingRows.find((row) => row[0].toLowerCase().includes("p4t")),
  sitala: fundingRows.find((row) => row[0].toLowerCase().includes("sitala")),
};
const fundingByUnit: Record<string, number> = Object.fromEntries(
  Object.entries(fundingSourceRowByUnit).map(([key, row]) => [key, parseSourceMoney(row?.[6])]),
);
const moneyTotalBillion = Object.values(fundingByUnit).reduce((sum, value) => sum + value, 0);

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState<string>(chapters[0][0]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const doc = document.documentElement;
        setProgress(doc.scrollHeight > doc.clientHeight ? (doc.scrollTop / (doc.scrollHeight - doc.clientHeight)) * 100 : 0);
        let current: string = chapters[0][0];
        chapters.forEach(([id]) => {
          const node = document.getElementById(`rd-${id}`);
          if (node && node.getBoundingClientRect().top < 180) current = id;
        });
        setActive(current);
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  return { progress, active };
}

function useEntranceAnimations(reduced: boolean) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const settleStaticContent = () => {
      element.querySelectorAll<HTMLElement>("[data-rd-reveal] [data-rd-animate]").forEach((node) => { node.style.opacity = "1"; node.style.transform = "none"; });
      element.querySelectorAll<HTMLElement>(".rd-bar-fill").forEach((node) => { node.style.width = node.dataset.width ?? "100%"; });
      element.querySelectorAll<HTMLElement>(".rd-fund-fill").forEach((node) => { node.style.height = node.dataset.height ?? "0%"; });
    };
    if (reduced || !("IntersectionObserver" in window)) { settleStaticContent(); return; }
    const animations: Array<{ complete: () => void }> = [];
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = entry.target as HTMLElement;
        target.dataset.animated = "true";
        const cards = target.querySelectorAll<HTMLElement>("[data-rd-animate]");
        if (cards.length) {
          const animation = animate(cards, {
            opacity: [0, 1], translateY: [18, 0], delay: (_el?: import("animejs").Target, i = 0) => i * 75,
            duration: 600, ease: "outCubic",
          });
          animations.push(animation);
        }
        const bars = target.querySelectorAll<HTMLElement>(".rd-bar-fill, .rd-fund-fill");
        bars.forEach((bar) => {
          const width = bar.dataset.width ?? "100%";
          const height = bar.dataset.height ?? "100%";
          const animation = animate(bar, bar.classList.contains("rd-fund-fill") ? {
            height: ["0%", height], duration: 850, ease: "outCubic",
          } : {
            width: ["0%", width], duration: 850, ease: "outCubic",
          });
          animations.push(animation);
        });
        observer.unobserve(target);
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    element.querySelectorAll<HTMLElement>("[data-rd-reveal]").forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.complete());
    };
  }, [reduced]);
  return root;
}

const unitFundingColors = ["#0e3b43", "#2f7f8c", "#6fa9b5", "#c08a22", "#8c6b3e", "#718889"];

function FundingChart({ reduced }: { reduced: boolean }) {
  const max = Math.max(...yearsFundingTotals, 1);
  return <figure className="rd-funding-figure" aria-labelledby="rd-funding-caption">
    <figcaption id="rd-funding-caption">Alokasi tahunan per unit kerja (miliar rupiah)</figcaption>
    <ul className="rd-funding-legend" aria-label="Legenda unit kerja" role="list">{units.map((unit, i) => <li key={unit.key}><i style={{ background: unitFundingColors[i] }} />{unit.name}</li>)}</ul>
    <div className="rd-funding" role="img" aria-label="Grafik batang bertumpuk alokasi tahunan, angka per segmen dijelaskan dalam tabel setelah grafik">
    {annualFundingRows.map(({ year, values, total }) => <div className="rd-fund-col" key={year}>
      <div className="rd-fund-stack" aria-label={`${year}: Rp${total.toFixed(1).replace(".", ",")} M`}>
        {values.map((value, i) => {
          const height = (value / max) * 100;
          return <i key={i} className="rd-fund-fill" title={`${units[i].name}: Rp${value.toFixed(2).replace(".", ",")} M`} data-height={`${height}%`} style={{ height: reduced ? `${height}%` : "0%", background: unitFundingColors[i] }} />;
        })}
      </div><small>{year}</small><b>Rp{total.toFixed(1).replace(".", ",")} M</b>
    </div>)}
    </div>
    <div className="rd-funding-data" role="table" aria-label="Data alokasi pendanaan tahunan per unit dalam miliar rupiah">
      <div role="row" className="rd-funding-data-row"><b role="columnheader">Tahun</b>{units.map((unit) => <b role="columnheader" key={unit.key}>{unit.name}</b>)}</div>
      {annualFundingRows.map(({ year, values }) => <div role="row" className="rd-funding-data-row" key={year}><b role="rowheader">{year}</b>{values.map((value, i) => <span role="cell" key={units[i].key}>Rp{value.toFixed(2).replace(".", ",")} M</span>)}</div>)}
    </div>
  </figure>;
}

const annualFundingRows = years.map((year, yearIndex) => {
  const values = units.map((unit) => parseSourceMoney(fundingSourceRowByUnit[unit.key]?.[yearIndex + 1]));
  return { year, values, total: values.reduce((sum, value) => sum + value, 0) };
});
const yearsFundingTotals = annualFundingRows.map(({ total }) => total);

function IkuChart({ index }: { index: number }) {
  const data = iku[index];
  const x = (i: number) => 64 + i * 135;
  const y = (value: number) => 215 - ((value - 60) / 40) * 160;
  const points = data.values.map((value, i) => `${x(i)},${y(value)}`).join(" ");
  return <div className="rd-chart"><svg viewBox="0 0 680 280" role="img" aria-label={`Target ${data.name}, tahun 2025 sampai 2029`}>
    {[60, 70, 80, 90, 100].map((value) => <g key={value}><line x1="64" x2="604" y1={y(value)} y2={y(value)} stroke="#d5dedd"/><text x="52" y={y(value) + 4} textAnchor="end" fill="#56696d" fontSize="12">{value}</text></g>)}
    {data.values.map((value, i) => <g key={i}><circle cx={x(i)} cy={y(value)} r="6" fill="#2f7f8c"/><text x={x(i)} y={y(value) - 15} textAnchor="middle" fill="#16282c" fontSize="13">{String(value).replace(".", ",")}</text><text x={x(i)} y="250" textAnchor="middle" fill="#56696d" fontSize="12">{2025 + i}</text></g>)}
    <polyline points={points} fill="none" stroke="#0e3b43" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </svg></div>;
}

export default function RenstraDigital() {
  const reduced = useReducedMotion();
  const rootRef = useEntranceAnimations(reduced);
  const { progress, active } = useScrollProgress();
  const [ikuIndex, setIkuIndex] = useState(0);
  const [unitIndex, setUnitIndex] = useState<number | null>(null);
  const related = useMemo(() => (unitIndex === null ? null : units[unitIndex] ?? null), [unitIndex]);

  return (
    <div className="renstra-digital" ref={rootRef}>
      <nav className="rd-nav" aria-label="Navigasi Renstra Digital">
        <div className="rd-wrap rd-nav-inner">
          {chapters.map(([id, label]) => <a key={id} href={`#rd-${id}`} aria-current={active === id ? "location" : undefined}>{label}</a>)}
          <Link className="rd-compare" to="/renstra-pmp">Bandingkan versi lama</Link>
        </div>
        <div className="rd-progress" style={{ width: `${progress}%` }} />
      </nav>

      <header className="rd-hero" id="rd-mandat">
        <div className="rd-wrap">
          <p className="rd-kicker">{renstraMeta.kicker} · Versi digital</p>
          <h1>Merancang arah.<br/>Mengawal perubahan.</h1>
          <p className="rd-hero-copy">Kedeputian Perencanaan Makro Pembangunan menghubungkan analisis makro, kebijakan lintas sektor, dan pengendalian pembangunan—agar arah nasional diterjemahkan menjadi rencana yang konsisten, terukur, dan adaptif.</p>
          <div className="rd-goals" data-rd-reveal>
            {renstraMeta.goals.map((goal, i) => <article className="rd-goal" data-rd-animate key={goal}><b>Tujuan {i + 1}</b>{goal}</article>)}
          </div>
          <div className="rd-flow" data-rd-reveal aria-label="Siklus perencanaan dan pengendalian pembangunan">
            {["Analisis makro", "Arah kebijakan", "Rencana lintas sektor", "Pelaksanaan", "Pemantauan & evaluasi"].map((step, i) => <div className="rd-flow-item" data-rd-animate key={step}><b>0{i + 1}</b>{step}</div>)}
          </div>
          <p className="rd-source">Periode 2025–2029 · Tahap awal RPJPN 2025–2045 · <a href={renstraMeta.pdf} target="_blank" rel="noreferrer">Buka dokumen Renstra</a></p>
        </div>
      </header>

      <section className="rd-section" id="rd-titik-berangkat">
        <div className="rd-wrap">
          <p className="rd-eyebrow">01 / Fondasi</p><h2>Ada kemajuan. Ada pekerjaan yang perlu dilanjutkan.</h2>
          <p className="rd-lead">Pemulihan ekonomi dan perbaikan sejumlah indikator menjadi pijakan. Evaluasi periode sebelumnya sekaligus menegaskan pentingnya memperkuat hubungan antara output, outcome, dan sasaran pembangunan.</p>
          <div className="rd-grid" data-rd-reveal>
            <article className="rd-card" data-rd-animate><strong className="rd-card-number">5,03%</strong><h3>Pertumbuhan ekonomi</h3><p>Capaian nasional pada 2024 setelah pemulihan pascapandemi.</p></article>
            <article className="rd-card" data-rd-animate><strong className="rd-card-number">8,57%</strong><h3>Tingkat kemiskinan</h3><p>Menurun dibanding 10,19% pada 2020.</p></article>
            <article className="rd-card" data-rd-animate><strong className="rd-card-number">69%</strong><h3>Indikator membaik</h3><p>Sekitar 69% indikator agenda pembangunan menunjukkan peningkatan kinerja.</p></article>
          </div>
          <div className="rd-callout">Evaluasi Renstra menekankan perlunya sasaran yang lebih terukur, integrasi data, pengendalian pada level outcome, dan pemanfaatan hasil evaluasi untuk memperbaiki kebijakan.</div>
          <p className="rd-source">Sumber: Renstra Bab I, PDF file hlm. 9–12 (hlm. dokumen 3–6); Tabel 1.1.</p>
        </div>
      </section>

      <section className="rd-section" id="rd-tantangan">
        <div className="rd-wrap">
          <p className="rd-eyebrow">02 / Diagnosis</p><h2>Lingkungan berubah; perencanaan harus lebih adaptif.</h2>
          <p className="rd-lead">Ketidakpastian geopolitik, perlambatan global, perubahan iklim, transformasi digital, tekanan fiskal, dan tantangan sosial-ekonomi menambah kompleksitas pembangunan 2025–2029.</p>
          <div className="rd-grid" data-rd-reveal>
            <article className="rd-card" data-rd-animate><h3>Transformasi struktural</h3><p>Produktivitas, nilai tambah industri, pemerataan wilayah, dan penciptaan kerja produktif perlu terus didorong.</p></article>
            <article className="rd-card" data-rd-animate><h3>Integrasi kebijakan</h3><p>Konsistensi target dan dokumen lintas sektor serta pusat-daerah memerlukan orkestrasi yang kuat.</p></article>
            <article className="rd-card" data-rd-animate><h3>Kapasitas pelaksanaan</h3><p>Integrasi data, proses digital, pengendalian, dan tata kelola perlu ditingkatkan agar keputusan lebih tepat waktu.</p></article>
          </div>
          <h3>Modal PMP untuk merespons</h3>
          <div className="rd-pills" data-rd-reveal>{["Mandat integrasi lintas K/L", "Pemodelan ekonomi makro", "Jejaring koordinasi", "Data & evidence-based planning", "Pengawalan Renstra K/L"].map((item) => <span className="rd-pill" data-rd-animate key={item}>{item}</span>)}</div>
          <p className="rd-source">Sumber: Renstra Bab I, PDF file hlm. 13–23 (hlm. dokumen 7–17), khususnya Tabel 1.3.</p>
        </div>
      </section>

      <section className="rd-section" id="rd-respons">
        <div className="rd-wrap">
          <p className="rd-eyebrow">03 / Pilihan strategi</p><h2>Fokus pada integrasi, respons, dan transformasi.</h2>
          <p className="rd-lead">Strategi PMP menghubungkan analisis dengan keputusan, memastikan konsistensi rencana dengan anggaran, serta menjaga ruang respons terhadap isu nasional.</p>
          <div className="rd-grid" data-rd-reveal>
            <article className="rd-card" data-rd-animate><h3>Rumuskan arah makro</h3><p>Susun kerangka ekonomi makro nasional dan daerah serta postur makro fiskal yang diperbarui mengikuti kondisi terkini.</p></article>
            <article className="rd-card" data-rd-animate><h3>Selaraskan rencana</h3><p>Jaga cascading sasaran dan konsistensi RPJPN, RPJMN, RKP, Renstra K/L, serta perencanaan pusat-daerah.</p></article>
            <article className="rd-card" data-rd-animate><h3>Percepat transformasi</h3><p>Dorong agenda hilirisasi, produktivitas, ekonomi hijau/biru/oranye, dan prakarsa lintas sektor.</p></article>
            <article className="rd-card" data-rd-animate><h3>Kendalikan berbasis bukti</h3><p>Perkuat pemantauan, evaluasi, manajemen risiko, dan umpan balik kebijakan berbasis data.</p></article>
            <article className="rd-card" data-rd-animate><h3>Perkuat organisasi</h3><p>Tingkatkan tata kelola, kapasitas SDM, manajemen pengetahuan, dan proses kerja digital.</p></article>
          </div>
          <details className="rd-details"><summary>Lihat strategi dan rencana aksi pada tabel sumber</summary><p>Tabel strategi pelaksanaan merinci rencana aksi lintas fungsi, antara lain koordinasi ADEM, postur makro fiskal, pengendalian inflasi, transformasi daerah, hilirisasi, produktivitas, dan sinkronisasi dokumen perencanaan.</p><p className="rd-source">Sumber: Tabel 2.7–2.8, PDF file hlm. 63–73 (hlm. dokumen 57–67).</p></details>
        </div>
      </section>

      <section className="rd-section" id="rd-pelaksanaan">
        <div className="rd-wrap">
          <p className="rd-eyebrow">04 / Mesin pelaksanaan</p><h2>Enam unit, satu rantai kerja.</h2>
          <p className="rd-lead">Setiap unit membawa keahlian yang berbeda; proses bisnis menyatukannya dari analisis dan perumusan kebijakan hingga evaluasi dan perbaikan.</p>
          <div className="rd-pills" role="group" aria-label="Pilih unit kerja">{units.map((unit, i) => <button className="rd-pill" key={unit.key} aria-pressed={unitIndex === i} onClick={() => setUnitIndex(unitIndex === i ? null : i)}>{unit.name}</button>)}</div>
          {related ? <div className="rd-callout"><b>{related.name}.</b> {related.description}</div> : <div className="rd-callout">Pilih unit untuk melihat fokus kerjanya. Seluruh unit berkontribusi pada siklus perencanaan dan pengendalian bersama.</div>}
          <div className="rd-flow" data-rd-reveal>{["Analisis & data", "Perumusan kebijakan", "Koordinasi & sinkronisasi", "Pemantauan & evaluasi", "Umpan balik kebijakan"].map((step, i) => <div className="rd-flow-item" data-rd-animate key={step}><b>TAHAP 0{i + 1}</b>{step}</div>)}</div>
          <div className="rd-grid" data-rd-reveal>{units.map((unit) => <article className="rd-card" data-rd-animate key={unit.key}><h3>{unit.name}</h3><p>{unit.description}</p></article>)}</div>
          <p className="rd-source">Sumber: Renstra Bab 1.3 dan Bab 2.6, PDF file hlm. 25–29 dan 77–117 (hlm. dokumen 19–23 dan 71–111).</p>
        </div>
      </section>

      <section className="rd-section" id="rd-hasil">
        <div className="rd-wrap">
          <p className="rd-eyebrow">05 / Rantai hasil</p><h2>Dari sasaran bersama ke ukuran kinerja.</h2>
          <p className="rd-lead">Pohon kinerja menghubungkan sasaran kementerian dengan sasaran PMP. Empat IKU memberi ukuran yang dapat diikuti sepanjang 2025–2029.</p>
          <div className="rd-tree" data-rd-reveal>{treeColumns.map((column) => <div className="rd-tree-col" data-rd-animate key={column.title}><h3>{column.title}</h3>{column.nodes.map((node) => <div className="rd-tree-node" key={node.id}>{node.text}</div>)}</div>)}</div>
          <div className="rd-iku-tabs" role="group" aria-label="Pilih indikator kinerja">{iku.map((item, i) => <button key={item.name} onClick={() => setIkuIndex(i)} aria-pressed={ikuIndex === i}>{item.name}</button>)}</div>
          <IkuChart index={ikuIndex} />
          <p className="rd-lead">{iku[ikuIndex].note}</p>
          <p className="rd-source">Sumber: Tabel 2.1, Tabel 2.5–2.6, dan Tabel 3.3, PDF file hlm. 38, 55–63, 130 (hlm. dokumen 32, 49–57, 124).</p>
        </div>
      </section>

      <section className="rd-section" id="rd-dukungan">
        <div className="rd-wrap">
          <p className="rd-eyebrow">06 / Dukungan pelaksanaan</p><h2>Target perlu ditopang kapasitas dan sumber daya.</h2>
          <div className="rd-grid" data-rd-reveal>
            <article className="rd-card" data-rd-animate><strong className="rd-card-number">{sdmGapTotal}</strong><h3>Kesenjangan kebutuhan SDM</h3><p>Gap kebutuhan menurut Analisis Jabatan dan Analisis Beban Kerja pada tabel sumber.</p></article>
            <article className="rd-card" data-rd-animate><strong className="rd-card-number">{units.length}</strong><h3>Unit kerja</h3><p>Enam unit dengan peran yang saling melengkapi dalam satu mandat makro.</p></article>
            <article className="rd-card" data-rd-animate><strong className="rd-card-number">Rp{moneyTotalBillion.toFixed(1).replace(".", ",")} M</strong><h3>Total pendanaan indikatif</h3><p>Mengikuti penjumlahan kolom “Total” pada Tabel 3.11 sumber.</p></article>
          </div>
          <div className="rd-bars" data-rd-reveal>
            {units.map((unit) => {
              const value = fundingByUnit[unit.key] ?? 0;
              const percent = moneyTotalBillion ? (value / moneyTotalBillion) * 100 : 0;
              return <div className="rd-bar" data-rd-animate key={unit.key}><span>{unit.name}</span><div className="rd-bar-track"><i className="rd-bar-fill" data-width={`${percent}%`} style={{ width: reduced ? `${percent}%` : "0%" }} /></div><b>Rp{value.toFixed(1).replace(".", ",")} M</b></div>;
            })}
          </div>
          <p className="rd-source">Grafik dan total unit mengacu pada kolom Total Tabel 3.11; grafik tahunan mengikuti kolom alokasi tiap tahun pada tabel. Karena total per unit dan alokasi tahunan di sumber tidak sepenuhnya selaras, headline tetap mengikuti kolom Total. SDM: Tabel 1.5, PDF file hlm. 29–30 dan Tabel 3.11, PDF file hlm. 141 dst.</p>
          <div data-rd-reveal><FundingChart reduced={reduced} /></div>
          <details className="rd-details"><summary>Kerangka regulasi dan pengembangan SDM</summary><p>Rencana mencakup pemenuhan dan pengembangan SDM, manajemen risiko dan tata kelola, serta regulasi pendukung sinkronisasi perencanaan dan penganggaran.</p><p className="rd-source">Sumber: Bab 1.3.2, Bab 2.5, dan Bab 2.6.</p></details>
        </div>
      </section>

      <footer className="rd-close" id="rd-komitmen">
        <div className="rd-wrap">
          <p className="rd-eyebrow">07 / Komitmen</p><h2>Menyatukan arah, menjaga konsistensi, mengawal hasil.</h2>
          <p>Renstra 2025–2029 menjadi komitmen bersama untuk memperkuat perencanaan makro yang terintegrasi, berbasis bukti, dan responsif terhadap perubahan—dalam mendukung sasaran pembangunan nasional menuju Indonesia Emas 2045.</p>
          <p><a href={renstraMeta.pdf} target="_blank" rel="noreferrer">Unduh dokumen Renstra lengkap (PDF) ↗</a></p>
          <p><Link to="/renstra-pmp">Bandingkan dengan halaman Renstra saat ini</Link></p>
        </div>
      </footer>
      <button className="rd-top" aria-label="Kembali ke atas" onClick={() => window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" })}>↑</button>
    </div>
  );
}

