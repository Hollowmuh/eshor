const fs = require("fs");
const path = process.argv[2];
const files = fs.readdirSync(path).filter((f) => f.startsWith("lhr-") && f.endsWith(".json"));
for (const f of files) {
  let r;
  try {
    r = JSON.parse(fs.readFileSync(path + "/" + f, "utf8"));
  } catch {
    continue;
  }
  console.log(
    r.finalUrl,
    "bytes=" + r.audits["total-byte-weight"].numericValue,
    "lcp=" + Math.round(r.audits["largest-contentful-paint"].numericValue) + "ms"
  );
}
