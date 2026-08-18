# Security policy

PkgWise analyzes dependency metadata and may process untrusted manifests, lockfiles, cached provider
responses, and command-line input. It must never execute code from a project being analyzed.

## Supported versions

Before the first stable release, only the latest published alpha receives security fixes. Alpha APIs
and report schemas may change between releases.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting
for `lovlyDev/pkgWise` when it is enabled. If private reporting is unavailable, contact the repository
owner privately and include:

- the affected PkgWise version;
- the operating system and Node.js version;
- a minimal reproduction or malformed input fixture;
- expected and observed behavior;
- the security impact and whether the issue is already public.

Avoid including secrets, access tokens, private package names, or proprietary lockfiles. A sanitized
fixture is preferred.

## Security boundaries

PkgWise does not install packages, execute lifecycle scripts, load project JavaScript configuration,
download package tarballs, or follow HTTP redirects. Remote enrichment is opt-in for project scans and
uses HTTPS requests to documented providers. Cache deletion is limited to owned, versioned cache
directories.
