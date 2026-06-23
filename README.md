# Rebarkit Releases Site Generator

This repository includes a minimal static-site generator that builds a GitHub Pages-friendly download page focused on MSI installers.

## Generate locally

From the repository root:

```bash
npm run generate-site
```

You can optionally override the source repository:

```bash
node scripts/generate-site.js <owner> <repo>
```

For offline testing, you can point to a local releases JSON file:

```bash
RELEASES_JSON_PATH=/absolute/path/releases.json npm run generate-site
```

## Output location

The generator writes the static page to:

- `site/index.html`

## Data source and filtering

- Data comes from the GitHub Releases API (`/repos/{owner}/{repo}/releases`).
- Draft and prerelease releases are excluded so the page shows only published stable releases.
- Only `.msi` assets are shown in the UI.
- The page highlights the newest stable release that contains an MSI with a prominent **Download latest installer** section.
- If no MSI exists, the page shows fallback messaging instead of a download button.
