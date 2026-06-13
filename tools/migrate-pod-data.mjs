import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const defaultExportDir = path.join(repoRoot, ".pod-migration", "export");
const exportDir = path.resolve(process.env.POD_MIGRATION_DIR || defaultExportDir);
const bucketName = process.env.POD_STORAGE_BUCKET || "assets";
const pageSize = Number(process.env.POD_MIGRATION_PAGE_SIZE || 500);
const storagePageSize = Number(process.env.POD_MIGRATION_STORAGE_PAGE_SIZE || 100);
const includeStorage = process.env.POD_INCLUDE_STORAGE !== "false";
const exportProviderKeys = process.env.POD_EXPORT_PROVIDER_KEYS === "true";

const dataTables = [
  "assets",
  "mockup_templates",
  "image_jobs",
  "image_job_items",
  "image_derivatives",
  "mockup_outputs",
  "product_drafts",
  "export_records",
  "ai_image_jobs",
  "image_collection_templates",
  "image_collection_sources",
  "image_collection_runs",
  "image_collection_items",
  "infringement_reference_items",
  "infringement_checks",
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function createSupabaseClient(url, key) {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function sourceClient() {
  return createSupabaseClient(
    requiredEnv("SOURCE_SUPABASE_URL"),
    requiredEnv("SOURCE_SUPABASE_SERVICE_ROLE_KEY"),
  );
}

async function targetClient() {
  return createSupabaseClient(
    requiredEnv("TARGET_SUPABASE_URL"),
    requiredEnv("TARGET_SUPABASE_SERVICE_ROLE_KEY"),
  );
}

function sourcePublicBase() {
  return `${requiredEnv("SOURCE_SUPABASE_URL").replace(/\/+$/, "")}/storage/v1/object/public/${bucketName}/`;
}

function targetPublicBase() {
  return `${requiredEnv("TARGET_SUPABASE_URL").replace(/\/+$/, "")}/storage/v1/object/public/${bucketName}/`;
}

function isMissingTableError(error) {
  const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return message.includes("42p01") || message.includes("does not exist") || message.includes("not found");
}

function maskSecret(value) {
  if (!value) return "";
  const text = String(value);
  if (text.length <= 8) return "********";
  return `${text.slice(0, 4)}****${text.slice(-4)}`;
}

function safeProviderRow(row) {
  const { api_key: apiKey, ...rest } = row;
  return {
    ...rest,
    api_key_hint: apiKey ? maskSecret(apiKey) : "",
    has_api_key: Boolean(apiKey),
  };
}

function providerSecretRow(row) {
  return {
    id: row.id,
    display_name: row.display_name,
    model_id: row.model_id,
    provider_type: row.provider_type,
    api_key: row.api_key || "",
  };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function exportTable(client, table) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client.from(table).select("*").range(from, to);
    if (error) {
      if (isMissingTableError(error)) {
        console.warn(`[pod-migration] Skip missing table: ${table}`);
        return null;
      }
      throw new Error(`Failed to export ${table}: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function exportTables(client) {
  const tableDir = path.join(exportDir, "tables");
  await ensureDir(tableDir);

  const providers = await exportTable(client, "ai_providers");
  if (providers) {
    await writeJson(path.join(exportDir, "ai_providers.public.json"), providers.map(safeProviderRow));
    if (exportProviderKeys) {
      await writeJson(path.join(exportDir, "private", "ai_providers.secrets.json"), providers.map(providerSecretRow));
      console.warn("[pod-migration] Provider keys were exported to a private local file. Do not commit that file.");
    }
    console.log(`[pod-migration] Exported ai_providers public config: ${providers.length}`);
  }

  const manifest = {
    bucketName,
    exportedAt: new Date().toISOString(),
    includeStorage,
    sourcePublicBase: sourcePublicBase(),
    tables: {},
  };

  for (const table of dataTables) {
    const rows = await exportTable(client, table);
    if (!rows) continue;
    await writeJson(path.join(tableDir, `${table}.json`), rows);
    manifest.tables[table] = rows.length;
    console.log(`[pod-migration] Exported ${table}: ${rows.length}`);
  }

  await writeJson(path.join(exportDir, "manifest.json"), manifest);
}

async function listStorageFiles(client, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += storagePageSize) {
    const { data, error } = await client.storage.from(bucketName).list(prefix, {
      limit: storagePageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(`Failed to list storage ${bucketName}/${prefix}: ${error.message}`);
    }
    const items = data || [];
    for (const item of items) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        files.push(itemPath);
      } else {
        files.push(...(await listStorageFiles(client, itemPath)));
      }
    }
    if (items.length < storagePageSize) break;
  }
  return files;
}

async function exportStorage(client) {
  if (!includeStorage) {
    console.log("[pod-migration] Storage export disabled.");
    return;
  }

  const storageDir = path.join(exportDir, "storage", bucketName);
  await ensureDir(storageDir);
  const files = await listStorageFiles(client);
  let copied = 0;

  for (const storagePath of files) {
    const { data, error } = await client.storage.from(bucketName).download(storagePath);
    if (error) {
      console.warn(`[pod-migration] Failed to download ${storagePath}: ${error.message}`);
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    const outputPath = path.join(storageDir, ...storagePath.split("/"));
    await ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, buffer);
    copied += 1;
    if (copied % 50 === 0) console.log(`[pod-migration] Downloaded storage files: ${copied}/${files.length}`);
  }

  await writeJson(path.join(exportDir, "storage-manifest.json"), {
    bucketName,
    count: files.length,
    exportedAt: new Date().toISOString(),
    files,
  });
  console.log(`[pod-migration] Exported storage files: ${copied}/${files.length}`);
}

function rewritePublicUrls(value, from, to) {
  if (typeof value === "string") return value.split(from).join(to);
  if (Array.isArray(value)) return value.map((item) => rewritePublicUrls(item, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewritePublicUrls(item, from, to)]));
  }
  return value;
}

async function upsertRows(client, table, rows) {
  let count = 0;
  for (let index = 0; index < rows.length; index += pageSize) {
    const chunk = rows.slice(index, index + pageSize);
    const { error } = await client.from(table).upsert(chunk, { onConflict: "id" });
    if (error) {
      throw new Error(`Failed to import ${table}: ${error.message}`);
    }
    count += chunk.length;
  }
  return count;
}

async function importProviderConfigs(client) {
  const publicRows = await readJson(path.join(exportDir, "ai_providers.public.json"), []);
  if (!publicRows.length) return 0;

  const secretRows = await readJson(path.join(exportDir, "private", "ai_providers.secrets.json"), []);
  const secretsById = new Map(secretRows.map((row) => [row.id, row.api_key]));
  const rows = publicRows
    .map((publicRow) => {
      const row = { ...publicRow };
      delete row.api_key_hint;
      delete row.has_api_key;
      return {
        ...row,
        api_key: secretsById.get(row.id) || "",
      };
    })
    .filter((row) => row.api_key);

  if (!rows.length) {
    console.warn("[pod-migration] Skipped ai_providers import because no private provider keys file was found.");
    console.warn(`[pod-migration] Fill ${path.join(exportDir, "private", "ai_providers.secrets.json")} locally if you want to import real keys.`);
    return 0;
  }

  const count = await upsertRows(client, "ai_providers", rows);
  console.log(`[pod-migration] Imported ai_providers with private keys: ${count}`);
  return count;
}

async function importTables(client) {
  await importProviderConfigs(client);
  const tableDir = path.join(exportDir, "tables");
  const manifest = await readJson(path.join(exportDir, "manifest.json"), {});
  const fromPublicBase = manifest.sourcePublicBase || "";
  const toPublicBase = targetPublicBase();

  for (const table of dataTables) {
    const rows = await readJson(path.join(tableDir, `${table}.json`), null);
    if (!rows) continue;
    const rewritten = fromPublicBase
      ? rows.map((row) => rewritePublicUrls(row, fromPublicBase, toPublicBase))
      : rows;
    try {
      const count = await upsertRows(client, table, rewritten);
      console.log(`[pod-migration] Imported ${table}: ${count}`);
    } catch (error) {
      console.warn(`[pod-migration] Skipped ${table}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function walkFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

async function importStorage(client) {
  if (!includeStorage) {
    console.log("[pod-migration] Storage import disabled.");
    return;
  }

  const storageDir = path.join(exportDir, "storage", bucketName);
  const files = await walkFiles(storageDir);
  let copied = 0;
  for (const filePath of files) {
    const relative = path.relative(storageDir, filePath).split(path.sep).join("/");
    const buffer = await fs.readFile(filePath);
    const { error } = await client.storage.from(bucketName).upload(relative, buffer, {
      cacheControl: "31536000",
      contentType: contentTypeForPath(relative),
      upsert: true,
    });
    if (error) {
      console.warn(`[pod-migration] Failed to upload ${relative}: ${error.message}`);
      continue;
    }
    copied += 1;
    if (copied % 50 === 0) console.log(`[pod-migration] Uploaded storage files: ${copied}/${files.length}`);
  }
  console.log(`[pod-migration] Imported storage files: ${copied}/${files.length}`);
}

function contentTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".zip") return "application/zip";
  return "application/octet-stream";
}

async function runExport() {
  const client = await sourceClient();
  await ensureDir(exportDir);
  await exportTables(client);
  await exportStorage(client);
  console.log(`[pod-migration] Export finished: ${exportDir}`);
}

async function runImport() {
  const client = await targetClient();
  await importStorage(client);
  await importTables(client);
  console.log("[pod-migration] Import finished.");
}

async function main() {
  const mode = process.argv[2];
  if (!["export", "import", "copy"].includes(mode)) {
    console.log(`Usage:
  node tools/migrate-pod-data.mjs export
  node tools/migrate-pod-data.mjs import
  node tools/migrate-pod-data.mjs copy

Required env:
  export: SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_ROLE_KEY
  import: TARGET_SUPABASE_URL, TARGET_SUPABASE_SERVICE_ROLE_KEY
  copy:   all four variables above

Optional env:
  POD_MIGRATION_DIR=${defaultExportDir}
  POD_INCLUDE_STORAGE=true
  POD_EXPORT_PROVIDER_KEYS=false
  POD_STORAGE_BUCKET=assets
`);
    process.exitCode = 1;
    return;
  }

  if (mode === "export") await runExport();
  if (mode === "import") await runImport();
  if (mode === "copy") {
    await runExport();
    await runImport();
  }
}

main().catch((error) => {
  console.error(`[pod-migration] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
