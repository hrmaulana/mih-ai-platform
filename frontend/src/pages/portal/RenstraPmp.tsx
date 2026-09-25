import { useEffect, useMemo, useRef, useState } from "react";
import { renstraMeta, renstraSections } from "../../data/renstra/meta";
import { years, units, sdm } from "../../data/renstra/units";
import { iku, treeColumns } from "../../data/renstra/performance";
import { accordionSections } from "../../data/renstra/content";
import "./RenstraPmp.css";

const colors = ["#0e3b43", "#2f7f8c", "#6fa9b5", "#c08a22", "#8c6b3e", "#718889"];
const format = (n: number | string) => String(n).replace(".", ",");

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        element.classList.add("is-visible");
        observer.unobserve(element);
      }
    }, { threshold: 0.12 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`}>{children}</div>;
}

function CountUp({ value, reduced }: { value: number; reduced: boolean }) {
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { setShown(value); return; }
    let frame = 0; const start = performance.now(); const duration = 900;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setShown(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return <>{format(value % 1 ? shown.toFixed(1) : Math.round(shown))}</>;
}

function LineChart({ index, reduced }: { index: number; reduced: boolean }) {
  const data = iku[index].values; const x = (i: number) => 48 + i * 134; const y = (v: number) => 224 - ((v - 60) / 40) * 180;
  const points = data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return <svg className="renstra-chart-svg" viewBox="0 0 640 280" role="img" aria-label={`Grafik ${iku[index].name}, target 2025 sampai 2029`}>
    {[60,70,80,90,100].map(g => <g key={g}><line x1="48" x2="584" y1={y(g)} y2={y(g)} className="grid-line"/><text x="38" y={y(g)+4} textAnchor="end">{g}</text></g>)}
    {years.map((yr, i) => <text key={yr} x={x(i)} y="252" textAnchor="middle">{yr}</text>)}
    <polygon points={`48,224 ${points} 584,224`} className="chart-area" />
    <polyline key={index} points={points} className={`chart-line ${reduced ? "no-motion" : "draw"}`} />
    {data.map((v, i) => <g key={i} className={reduced ? "chart-point" : "chart-point reveal-point"} style={{ animationDelay: `${i * 90}ms` }}><circle cx={x(i)} cy={y(v)} r="5" className="chart-dot"/><text x={x(i)} y={y(v)-12} textAnchor="middle" className="chart-value">{format(v)}</text></g>)}
  </svg>;
}
function FundingChart({ hidden, reduced }: { hidden: Set<number>; reduced: boolean }) {
  const x = (i: number) => 96 + i * 112; const y = (v: number) => 270 - v * 2.05;
  return <svg className="renstra-chart-svg funding-svg" viewBox="0 0 640 320" role="img" aria-label="Grafik batang bertumpuk pagu indikatif per unit dan tahun dalam miliar rupiah">
    {[0,30,60,90,120].map(g => <g key={g}><line x1="48" x2="610" y1={y(g)} y2={y(g)} className="grid-line"/><text x="38" y={y(g)+4} textAnchor="end">{g}</text></g>)}
    {years.map((yr, j) => { let acc = 0; return <g key={yr}>{units.map((u, i) => { if (hidden.has(i)) return null; const v=u.values[j], top=acc+v; const el=<rect key={u.key} className={reduced ? "funding-bar no-motion" : "funding-bar"} x={x(j)-32} y={y(top)} width="64" height={Math.max(0,y(acc)-y(top))} fill={colors[i]}><title>{`${u.name} ${yr}: Rp${format(v.toFixed(2))} M`}</title></rect>; acc=top; return el; })}<text x={x(j)} y={y(acc)-8} textAnchor="middle" className="chart-value">{format(acc.toFixed(1))}</text><text x={x(j)} y="300" textAnchor="middle">{yr}</text></g>})}
  </svg>;
}
function AccordionSection({ section }: { section: typeof accordionSections[number] }) { return <section id={section.id}><Reveal><div className="renstra-wrap"><h2>{section.title}</h2><p className="sub">{section.intro}</p>{section.items.map(([title, body]) => <details key={title}><summary>{title}</summary><div className="details-body"><p>{body}</p></div></details>)}</div></Reveal></section>; }

export default function RenstraPmp() {
  const [theme, setTheme] = useState<"light"|"dark">("light"); const [ikuIndex, setIkuIndex] = useState(0); const [hidden, setHidden] = useState<Set<number>>(new Set()); const [focus, setFocus] = useState<string | null>(null); const [active, setActive] = useState("konteks"); const [progress, setProgress] = useState(0); const reduced = useReducedMotion();
  useEffect(() => { const onScroll=()=>{ const doc=document.documentElement; setProgress(doc.scrollHeight-doc.clientHeight ? doc.scrollTop/(doc.scrollHeight-doc.clientHeight)*100 : 0); let current="konteks"; renstraSections.forEach(([id])=>{const el=document.getElementById(id); if(el && el.getBoundingClientRect().top < 150) current=id;}); setActive(current); }; window.addEventListener("scroll",onScroll,{passive:true}); onScroll(); return()=>window.removeEventListener("scroll",onScroll); }, []);
  const related = useMemo(() => { if (!focus) return new Set<string>(); const result=new Set([focus]); const all=treeColumns.flatMap(c=>c.nodes); let changed=true; while(changed){changed=false; all.forEach(n=>{const parents=(n.parent||"").split(" "); if(parents.some(p=>result.has(p)) && !result.has(n.id)){result.add(n.id);changed=true;} if(result.has(n.id)) parents.forEach(p=>{if(p&&!result.has(p)){result.add(p);changed=true;}});});} return result; },[focus]);
  const toggleUnit=(i:number)=>setHidden(prev=>{const next=new Set(prev); if(next.has(i)) next.delete(i); else next.add(i); if(next.size===units.length) next.delete(i); return next;});
  return <div className="renstra-page" data-theme={theme}>
    <nav className="renstra-toc" aria-label="Daftar isi"><div className="renstra-wrap toc-inner">{renstraSections.map(([id,label])=><a key={id} href={`#${id}`} className={active===id?"on":""} aria-current={active===id?"location":undefined}>{label}</a>)}<button className="theme-toggle" onClick={()=>setTheme(t=>t==="light"?"dark":"light")} aria-label="Ganti tema" aria-pressed={theme==="dark"}>{theme==="light"?"◐":"☼"}</button></div><div className="progress" style={{width:`${progress}%`}} /></nav>
    <header className="renstra-hero"><div className="renstra-wrap"><div className="hero-stagger kicker">{renstraMeta.kicker}</div><h1 className="hero-stagger">{renstraMeta.title}</h1><p className="hero-stagger">{renstraMeta.intro}</p><div className="goals hero-stagger">{renstraMeta.goals.map((goal,i)=><div className="goal" key={goal}><b>Tujuan {i+1}</b>{goal}</div>)}</div><div className="facts hero-stagger">{renstraMeta.facts.map(f=>{const match=f.match(/^(\d+(?:[,.]\d+)?)/); const value=match ? Number(match[1].replace(",", ".")) : 0; return <div key={f}><strong>{match ? <CountUp value={value} reduced={reduced}/> : f.split(" ")[0]}</strong>{match ? f.substring(match[0].length) : f.substring(f.indexOf(" ")+1)}</div>;})}</div></div></header>
    {accordionSections.slice(0,1).map(s=><AccordionSection key={s.id} section={s}/>)}
    {accordionSections.slice(1,4).map(s=><AccordionSection key={s.id} section={s}/>)}
    <section id="organisasi"><Reveal><div className="renstra-wrap"><h2>Enam unit, satu mandat makro</h2><p className="sub">Berdasarkan Permen PPN/Kepala Bappenas No. 2 Tahun 2025. Pilih unit untuk menyorotnya di grafik pendanaan.</p><div className="units">{units.map((u,i)=><button className="unit" key={u.key} onClick={()=>{toggleUnit(i);document.getElementById("dana")?.scrollIntoView({behavior:reduced?"auto":"smooth"})}}><span className="sw" style={{background:colors[i]}}/><b>{u.name}</b><small>{u.description}</small></button>)}</div><h3>Kebutuhan pegawai belum terpenuhi</h3><p className="sub">Analisis Beban Kerja menunjukkan kekurangan 178 pegawai. Jabatan perencana paling terdampak.</p><div className="sdm">{sdm.map(row=><div className="sdm-row" key={row.label}><span>{row.label}</span><div className="track"><div className="fill" style={{width:`${row.value/96*100}%`}}/></div><b><CountUp value={row.value} reduced={reduced}/></b></div>)}</div><p className="src">Sumber: Renstra hlm. 21–22.</p></div></Reveal></section>
    <section id="pohon"><Reveal><div className="renstra-wrap"><h2>Pohon kinerja</h2><p className="sub">Ketuk kotak mana pun untuk melihat rantai sasaran dan indikator terkait.</p><div className={`tree ${focus?"has-focus":""}`}>{treeColumns.map(col=><div className="tree-col" key={col.title}><h4>{col.title}</h4>{col.nodes.map(node=><button key={node.id} className={`node ${related.has(node.id)?"hit":""}`} onClick={()=>setFocus(focus===node.id?null:node.id)} aria-pressed={focus===node.id}>{node.text}</button>)}</div>)}</div><p className="src">Sumber: Tabel 2.1, Renstra hlm. 36–37.</p></div></Reveal></section>
    {accordionSections.slice(4).map(s=><AccordionSection key={s.id} section={s}/>)}
    <section id="target"><Reveal><div className="renstra-wrap"><h2>Target IKU 2025–2029</h2><p className="sub">Empat IKU yang menjadi acuan Perjanjian Kinerja tahunan. Pilih indikator.</p><div className="tabs" role="group" aria-label="Pilih IKU">{iku.map((item,i)=><button key={item.name} className="tab" onClick={()=>setIkuIndex(i)} aria-pressed={ikuIndex===i}>{item.name}</button>)}</div><div className="chart"><LineChart index={ikuIndex} reduced={reduced}/></div><p className="sub">{iku[ikuIndex].note}</p><p className="src">Sumber: Tabel 3.3, Renstra hlm. 124–125.</p></div></Reveal></section>
    <section id="dana"><Reveal><div className="renstra-wrap"><h2>Kerangka pendanaan</h2><p className="sub">Pagu indikatif per unit kerja (Rupiah Murni), dalam miliar rupiah. Ketuk nama unit untuk menyembunyikan atau menampilkan.</p><div className="chart"><FundingChart hidden={hidden} reduced={reduced}/></div><div className="legend">{units.map((u,i)=><button key={u.key} onClick={()=>toggleUnit(i)} aria-pressed={!hidden.has(i)}><i style={{background:colors[i]}}/>{u.name.replace("Dit. ","")}</button>)}</div><p className="note"><b>Catatan verifikasi:</b> kolom “Total” per unit di tabel sumber tidak sama dengan jumlah lima tahunnya (misalnya Sekretariat Deputi tertulis Rp33,1 M, sedangkan penjumlahan per tahun sekitar Rp80,2 M). Grafik ini memakai angka per tahun. Total penjumlahan tahunan adalah Rp329,6 M, sedangkan tabel mencantumkan Rp383,6 M. Angka tidak dikoreksi secara diam-diam.</p><p className="src">Sumber: Bab 3.4, Renstra hlm. 132–144.</p></div></Reveal></section>
    <footer id="penutup"><div className="renstra-wrap"><h2>Penutup</h2><p>Renstra ini menjadi pedoman seluruh unit kerja di lingkungan Kedeputian PMP untuk memastikan pelaksanaan program dan pencapaian outcome yang mendukung visi, misi, dan sasaran strategis Kementerian PPN/Bappenas.</p><a className="download" href={renstraMeta.pdf} download>Unduh dokumen lengkap (PDF)</a><p className="src">Konten ringkas mengacu pada dokumen Renstra Deputi Bidang PMP 2025–2029.</p></div></footer>
    <button className="back-to-top" onClick={()=>window.scrollTo({top:0, behavior:reduced?"auto":"smooth"})} aria-label="Kembali ke atas">↑</button>
  </div>;
}
