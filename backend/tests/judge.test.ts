import { describe, expect, test } from "bun:test";
import { parseSkor } from "../src/lib/judge";

describe("parser skor juri", () => {
  test("JSON bersih", () => {
    const s = parseSkor('{"faithfulness":0.8,"relevancy":1,"recall":0.5}');
    expect(s).not.toBeNull();
    expect(s!.faithfulness).toBe(0.8);
    expect(s!.relevancy).toBe(1);
    expect(s!.recall).toBe(0.5);
  });

  test("JSON dibungkus teks tambahan", () => {
    const s = parseSkor('Berikut penilaiannya:\n{"faithfulness": 0.4, "relevancy": 0.9, "recall":  domain}\nSelesai.');
    expect(s).toBeNull();
  });

  test("nilai string & koma desimal", () => {
    const s = parseSkor('{"faithfulness":"0,75","relevancy":"0.25","recall":"1"}');
    expect(s!.faithfulness).toBe(0.75);
    expect(s!.relevancy).toBe(0.25);
    expect(s!.recall).toBe(1);
  });

  test("nilai di luar rentang dijepit 0..1", () => {
    const s = parseSkor('{"faithfulness":1.7,"relevancy":-0.3,"recall":0.5}');
    expect(s!.faithfulness).toBe(1);
    expect(s!.relevancy).toBe(0);
  });

  test("tanpa JSON → null", () => {
    expect(parseSkor("faithfulness tinggi")).toBeNull();
  });
});
