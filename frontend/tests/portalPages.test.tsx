import { describe, it, expect } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  PortalArticleHero,
  PortalListSection,
  PortalNotFound,
  PortalRelatedGrid,
} from "../src/pages/portal/portalPages";

// Tes render: memastikan ekstraksi komponen bersama (portalPages.tsx) tetap
// menghasilkan markup yang sama seperti sebelum refactor portal Berita/Publikasi.

const items = [
  {
    slug: "contoh-berita",
    title: "Judul Contoh",
    image: "/img/contoh.jpg",
    date: "2026-01-31",
    category: "Berita",
    excerpt: "Ringkasan contoh.",
  },
];

function render(node: ReactElement) {
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
}

describe("portalPages (komponen bersama halaman portal)", () => {
  it("PortalListSection: eyebrow, judul, kartu, tautan, dan gambar", () => {
    const html = render(
      <PortalListSection
        eyebrow="Publikasi Resmi"
        title="Publikasi"
        items={items}
        hrefFor={(i) => `/publikasi/${i.slug}`}
      />,
    );
    expect(html).toContain("Publikasi Resmi");
    expect(html).toContain("Judul Contoh");
    expect(html).toContain('href="/publikasi/contoh-berita"');
    expect(html).toContain('src="/img/contoh.jpg"');
    expect(html).toContain("Ringkasan contoh.");
    expect(html).toContain("2026-01-31 - Berita");
  });

  it("PortalNotFound: menampilkan judul & petunjuk", () => {
    const html = render(<PortalNotFound title="Berita tidak ditemukan" hint="Silakan pilih berita." />);
    expect(html).toContain("Berita tidak ditemukan");
    expect(html).toContain("Silakan pilih berita.");
    expect(html).toContain("PMP Portal");
  });

  it("PortalArticleHero: kategori, judul, meta, dan gaya khusus", () => {
    const html = render(
      <PortalArticleHero
        category="Publikasi"
        title="Judul Besar"
        meta="2026-01-31 • Oleh Tim"
        sectionStyle={{ background: "linear-gradient(135deg, #0f172a, #1e293b)" }}
        pillStyle={{ background: "var(--amber-500)" }}
      />,
    );
    expect(html).toContain("Judul Besar");
    expect(html).toContain("2026-01-31 • Oleh Tim");
    expect(html).toContain("--amber-500");
  });

  it("PortalRelatedGrid: keadaan berisi (maks 3) dan keadaan kosong", () => {
    const banyak = [...items, { ...items[0], slug: "b", title: "Kedua" }, { ...items[0], slug: "c", title: "Ketiga" }, { ...items[0], slug: "d", title: "Keempat" }];
    const htmlIsi = render(
      <PortalRelatedGrid
        heading="Berita Terkait"
        items={banyak}
        emptyTitle="Belum Ada Berita Terkait"
        emptyHint="kosong"
        hrefFor={(i) => `/berita/${i.slug}`}
      />,
    );
    expect(htmlIsi).toContain("Berita Terkait");
    expect(htmlIsi).not.toContain("Keempat"); // dibatasi 3 kartu

    const htmlKosong = render(
      <PortalRelatedGrid
        heading="Berita Terkait"
        items={[]}
        emptyTitle="Belum Ada Berita Terkait"
        emptyHint={<span>kategori <strong>Ekonomi</strong></span>}
        hrefFor={(i) => `/berita/${i.slug}`}
      />,
    );
    expect(htmlKosong).toContain("Belum Ada Berita Terkait");
    expect(htmlKosong).toContain("<strong>Ekonomi</strong>");
  });
});
