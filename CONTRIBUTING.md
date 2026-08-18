# Contributing to PkgWise

PkgWise is an ESM TypeScript monorepo managed with pnpm. Node.js 22 or newer and pnpm 11 are required.

## Development workflow

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm verify:pack
```

Keep the core package free of process exits and console output. The CLI owns argument parsing,
presentation, filesystem output, and exit-code mapping. Never execute dependency or project code while
analyzing a repository.

Tests should cover successful behavior, malformed input, deterministic output, cancellation where
relevant, and offline/cache behavior for provider changes. Network tests must use explicit public test
coordinates or mocked fetch implementations; never upload a private lockfile or dependency list.

User-visible changes require a Changeset. Before submitting a pull request, run `pnpm check` and
`pnpm verify:pack` and describe any known limitations or intentionally deferred work.
