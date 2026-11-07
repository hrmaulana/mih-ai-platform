import { describe, expect, test } from "bun:test";
import { urutkanCE } from "../src/services/rerank-ce";

describe("urutan hasil cross-encoder", () => {
  test("menurun berdasarkan skor", () => {
    const item = ["a", "b", "c"];
    expect(urutkanCE(item, [0.2, 0.9, 0.5])).toEqual(["b", "c", "a"]);
  });

  test("skor hilang/NaN dianggap 0 (tidak melempar)", () => {
    const item = ["a", "b"];
    expect(urutkanCE(item, [Number.NaN, 0.3])).toEqual(["b", "a"]);
  });

  test("daftar kosong aman", () => {
    expect(urutkanCE([], [])).toEqual([]);
  });
});
