import { describe, expect, test } from "bun:test";
import { normalisasi, nilaiKasus } from "../scripts/eval-e2e";

describe("penilaian harness e2e", () => {
  const fakta = "5,35 persen";
  const dok = 344;

  test("fakta muncul & dokumen benar disitasi", () => {
    expect(nilaiKasus("Target pertumbuhan 2026 adalah 5,35 persen [2].", false, [344], fakta, dok)).toBe(
      "BENAR-SITASI-BENAR",
    );
  });

  test("fakta muncul tapi dokumen sumber tidak disitasi", () => {
    expect(nilaiKasus("Targetnya 5,35 persen [1].", false, [999], fakta, dok)).toBe("BENAR-TANPA-SITASI");
  });

  test("fakta tidak muncul → tidak lengkap", () => {
    expect(nilaiKasus("Targetnya 5,2 persen [1].", false, [344], fakta, dok)).toBe("TIDAK-LENGKAP");
  });

  test("menolak padahal fakta ada", () => {
    expect(nilaiKasus("Saya tidak menemukan informasi.", true, [], fakta, dok)).toBe("MENOLAK");
  });

  test("normalisasi tahan variasi tanda baca & spasi", () => {
    expect(normalisasi("Target  5,35 persen—2026.")).toBe("target 5,35 persen 2026");
  });
});
