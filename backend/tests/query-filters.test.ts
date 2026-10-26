import { describe, it, expect } from "bun:test";
import { pushEq, pushIlike, whereClause } from "../../shared/query-filters.js";

describe("shared/query-filters", () => {
  it("pushEq menambah klausa & param hanya bila nilai ada", () => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    idx = pushEq(conditions, params, idx, "sumber", "cnbc");
    idx = pushEq(conditions, params, idx, "sentimen", ""); // dilewati

    expect(conditions).toEqual(["sumber = $1"]);
    expect(params).toEqual(["cnbc"]);
    expect(idx).toBe(2);
  });

  it("pushIlike memakai pola %nilai% dan menghormati penomoran param", () => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    idx = pushEq(conditions, params, idx, "sumber", "antara");
    idx = pushIlike(conditions, params, idx, "judul", "pangan");

    expect(conditions).toEqual(["sumber = $1", "judul ILIKE $2"]);
    expect(params).toEqual(["antara", "%pangan%"]);
    expect(idx).toBe(3);
  });

  it("whereClause menyusun WHERE atau kosong", () => {
    expect(whereClause([])).toBe("");
    expect(whereClause(["a = $1", "b = $2"])).toBe("WHERE a = $1 AND b = $2");
  });
});
