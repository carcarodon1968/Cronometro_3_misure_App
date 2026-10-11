const fs = require("fs");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = pkg.version || "1.0.5";
const runNumber = Number(process.env.GITHUB_RUN_NUMBER) || 1;
const repo = process.env.GITHUB_REPOSITORY || "carcarodon1968/Cronometro_3_misure_App";
const sha = (process.env.GITHUB_SHA || "local000").slice(0, 7);

pkg.dependencies = {
  "firebase": "latest",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "lucide-react": "latest"
};

pkg.devDependencies = {
  "@tailwindcss/vite": "^4.0.0",
  "@types/node": "^22.0.0",
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0",
  "@vitejs/plugin-react": "^4.3.0",
  "tailwindcss": "^4.0.0",
  "typescript": "^5.7.0",
  "vite": "^6.0.0",
  "vite-plugin-pwa": "^0.21.0"
};

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

const pagesBase = "https://carcarodon1968.github.io/Cronometro_3_misure_App";
const manifest = {
  version,
  buildNumber: runNumber,
  commit: sha,
  builtAt: new Date().toISOString(),
  apkUrl: `${pagesBase}/update.html?v=${version}&b=${runNumber}`,
  directApkUrl: `${pagesBase}/Cronometro_3_misure_v.${version}.apk`,
  githubApkUrl: `https://github.com/${repo}/releases/download/v.${version}/Cronometro_3_misure_v.${version}.apk`,
  releasesPageUrl: `${pagesBase}/update.html?v=${version}&b=${runNumber}`,
  githubReleasesUrl: `https://github.com/${repo}/releases/tag/v.${version}`
};

fs.writeFileSync("public/version.json", JSON.stringify(manifest, null, 2));
console.log("Prepared package.json and public/version.json for version", version, "build", runNumber);
