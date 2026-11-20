# Encrypted backups and recovery

The Telegram admin bot sends encrypted database backups to the configured private admin chat. PostgreSQL output is compressed and streamed directly into age. A backup larger than 19,000,000 bytes is streamed from the same ciphertext file as consecutive numbered documents. Each document fits both Telegram's upload and Bot API download limits. Missing or invalid configuration prevents sending. The admin token and the database password are excluded from backup failure messages.

The Windows recovery key is in the operator's profile under `%LOCALAPPDATA%\OostaRecovery\backup-key.txt`, with access restricted to that Windows account. Install age on a trusted recovery machine and store a second protected copy of the recovery key separately. Production only receives the public recipient. Keep old recovery keys while their encrypted backups are retained.

## Recovery drill

1. Obtain an archive through a trusted channel. For a multipart backup, download every document with the same timestamped archive name. Save the names intact in an empty private directory. Check that numbering starts at 1, ends at the stated total and contains every part exactly once. Concatenate the parts in filename order to recover the original `.sql.gz.age`.

   ```powershell
   $archiveName = 'oosta-2026-11-20T03-15-00-000Z-Example.sql.gz.age' # use the actual archive name
   $parts = @(Get-ChildItem -File -Filter "$archiveName.part-*" | Sort-Object Name)
   if (!$parts.Count -or $parts[0].Name -notmatch '\.part-(\d+)-of-(\d+)$') {
     throw 'Missing or invalid backup parts'
   }
   $width = $Matches[1].Length
   $total = [int]$Matches[2]
   if ($parts.Count -ne $total) { throw 'Incomplete backup' }
   for ($i = 0; $i -lt $total; $i++) {
     $expected = "$archiveName.part-" + ($i + 1).ToString("D$width") + '-of-' + $total.ToString("D$width")
     if ($parts[$i].Name -cne $expected) { throw "Missing backup part $expected" }
   }
   $archive = [IO.File]::Open((Join-Path (Get-Location).Path $archiveName), 'CreateNew')
   try {
     foreach ($part in $parts) {
       $inputPart = $part.OpenRead()
       try { $inputPart.CopyTo($archive) } finally { $inputPart.Dispose() }
     }
   } finally { $archive.Dispose() }
   ```

   Keep a SHA-256 digest alongside any copy maintained outside Telegram.
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
