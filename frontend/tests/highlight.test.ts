import { describe, it, expect } from "bun:test";
import { CLUSTERS, CLUSTER_ICONS, segment } from "../src/lib/highlight";

// Tes karakterisasi: mengunci perilaku modul highlight frontend sebelum/sesudah
// disatukan ke shared/highlight-core.ts (harus tetap hijau di kedua kondisi).
describe("highlight frontend (karakterisasi)", () => {
  it("CLUSTERS & CLUSTER_ICONS lengkap untuk 8 klaster PKPN", () => {
    for (let i = 1; i <= 8; i++) {
      expect(typeof CLUSTERS[i]).toBe("string");
      expect(CLUSTERS[i].length).toBeGreaterThan(0);
      expect(typeof CLUSTER_ICONS[i]).toBe("string");
    }
  });

  it("segment menandai kata kunci dan tidak menghilangkan karakter teks", () => {
    const teks = "Pemerintah mempercepat PKPN tahun ini.";
    const segs = segment(teks);
    const match = segs.find((s) => s.match);
    expect(match).toBeTruthy();
    expect(match!.text).toBe("PKPN");
    expect(match!.match!.cat).toBe("pkpn");
    expect(segs.map((s) => s.text).join("")).toBe(teks);
  });

  it("literal PKPN dikenali dan klaster PKPN ikut terisi", () => {
    const segs = segment("Program Kerja Prioritas Nasional dan Kampung Nelayan Merah Putih");
    const texts = segs.filter((s) => s.match).map((s) => s.text);
    expect(texts).toContain("Program Kerja Prioritas Nasional");
    expect(texts).toContain("Kampung Nelayan Merah Putih");
    const knmp = segs.find((s) => s.match && s.text === "Kampung Nelayan Merah Putih")!;
    expect(knmp.match!.cluster).toContain(1);
  });

  it("kata makro tidak membawa klaster PKPN", () => {
    const segs = segment("Inflasi dan pertumbuhan ekonomi kuartal ini.");
    const matches = segs.filter((s) => s.match);
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m.match!.cat).toBe("makro");
      expect(m.match!.cluster).toEqual([]);
    }
  });

  it("frasa terpanjang menang (tanpa tumpang tindih)", () => {
    const segs = segment("Kampung Nelayan Merah Putih dibangun.");
    const matches = segs.filter((s) => s.match);
    expect(matches.length).toBe(1);
    expect(matches[0].text).toBe("Kampung Nelayan Merah Putih");
  });
});
