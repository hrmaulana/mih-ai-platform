# MIH kantor → VPS: template dan gate cutover (Tahap 6)

**Status: template saja, belum terpasang/diaktifkan.** Tidak ada restart produksi,
perubahan nginx/sshd/systemd live, pembukaan tunnel, commit atau push pada tahap ini.
Kantor `keuanganpmp` adalah satu origin produksi. VPS hanya proxy HTTPS/edge; DB VPS
bukan fallback. Backup off-site dan penerimaan pipeline tetap gate terpisah.

## Discovery read-only 13 Oktober 2026

- SSH alias kantor `vps`: `root@202.155.16.55:22`, identity existing
  `~/.ssh/vps_tunnel`, `corkscrew proxy.bappenas.go.id 8080 %h %p`.
  Identitas existing hanya digunakan untuk discovery, bukan di-copy/display.
- VPS hostname `vps.arthakarya.id`. `ss -ltnp` menemukan VPS `0.0.0.0:8080`
  (+ IPv6) sebagai docker-proxy MIH lama dan `127.0.0.1:8081` docker-proxy lain.
  **18080 tidak memiliki listener saat discovery**; pilih `127.0.0.1:18080`.
  Wajib periksa ulang sebelum start karena hasil ini bukan reservasi port.
- Nginx live MIH masih meneruskan HTTP/HTTPS ke VPS `127.0.0.1:8080`.
  Jangan sentuh site `remote.keuanganppn1.cloud`, port 8081 atau container lain.
- Site HTTP live tidak redirect (TLS Cloudflare/edge). HTTPS VPS memakai
  `/etc/letsencrypt/live/remote.keuanganppn1.cloud/{fullchain,privkey}.pem`.
  Sertifikat yang diperiksa memiliki SAN `mih.keuanganppn1.cloud` dan
  `remote.keuanganppn1.cloud`. Pertahankan jalur existing, verifikasi renewal/expiry
  sebelum aplikasi. Jangan menciptakan jalur sertifikat MIH yang belum ada.
- **BLOCKER PRIVASI: effective `sshd -T` VPS saat discovery: `gatewayports yes`.**
  Dengan ini, sshd dapat memaksa remote forward wildcard walaupun klien meminta
  127.0.0.1. Jangan start unit sebelum konfigurasi khusus akun tunnel terverifikasi.
- Frontend kantor di host port 8080 meneruskan `/api/` ke backend. Source
  `frontend/nginx.conf` belum memuat `proxy_buffering off`, HTTP/1.1 dan timeout
  streaming panjang. **BLOCKER SSE dua-hop:** proxy VPS saja tidak menyelesaikan
  buffering/timeout frontend kantor. Pemilik frontend/compose perlu memperbaiki
  hop ini dan memastikan `X-Forwarded-Proto` tidak hilang sebelum cutover.
  File frontend/compose tidak diubah oleh tahap tunnel.

## Artefak

- `deploy/systemd/mih-tunnel.service`: kantor, user lokal `hrmaulana`, SSH direct
  dengan corporate corkscrew, account VPS khusus `mih-tunnel`, dedicated key
  `~/.ssh/mih_office_tunnel` (belum dibuat), known_hosts existing + strict checking.
  `-F /dev/null` menghindari forward tak sengaja dari config alias existing.
  systemd `%%h`/`%%p` diterjemahkan menjadi placeholder SSH `%h`/`%p`.
  `ExitOnForwardFailure`, keepalive 30s×3, reconnect setiap 10s. Tidak menjamin
  origin sehat; health/data gate tetap diperlukan.
- `deploy/nginx/mih-office-proxy.conf`: pengganti **site MIH existing**, bukan
  include tambahan dengan duplicate server_name. Diletakkan di konteks `http{}`.
  Kedua listener HTTP/HTTPS seluruh URI → `127.0.0.1:18080`, termasuk `/api`, upload,
  SSE dan streamed chat. Buffer/cache/gzip off, timeout idle 3600s, upgrade map,
  body 50m. 502/503/504 menjadi maintenance lokal 503 + no-store + Retry-After;
  tidak ada peer/fallback VPS8080/8081. Stream yang sudah mengirim headers lalu
  putus tidak dapat diubah menjadi 503: client harus reconnect.
- `scripts/verify-office-route.sh`: GET-only, tanpa login/POST atau penciptaan
  auth; capture baseline kantor dan bandingkan signature target.
- `tests/tunnel/test_office_route.py`: fixtures lokal, tidak mengakses DB/aplikasi
  produksi; mencakup auth fail-closed, signature mismatch, maintenance, redirect,
  validasi URL/key permissions dan invarian template.

## Akun/key terbatasi: perubahan ini memerlukan persetujuan operator

Jangan gunakan key root existing `vps_tunnel` untuk layanan baru. Buat key dedicated
oleh operator, simpan private key di kantor mode 600 dan jangan tampilkan ke chat,
git atau log. Known-host fingerprint harus diverifikasi out-of-band; `ssh-keyscan`
saja bukan verifikasi. Unit sengaja menolak host yang belum dipercaya.

Contoh **opsi** entry `authorized_keys` akun VPS khusus (public key diisi operator):

```text
restrict,port-forwarding,permitlisten="127.0.0.1:18080",command="/usr/bin/false" <PUBLIC_KEY_DIISI_OPERATOR>
```

`restrict` melarang PTY, agent/X11 forwarding, user rc; `port-forwarding` membuka
forward dengan batas `permitlisten`. `command` menolak shell/exec, bukan `ssh -N`.
Gunakan akun dedicated tanpa shell interaktif; jangan ganti shell/akses root existing.
Untuk membatasi hanya reverse TCP forwarding, persiapkan **Match User** yang ditinjau:

```text
Match User mih-tunnel
    AuthenticationMethods publickey
    PasswordAuthentication no
    AllowTcpForwarding remote
    AllowStreamLocalForwarding no
    GatewayPorts no
    PermitListen 127.0.0.1:18080
    PermitOpen none
    AllowAgentForwarding no
    X11Forwarding no
    PermitTTY no
    PermitUserRC no
    MaxSessions 0
```

`GatewayPorts no` memaksa loopback; `clientspecified` hanya alternatif dengan
`PermitListen` ketat, bukan `yes`. `PermitOpen` membatasi local/direct forward,
**bukan** tujuan lokal remote forward; siapa menguasai key kantor dapat memilih
origin lain di kantor. Karena itu lindungi private key dan pin unit/origin.
Verifikasi `sshd -t` dan `sshd -T -C user=mih-tunnel,host=<host>,addr=<office-egress>`
sebelum reload terkontrol (bukan dilakukan pada tahap template ini). Pastikan sesi
admin cadangan tetap ada. Setelah izin start, `ss -ltnp` harus menampilkan **hanya**
`127.0.0.1:18080`, tidak `0.0.0.0:18080`, `[::]:18080`, atau IP publik.

## Verifikasi route tanpa auth fiktif

Gunakan satu sesi/token pengguna MIH kantor yang benar dan masih berlaku. Operator
menyimpan tepat satu baris `Cookie: mih_session=<REAL_SESSION>` atau
`Authorization: Bearer <REAL_TOKEN>` dalam file regular milik user mode 600 di luar
repo. Script tidak mencetak credential, user detail, nama dokumen atau body API;
redirect dilarang agar credential tidak berpindah origin. HTTPS diverifikasi normal,
HTTP hanya loopback. File credential bukan cookie-jar Netscape; ini file satu header.
Script memakai konfigurasi proxy lingkungan urllib (loopback mesti masuk NO_PROXY).
Jangan menaruh secret di argumen CLI, shell history, fixtures produksi atau chat.

1. Dari kantor, capture hanya frontend lokal yang sudah dibuktikan memakai DB kantor:

   ```bash
   scripts/verify-office-route.sh --office-base http://127.0.0.1:8080 \
     --auth-header-file /secure/operator/mih-auth.header --capture-office \
     > /secure/operator/office-signature.json
   ```

   Capture memeriksa anonymous `/api/auth/me`, `/api/admin/documents`,
   `/api/early-warning?limit=1` harus 401; credential real harus 200 JSON. Signature
   memuat count documents, sum chunk_count, hash metadata id/status/chunks/updated_at,
   total berita + newest id/fetched_at, hash HTML/bundle references dan user id/admin.
   Cocokkan count/chunks dengan query read-only DB kantor/snapshot independen.
   **751/19111 adalah snapshot drill, bukan konstanta yang diasumsikan selalu benar.**
   Sum `documents.chunk_count` tidak membuktikan jumlah baris chunks aktual atau isi
   file, jadi query DB/file canary independen tetap gate. Baseline harus berasal kantor,
   bukan data yang ditangkap dari target yang belum dipercaya.

2. Setelah izin provisioning/start tunnel (belum pada task ini), dari VPS gunakan
   baseline kantor yang ditransfer aman dan credential real dalam file mode 600:

   ```bash
   scripts/verify-office-route.sh --target-base http://127.0.0.1:18080 \
     --auth-header-file /secure/operator/mih-auth.header \
     --expected-office-signature /secure/operator/office-signature.json
   ```

   Jangan gunakan VPS localhost8080 sebagai referensi kantor. Dari kantor, target
   loopback VPS tidak dapat diakses tanpa operator transport yang terpisah. Signature
   mismatch memblokir cutover. Jika worker/crawler mengubah snapshot, recapture saat
   window terkendali, jangan mengendurkan comparison. Header auth juga dibuktikan oleh
   `/auth/me`, bukan hanya HTTP 200 SPA. Script tidak memanggil `/health` karena frontend
   tidak memproxy path tersebut dan dapat mengembalikan SPA palsu.

3. Sesudah operator menyetujui nginx switch, ulangi target
   `https://mih.keuanganppn1.cloud` dari jaringan nyata; script tidak menganggap sukses
   loopback sama dengan sukses publik. Opsional `--office-base` pada mode compare
   mengecek bahwa baseline kantor tidak berubah.

4. Dengan outage terkontrol yang diizinkan operator, dari jaringan publik:

   ```bash
   scripts/verify-office-route.sh --target-base https://mih.keuanganppn1.cloud \
     --expect-maintenance
   ```

   Semua frontend/auth/docs/news harus 503. Jangan menghentikan tunnel/produksi pada
   tugas template. Edge cache wajib bypass `/api/*`, auth dan maintenance; cache lama
   dapat menyembunyikan 503. Template tidak mempercayai inbound proto sembarang;
   HTTP origin meneruskan proto HTTPS untuk topologi edge saat ini. Gate operator:
   edge harus enforce HTTPS dan cert mode/coverage benar. X-Forwarded-For saat ini
   append; konfigurasi trusted Cloudflare real IP adalah keputusan terpisah, jangan
   menggunakan arbitrary client header sebagai identitas tepercaya/rate-limit.

## Gate sebelum cutover — belum dinyatakan lulus

- Backup kantor + off-site tervalidasi dan drill restore; budget/ZDR/worker/news gates.
- Dedicated account/key + effective GatewayPorts no/PermitListen; cek ulang port bebas.
- Frontend kantor juga HTTP/1.1, buffering/cache off dan timeout SSE/chat panjang;
  meneruskan `X-Forwarded-Proto` terverifikasi sampai backend.
- Unit diinstal/start hanya dengan approval; pastikan listener loopback dan origin sehat.
- Route signature + auth kantor lewat tunnel; canary read-only dokumen/file/chunk dan
  berita aktual; tidak cukup HTML/401. SSE incremental arrival perlu observasi aktual
  di kedua hop dan edge; script GET-only tidak POST `/ask` agar tidak biaya/mutasi chat.
- Nginx baru diuji bersama config VPS aktual, cert tersedia/valid; backup site MIH
  lama lalu reload terkontrol sesudah approval. Tidak restart/restore DB.
- HTTPS publik, login/session cookie Secure dan anonymous gate; UI bundle/api serasi;
  stream tidak buffered dan maintenance 503 tanpa fallback/cache stale.
- Rollback routing adalah keputusan eksplisit operator ke backup site lama, bukan
  peer otomatis. Laporkan VPS lama sebagai data stale; jangan hapus volume/stack VPS.

## Tes fixture saja

```bash
bash -n scripts/verify-office-route.sh
systemd-analyze verify deploy/systemd/mih-tunnel.service
python3 -m unittest discover -s tests/tunnel -v
```

Hasil eksekusi tahap template: `bash -n` lulus, `systemd-analyze verify` exit 0
(hanya warning CPUAccounting pada unit XFS bawaan sistem, bukan unit MIH), dan
**15 tests lulus tanpa skip** dengan `MIH_TEST_NGINX=/tmp/mih-nginx-fixture/usr/sbin/nginx`
serta `python3 -W error::ResourceWarning -m unittest discover -s tests/tunnel -v`.
Binary nginx 1.28.3 berasal paket yang diekstrak ke `/tmp`, tidak diinstall sebagai
service. Tes nyata `nginx -t`, incremental SSE lokal dan upstream-down 503 lulus.
Belum dilakukan pembuktian route produksi/auth real, instalasi key/account, start
tunnel, nginx cutover atau outage produksi.

Nginx syntax tes memakai nginx binary lokal atau `MIH_TEST_NGINX` yang menunjuk
binary fixture, config sementara dan sertifikat self-signed sementara. Opsional
`MIH_TEST_NGINX` juga menambah fixture request upstream-down 503 dan SSE unbuffered
pada proxy baru **lokal**. Tidak menguji site VPS live atau forwarding produksi.
