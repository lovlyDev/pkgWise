# Cache operations

`pkgwise cache status` is read-only and reports the resolved `v1` namespace, ownership-marker state,
entry count, byte size, expired entries, corrupt entries, and per-provider counts. Use the global
`--cache-dir <path>` option to inspect a non-default cache base.

`pkgwise cache clear --yes` removes the complete version namespace. Add `--provider <id>` to remove
only JSON entries whose validated envelope names that provider. Confirmation is mandatory because the
CLI intentionally does not use an interactive prompt.

Before deletion, PkgWise requires all of the following:

- the configured base is neither a filesystem root nor the user's home directory;
- the resolved namespace is the contained `<base>/v1` directory;
- the namespace and entries directory are real directories, not symbolic links or junctions;
- `v1/metadata.json` contains `{ "schemaVersion": 1, "owner": "pkgwise" }`.

An absent namespace is an empty, successful no-op. An existing unowned namespace fails with
`PW_CACHE_UNSAFE`. npm Registry package documents populate this cache automatically. Writes use a
same-directory temporary file and atomic rename; reads validate the key and payload checksum, treat
corrupt data as a miss, and quarantine it best-effort. Fresh npm documents live for six hours and may
be read stale in explicit offline mode for up to seven days.
