PROXY CONSOLIDATION

The top-level proxy/ folder in this repository is deprecated. The project now provides a TypeScript-based token proxy used during development at:

  src/opensky/opensky-token-proxy.ts

What to do to consolidate:

1. Remove the proxy/ folder from the repository (or archive it) once you have confirmed the TS proxy works for your workflow.
2. Run `npm install` at the repository root to regenerate package-lock.json so that node-fetch (if present) is removed and devDependencies are synchronized with package.json.
3. Ensure your CI and production Node runtime use Node >= 18 (the TS proxy uses the global fetch API).

If you'd like, I can open a follow-up PR that removes the proxy/ folder entirely and regenerates package-lock.json; I didn't remove it automatically to avoid deleting potentially important production setup without your explicit confirmation.
