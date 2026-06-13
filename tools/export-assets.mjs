// One-off: export all asset rows from the OLD project (qqmftpunsuogmqgonpko)
// and emit INSERT ... ON CONFLICT (id) DO NOTHING SQL to /tmp/assets_insert.sql
// Image URLs are kept as-is (they point at the old project's public storage).
import fs from "node:fs";

const SRC_URL = "https://qqmftpunsuogmqgonpko.supabase.co";
const KEY = process.env.POD_SECRET_KEY;
if (!KEY) {
  console.error("Missing POD_SECRET_KEY");
  process.exit(1);
}

const COLS = [
  "id","original_url","processed_url","filename","file_size","width","height",
  "format","status","source","copyright_status","created_at","updated_at",
  "print_extract_url","cutout_url","preferred_design_url",
];

function sqlVal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

const res = await fetch(`${SRC_URL}/rest/v1/assets?select=*`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
if (!res.ok) {
  console.error("fetch failed", res.status, await res.text());
  process.exit(1);
}
const rows = await res.json();
console.error(`fetched ${rows.length} rows`);

let sql = "";
for (const r of rows) {
  const vals = COLS.map((c) => sqlVal(r[c])).join(", ");
  sql += `INSERT INTO public.assets (${COLS.join(", ")}) VALUES (${vals}) ON CONFLICT (id) DO NOTHING;\n`;
}
fs.writeFileSync("/tmp/assets_insert.sql", sql);
console.error(`wrote /tmp/assets_insert.sql (${sql.length} bytes, ${rows.length} statements)`);
