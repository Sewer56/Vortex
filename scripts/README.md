# Scripts

Standalone build, release, and repository-management scripts. They are not
part of any app package. These scripts are intended for developers
maintaining the Vortex repository.

## How to Run

| Script type        | Invocation                   |
| ------------------ | ---------------------------- |
| `.js` (CommonJS)   | `node scripts/<name>.js`     |
| `.mjs` (ESM)       | `node scripts/<name>.mjs`    |
| `.ts` (TypeScript) | `pnpm tsx scripts/<name>.ts` |

Scripts wired into `package.json` can also be called with `pnpm run <name>`.
These are noted below.

## Scripts

### Build and Assets

- `download-duckdb-extensions.ts` : downloads platform-specific DuckDB
  extensions listed in `duckdb-extensions.json`. Run via
  `pnpm run assets` (called from the root `assets` script).
- `dependency-report.mjs` : generates `etc/Dependency Report.md` listing
  production dependencies accessible to extensions via nodeIntegration. Run
  via `pnpm run assets`.
- `extensions-rolldown.mjs` : shared Rolldown helpers for bundling in-repo
  extensions. Keeps core Vortex packages (e.g., @vortex/\*) external and remaps
  native module imports to their runtime paths. Extension build configs import
  this module; do not run it directly.
- `create-env-file.mjs` : writes `.local.env` with `NX_PARALLEL` set to the
  number of CPU cores. Runs automatically on `pnpm install` via the
  `preinstall` hook.
- `generate-query-types.ts` : generates TypeScript interfaces from SQL query
  definitions in `src/queries/`. Run via `pnpm run generate:query-types`.

### Release and Versioning

- `publish-release-to-nexus/` : prepares and uploads a Vortex release to Nexus
  Mods. Entry point is `index.ts`; see
  `publish-release-to-nexus/prepare.ts` for the core logic.
  Run via `pnpm tsx scripts/publish-release-to-nexus/index.ts`.
- `update-version.js` : reads the version from `app/package.json` and writes
  the major/minor/patch constants into `src/constants.ts`.
- `update-package-branches.js` : switches `package.json` Git dependencies to
  specific branches for testing, and can restore them afterward. Depends on
  `manage-node-modules.js`.

### Repository Management

- `manage-node-modules.js` : manages Git repositories for native Node
  modules (C++, C#, etc.) included as Git dependencies. See
  [`docs/native-node-module-management.md`](../docs/native-node-module-management.md)
  for comprehensive workflows. Commands:
    - `status [filter]` : check repository status
    - `summary` : show project overview and statistics
    - `setup-remotes` : set up Git remotes
    - `create-branch <name>` : create a feature branch across repos
    - `delete-branch <name>` : delete a branch (supports `--force --remote`)
    - `commit "<message>"` : commit changes across repos
    - `push` : push to remote

- `open-pr-links.js <branch> [filter]` : open PR creation links in the
  browser for managed repositories.
- `convert-to-git.js` : converts npm/yarn-installed packages to proper Git
  repositories so they can be managed by the system above.

#### Filters

The `manage-node-modules.js` and `open-pr-links.js` scripts accept filters:

- `cpp` : C++ modules: winapi-bindings, bsatk, loot, gamebryo-savegame
- `csharp` : C# projects: fomod-installer, dotnetprobe
- `nexus` : Nexus-Mods hosted repos
- `all` : all managed repositories

#### Workflow Example

```bash
node scripts/manage-node-modules.js create-branch feature-name
# ... make changes ...
node scripts/manage-node-modules.js commit "Add feature"
node scripts/manage-node-modules.js push
node scripts/open-pr-links.js feature-name cpp
```

### Testing and Debugging

- `test-adaptor.ts` : CLI to test an adaptor installer end-to-end against a
  live Nexus Mods URL. Run via
  `pnpm tsx scripts/test-adaptor.ts <nexus-mods-url>`. Requires
  `NEXUS_API_KEY` for some endpoints.

## TypeScript Editor Support

The `.ts` files in this directory are standalone Node scripts run via
`pnpm tsx`. They aren't part of any app package. `tsconfig.node.json` (repo
root) provides type checking and includes `"./scripts/**/*.ts"`
so the editor resolves `node:*` imports.
