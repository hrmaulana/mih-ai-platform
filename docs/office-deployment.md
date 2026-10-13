# Deploy kantor MIH — persiapan Tahap 0

**Status: code-only, belum deploy.** VPS adalah target proxy-only; workflow tidak lagi memiliki job deploy aplikasi VPS. Nginx/tunnel/VPS app existing tidak diubah. Script VPS/prod legacy tetap tersimpan untuk historis, bukan jalur deploy yang diizinkan. Jangan menjalankannya.

## Inventaris read-only (13 Oktober 2026)

- Host `keuanganpmp`, repo produksi `/home/hrmaulana/mih`; IP kantor disepakati `10.2.17.186`, Tailscale `100.102.56.69` (alamat dari konteks, bukan pemeriksaan jaringan baru).
- Live Compose project `mih`, config `/home/hrmaulana/mih/docker-compose.prod.yml`, working directory `/home/hrmaulana/mih`.
- DB `mih-db-1`: **bind** `/data/mih/pgdata` → `/var/lib/postgresql/data`; bukan volume `db_data` pada Compose dev.
- Backend dan worker: **volume** `mih_appdata`, `/var/lib/docker/volumes/mih_appdata/_data` → `/data`.
- Worker juga memiliki bind `/home/hrmaulana/mih/data/rclone` → `/data/rclone` RW; Tahap 0 tidak mengubahnya menjadi source ingestion baru.
- Frontend `mih-frontend-1` tidak memiliki mount persisten. Port 8080 adalah target kantor menurut plan.
- Backend live memiliki revision label `34cbb9a40b4bd1bd767d134a7065e66c2432a676`; worker/frontend tidak memiliki revision label. Jangan menganggap image-image itu sudah sama dengan Git HEAD `768503471c1ddf04d0faceb5e2e297409bcbeded` saat inventaris.
- Runner service `actions.runner.hrmaulana-mih-ai-platform.arthakarya.service`: **inactive**, user `hrmaulana`, entry `/home/hrmaulana/actions-runner/runsvc.sh`. Metadata lokal `.runner` berisi `agentName=arthakarya`, `poolName=Default`, **tidak mencantumkan labels**. Label unik belum terbukti terdaftar; tidak ada re-registration/start service dilakukan.

## Kontrak release

1. Workflow hanya menerima completion CI **success**, event **push**, branch **master**, repository yang sama. Tidak ada manual dispatch yang melompati CI. Checkout/build/frontend artifact menggunakan `workflow_run.head_sha`, bukan branch HEAD yang bergerak.
2. GitHub-hosted job menjalankan safety tests, `npm ci` dan build frontend. Artifact bernama `frontend-dist-<SHA>` membawa `.mih-release-sha` dan SHA256 manifest. Artifact office diambil dari run Deploy yang sama, lalu SHA, checksum, kelengkapan file, path traversal dan symlink diperiksa. Frontend di kantor hanya assembly image `COPY dist`; tidak menjalankan instalasi/build frontend.
3. Job kantor membutuhkan `[self-hosted, Linux, X64, mih-office-keuanganpmp]`, **repository variable** `MIH_OFFICE_DEPLOY_ENABLED=true`, dan environment `office-production`. Default missing/false berarti tidak deploy. Variable environment-only tidak cukup untuk job-level gate.
4. Script runner checkout bertugas memeriksa host, physical repo path dan tracked/untracked dirtiness; script tidak menghapus/stash file pengguna. Git fetch exact object dan checkout detached exact SHA, tidak `pull master`, `reset --hard` atau `git clean`. Kredensial fetch disediakan host secara aman; transport output disembunyikan.
5. Semua operasi Compose eksplisit `-p mih --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.office.yml`. Override hanya menjadikan `mih_appdata` external dengan nama tetap: volume yang hilang membuat deploy gagal, bukan dibuat ulang. Guard menggunakan identity override dari tested runner checkout agar release pertama tidak membutuhkan override sudah ada di revision produksi lama.
6. Guard membandingkan **seluruh mount** planned/live untuk DB/backend/worker, live project/service/repo/config labels, running state, nama/lokasi appdata dan bind pgdata. Tidak boleh ada perbedaan diam-diam. Tahap ingestion berikutnya yang sengaja menambah mount memerlukan perubahan guard/test yang direview; guard Tahap 0 sengaja menolak delta mount.
7. Hanya backend/frontend/worker/analisis-service/artikel-service dibangun, lalu `up --no-deps --no-build` untuk kelima service itu. DB/seed tidak dimasukkan; tidak ada migrasi otomatis. Frontend artifact lama dipindahkan ke direktori unik `/tmp/mih-previous-dist.*` sebelum penggantian, tanpa merge stale chunks. Ini bukan backup durable atau rollback image otomatis.
8. Script default read-only: `bash scripts/deploy.sh <tested-sha> <artifact-dir>`. Ia mengharuskan repo sudah di SHA tersebut dan tidak fetch/checkout/copy/build/restart. `--apply` tambahan plus enable variable adalah tindakan berisiko yang **belum dijalankan pada tahap persiapan ini**. Kegagalan setelah checkout tidak mengembalikan checkout; kegagalan smoke tidak otomatis mengembalikan image/DB.

## Gate wajib sebelum mengaktifkan deploy

- Review, commit scoped dan push perubahan workflow aman bersama kode; CI backend/worker/frontend/Docker dan deployment tests hijau pada SHA release. Tidak ada commit/push dilakukan dalam persiapan ini.
- **Preservasi/reconcile manual dirty checkout kantor**, termasuk `.hermes/` dan SRS untracked; jangan hapus/stage otomatis. Untracked apa pun sengaja memblokir deploy. Simpan yang non-release di lokasi aman atau kebijakan local-exclude yang disetujui operator, bukan force-clean.
- Verifikasi/daftarkan unique label `mih-office-keuanganpmp` pada runner kantor saja; audit logs/restart policy dan akses Docker/proxy/GitHub artifacts/git host sebelum service diaktifkan dengan persetujuan terpisah. Pastikan workspace runner **berbeda** dari repo produksi.
- Buat/protect environment `office-production` dengan required reviewer, prevent self-review, branch restriction dan kebijakan bypass yang sesuai kemampuan repository. Nama environment pada YAML sendiri **tidak** membuktikan protection aktif. Tetapkan repository enable variable hanya setelah gate lengkap; jangan aktifkan sekarang.
- Backup kantor + encrypted off-site OneDrive terverifikasi dan restore drill lulus sesuai Tahap 1; persetujuan deployment/restart aplikasi eksplisit. Aksi DB/migrasi yang diperlukan release harus direview dan backup-gated terpisah karena script tidak menerapkannya.
- Artifact CI SHA/checksum tersedia, container DB/backend/worker live dan mount identity tetap sesuai guard; proxy dependency backend/worker dan Docker base-image availability terverifikasi. Belum ada build production yang diuji.
- Sesudah deploy terkontrol: authenticated business acceptance, dokumen/chunks/news, worker health dan UI bundle/route cocok SHA. Smoke otomatis hanya portal/deep-route HTTP dan endpoint API mengembalikan 401, **bukan** bukti data bisnis atau kesehatan ingestion.
- VPS tunnel/listener/nginx serta public cutover tetap manual Tahap 6 setelah acceptance kantor. Public domain masih belum dibuktikan menggunakan kantor; tidak ada perubahan gateway/routing atau penghentian app stack VPS di sini.

## Verifikasi aman yang tersedia

```sh
python3 -m unittest discover -s tests -p test_office_deployment.py -v
bash -n scripts/deploy.sh
python3 scripts/deploy-office-preflight.py
```

Suite stdlib menggunakan temporary fixture/fake executables; tidak menjalankan Docker produksi. Perintah preflight terakhir hanya `compose config`, `docker inspect`, `docker volume inspect`; output config/env/secret ditahan di memori, tidak dicetak/disimpan. Sanitized config comparison saat implementasi: service config **identik**, project tetap `mih`; hanya appdata berubah dari `name=mih_appdata` menjadi `name=mih_appdata, external=true`.

`actionlint` dan `shellcheck` tidak tersedia pada host saat verifikasi. YAML berhasil diparse dan shell syntax/safety fixture tests lulus; validasi Actions remote/production build/deployment belum dilakukan.
