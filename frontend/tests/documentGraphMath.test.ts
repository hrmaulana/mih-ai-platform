import { describe, expect, test } from "bun:test";
import {
  capEdges3D,
  clusterLinkDistance,
  docLinkDistance,
  docRadius,
  EDGE_CAP_3D,
  LABEL_MIN_SCALE,
  passEdge,
  shouldDrawLabel,
  stableZ,
} from "../src/pages/documentGraphMath";

describe("documentGraphMath — logika murni relasi dokumen", () => {
  describe("docRadius", () => {
    test("docRadius(0) === 5", () => {
      expect(docRadius(0)).toBe(5);
    });
    test("docRadius(30) === 22", () => {
      expect(docRadius(30)).toBe(22);
    });
    test("derajat di atas 30 dikunci di 22 (batas atas)", () => {
      expect(docRadius(100)).toBe(22);
    });
    test("radius selalu dalam rentang 5..22 untuk derajat >= 0", () => {
      for (const deg of [0, 1, 5, 15, 29, 30, 40, 80]) {
        const r = docRadius(deg);
        expect(r).toBeGreaterThanOrEqual(5);
        expect(r).toBeLessThanOrEqual(22);
      }
    });
  });

  describe("docLinkDistance", () => {
    test("docLinkDistance(null) === 90", () => {
      expect(docLinkDistance(null)).toBe(90);
    });
    test("docLinkDistance(1) === 130", () => {
      expect(docLinkDistance(1)).toBe(130);
    });
    test("semantic di luar [0,1] di-clamp ke range", () => {
      expect(docLinkDistance(5)).toBe(130);
      expect(docLinkDistance(-2)).toBe(90);
    });
  });

  describe("clusterLinkDistance", () => {
    test("jarak untuk semantic 0..1 tidak melebihi 220", () => {
      for (let sem = 0; sem <= 1.0001; sem += 0.05) {
        expect(clusterLinkDistance(sem)).toBeLessThanOrEqual(220);
      }
    });
    test("clusterLinkDistance(1) === 220 dan clusterLinkDistance(null) === 140", () => {
      expect(clusterLinkDistance(1)).toBe(220);
      expect(clusterLinkDistance(null)).toBe(140);
    });
  });

  describe("LABEL_MIN_SCALE & shouldDrawLabel", () => {
    test("LABEL_MIN_SCALE === 1.6", () => {
      expect(LABEL_MIN_SCALE).toBe(1.6);
    });
    test("shouldDrawLabel(1.5) === false", () => {
      expect(shouldDrawLabel(1.5)).toBe(false);
    });
    test("shouldDrawLabel(1.6) === true", () => {
      expect(shouldDrawLabel(1.6)).toBe(true);
    });
    test("label muncul tepat pada ambang ke atas", () => {
      expect(shouldDrawLabel(1.59)).toBe(false);
      expect(shouldDrawLabel(1.6)).toBe(true);
      expect(shouldDrawLabel(4)).toBe(true);
    });
  });

  describe("passEdge", () => {
    // Pasangan (sem, cit) sampel untuk kombinasi tombol.
    const semEdge = { semantic: 0.8, citations: null };
    const lowSemEdge = { semantic: 0.4, citations: null };
    const citEdge = { semantic: null, citations: 3 };
    const bothEdge = { semantic: 0.9, citations: 5 };
    const noneEdge = { semantic: null, citations: 0 };

    test("showSem=true, showCit=true, minSem=0.6", () => {
      const o = { showSem: true, showCit: true, minSem: 0.6 };
      expect(passEdge(semEdge, o)).toBe(true);
      expect(passEdge(bothEdge, o)).toBe(true);
      expect(passEdge(citEdge, o)).toBe(true);
      expect(passEdge(lowSemEdge, o)).toBe(false); // sem di bawah ambang
      expect(passEdge(noneEdge, o)).toBe(false);
    });
    test("showSem=true, showCit=false", () => {
      const o = { showSem: true, showCit: false, minSem: 0.6 };
      expect(passEdge(semEdge, o)).toBe(true);
      expect(passEdge(citEdge, o)).toBe(false); // showCit off
      expect(passEdge(lowSemEdge, o)).toBe(false);
    });
    test("showSem=false, showCit=true", () => {
      const o = { showSem: false, showCit: true, minSem: 0.6 };
      expect(passEdge(citEdge, o)).toBe(true);
      expect(passEdge(bothEdge, o)).toBe(true);
      expect(passEdge(semEdge, o)).toBe(false); // showSem off
      expect(passEdge(noneEdge, o)).toBe(false);
    });
    test("keduanya off selalu false", () => {
      const o = { showSem: false, showCit: false, minSem: 0.6 };
      expect(passEdge(semEdge, o)).toBe(false);
      expect(passEdge(citEdge, o)).toBe(false);
      expect(passEdge(bothEdge, o)).toBe(false);
      expect(passEdge(noneEdge, o)).toBe(false);
    });
    test("minSem batas inklusif", () => {
      const o = { showSem: true, showCit: false, minSem: 0.8 };
      expect(passEdge({ semantic: 0.8, citations: null }, o)).toBe(true);
      expect(passEdge({ semantic: 0.799, citations: null }, o)).toBe(false);
    });
    test("citations undefined diperlakukan sebagai 0", () => {
      const o = { showSem: false, showCit: true, minSem: 0.6 };
      expect(
        passEdge({ semantic: null, citations: undefined } as never, o),
      ).toBe(false);
      expect(passEdge({ semantic: null, citations: 1 }, o)).toBe(true);
    });
  });

  describe("EDGE_CAP_3D & capEdges3D", () => {
    test("EDGE_CAP_3D === 1500", () => {
      expect(EDGE_CAP_3D).toBe(1500);
    });
    test("<= threshold dikembalikan apa adanya tanpa cap", () => {
      const links = [
        { id: 1, semantic: 0.9 },
        { id: 2, semantic: 0.1 },
      ];
      const res = capEdges3D(links);
      expect(res.capped).toBe(false);
      expect(res.links).toHaveLength(2);
    });
    test("2000 link dipangkas jadi 1500, capped=true, urut menurun semantic", () => {
      const links = Array.from({ length: 2000 }, (_, i) => ({
        id: i,
        semantic: (i % 100) / 100,
      }));
      const res = capEdges3D(links);
      expect(res.capped).toBe(true);
      expect(res.links).toHaveLength(1500);
      for (let i = 1; i < res.links.length; i++) {
        expect((res.links[i - 1].semantic ?? 0)).toBeGreaterThanOrEqual(
          res.links[i].semantic ?? 0,
        );
      }
    });
    test("link dengan semantic null (skor 0) dibuang saat ada cukup link lebih tinggi", () => {
      const links = [
        { id: 0, semantic: null },
        ...Array.from({ length: 1500 }, () => ({ id: 1, semantic: 0.8 })),
        { id: 2, semantic: 0.5 },
      ];
      // 1502 link > threshold → dipangkas jadi 1500.
      const res = capEdges3D(links);
      expect(res.capped).toBe(true);
      expect(res.links).toHaveLength(1500);
      // Setiap link yang bertahan punya semantic non-null (skor > 0).
      for (const l of res.links) {
        expect(l.semantic).not.toBeNull();
      }
    });
  });

  describe("stableZ", () => {
    test("deterministik: hasil sama untuk id yang sama di dua pemanggilan", () => {
      for (const id of [1, 7, 42, 1000, 12345]) {
        expect(stableZ(id)).toBe(stableZ(id));
      }
    });
    test("nilai selalu dalam [-100, 100]", () => {
      for (let id = 0; id < 500; id++) {
        const z = stableZ(id);
        expect(z).toBeGreaterThanOrEqual(-100);
        expect(z).toBeLessThanOrEqual(100);
      }
    });
  });
});