import { pool } from "../db";
import { config } from "../config";
import { generateAnswerDenganUsage, streamAnswer, tulisUlangKueri, type ChatTurn } from "./llm";
import { embedTexts } from "./embeddings";
import { decideAbstainKalibrasi, lexicalScore, pecahKalimat, perluTulisUlang, rrfFuseBanyak, skorMaxSim, varianKueri, varianSinonim } from "./retrieval";
import { bobotDariEnv, cakupanToken, pilihRerank } from "./rerank";

export interface Citation {
  label: number;
  document_id: number;
  filename: string;
  file_type: string;
  page_or_slide: number | null;
  section_title: string | null;
}

export interface SearchRow {
  document_id: number;
  filename: string;
  file_type: string;
  page_or_slide: number | null;
  section_title: string | null;
  content: string;
  label: number;
}

export interface SearchResult {
  labeled: SearchRow[];
  context: string;
  isComparison: boolean;
  /** Kemiripan vektor terbaik (0..1); null bila jalur webhook (skor tidak diketahui). */
  bestScore?: number | null;
  /** Cakupan leksikal terbaik (0..1) — dasar kalibrasi abstain. */
  lexScore?: number;
  /** Porsi token penting pertanyaan yang muncul di konteks terbaik (0..1). */
  cakupan?: number;
}

export function extractCitedIndices(answer: string): Set<number> {
  const set = new Set<number>();
  const re = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer))) set.add(Number(m[1]));
  return set;
}

// Deteksi pertanyaan perbandingan/ber-entities ganda agar retriever
// mengambil konteks dari KEDUA sisi (mis. "RKP 2026 dan 2027").
const COMPARISON_RE =
  /(?:perbandingan|bandingkan|membandingkan|dibanding(?:kan)?|vs\.?|versus|perbedaan|selisih)/i;

export function extractYears(question: string): Set<number> {
  const set = new Set<number>();
  for (const m of question.matchAll(/\b(19|20)\d{2}\b/g)) set.add(Number(m[0]));
  return set;
}

export function isComparisonQuery(question: string): boolean {
  return COMPARISON_RE.test(question) || extractYears(question).size >= 2;
}

// Augmentasi query retrieval dengan pertanyaan user terakhir dari history.
// Follow-up yang referensial ("jelaskan poin kedua") kehilangan konteks dokumen
// bila hanya di-embed sendirian; menggabungkannya dengan pertanyaan sebelumnya
// membuat retrieval tetap mengarah ke dokumen yang sama dengan turn awal.
export function buildRetrievalQuery(question: string, history: ChatTurn[]): string {
  const lastUser = [...history].reverse().find((t) => t.role === "user");
  if (!lastUser) return question;
  return `${question} ${lastUser.content}`;
}

function capPerDocument(rows: any[], maxPerDoc: number): any[] {
  const perDoc = new Map<number, number>();
  const out: any[] = [];
  for (const r of rows) {
    const doc = Number(r.document_id);
    const n = perDoc.get(doc) ?? 0;
    if (n < maxPerDoc) {
      out.push(r);
      perDoc.set(doc, n + 1);
    }
  }
  return out;
}

export function buildContext(labeled: SearchRow[], groupByDocument: boolean): string {
  if (!groupByDocument) {
    return labeled
      .map((r) =>
        `[${r.label}] (File: ${r.filename}, ${r.file_type}` +
        (r.page_or_slide != null ? `, halaman/slide ${r.page_or_slide}` : "") +
        (r.section_title ? `, Bagian: ${r.section_title}` : "") + `)\n${r.content}`
      )
      .join("\n\n---\n\n");
  }
  // Kelompokkan per dokumen agar LLM jelas mana chunk dari dokumen mana
  // (kritis untuk pertanyaan perbandingan). Nomor [n] tetap berurutan.
  const groups = new Map<number, { filename: string; file_type: string; rows: SearchRow[] }>();
  for (const r of labeled) {
    let g = groups.get(r.document_id);
    if (!g) {
      g = { filename: r.filename, file_type: r.file_type, rows: [] };
      groups.set(r.document_id, g);
    }
    g.rows.push(r);
  }
  const parts: string[] = [];
  let groupIdx = 0;
  for (const g of groups.values()) {
    groupIdx++;
    parts.push(`=== Dokumen ${groupIdx}: ${g.filename} (${g.file_type}) ===`);
    for (const r of g.rows) {
      parts.push(
        `[${r.label}]` +
        (r.page_or_slide != null ? ` (halaman/slide ${r.page_or_slide})` : "") +
        (r.section_title ? ` (Bagian: ${r.section_title})` : "") +
        `\n${r.content}`
      );
    }
  }
  return parts.join("\n\n---\n\n");
}

const RAG_WEBHOOK_TIMEOUT_MS = 30_000;

/** Jawaban penolakan deterministik (harus sama dengan frasa di system prompt). */
export const JAWABAN_TIDAK_DITEMUKAN =
  "Saya tidak menemukan informasi tersebut dalam dokumen yang tersedia.";

/**
 * Penjaga abstain: bila kemiripan terbaik di bawah ambang, jangan tanya LLM sama sekali.
 * Hanya berlaku pada jalur lokal (skor diketahui); jalur webhook tidak dipaksa menolak.
 */
export function harusMenolak(hasil: SearchResult): boolean {
  if (config.ragAbstainMin <= 0) return false;
  if (hasil.bestScore == null) return false;
  // Catatan: guard berbasis cakupan token dicoba (run 6) dan DICABUT — ia menolak
  // J2 yang sebenarnya ada di korpus, tanpa menahan T4. Cakupan tetap dihitung
  // sebagai sinyal diagnostik, bukan penentu keputusan.
  return decideAbstainKalibrasi(
    hasil.bestScore,
    hasil.lexScore ?? 0,
    config.ragAbstainMin,
    config.ragAbstainLexMin,
  );
}

/**
 * Ambil chunk tetangga (index ±1) dari beberapa hasil teratas dokumen yang sama.
 * Murni pelengkap konteks — tidak menambah label baru bila sudah ada.
 */
async function tambahTetangga(rows: any[], maks: number): Promise<any[]> {
  if (rows.length === 0 || maks <= 0) return rows;
  const terpilih = rows.slice(0, 3);
  const idTerpilih = terpilih.map((r) => Number(r.id));
  const { rows: tetangga } = await pool.query(
    `SELECT c.id, c.content, c.page_or_slide, c.section_title,
            d.id AS document_id, d.filename, d.file_type
       FROM chunks c
       JOIN chunks asal ON asal.document_id = c.document_id
            AND c.chunk_index BETWEEN asal.chunk_index - 1 AND asal.chunk_index + 1
       JOIN documents d ON d.id = c.document_id
      WHERE asal.id = ANY($1::bigint[])
        AND c.id <> ALL($1::bigint[])
        AND c.is_outdated = FALSE AND d.status = 'completed'
      ORDER BY c.document_id, c.chunk_index
      LIMIT $2`,
    [idTerpilih, maks],
  );
  const ada = new Set(rows.map((r) => Number(r.id)));
  const tambahan = tetangga.filter((t) => !ada.has(Number(t.id)));
  return [...rows, ...tambahan];
}

async function searchLocal(question: string): Promise<SearchResult> {
  const [qv] = await embedTexts([question]);
  const SELECT = `SELECT c.id, c.content, c.page_or_slide, c.section_title,
                         d.id AS document_id, d.filename, d.file_type,
                         1 - (c.embedding <=> $1::vector) AS sim
                    FROM chunks c JOIN documents d ON d.id = c.document_id
                   WHERE c.is_outdated = FALSE AND d.status = 'completed'`;
  let rows: any[];
  let bestScore: number | null = null;
  if (isComparisonQuery(question)) {
    // Perbandingan: cari lebih luas, ragamkan per dokumen, lalu jamin tiap
    // tahun/entitas yang disebut (mis. RKP 2026 & 2027) punya chunk sendiri.
    const { rows: wide } = await pool.query(
      `${SELECT} ORDER BY c.embedding <=> $1::vector LIMIT $2`,
      [JSON.stringify(qv), config.vectorK + 6]
    );
    bestScore = wide.length ? Number(wide[0].sim) : null;
    rows = capPerDocument(wide, 5);
    const seen = new Set<number>(rows.map((r) => r.id));
    for (const year of extractYears(question)) {
      const { rows: docs } = await pool.query(
        `SELECT id FROM documents
          WHERE status = 'completed' AND filename ILIKE '%' || $1::text || '%' LIMIT 3`,
        [String(year)]
      );
      for (const d of docs) {
        const { rows: extra } = await pool.query(
          `${SELECT} AND c.document_id = $2 ORDER BY c.embedding <=> $1::vector LIMIT 2`,
          [JSON.stringify(qv), d.id]
        );
        for (const r of extra) if (!seen.has(r.id)) {
          seen.add(r.id);
          rows.push(r);
        }
      }
    }
    rows = rows.slice(0, config.vectorK + 2 * extractYears(question).size);
  } else {
    const kandidat = Math.max(config.ragCandidateK, config.vectorK * 3);
    const cariVektor = async (qv: any, jumlah: number) => {
      const { rows } = await pool.query(
        `${SELECT} ORDER BY c.embedding <=> $1::vector LIMIT $2`,
        [JSON.stringify(qv), jumlah]
      );
      return rows;
    };

    // Tahap 1 — pertanyaan asli. Skor ini juga yang dipakai penjaga abstain,
    // sehingga tulis-ulang tidak bisa menyamarkan pertanyaan di luar korpus.
    const [qvAsli] = await embedTexts([question]);
    const vektorAsli = await cariVektor(qvAsli, kandidat);
    bestScore = vektorAsli.length ? Number(vektorAsli[0].sim) : null;

    let leksikal: any[] = [];
    if (config.ragHybrid) {
      const { rows: lex } = await pool.query(
        `SELECT c.id, c.content, c.page_or_slide, c.section_title,
                d.id AS document_id, d.filename, d.file_type,
                ts_rank_cd(to_tsvector('indonesian', c.content), plainto_tsquery('indonesian', $1)) AS lex
           FROM chunks c JOIN documents d ON d.id = c.document_id
          WHERE c.is_outdated = FALSE AND d.status = 'completed'
            AND to_tsvector('indonesian', c.content) @@ plainto_tsquery('indonesian', $1)
          ORDER BY lex DESC LIMIT $2`,
        [question, kandidat]
      );
      leksikal = lex;
    }

    // Tahap 2 — tulis-ulang kueri HANYA bila tahap 1 lemah (hemat 1 panggilan LLM
    // dan menghindari efek samping pada kasus yang sudah benar).
    let vektorTambahan: any[] = [];
    if (config.ragRewrite && perluTulisUlang(bestScore, leksikal.length, config.ragRewriteMin)) {
      const kueriBaru = await tulisUlangKueri(question);
      if (kueriBaru && kueriBaru !== question) {
        const [qvBaru] = await embedTexts([kueriBaru]);
        vektorTambahan = await cariVektor(qvBaru, kandidat);
      }
    }

    // Tahap 2b — ekspansi multi-kueri: pertanyaan percakapan ter-embed berbeda
    // dari gaya bahasa dokumen. Varian kata kunci menaikkan peluang chunk sumber
    // ikut terambil sebelum rerank.
    let vektorVarian: any[] = [];
    if (config.ragVarian) {
      const varian = [...varianKueri(question), ...varianSinonim(question)]
        .map((v) => v.trim())
        .filter((v) => v && v !== question)
        .slice(0, 4);
      if (varian.length > 0) {
        const vektorV = await embedTexts(varian);
        for (let i = 0; i < varian.length; i++) {
          vektorVarian = vektorVarian.concat(await cariVektor(vektorV[i], kandidat));
        }
      }
    }

    const sumberKandidat = [vektorAsli, vektorTambahan, leksikal, vektorVarian];
    const gabung = new Map<number, any>();
    for (const list of sumberKandidat) {
      for (const r of list) if (!gabung.has(Number(r.id))) gabung.set(Number(r.id), r);
    }
    // Peringkat ulang tahap 1: RRF + cakupan token leksikal.
    const skorRrf = rrfFuseBanyak(sumberKandidat);
    const pra = [...gabung.values()].map((r) => ({
      r,
      skor: (skorRrf.get(Number(r.id)) ?? 0) + 0.5 * lexicalScore(question, String(r.content)),
    }));
    pra.sort((a, b) => b.skor - a.skor);

    // Peringkat ulang tahap 2 (MaxSim) — default mati: diukur menambah latensi tanpa manfaat.
    if (config.ragMaxSim && pra.length > 0) {
      const M = Math.min(config.ragMaxSimKandidat, pra.length);
      const kalimatPer = pra.slice(0, M).map((x) => pecahKalimat(String(x.r.content)));
      const datar: string[] = [];
      const peta: number[] = [];
      kalimatPer.forEach((ks, i) =>
        ks.forEach((k) => {
          datar.push(k);
          peta.push(i);
        })
      );
      if (datar.length > 0) {
        const vektorKalimat = await embedTexts(datar);
        const perKandidat: number[][][] = kalimatPer.map(() => []);
        vektorKalimat.forEach((v: any, j: number) => perKandidat[peta[j]].push(v as number[]));
        for (let i = 0; i < M; i++) pra[i].skor += 0.6 * skorMaxSim(qvAsli as number[], perKandidat[i]);
        pra.sort((a, b) => b.skor - a.skor);
      }
    }
    if (config.ragRerank) {
      rows = pilihRerank(
        pra.map((x) => ({
          ...x.r,
          skorAwal: x.skor,
          skorLeksikal: lexicalScore(question, String(x.r.content)),
        })),
        question,
        config.vectorK,
        bobotDariEnv(),
      );
    } else {
      rows = pra.slice(0, config.vectorK).map((x) => x.r);
    }
    // Fakta sering terbelah antar-chunk (mis. tabel & narasinya). Tambahkan
    // tetangga terdekat dari chunk teratas agar jawaban tidak setengah.
    rows = await tambahTetangga(rows, 4);
  }
  const labeled = rows.map((r, i) => ({ ...r, label: i + 1 }));
  const isComparison = isComparisonQuery(question);
  const context = buildContext(labeled, isComparison);
  // Cakupan leksikal terbaik = sinyal kalibrasi abstain (lihat harusMenolak).
  const lexScore = labeled.reduce(
    (maks, r) => Math.max(maks, lexicalScore(question, String(r.content))),
    0,
  );
  const cakupan = labeled
    .slice(0, 5)
    .reduce((maks, r) => Math.max(maks, cakupanToken(question, String(r.content))), 0);
  return { labeled, context, isComparison, bestScore, lexScore, cakupan };
}

export async function searchViaWebhook(question: string): Promise<SearchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RAG_WEBHOOK_TIMEOUT_MS);
  try {
    const resp = await fetch(config.ragWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, vector_k: config.vectorK }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`n8n rag webhook HTTP ${resp.status}`);
    const data = (await resp.json()) as { labeled?: SearchRow[]; context?: string };
    if (!Array.isArray(data.labeled) || typeof data.context !== "string")
      throw new Error("n8n rag webhook: format response tidak valid");
    return { labeled: data.labeled, context: data.context, isComparison: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function search(question: string, history: ChatTurn[] = []): Promise<SearchResult> {
  const query = buildRetrievalQuery(question, history);
  if (config.ragWebhookUrl) {
    try {
      return await searchViaWebhook(query);
    } catch (err) {
      console.warn("n8n rag webhook gagal, fallback ke query lokal:", (err as Error).message);
    }
  }
  return searchLocal(query);
}

/** Sitasi = dokumen yang labelnya benar-benar dikutip di dalam jawaban. */
function buildCitations(labeled: SearchRow[], text: string): Citation[] {
  const cited = extractCitedIndices(text);
  return labeled
    .filter((r) => cited.has(r.label))
    .map((r) => ({
      label: r.label,
      document_id: r.document_id,
      filename: r.filename,
      file_type: r.file_type,
      page_or_slide: r.page_or_slide,
      section_title: r.section_title,
    }));
}

export interface HasilAsk {
  answer: string;
  citations: Citation[];
  model?: string;
  tokenIn?: number | null;
  tokenOut?: number | null;
  menolak?: boolean;
}

export async function ask(
  question: string,
  history: ChatTurn[] = []
): Promise<HasilAsk> {
  const hasil = await search(question, history);
  if (harusMenolak(hasil)) {
    return { answer: JAWABAN_TIDAK_DITEMUKAN, citations: [], menolak: true };
  }
  const { labeled, context, isComparison } = hasil;
  const jawab = await generateAnswerDenganUsage(question, context, history, isComparison);

  // Verifikasi sitasi: jawaban substantif tanpa satu pun [n] → minta ulang sekali
  // dengan instruksi tegas menyitasi. Menyerang "sitasi tidak lengkap" (50%).
  let teks = jawab.text;
  let sitasi = buildCitations(labeled, teks);
  if (sitasi.length === 0 && teks !== JAWABAN_TIDAK_DITEMUKAN && labeled.length > 0) {
    const ulang = await generateAnswerDenganUsage(question, context, history, isComparison, true);
    const sitasiUlang = buildCitations(labeled, ulang.text);
    if (sitasiUlang.length > 0) {
      teks = ulang.text;
      sitasi = sitasiUlang;
    }
  }

  return {
    answer: teks,
    citations: sitasi,
    model: jawab.model,
    tokenIn: jawab.tokenIn,
    tokenOut: jawab.tokenOut,
    menolak: teks === JAWABAN_TIDAK_DITEMUKAN,
  };
}

export async function* askStream(
  question: string,
  history: ChatTurn[] = []
): AsyncGenerator<{ delta: string } | { citations: Citation[] }> {
  const hasil = await search(question, history);
  if (harusMenolak(hasil)) {
    yield { delta: JAWABAN_TIDAK_DITEMUKAN };
    yield { citations: [] };
    return;
  }
  const { labeled, context, isComparison } = hasil;
  let text = "";
  for await (const delta of streamAnswer(question, context, history, isComparison)) {
    text += delta;
    yield { delta };
  }
  yield { citations: buildCitations(labeled, text) };
}
