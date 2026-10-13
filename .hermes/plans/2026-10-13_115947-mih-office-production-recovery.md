# Pemulihan Pipeline MIH dengan Produksi di Kantor — Implementation Plan

> **For Hermes:** Execute this plan by dispatching each Tahap/phase to a separate delegate_task sub-agent, sequentially or batched. Jangan dispatch perubahan infra destruktif tanpa verifikasi parent dan persetujuan scope.

**Goal:** Mesin kantor menjadi satu sumber data/pemrosesan MIH; VPS hanya pintu HTTPS/reverse proxy privat. Pulihkan OneDrive→ingestion→chunk, audit RSS→PKPN, dan lindungi DB/file dengan backup teruji.

**Architecture:** PostgreSQL, frontend, API, worker, crawler dan scoring di keuanganpmp. VPS meneruskan seluruh trafik MIH melalui tunnel privat ke frontend kantor; frontend mengarahkan /api ke backend kantor. VPS menyajikan maintenance ketika origin tidak sehat, tidak fallback ke DB VPS. Salinan VPS dipertahankan tanpa restore/overwrite untuk rollback routing selama transisi.

**Tech Stack:** Docker Compose, PostgreSQL/pgvector, Python psycopg worker, Bun/Express API, React/Vite, rclone OneDrive, systemd SSH tunnel, GitHub Actions.

## Temuan yang menjadi dasar (13 Oktober 2026)
- Domain mih.keuanganppn1.cloud diarahkan nginx VPS ke 127.0.0.1:8080 (frontend stack VPS), bukan frontend kantor.
- Kantor: 751 dokumen, 714 completed, 37 failed, 19.111 chunks; RSS diperbarui cron dengan ribuan berita. Worker loop berulang 'the connection is lost'.
- VPS: 96 dokumen, 9.363 chunks, 70 Early Warning, 69 articles/scores; sinkronisasi gagal karena rclone.conf tidak ada pada mount aktif.
- Cron Hermes kantor: rclone-sync.sh setiap 15 menit, early-warning-crawl.sh setiap 6 jam, mih-backup.sh harian. Semua mengarah kantor; rclone hasil di /data/mih/rclone tidak dipantau worker aktif.
- /data/mih/pgdata kantor persistent. Backup harian kantor valid secara inspeksi row COPY, belum restore drill. Backup VPS audit 68.972.620 byte /var/backups/mih-audit/production-20261013.dump terbaca seluruh arsip; bukan pengganti backup kantor.
- Rclone cron sekarang memakai sync --ignore-existing: dapat melewatkan pembaruan file dan menghapus lokal. Worker prune_removed hard-delete metadata. Jangan aktifkan ingestion source baru sebelum membatasi penghapusan.
- Workflow deploy saat ini otomatis men-deploy kantor dan VPS; kantor memakai runs-on:self-hosted tanpa label spesifik, git pull master (bukan exact SHA). Harus dibenahi sebelum push kode pipeline.
- Port frontend kantor 8080. Listener VPS 8081 ditemukan tetapi belum terverifikasi fungsi/pemiliknya; jangan mengambil alih port tersebut.

## Batas keselamatan
- Tidak hapus volume, tidak ganti mount pgdata, tidak restore DB produksi.
- Tidak mengganti identitas/auth pengguna atau menyalin secret melalui chat/git/log.
- Backup sebelum perubahan; restore drill hanya container/DB/volume sementara dengan nama unik dan port loopback.
- 37 gagal tidak di-retry-all: gambar/Excel/arsip belum didukung. PDF/DOCX/PPTX menjadi cakupan fase ini; OCR format lain adalah pekerjaan terpisah.
- Angka cron success harus mencerminkan pipeline bisnis, bukan hanya exit shell.
- DB VPS tetap disimpan; rekonsiliasi data lintas DB opsional setelah audit SHA/URL dan identitas pemilik, tidak menjadi prasyarat cutover.

## Tahap 0 — Prasyarat deploy dan inventaris sumber (gate sebelum push)
**File:** .github/workflows/deploy.yml, scripts/deploy.sh; baru docker-compose.office.yml bila diperlukan untuk konfigurasi kantor yang eksplisit.
1. Inventaris nama project/volume/mount, revision image, users layanan runner, tunnel lama, nginx VPS, repo kantor dan dependency/proxy.
2. Periksa deployment workflow: batasi runner kantor label unik; pasang exact CI SHA, bukan pull master terbaru. Pertahankan artifact dist dari CI, hindari install/build frontend lewat proxy kantor.
3. VPS pipeline deploy stack aplikasi dinonaktifkan untuk arsitektur baru. Perubahan nginx/tunnel hanya manual terkontrol sampai gate cutover; jangan otomatis menimpa konfigurasi VPS.
4. Konfirmasi compose override kantor TIDAK membuat project/volume baru (gunakan mount/project aktif); diff docker compose config yang sudah disanitasi.
5. Runner MIH kantor inactive: diagnosis log dulu; pulihkan dengan kebijakan restart yang tepat setelah konfigurasi dan label terverifikasi.

## Tahap 1 — Backup DB dan file + restore drill
**Baru:** scripts/backup-office.sh, scripts/verify-backup.sh; template systemd backup service/timer atau update job Hermes yang sudah ada, bukan membuat jadwal ganda.
**Diubah:** ~/.hermes/scripts/mih-backup.sh menjadi wrapper ke script repo, setelah diverifikasi.
1. pg_dump -Fc dari DB kantor aktual, permission 600; temp file → rename atomik hanya setelah sukses.
2. Backup file sumber raw/uploaded/appdata dan manifest ukuran/SHA; kaitkan ke DB dump dalam manifest waktu/snapshot. Koordinasikan ingestion saat menginginkan titik konsistensi; jangan mengklaim dump DB+file otomatis atomik.
3. Backup rclone/config secara terenkripsi, lokasi/secret tidak dibocorkan. DB roles/extension/versi dicatat; credentials recovery disimpan terpisah.
4. Destinasi eksternal ditentukan sebelum off-site (storage selain disk kantor, remote terotorisasi); retensi, disk free guard dan checksum. Jangan menebak bucket/NAS.
5. Restore dump ke DB terisolasi: pgvector versi kompatibel, cek rows documents/chunks/articles/scores, FK dan query representatif; uji file existence/hash dari snapshot. Cleanup hanya sumber sementara bernama pasti.
6. Tambah log run_id/start/end/status/size/checksum dan alert kegagalan; backup hari sebelumnya jangan dihapus sebelum baru tervalidasi.
**Gate:** backup kantor + salinan off-site diverifikasi, restore drill lulus sebelum rencana restart DB produksi.

## Tahap 2 — Satu alur sinkronisasi OneDrive di kantor
**Diubah:** ~/.hermes/scripts/rclone-sync.sh, konfigurasi/mount worker kantor di docker-compose.office.yml atau override aktual.
**Baru:** scripts/sync-onedrive-office.sh; worker/tests/test_source_mounts.py atau integrasi equivalent.
1. Pilih host sync sebagai satu pemilik download, mempertahankan jadwal 15 menit; worker hanya scan/ingest. Nonaktifkan SHAREPOINT_REMOTE/DRIVE_REMOTE di worker untuk menghindari double sync.
2. Rclone copy (bukan sync deleting) dengan perbandingan normal untuk file berubah, tidak --ignore-existing; batasi source remote path yang benar setelah list read-only. Lock flock mencegah overlap, timeout dan exit status nyata.
3. Mount /data/mih/rclone → /data/raw/sharepoint read-only di worker; pertahankan mount appdata/raw/uploaded yang sudah ada. File_path dokumen baru menggunakan path container yang stabil, bukan path host.
4. Hilangkan hard-delete otomatis bila file tidak ada: prune_removed tidak berjalan untuk source ini; penanganan penghapusan/arsip memerlukan kebijakan eksplisit, bukan filesystem absent → DELETE.
5. Deduplikasi SHA dan versi path: jika SHA sudah tercatat tetapi file_path lama tidak bisa diakses, rekonsiliasi path terkontrol hanya setelah file cocok SHA; jangan menduplikasi chunks atau menandai source upload sebagai remote sembarangan.
6. Test dry-run daftar kandidat: new/changed/already indexed/unsupported/missing. Uji satu file nyata terpilih dahulu, lalu batch backlog rate-limited sesuai kapasitas embedding/LLM.
**Gate:** satu dokumen dari remote sampai DB+chunks+pencarian berhasil, file berubah tidak terlewat, file hilang tidak menghapus DB.

## Tahap 3 — Worker reconnect dan transaksi ingestion
**Diubah:** worker/ingest.py, worker/db.py, worker/api.py.
**Tes:** worker/tests/test_ingest.py, test_sharepoint_sync.py; baru test_worker_recovery.py, test_worker_health.py.
1. RED: simulasi koneksi putus pada scan/get_pending/insert_chunk; worker harus rollback bila mungkin, tutup koneksi rusak, backoff bounded, connect baru, lanjut loop.
2. Pisahkan error infrastruktur DB dari error dokumen. OperationalError/InterfaceError tidak menandai dokumen permanen failed; error parse file tetap failed dengan alasan jelas.
3. Claim/proses satu dokumen dengan batas transaksi yang jelas; hindari rollback dokumen kedua menghapus hasil dokumen sebelumnya; status, chunks, chunk_count completion commit atomik.
4. Retry idempotent: chunk_index/doc_id tidak duplikat; partial writes dibatalkan. Jika claim committed terpisah, gunakan lease/recovery processing dengan timeout, bukan reset-all.
5. Watch juga scan folder host sync yang dimount; ingestion upload pending tetap diproses. Pastikan RAW_DIR bukan folder yang tak pernah dipindai.
6. Heartbeat loop, last scan/process/error/reconnect serta DB probe; /api/health menunjukkan degraded saat loop macet, terpisah dari server uptime. Perbaiki log_message format error di api.py yang menghasilkan IndexError.
7. Status terinci diproxy lewat backend auth admin, worker port tidak dibuka publik. Observabilitas tidak membocorkan nama/path dokumen atau secret ke endpoint publik.
8. Uji DB terisolasi stop/start untuk recovery; produksi hanya bila backup gate dan izin terpenuhi.

## Tahap 4 — RSS/scoring sesuai skema
**Diubah:** backend/src/routes/early-warning.ts, routes/pantau-berita.ts, lib/llm-sentiment.ts, services/berita-scorer.ts.
**Baru:** backend/src/lib/news-llm.ts (provider adapter), backend/tests/news-pipeline.test.ts; migration baru di db/migrations bila perlu status/run metadata.
**Diubah:** ~/.hermes/scripts/early-warning-crawl.sh menjadi wrapper script terverifikasi/runner internal, tanpa kredensial admin hardcoded.
1. Audit terlebih dahulu versi scorer di container kantor dan konfigurasi real provider (tidak menyimpulkan bahwa nama model di DB berarti LLM berhasil); pilih provider/model yang sesuai kuota, tanpa mengasumsikan key Hermes dipakai MIH.
2. Tetapkan kontrak skema yang ada: relevansi 0–3, lantai relevansi, dampak, sentimen teks, klaster PKPN, confidence dan review. Kebijakan threshold dipertahankan sampai user menyetujui revisi.
3. Provider adapter timeout, retries terbatas, validasi JSON/enum/range. Tests mocked HTTP untuk 200 JSON valid, 402/429, timeout, invalid JSON.
4. Fallback ditandai llm_used=false/source=lexicon-fallback/perlu_review_manual, model aktual tidak difabrikasi. Proses klasifikasi boleh continue tetapi status degraded, bukan 'ok' seolah LLM.
5. Simpan artikel+score dalam transaksi; status retry/rescore untuk artikel gagal scoring, jangan dedup memblokir retry permanen setelah artikel sudah terinsert.
6. Feed config satu sumber bersama; scheduler kantor tepat sasaran. Ambil item lebih dari 10 dengan batas aman, dedup existing before scoring; interval/laju berdasarkan volume nyata agar tidak membebani mesin/API. Atom support jika feed memerlukan.
7. Catat per-feed run: fetched/new/duplicate/failed/status/error/last_success, serta stage LLM/fallback. success=true tidak boleh menyembunyikan semua feed gagal; shell wrapper memeriksa HTTP dan JSON.
8. Re-scoring data fallback lama bertahap hanya setelah audit budget dan persetujuan; bukan mengulang seluruh sejarah otomatis.
9. Isi full artikel di luar cakupan awal: RSS summary diberi sumber jelas; extraction penuh hanya bila sumber mengizinkan dan perlu.
**Gate:** sampel berita real lintas klaster diverifikasi terhadap skema, fallback terlihat jelas, cron menunjuk kantor dan tidak sukses palsu.

## Tahap 5 — Kesehatan pipeline dan panel admin
**Diubah:** worker/api.py, backend route admin (path aktual ditentukan saat baca router), frontend halaman monitoring admin existing.
**Baru:** table pipeline_runs atau endpoint snapshot bila dibutuhkan, bukan dump log ke UI.
- last successful sync/scan/chunk/crawl/LLM/backup, antrean/status dokumen, stale/degraded, failure per feed.
- auth admin untuk diagnostik, endpoint health publik minimal.
- Alert event-driven/rate-limited jika macet; tidak melaporkan setiap health poll.
- Backup health berasal manifest valid, bukan keberadaan file kosong; status green mensyaratkan freshness + keberhasilan stage yang relevan.

## Tahap 6 — Tunnel dan cutover publik (terakhir)
**Baru:** deploy/systemd/mih-tunnel.service, deploy/nginx/mih-office-proxy.conf, scripts/verify-office-route.sh.
**Diubah:** konfigurasi nginx MIH VPS saja setelah backup config.
1. Discovery tunnel existing/listener 8081 dan port lainnya; jangan bentrok Arthakarya. Pilih port loopback VPS yang benar-benar bebas.
2. systemd SSH reverse forward privat: remote 127.0.0.1:<port_baru> → kantor 127.0.0.1:8080; ExitOnForwardFailure, ServerAliveInterval/CountMax, Restart policy. Key terbatas forwarding dan user khusus; pakai proxy Bappenas jika perlu. Jangan menonaktifkan host-key checking.
3. Semua route / dan /api melewati frontend kantor, termasuk SSE/stream: buffering off, timeout/upgrade yang sesuai, X-Forwarded headers, upload size, /api/rekap jika memang dipakai.
4. Gate sebelum nginx switch: request dari VPS ke tunnel health + authenticated docs/news mencerminkan DB kantor (gunakan identitas/counter/read-only penanda terverifikasi), UI bundle sesuai backend, SSE streaming tidak buffered.
5. Backup nginx, nginx -t lalu reload (bukan restart DB). Domain mih.keuanganppn1.cloud harus diverifikasi HTTPS real, autentikasi/cookie, documents/chunks retrievable, RSS terbaru dan scoring.
6. Origin down → maintenance 503. Tidak meneruskan trafik ke DB VPS stale.
7. Rollback hanya routing nginx ke konfigurasi lama jika cutover gagal; DB kantor tidak di-restore. Tetap laporkan fallback sebagai data lama jika rollback terjadi.
8. Stack aplikasi VPS boleh dihentikan belakangan setelah acceptance, terpisah persetujuan; tidak menghapus volumes/data.

## Pengujian dan urutan delivery
- Setiap tahap code: RED test → minimal implementation → GREEN targeted → seluruh suite terkait.
- Backend: baca package.json/testing config sebelum menjalankan; DB test terisolasi saja.
- Worker: pytest worker/tests dengan deps/venv yang benar; pilih mock untuk embedding agar tidak biaya nyata.
- Frontend: build GitHub artifact, verifikasi admin panel/routing desktop/mobile setelah deploy.
- Infrastruktur: shell syntax, compose sanitized diff, systemd-analyze verify, nginx -t, backup+restore drill, loopback/private/public smoke.
- Commit scoped setelah test; jangan menyertakan SRS/untracked lain. CI hijau; exact SHA deploy ke kantor, tidak push ke workflow lama yang tanpa gate men-deploy dua stack.
- Tidak semua tahap dirilis sekaligus: backup/discovery → worker canary → ingestion batch → scoring canary → tunnel/cutover → observability acceptance.

## Keputusan pengguna yang disetujui
1. Backup off-site: OneDrive dalam folder khusus backup yang terpisah dari sumber ingestion. Retensi 14 harian, 4 mingguan, 3 bulanan; backup harian dan sebelum perubahan berisiko, restore drill bulanan. Arsip dan secret dienkripsi; kunci pemulihan tidak disimpan hanya di mesin kantor atau ikut dalam arsip yang sama.
2. AI berita: OpenRouter, plafon Rp250.000 per bulan untuk analisis berita. Model final dipilih setelah uji sampel. Catat biaya seluruh panggilan/retry, gunakan konversi kurs yang eksplisit dan margin aman sebelum panggilan. Saat mencapai batas atau biaya tidak dapat diverifikasi, RSS tetap diambil, analisis ditunda dan dilabeli; jangan sekadar mengandalkan saldo akun OpenRouter bersama.
3. Dokumen internal boleh dikirim ke provider eksternal HANYA dengan Zero Data Retention yang aktif dan terverifikasi pada provider/model/endpoint aktual. Fail-closed: hentikan pemrosesan eksternal dokumen jika dukungan/kebijakan ZDR belum terkonfirmasi. Untuk OpenRouter, verifikasi pengaturan ZDR dan routing provider yang sesuai dokumentasi resmi; jangan menganggap satu toggle menjamin semua endpoint.
4. Embedding lama dipertahankan untuk kompatibilitas indeks. Audit provider/model embedding existing dan apakah endpointnya memenuhi ZDR. Jika belum memenuhi, simpan dokumen pending tanpa mengirim teks sampai kebijakan ZDR terpenuhi; tidak mengganti embedding/re-embedding secara diam-diam.

## Detail operasional yang masih diperlukan saat eksekusi
1. Folder backup telah dibuat dan daftar remote diverifikasi: onedrive:Backup MIH (sibling Pengetahuan PMP). Ingestion wajib dibatasi ke onedrive:Pengetahuan PMP, bukan root OneDrive, dan mengecualikan Backup MIH. Belum ada arsip yang diunggah.
   Pengguna menyatakan ZDR saat ini sudah digunakan; audit teknis tetap memverifikasi provider/model/endpoint tanpa mengubahnya atau mengklaim verifikasi sebelum bukti tersedia.
2. Tentukan pemegang dan lokasi pemulihan kunci enkripsi; jangan meminta secret melalui chat.
3. Verifikasi kredensial, model, biaya dan pengaturan ZDR existing tanpa menampilkan secret. Plafon berita tidak otomatis mencakup biaya embedding; audit dan laporkan biaya embedding terpisah sebelum bulk backlog.
4. Penghapusan dokumen default aman: simpan versi, jangan hard-delete. Rekonsiliasi data VPS ke kantor hanya setelah audit overlap; jangan full restore.

**Status:** Hanya rencana. Tidak mengubah kode, layanan, routing, scheduler, atau DB dalam penyusunan ini.
Immediate next action setelah disetujui: Tahap 0 inventory deploy + Tahap 1 backup/restore drill, baru perubahan worker.
