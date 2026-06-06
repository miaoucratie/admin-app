/**
 * Builds the static web (PWA) version of the app for hosting on the user's own
 * domain (e.g. miaoucratie.fr/indispo/). It:
 *   1. Runs `expo export --platform web` with the right base path + direct API.
 *   2. Injects iPhone "Add to Home Screen" (PWA) meta tags into index.html.
 *   3. Writes a web app manifest with paths matching the hosting subfolder.
 *
 * Config via env (sensible defaults):
 *   EXPO_BASE_URL          subfolder the build is hosted under (default "/indispo")
 *   EXPO_PUBLIC_API_BASE   reservation API base (default: Workers /admin endpoint)
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
let BASE = (process.env.EXPO_BASE_URL || "/indispo").trim().replace(/\/+$/, "");
if (BASE && !BASE.startsWith("/")) BASE = `/${BASE}`;
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  "https://miaoucratie-reservation-api.miaoucratie.workers.dev/admin";

console.log(`Building web app  base="${BASE}"  api="${API_BASE}"`);

execSync("npx expo export --platform web", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, EXPO_BASE_URL: BASE, EXPO_PUBLIC_API_BASE: API_BASE },
});

const distDir = path.join(root, "dist");

// 1. Inject PWA meta tags into index.html
const indexPath = path.join(distDir, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
if (!html.includes("apple-touch-icon")) {
  const tags = [
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="default">`,
    `<meta name="apple-mobile-web-app-title" content="Indisponibilités">`,
    `<link rel="apple-touch-icon" href="${BASE}/apple-touch-icon.png">`,
    `<link rel="manifest" href="${BASE}/manifest.json">`,
  ].join("\n    ");
  html = html.replace("</head>", `    ${tags}\n  </head>`);
  fs.writeFileSync(indexPath, html);
  console.log("Injected PWA meta tags into index.html");
}

// 2. Write the web app manifest with subfolder-aware paths
const manifest = {
  name: "Miaoucratie — Indisponibilités",
  short_name: "Indispo",
  start_url: `${BASE}/`,
  scope: `${BASE}/`,
  display: "standalone",
  orientation: "portrait",
  background_color: "#F6EFE9",
  theme_color: "#A8472A",
  lang: "fr",
  icons: [
    { src: `${BASE}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" },
    { src: `${BASE}/icon-512.png`, sizes: "512x512", type: "image/png" },
  ],
};
fs.writeFileSync(
  path.join(distDir, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log("Wrote manifest.json");

// 3. SPA fallback for Apache hosts (most shared hosting): serve index.html for
// any in-app route so a refresh/deep link to e.g. /indispo/manage doesn't 404.
const htaccess = `<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase ${BASE}/
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . ${BASE}/index.html [L]
</IfModule>
`;
fs.writeFileSync(path.join(distDir, ".htaccess"), htaccess);
console.log("Wrote .htaccess (SPA fallback)");

console.log(`\nDone. Upload the contents of dist/ to ${BASE}/ on your host.`);
