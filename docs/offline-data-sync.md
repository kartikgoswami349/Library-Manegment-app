# Local accounts, database, and LAN sync

## Local database and accounts

The app uses a persistent `expo-sqlite` database named `library.db`; it does
not require a cloud account or API. On first use, the database imports the
catalog from `assets/library-seed.json`. The books table follows the supplied
schema reference, including `index_path`; imported rows have no cover image.

Profiles and borrowing fields follow the app's local library workflows. New
accounts have a unique username, a PBKDF2-HMAC-SHA256 password hash, and the
`subscriber` role. Passwords are never stored as plain text. The initial local
administrator is `admin` / `123456`; change this password from the profile
screen after first sign-in. There is no email-based recovery, so forgotten
passwords must be reset by an administrator through a future local reset
workflow.

Borrowing subscribers are separate from login accounts. Add them manually from
**Admin Dashboard → Subscribers → Add subscriber**; the generated borrower
record has no login password. Login accounts received through LAN sync are not
added to the borrowing subscriber list, and a manually added subscriber is
available in the issue-book search on every paired device.

When upgrading an older local database, profiles that existed before usernames
are assigned a generated `user-<id>` username and their old email column is
removed. Those legacy profiles do not have local password credentials; create
new local accounts for people who need to sign in.

## Using LAN sync

Open **Device Sync** once on both devices to start their LAN listeners; they
remain available until the app exits. Discovery works in native
development/production builds; the TCP socket module is not included in
standard Expo Go. Each listener must successfully own its TCP port before its
service is advertised. If a preferred port is occupied, the listener uses the
next available reserved port and advertises the actual port; startup reports an
error if every reserved port is unavailable. On the device doing the pairing, open
**Admin Dashboard → Device Sync
→ Find Nearby Device**, select the destination, enter the six-digit code shown
on that destination, and choose **Pair & Sync**. Both devices save the pairing;
there is no host-group role. Pairings remain until explicitly re-paired or
forgotten. Re-pairing updates that peer's code and safely replays retained
events; event application is idempotent.

Each device displays a temporary six-digit R58 pairing code that expires after
five minutes and is consumed after a successful pairing. Pairing exchanges a
persistent shared secret; the code is not reused as the long-term sync
credential. Device identity and the shared secret are stored in platform
secure storage (Expo SecureStore on mobile and Electron `safeStorage` on
desktop). The R58 listener prefers TCP port `45858` and can use `45859` or
`45860` when needed. The legacy transfer listener prefers `45831` and can use
`45832` or `45833`. Both actual ports are included in discovery metadata and
saved pairings. R58 uses newline-delimited JSON packets. Pairing and sync requests/responses are
authenticated with SHA-256 over the shared secret, packet ID, and direction.
Pairing is saved before the initial sync starts; if that sync fails, the device
remains paired and can be synced again without pairing a second time.

Both platforms advertise and discover `_r58inventory._tcp` using mDNS with
device ID, display name, and protocol version in TXT metadata. Android uses the
same explicit `DNSSD` implementation and long-lived scanner as R58 Inventory;
the default Android NSD implementation can omit services published by other
apps. Electron keeps a persistent Bonjour browser and refreshes its service
cache. Both current TXT key conventions (`id`/`name` and
`deviceId`/`deviceName`) are accepted and advertised, alongside the actual
legacy transfer port. Android's generated
manifest includes the Wi-Fi multicast and network permissions required for
discovery. Each mDNS candidate is confirmed with a correlated Library R58 v1
`discover` request before it appears in the nearby list. This filters stale
advertisements and Inventory services that use the same Bonjour service name
and TCP port but a different packet envelope.

Discovery verifies mDNS peers with a correlated TCP request, then scans the
local IPv4 subnets for devices not found there. The bounded fallback probes the
reserved R58 TCP ports `45858`–`45860` and legacy Library ports `45831`–`45833`.
Electron derives candidates from each local
IPv4 interface's netmask, capping broader networks to a `/24`; Android uses
the IP address available from Expo Network and probes its `/24` fallback range.
Probe concurrency is bounded to avoid overwhelming the mobile TCP module.
Firewall rules or Wi-Fi client isolation may still prevent fallback discovery.
R58-discovered devices always use the authenticated R58 pairing and sync
exchange on the advertised port; errors are surfaced rather than silently
retrying the legacy protocol. The legacy listener remains available for
already-deployed Android clients and legacy pairings.

On Windows, inbound LAN sync requires Ashram Library to be allowed through
Windows Firewall. The Windows installer adds an app-specific TCP allowance for
ports `45831`–`45833` and `45858`–`45860` on the **Private** profile only. Install with
administrator approval if Windows requests it, and mark only a trusted home or
office Wi-Fi as Private. When running the Electron development build, add an
equivalent inbound rule for its `electron.exe`; the installer rule applies to
the installed `Ashram Library.exe`, not the development runtime.

R58 maps books to `items`, profiles to `people`, borrowings to `transactions`,
and the append-only sync event history to `audits`. This app does not currently
have a departments table; it rejects nonempty department records rather than
discarding them. A transaction/borrowing is mutable in the current app model,
while its event history is retained as the audit trail.

An acknowledgment ledger tracks outbound events per peer so syncing one
device cannot mark changes as delivered to every other device. Paired devices
attempt sync automatically about every 20 seconds while the app is active in
the foreground, and make a nonblocking sync attempt after a local change. Each
device must be running and reachable for an exchange; a failed automatic
attempt is logged and can be retried manually.

### Direct Library transfer

On iOS and Android, **Transfer Library → Send Library** compares the selected
paired device's records and cover hashes, then sends missing or newer books,
profiles, borrowing records, and changed covers in bounded batches. The
receiver creates and verifies a `.library` safety backup before applying the
incoming changes; after receiver verification, the sender checks for newer
receiver-side changes and applies those with its own safety backup. Each device
keeps its own SQLite database. Direct transfer works between native iOS/Android
devices and the Electron desktop app.

Transfer staging is currently held in memory on the receiving device. If a
connection drops before commit, reconnect both devices and press **Continue
Transfer** again; acknowledged record batches and cover chunks are resumed while
both apps remain running. If either app restarts, compare again and start a new
transfer; records already committed are compared by version and are not sent
again.

The sync screen shows local readiness counts, supports a manual refresh button
with a success/error status bar, and includes a LAN self-test. The admin
dashboard and subscriber screen expose the same refresh/status pattern.
Forgetting a device removes the pairing on both ends when the peer is reachable;
if it is offline, forget it on the other device separately. Neither operation
erases either device's local library data.

## Export and backup

- **Excel workbook (`.xlsx`)** exports Books, People, Transactions, Sync Events,
  and Conflict Audits sheets. Password hashes and raw sync/conflict payloads
  are excluded from this workbook.
- **Sync packet (`.json`)** exports/imports the append-only sync events for
  offline transfer and can be replayed idempotently. Packets may include
  account credential hashes in profile events; protect them like backups.
- **Portable Library backup (`.library`)** is the preferred user-facing format.
  It is a ZIP container with `library.db`, `manifest.json`,
  `checksums.json`, and `covers/<book-id>.<extension>`. The manifest records
  the database version and record counts from the exact serialized database
  snapshot. SHA-256 checksums cover every package file and every cover. Before
  import or export, the database snapshot is opened from a temporary cache file
  on native devices and checked with SQLite integrity and schema checks; import
  also verifies manifest counts, cover references, archive paths, and checksum
  coverage before changing the local library. Desktop import normalizes the
  SQLite journal-mode header on a copy of standalone mobile snapshots so the
  web in-memory SQLite VFS does not look for a missing WAL sidecar; the package
  bytes and checksums remain unchanged. Package creation fails if an existing
  cover URI cannot be read.
- **SQLite backup (`.db`)** is available on iOS/Android and the Electron
  Windows desktop app. On Electron, the backup is serialized from the local
  SQLite/WASM database and saved through the native file dialog; restore opens
  the selected file, validates it, and replaces the current database contents.
  Restore accepts healthy Library backups at supported schema versions. The `.library`
  workflow supports replace and merge modes; merge replays the event log and
  also imports the package's current records, including seeded catalog records
  that may not have sync events. Snapshot event IDs are deterministic, and the
  existing latest-edit-wins conflict audit is retained. Replace preserves the
  receiving device's device ID, clears its stale peer roster, and marks events
  for resync. Keep a separate backup before restoring; restore is not an undo
  operation.

Use the share sheet or browser download to save exports. Database backups and
sync packets contain sensitive library/account data and should only be shared
with trusted people and devices.

## Windows desktop application

The PC build is an installable Electron application, not a hosted website. It
packages the existing Expo/React Native Web screens inside an Electron
renderer, with a locked-down main/preload boundary (`contextIsolation` enabled
and Node integration disabled). The desktop build exposes native file dialogs,
an authenticated TCP LAN-sync client and listener, LAN discovery, and a
paired-device transfer listener through typed IPC. Desktop and mobile devices
can both discover, pair, sync, and send or receive direct transfers. Pairing
codes are encrypted with Electron `safeStorage`, and
transfer safety backups are saved in the desktop app's user-data directory.
Run `npm run desktop:package` to produce the Windows installer in `release/`.

Every local book, profile, issue, return, and password change is committed to
SQLite with an append-only sync event in the same transaction. A successful
local event schedules an immediate, nonblocking attempt to sync trusted peers;
the foreground interval remains the retry mechanism when a peer is offline.
Native database
transactions are exclusive, and each listener serializes incoming sync requests
so concurrent devices cannot interleave their sync writes. The Library R58 v1
packet envelope and authentication remain unchanged. Devices exchange new events
in authenticated batches of up to 200, continuing
in both directions until neither side has another batch, instead of stopping
after a single page or repeatedly sending complete history.
The receiver tracks a per-device acknowledged sequence and resends an
unacknowledged batch after a dropped connection; each sender also records which
events each peer has acknowledged. Applying a repeated event is idempotent.
Password hashes and salts are included so accounts can be used on synced
devices. For the same record, a higher revision wins, then the most recent
modification time, then the device ID as a deterministic tie-breaker. Incoming competing versions are
preserved in `sync_events` and summarized in
`sync_conflicts`; returns update borrowing records rather than deleting them.
If two offline devices issue the same book independently, the newer active
issue wins and the superseded issue remains in the audit history.

## Boundaries and security

- Each device keeps its own SQLite database; the LAN listener only exchanges
  sync and transfer requests, never exposes a shared database file.
- Portable `.library` packages include readable cover bytes and restore them to
  app-managed native storage (or safe data URIs in Electron/web). Existing
  legacy book rows still retain their original URI until they are included in a
  package restore; missing legacy files cause package creation to fail visibly
  rather than producing an incomplete package.
- LAN traffic is plain TCP/HTTP protected by a six-digit per-device code, not
  encrypted. Invalid pairing attempts are rate-limited, but the code is not a
  substitute for transport encryption. Password hashes are transmitted to
  trusted peers as part of account sync. Use pairing only on a trusted private
  network; never sync over public Wi-Fi.
- Sync requests are capped at 20 MiB; direct transfers use bounded event and
  cover chunks and are limited to 128 MiB total, with individual covers limited
  to 32 MiB. Events are retained for auditability and reliable retry; a
  coordinated compaction strategy is needed for long-running deployments. All
  devices should be upgraded to the current app version before syncing because
  the incremental sync protocol is versioned.
