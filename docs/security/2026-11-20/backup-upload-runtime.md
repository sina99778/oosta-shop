# Backup delivery, file uploads, and runtime checks

## Encrypted Telegram backups

The API bot and host scheduler now use the same sender for the private admin chat. The sender streams the encrypted archive in ranges of at most 19,000,000 bytes. This fits Telegram's 50 MB upload and 20 MB Bot API download limits. Small archives retain the original filename. Larger archives use the same timestamped name with the part number and total in each filename and caption. Each part is confirmed against the configured chat, filename, and Telegram message ID. The sender retries the current part up to three times and logs success only after Telegram confirms every part. [Telegram upload documentation](https://core.telegram.org/bots/api#senddocument), [Telegram download documentation](https://core.telegram.org/bots/api#getfile).

The sender creates one temporary ciphertext file inside the API container and removes it after normal completion or a handled failure. It streams each range directly from that file. If Telegram receives a part but the client's confirmation is lost, the retry can produce a duplicate. A failure after earlier parts were sent leaves an incomplete archive in the chat. Use an archive whose filename set is complete and follow the [recovery procedure](../2026-11-16/encrypted-backups.md#recovery-drill). The original archive length depends on database size and must fit the container's temporary filesystem. A container or host failure can interrupt delivery and cleanup.

Deploy the new API image before replacing `/opt/oostaAI/shared/release-ops/telegram-backup.cjs`. The new launcher loads the shared sender from the API image. Check the scheduler journal for the confirmed part count.

## Uploads and PDF receipts

The existing in-memory multipart handlers now compare declared types with JPEG, PNG, WebP, GIF or PDF signatures before route controllers receive the file. PDF is allowed for receipts. Headers identify the format, and the application keeps its file-size limits. Signature checks alone do not parse the whole document or scan it for malware. Receipt PDFs use a private, uncached attachment response with `Content-Security-Policy: sandbox`. The admin frontend downloads the fetched PDF. Existing ownership and current database role checks protect the receipt flows.

The upload middleware lowercases the declared MIME type before checking the signature and passing it to the controller. The receipt service also lowercases the type before checking its allowlist and storing it. The installed multipart parser already normalized header case, and the isolated regression reproduced `BAD_FILE_TYPE` on a direct service call with `IMAGE/PNG`. After the change, the service stored `image/png`, rejected an unsupported type, and denied a request for another buyer's order. HTTP checks accepted mixed-case PNG and PDF headers, rejected mismatched PNG bytes, and verified the PDF's private cache and download headers.

## Runtime and Nginx

Both Node images run as the bundled `node` user. The API prunes development packages after building and retains Prisma CLI for migrations. npm preserves TypeScript as an optional peer of Prisma. The web image grants the runtime user write access to Next.js cache and generated pages. On the shared VPS, grant the API's mapped UID a read-only ACL on `/opt/oostaAI/shared/suppliers.env` before starting the new image. For standard Docker UID mapping, the container uses UID 1000. The Blu status mount is already configured with a readable status file.

Run the credential check against the new image and the existing VPS mount before switching traffic. It checks readability without printing the file.

```bash
docker compose -p oosta -f docker-compose.prod.yml -f docker-compose.vps.yml \
  --env-file /opt/oostaAI/shared/.env.production run --rm --no-deps \
  --entrypoint sh api -ec 'test "$(id -u)" -ne 0 && head -c 1 "$SUPPLIER_CREDENTIALS_FILE" >/dev/null'
```

Both Nginx templates replace `X-Forwarded-For` and `X-Real-IP` with the address Nginx sees after applying trusted-CDN rules. Proxy routes clear upstream copies of `Ar-Real-IP`, `CF-IPCountry`, and `X-Country-Code`. The preview tracking limiter uses this same address and shares the site's trusted CDN list. For the shared VPS, install the repository's `trusted-cdn.conf` as `/etc/nginx/oosta-trusted-cdn.conf` and include it in this site's server block. Install both the updated tracking zone and tracking route files together before reloading. Check the effective configuration with `nginx -t` and verify that a direct request cannot supply the trusted address. The feature-gated VPS files have distinct install histories and route restrictions. Consolidation requires access to the rendered site configuration to confirm which route blocks and overrides are active. [ArvanCloud published edge ranges](https://www.arvancloud.ir/en/ips.txt), [Nginx real IP module](https://nginx.org/en/docs/http/ngx_http_realip_module.html).

The VPS uses `shared-vps-preview.conf` as its base. Compare the site's installed includes and effective location order with `nginx -T` before a change. Keep the catch-all preview write restrictions and enable only the route groups approved for this deployment.

| Route group | VPS configuration |
| --- | --- |
| Public indexing, asset cache, Search Console | `oosta-product-indexing.conf`, `oosta-content-indexing.conf`, `oosta-static-assets.conf`, `oosta-search-console.conf` |
| Account sessions and support | `oosta-auth-session-preview.conf`, `oosta-support-preview.conf` |
| Admin editing | `oosta-admin-catalog-preview.conf`, `oosta-admin-blog-preview.conf` |
| Supplier quotes and manual supplier administration | `oosta-supplier-quote-preview.conf`, `oosta-supplier-manual-admin.conf` |
| Enabled checkout routes | `oosta-supplier-checkout-live.conf`, `oosta-cart-live.conf` |
| Visit tracking | `oosta-visit-tracking.conf` at server scope and `oosta-track-limit.http.conf` at HTTP scope |

## Dependency checks

Both npm audits initially reported three high findings through Prisma's configuration package and its pinned Effect 3.21.0. The scoped override selects the patched Effect 3.22.1 and preserves Prisma 6.19.3. The dependency regression confirms the installed Effect version and exercises the Prisma configuration loader and nested merge. Both post-change npm audits reported zero advisories on 2026-11-20. [Effect advisory](https://github.com/advisories/GHSA-7589-6fvf-x4pw).

## Local operational checks

- The synthetic backup test reproduced the original 51 MB send failure. The shared sender passed exact byte reassembly, retrying a part after reading it, and cleanup with permanent failure. The host runner shell test passed with stubbed Docker.
- `npm run verify` passed with `OOSTA_TEST_AGE=1`. The isolated encrypted restore rejected a wrong key and altered ciphertext and recovered the synthetic order and inventory. The test runner removed the disposable database.
- The isolated HTTP tests rejected mismatched receipt bytes, accepted supported receipt uploads, required administrator access, and returned attachment, sandbox and private cache headers on the PDF.
- Nginx passed syntax checks for both templates. A synthetic upstream confirmed the preview template replaced forwarded addresses and discarded the raw headers. Direct requests with varying claimed addresses hit one rate-limit bucket. A synthetic allowlisted peer could set the address used for the limit and upstream request.
- Both Docker builds succeeded with a temporary local trust configuration for the workstation's TLS inspection. With external networking disabled, both containers ran as UID 1000 and served the API health endpoint and web login page. The API image also validated the Prisma schema and ran `pg_dump` and age. ESLint and Prettier were absent from that image.
