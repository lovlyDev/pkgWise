# Provider behavior

## npm Registry

`pkgwise inspect <name> --remote` and `pkgwise inspect <name>@<version-or-tag> --remote` query the
public npm Registry. Without `--project`, the operation is remote-only and does not require a local
`package.json`. Supplying `--project` combines registry metadata with installed graph context.

The current normalized metadata includes available versions, dist-tags, selected exact version,
description, license, deprecation notice, Node engine constraint, and repository reference. A tag such
as `latest` or `next` is resolved from the returned package document and the exact result is displayed.

Provider requests:

- use HTTPS only and refuse redirects;
- accept JSON and cap the streamed response at 5 MiB;
- use a configurable request timeout;
- retry network failures and HTTP 408, 425, 429, 500, 502, 503, and 504 up to three attempts;
- respect bounded `Retry-After` values and otherwise use exponential full jitter;
- never fetch tarballs or execute package code.

`--refresh` bypasses a fresh read and revalidates from the network. `--no-cache` disables both cache
reads and writes. `--offline` proves the provider path performs no fetch: it uses fresh or permitted
stale data and returns `PW_PROVIDER_UNAVAILABLE` (exit code `4`) on a cache miss. Registry 404 maps to
`PW_PACKAGE_NOT_FOUND` (exit code `2`). JSON output includes provider URL and `miss`, `fresh`, or `stale`
cache provenance.

## OSV advisories

After npm metadata resolves an exact version, remote inspection queries OSV with the exact npm
coordinate. `pkgwise scan <path> --remote` checks every unique exact coordinate available from the
lockfile. Repeated locators for the same `name@version` share one request and cache entry; project
requests run with a maximum of four concurrent workers even when the global concurrency setting is
higher. Active records become `security/osv-vulnerability` findings with confirmed-fact evidence,
stable fingerprints, normalized severity, recommendation, and local dependency paths when project
context exists.

OSV aliases are treated as an identity graph. Connected records are merged into one advisory using the
strongest reported severity and the union of IDs, references, and timestamps. This prevents duplicate
findings when databases publish the same vulnerability under mutually linked GHSA or CVE identifiers.
Withdrawn records remain visible in advisory history but do not generate active findings. Unknown
severity stays `unknown` in the advisory and becomes informational in the finding; PkgWise does not
invent a numeric severity.

OSV query results are fresh for one hour and available stale in offline mode for up to 24 hours. An OSV
failure does not erase usable local data. Focused inspection includes `PW_OSV_UNAVAILABLE`; project
reports include `PW_OSV_PROJECT_ENRICHMENT_INCOMPLETE`, an `available`, `partial`, `offline`, or
`unavailable` status, and evaluated/eligible coordinate counts. Cached project scans work with
`--offline --remote` without opening a socket.

GitHub repository metadata, custom registries, conditional ETag revalidation, and OSV batch-query
optimization remain future increments.
