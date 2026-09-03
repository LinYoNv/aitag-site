const https = require("https");
const fs = require("fs");
const dest = "/root/dsh-work/aitag/";
const files = [
  ["styles.css",        "https://aitag.win/styles.css?v=260727c"],
  ["ai_metadata.css",   "https://aitag.win/ai_metadata.css?v=260731c"],
  ["app.js",            "https://aitag.win/app.js?v=260831a"],
  ["ui_i18n.js",        "https://aitag.win/ui_i18n.js?v=260830d"],
  ["tag_translations.js","https://aitag.win/tag_translations.js?v=260727a"],
  ["nai.js",            "https://aitag.win/nai.js?v=260821a"],
  ["nai_x.js",          "https://aitag.win/nai_x.js?v=260825a"],
  ["ai_metadata_ruleset.js","https://aitag.win/ai_metadata_ruleset.js?v=260821a"],
  ["ai_metadata_view.js","https://aitag.win/ai_metadata_view.js?v=260731c"],
  ["sensitive_filter.js","https://aitag.win/sensitive_filter.js?v=260830a"],
  ["index.html",        "https://aitag.win/"],
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
function get(name, url, cb) {
  const req = https.get(url, { headers: { "User-Agent": UA, "Accept": "*/*" } }, res => {
    let d = ""; res.setEncoding("utf8");
    res.on("data", c => { d += c; if (d.length > 10e6) req.destroy(); });
    res.on("end", () => { fs.writeFileSync(dest + name, d); console.log("OK", name, res.statusCode, d.length, "chars"); cb(); });
    res.on("error", e => { console.log("ERR", name, e.message); cb(); });
  });
  req.setTimeout(30000, () => { req.destroy(new Error("timeout")); });
  req.on("error", e => { console.log("ERR", name, e.message); cb(); });
}
let i = 0;
(function next() { if (i >= files.length) { console.log("DONE"); return; } const [n,u] = files[i++]; get(n,u,next); })();
