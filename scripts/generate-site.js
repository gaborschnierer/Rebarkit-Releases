#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_OWNER = 'gaborschnierer';
const DEFAULT_REPO = 'Rebarkit-Releases';
const OUTPUT_DIR = path.resolve(process.cwd(), 'site');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'index.html');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoDate) {
  if (!isoDate) return 'Unknown date';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function conciseNotes(body) {
  if (!body) return 'No release notes provided.';
  const oneLine = body
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (oneLine.length <= 240) return oneLine;
  return `${oneLine.slice(0, 237)}...`;
}

async function fetchReleases(owner, repo) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=50`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'rebarkit-release-site-generator',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function loadReleases(owner, repo) {
  // Optional local JSON source for offline/manual testing.
  const localPath = process.env.RELEASES_JSON_PATH;
  if (!localPath) return fetchReleases(owner, repo);

  const raw = await fs.readFile(path.resolve(localPath), 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function extractMsiAssets(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  return assets.filter((asset) => typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.msi'));
}

function buildHtml({ owner, repo, releases, latestWithMsi }) {
  const latestSection = latestWithMsi
    ? `
      <section class="hero">
        <h2>Download latest installer</h2>
        <p class="meta">${escapeHtml(latestWithMsi.name || latestWithMsi.tag_name || 'Latest release')} • ${escapeHtml(formatDate(latestWithMsi.published_at))}</p>
        <a class="button" href="${escapeHtml(latestWithMsi.msiAssets[0].browser_download_url)}">Download ${escapeHtml(latestWithMsi.msiAssets[0].name)}</a>
      </section>
    `
    : `
      <section class="hero">
        <h2>Download latest installer</h2>
        <p>No MSI installer is available in published releases yet.</p>
      </section>
    `;

  const releaseCards = releases.length
    ? releases
        .map((release) => {
          const title = release.name || release.tag_name || 'Unnamed release';
          const date = formatDate(release.published_at);
          const notes = conciseNotes(release.body);
          const msiButtons = release.msiAssets.length
            ? release.msiAssets
                .map(
                  (asset) =>
                    `<a class="button secondary" href="${escapeHtml(asset.browser_download_url)}">${escapeHtml(asset.name)}</a>`
                )
                .join(' ')
            : '<p class="missing">No MSI installer attached to this release.</p>';

          return `
            <article class="card">
              <h3>${escapeHtml(title)}</h3>
              <p class="meta">${escapeHtml(release.tag_name || 'No tag')} • ${escapeHtml(date)}</p>
              <p>${escapeHtml(notes)}</p>
              <div class="downloads">${msiButtons}</div>
            </article>
          `;
        })
        .join('\n')
    : '<p>No published stable releases were found.</p>';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Rebarkit Downloads</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; background: #f6f8fa; color: #1f2328; }
      main { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; }
      h1 { margin-bottom: 8px; }
      .intro { margin-top: 0; color: #59636e; }
      .hero, .card { background: #fff; border: 1px solid #d0d7de; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
      .meta { color: #59636e; font-size: 0.95rem; }
      .button { display: inline-block; background: #2da44e; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 8px; font-weight: 600; }
      .button.secondary { background: #0969da; margin-right: 8px; margin-top: 8px; }
      .missing { color: #8250df; }
      .downloads { margin-top: 10px; }
      footer { color: #59636e; font-size: 0.9rem; margin-top: 24px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Rebarkit Downloads</h1>
      <p class="intro">Simple download page for Rebarkit installers.</p>
      ${latestSection}
      <section>
        <h2>Release history</h2>
        ${releaseCards}
      </section>
      <footer>
        Data source: GitHub Releases API for <a href="https://github.com/${escapeHtml(owner)}/${escapeHtml(repo)}/releases">${escapeHtml(owner)}/${escapeHtml(repo)}</a>. Draft and prerelease versions are intentionally excluded.
      </footer>
    </main>
  </body>
</html>`;
}

async function main() {
  const [ownerArg, repoArg] = process.argv.slice(2);
  const owner = ownerArg || process.env.GITHUB_OWNER || DEFAULT_OWNER;
  const repo = repoArg || process.env.GITHUB_REPO || DEFAULT_REPO;

  const releases = await loadReleases(owner, repo);
  const stableReleases = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({ ...release, msiAssets: extractMsiAssets(release) }));

  stableReleases.sort((a, b) => {
    const dateA = Date.parse(a.published_at || 0);
    const dateB = Date.parse(b.published_at || 0);
    return dateB - dateA;
  });

  const latestWithMsi = stableReleases.find((release) => release.msiAssets.length > 0) || null;
  const html = buildHtml({ owner, repo, releases: stableReleases, latestWithMsi });

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, html, 'utf8');

  console.log(`Generated ${OUTPUT_FILE} from ${stableReleases.length} stable release(s).`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
