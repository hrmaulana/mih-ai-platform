import { usePortalContent } from "./usePortalContent";
import {
  PortalArticleHero,
  PortalExcerpt,
  PortalListSection,
  PortalNotFound,
} from "./portalPages";

/*
 * Daftar Publikasi + Detail Publikasi — reproduksi `renderPublicationListPage()`
 * dan `renderPublicationDetailPage()` dari PMP Portal.html.
 *
 * Rute: `/publikasi` (list) dan `/publikasi/:slug` (detail).
 * Potongan tata letak bersama ada di `portalPages.tsx`.
 */
export function PortalPublication() {
  const { publications } = usePortalContent();
  return (
    <PortalListSection
      eyebrow="Publikasi Resmi"
      title="Publikasi"
      items={publications}
      hrefFor={(item) => `/publikasi/${item.slug}`}
    />
  );
}

export function PortalPublicationDetail({ slug }: { slug: string }) {
  const { publications } = usePortalContent();
  const item = publications.find((p) => p.slug === slug);

  if (!item) {
    return (
      <PortalNotFound
        title="Publikasi tidak ditemukan"
        hint="Silakan pilih publikasi dari daftar Publikasi."
      />
    );
  }

  return (
    <>
      <PortalArticleHero
        category={item.category}
        title={item.title}
        meta={`${item.date} • Oleh ${item.author}`}
        sectionStyle={{ background: "linear-gradient(135deg, #0f172a, #1e293b)" }}
        pillStyle={{ background: "var(--amber-500)" }}
      />
      <section className="section" style={{ background: "white", paddingTop: 0 }}>
        <div className="container">
          <img className="article-image" src={item.image} alt={item.title} />
          <div className="article-body">
            <PortalExcerpt
              style={{
                background: "#f0fdf4",
                color: "#166534",
                borderLeft: "5px solid #22c55e",
              }}
            >
              {item.excerpt}
            </PortalExcerpt>
            <div className="download-box">
              <div className="download-info">
                <span className="download-icon">📄</span>
                <div>
                  <h4 style={{ margin: 0, color: "var(--slate-900)" }}>{item.documentName}</h4>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>
                    Klik tombol di kanan untuk mengakses berkas lengkap publikasi.
                  </p>
                </div>
              </div>
              <a
                href={item.documentUrl}
                target="_blank"
                rel="noreferrer"
                className="button primary"
                style={{ minHeight: 38, fontSize: "0.9rem" }}
              >
                Akses Dokumen
              </a>
            </div>
            <div
              className="article-content"
              dangerouslySetInnerHTML={{ __html: item.content }}
            />
          </div>
        </div>
      </section>
    </>
  );
}
