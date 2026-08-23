# Workspace analysis

PkgWise discovers workspace packages from the root `package.json` `workspaces` array,
`workspaces.packages` array, or `pnpm-workspace.yaml` `packages` array. Discovery uses the declared
glob patterns, excludes `.git` and
`node_modules`, validates real paths against the project root, and stops above 1,000 matched packages.
It never imports or executes a workspace package.

Without `--workspace`, `scan` keeps its original behavior and analyzes the root importer. Select a
workspace by its package name or normalized relative directory:

```bash
pkgwise scan . --workspace @example/api
pkgwise scan . --workspace packages/api
```

Repeat the option to combine selected importer roots, or use `*` for every discovered workspace:

```bash
pkgwise scan . --workspace packages/api --workspace packages/web
pkgwise scan . --workspace '*'
```

For npm lockfiles, workspace paths are resolved through matching `packages` entries and normal npm
hoisting rules. For pnpm lockfiles, they map to exact `importers` keys. Only packages reachable from the
selected importers participate in graph metrics, findings, remote enrichment, scoring, and policy.
Direct dependency counts are the unique names declared by the selected workspace manifests.

Terminal, JSON, Markdown, and SARIF reports record the number of discovered workspaces and the selected
name/path pairs. An unknown selector fails with `PW_WORKSPACE_NOT_FOUND`; a duplicate package name that
matches multiple paths fails with `PW_WORKSPACE_SELECTOR_AMBIGUOUS`. A selected workspace missing from a
supported lockfile fails lockfile parsing instead of silently analyzing the root.

Yarn and Bun workspace manifests can be discovered, but their lockfile graph parsers are not implemented
yet. Those managers continue to return an explicitly partial manifest-only analysis.
