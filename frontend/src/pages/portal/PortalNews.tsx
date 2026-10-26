import { useState } from "react";
import { usePortalContent } from "./usePortalContent";
import {
  PortalArticleHero,
  PortalExcerpt,
  PortalLightbox,
  PortalListSection,
  PortalNotFound,
  PortalRelatedGrid,
} from "./portalPages";

/*
 * Daftar Berita + Detail Berita — reproduksi `renderNewsListPage()` dan
 * `renderNewsDetailPage()` dari PMP Portal.html.
 *
 * Rute: `/berita` (list) dan `/berita/:slug` (detail).
 * Potongan tata letak bersama ada di `portalPages.tsx`.
 */

/* ===== Berita List ===== */
export function PortalNews() {
  const { news } = usePortalContent();
  return (
    <PortalListSection
      eyebrow="Berita"
      title="Berita"
      items={news}
      hrefFor={(item) => `/berita/${item.slug}`}
    />
  );
}

/* ===== Berita Detail ===== */
export function PortalNewsDetail({ slug }: { slug: string }) {
  const { news } = usePortalContent();
  const item = news.find((n) => n.slug === slug);

  /* State lightbox */
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (!item) {
    return (
      <PortalNotFound
        title="Berita tidak ditemukan"
        hint="Silakan pilih berita dari halaman Berita."
      />
    );
  }

  const relatedNews = news.filter((n) => n.slug !== item.slug && n.category === item.category);

  return (
    <>
      <PortalArticleHero
        category={item.category}
        title={item.title}
        meta={`${item.date} • ${item.author}`}
      />
      <section className="section" style={{ background: "white", paddingTop: 0 }}>
        <div className="container">
          <img className="article-image" src={item.image} alt={item.title} />
          <div className="article-body">
            <PortalExcerpt>{item.excerpt}</PortalExcerpt>
            <div
              className="article-content"
              dangerouslySetInnerHTML={{ __html: item.content }}
            />
            {item.gallery?.length ? (
              <div style={{ marginTop: 60 }}>
                <h2 style={{ marginBottom: 20, color: "var(--slate-900)" }}>📸 Galeri Pelaksanaan</h2>
                <div className="gallery-grid">
                  {item.gallery.map((image, i) => (
                    <img
                      key={i}
                      src={image}
                      alt={`${item.title} - ${i + 1}`}
                      loading="lazy"
                      style={{ cursor: "pointer" }}
                      onClick={() => setLightboxSrc(image)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <PortalRelatedGrid
              heading="Berita Terkait"
              items={relatedNews}
              emptyTitle="Belum Ada Berita Terkait"
              emptyHint={
                <>
                  Belum terdapat berita lain dengan kategori <strong>{item.category}</strong>.
                </>
              }
              hrefFor={(n) => `/berita/${n.slug}`}
            />
          </div>
        </div>
      </section>

      <PortalLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  );
}
