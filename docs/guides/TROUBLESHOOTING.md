# Troubleshooting

## Frontend dev server crashes silently

**Symptom:** `npm run dev` starts, the page partially loads in the browser, then the server exits with no error message. `ERR_CONNECTION_REFUSED` follows in the browser console.

**Root cause:** Multiple native Node.js modules can trigger a SIGSEGV that kills the process. Use `coredumpctl list` (Linux/systemd) to confirm and identify the crashing module.

### Sharp (image optimization) — confirmed on Arch Linux

`sharp-linux-x64.node` segfaults when Next.js tries to optimize any `<Image>` request. The crash takes down the entire server process.

**Fix (applied):** `images: { unoptimized: true }` in `src/frontend/next.config.ts`. Images are served as-is without resizing. Acceptable for development; for production consider an external image CDN or a compatible Sharp build.

**Likely cause:** Incompatibility between Sharp's prebuilt libvips binary and the system's glibc/kernel version. Other Linux distributions or macOS may not be affected.

### Turbopack — crashes on large asm.js files

`libsodium-sumo` and `@bitcoin-js/tiny-secp256k1-asmjs` (pulled in by `@meshsdk/core`) are multi-megabyte asm.js blobs that crash Turbopack during bundling.

**Fix (applied):** `--turbopack` removed from `dev` and `build` scripts in `src/frontend/package.json`. Webpack is used instead with:
```ts
// next.config.ts
webpack: (config) => {
  config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true };
  return config;
}
```

---

## MeshProvider causes "Invalid hook call" on SSR

**Symptom:** `GET /create 500` with `TypeError: Cannot read properties of null (reading 'useState')`.

**Cause:** `@meshsdk/react` must never render server-side. If it is included in `serverExternalPackages`, Next.js loads it via Node.js `require()` with its own React copy, creating a duplicate React instance.

**Fix (applied):** `WalletProvider` uses `next/dynamic` with `ssr: false` so MeshSDK is only ever loaded in the browser.

---

## npm workspace lockfile conflicts

**Symptom:** Next.js warns about multiple lockfiles and selects the wrong workspace root.

**Cause:** Running `npm install` inside a workspace subdirectory (e.g. `src/frontend/`) creates a local `package-lock.json` that conflicts with the root workspace lockfile. A stray `~/package-lock.json` in the home directory compounds this.

**Fix:** Always run `npm install` from the repo root. Delete any `package-lock.json` inside workspace subdirectories and any stray lockfiles outside the repo.

---

## `modp-semaphore-bls12381` backend import fails at runtime

**Symptom:** `Error: Cannot find module 'modp-semaphore-bls12381/packages/typescript/...'` on backend startup.

**Cause:** This package is installed from GitHub and ships only TypeScript source. The compiled `lib/` directory is not committed and no `prepare` hook runs it automatically.

**Fix (applied):** A `postinstall` script in the root `package.json` compiles the package after every `npm install`. The backend import path points to `lib/group` (compiled output), not `src/group` (TypeScript source).

---

## Node.js version

The frontend has been verified to run on **Node.js v23.6.0**. Node.js v24 triggers additional segfaults (confirmed via `coredumpctl`). Use `nvm alias default 23.6.0` to make the version persistent across terminals.
