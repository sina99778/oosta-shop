# Encrypted backups and recovery

The Telegram admin bot sends only `.sql.gz.age` database backups to the configured private admin chat. PostgreSQL output is compressed and streamed directly into age, so the outgoing backup does not create a plaintext archive on disk. The recipient is a native age public key. Missing or invalid configuration prevents sending. Manual and scheduled attempts share a process lock. The admin token and the database password are not included in command arguments or backup failure messages.

The Windows recovery key is in the operator's profile under `%LOCALAPPDATA%\OostaRecovery\backup-key.txt`, with access restricted to that Windows account. Install age on a trusted recovery machine and store a second protected copy of the recovery key separately. Production only receives the public recipient. Keep old recovery keys while their encrypted backups are retained.

## Recovery drill

1. Obtain an archive produced by the store through a trusted channel. Keep its SHA-256 digest alongside any copy maintained outside Telegram.
2. On a trusted machine, decrypt into a private directory and verify the age command exits successfully before using the unpacked SQL.

   ```powershell
   $identity = Join-Path $env:LOCALAPPDATA 'OostaRecovery/backup-key.txt'
   age -d -i $identity -o .\recovery.sql.gz .\oosta-backup.sql.gz.age
   if ($LASTEXITCODE -ne 0) { throw 'Backup decryption failed' }
   ```

3. Expand the gzip and use the PostgreSQL client's single-transaction restore against a disposable, disconnected database. These archives replace tables and may include credentials and personal data. Verify the migration history, order and receipt counts, inventory states and supplier ledgers. The test suite can run this drill on synthetic data with `age` and `age-keygen` on PATH and `OOSTA_TEST_AGE=1 npm run verify` under a POSIX shell.
4. A live recovery is an operator action. First suspend writes, external workers and the bot, and retain the current database plus the latest payment, supplier purchase and FX quota ledgers. Reconcile the interval since the snapshot before resuming service. Telegram documents and legacy confirmation buttons cannot start a restore.

The Telegram interval, when enabled, starts when the API comes up. The live interval was set to zero and is still disabled. The owner can request an encrypted backup from the admin menu. Archives previously sent as plaintext are a separate exposure. Rotate the Telegram token previously shared in chat through the bot owner before enabling scheduled delivery.

`npm run verify` ran with `OOSTA_TEST_AGE=1` and passed. A synthetic encrypted archive rejected a different private key and altered ciphertext. Decryption and restoration of the intact archive returned the disposable order to its previous paid status and preserved delivered inventory. Telegram guard tests use a stub. ESLint, the production API build and both npm audits passed. The image installs age 1.3.2 from the signed Alpine package repository.

Release `20261116-encrypted-backups` was verified with the live DB health check and storefront HTTPS. Its production API created a 1,835,522-byte ciphertext archive. The encrypted copy saved in the Windows recovery directory matched the server SHA-256 and decrypted with the local identity; the plaintext stream was discarded. Production data was never restored or sent to Telegram in this check. No schema changes were needed.
