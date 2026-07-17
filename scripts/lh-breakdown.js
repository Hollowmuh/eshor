const fs = require("fs");
const path = process.argv[2];
const files = fs.readdirSync(path).filter((f) => f.startsWith("lhr-") && f.endsWith(".json"));
for (const f of files) {
  const full = path + "/" + f;
  let r;
  try {
    r = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (e) {
    console.log(f, "-- not valid JSON, skipping:", e.message.slice(0, 60));
    continue;
  }
  if (!r.finalUrl || !r.finalUrl.includes("aja-dress")) continue;
  const items = r.audits["network-requests"].details.items;
  const sorted = items
    .map((i) => ({ url: String(i.url).slice(0, 100), size: i.transferSize || 0 }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 15);
  console.log("PDP total-byte-weight:", r.audits["total-byte-weight"].numericValue);
  sorted.forEach((i) => console.log(i.size, i.url));
}
