import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "src", "lib", "infringement", "generated-celebrity-seeds.ts");

const endpoint = "https://query.wikidata.org/sparql";
const userAgent = "pod-batch-infringement-seed-builder/1.0 (local development)";
const maxAliasesPerSeed = 8;

const occupationQueries = [
  { group: "Film and television actors", limit: 650, minSitelinks: 40, qid: "Q33999" },
  { group: "Singers and vocal performers", limit: 650, minSitelinks: 35, qid: "Q177220" },
  { group: "Musicians", limit: 500, minSitelinks: 35, qid: "Q639669" },
  { group: "Rappers and hip hop artists", limit: 320, minSitelinks: 25, qid: "Q2252262" },
  { group: "Songwriters", limit: 260, minSitelinks: 35, qid: "Q753110" },
  { group: "Composers", limit: 260, minSitelinks: 45, qid: "Q36834" },
  { group: "Film directors", limit: 420, minSitelinks: 45, qid: "Q2526255" },
  { group: "Models", limit: 260, minSitelinks: 25, qid: "Q4610556" },
  { group: "Fashion designers", limit: 180, minSitelinks: 35, qid: "Q3501317" },
  { group: "Artists", limit: 360, minSitelinks: 55, qid: "Q483501" },
  { group: "Writers and authors", limit: 360, minSitelinks: 70, qid: "Q36180" },
  { group: "Comedians", limit: 240, minSitelinks: 30, qid: "Q245068" },
  { group: "Basketball players", limit: 320, minSitelinks: 25, qid: "Q3665646" },
  { group: "Association football players", limit: 420, minSitelinks: 35, qid: "Q937857" },
  { group: "American football players", limit: 260, minSitelinks: 20, qid: "Q19204627" },
  { group: "Baseball players", limit: 260, minSitelinks: 20, qid: "Q10871364" },
  { group: "Tennis players", limit: 220, minSitelinks: 25, qid: "Q10833314" },
  { group: "Boxers", limit: 180, minSitelinks: 25, qid: "Q10841764" },
  { group: "Professional wrestlers", limit: 180, minSitelinks: 20, qid: "Q13474373" },
  { group: "Politicians and heads of government", limit: 420, minSitelinks: 115, qid: "Q82955" },
  { group: "Businesspeople and founders", limit: 260, minSitelinks: 70, qid: "Q43845" },
  { group: "Entrepreneurs", limit: 220, minSitelinks: 55, qid: "Q131524" },
  { group: "YouTubers and creators", limit: 180, minSitelinks: 20, qid: "Q17125263" },
];

const groupQueries = [
  { group: "Bands and musical groups", limit: 360, minSitelinks: 35, qid: "Q215380" },
];

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeKey(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

function asciiFold(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isUsefulAlias(alias, name) {
  const trimmed = alias.trim();
  if (!trimmed) return false;
  if (trimmed.length < 3 || trimmed.length > 80) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/^@/.test(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (normalizeKey(trimmed) === normalizeKey(name)) return false;
  return true;
}

function cleanAliases(value, name) {
  if (!value) return [];
  const aliases = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => isUsefulAlias(item, name));
  const folded = asciiFold(name);
  if (folded && folded !== name && isUsefulAlias(folded, name)) {
    aliases.unshift(folded);
  }

  const seen = new Set();
  return aliases.filter((alias) => {
    const key = normalizeKey(alias);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maxAliasesPerSeed);
}

function occupationSparql({ limit, minSitelinks, qid }) {
  return `SELECT ?item ?itemLabel ?itemAltLabel ?countryLabel ?sitelinks WHERE {
  ?item wdt:P31 wd:Q5;
        wdt:P106 wd:${qid};
        wikibase:sitelinks ?sitelinks.
  OPTIONAL { ?item wdt:P27 ?country. }
  FILTER(?sitelinks >= ${minSitelinks})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,zh,fr,de,es,it,pt,ja,ko,ru". }
}
ORDER BY DESC(?sitelinks)
LIMIT ${limit}`;
}

function groupSparql({ limit, minSitelinks, qid }) {
  return `SELECT ?item ?itemLabel ?itemAltLabel ?countryLabel ?sitelinks WHERE {
  ?item wdt:P31 wd:${qid};
        wikibase:sitelinks ?sitelinks.
  OPTIONAL { ?item wdt:P495 ?country. }
  FILTER(?sitelinks >= ${minSitelinks})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,zh,fr,de,es,it,pt,ja,ko,ru". }
}
ORDER BY DESC(?sitelinks)
LIMIT ${limit}`;
}

async function fetchSparql(query, label) {
  const url = `${endpoint}?format=json&query=${encodeURIComponent(query)}`;
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": userAgent,
        },
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 240)}`);
      }
      return JSON.parse(text).results.bindings;
    } catch (error) {
      lastError = error;
      console.warn(`[celebrity-seeds] ${label} attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
      await wait(2500 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`Failed to query ${label}`);
}

function upsertRecord(recordsByQid, row, group) {
  const itemUrl = row.item?.value;
  const qid = itemUrl?.split("/").pop();
  const name = row.itemLabel?.value?.trim();
  if (!qid || !name || /^Q\d+$/.test(name)) return;
  if (name.length < 3 || name.length > 90) return;

  const sitelinks = Number(row.sitelinks?.value ?? 0);
  const country = row.countryLabel?.value?.trim();
  const aliases = cleanAliases(row.itemAltLabel?.value ?? "", name);
  const existing = recordsByQid.get(qid);

  if (existing) {
    existing.aliases = cleanAliases([...existing.aliases, ...aliases].join(","), existing.name);
    existing.groups.add(group);
    if (country && !existing.countries.has(country)) existing.countries.add(country);
    existing.sitelinks = Math.max(existing.sitelinks, sitelinks);
    return;
  }

  recordsByQid.set(qid, {
    aliases,
    countries: new Set(country ? [country] : []),
    groups: new Set([group]),
    name,
    qid,
    sitelinks,
  });
}

function dedupeRecords(recordsByQid) {
  const recordsByName = new Map();

  for (const record of recordsByQid.values()) {
    const key = normalizeKey(record.name);
    const existing = recordsByName.get(key);
    if (!existing || record.sitelinks > existing.sitelinks) {
      recordsByName.set(key, record);
    } else {
      existing.aliases = cleanAliases([...existing.aliases, ...record.aliases].join(","), existing.name);
      for (const group of record.groups) existing.groups.add(group);
      for (const country of record.countries) existing.countries.add(country);
    }
  }

  return Array.from(recordsByName.values())
    .sort((left, right) => right.sitelinks - left.sitelinks || left.name.localeCompare(right.name));
}

function toSeed(record) {
  const groups = Array.from(record.groups).slice(0, 3);
  const countries = Array.from(record.countries).slice(0, 2);
  return {
    aliases: record.aliases,
    imageHash: null,
    imageUrl: null,
    name: record.name,
    region: [...countries, ...groups].filter(Boolean).join(" · ") || "Global public figure",
    sourceUrl: `https://www.wikidata.org/wiki/${record.qid}`,
  };
}

function buildRuleRoots(records) {
  const roots = [];
  const seen = new Set();

  for (const record of records.slice(0, 1400)) {
    for (const term of [record.name, ...record.aliases.slice(0, 2)]) {
      const key = normalizeKey(term);
      if (!key || seen.has(key)) continue;
      if (key.length <= 3) continue;
      seen.add(key);
      roots.push(term);
    }
  }

  return roots;
}

async function main() {
  const recordsByQid = new Map();

  for (const queryConfig of occupationQueries) {
    console.log(`[celebrity-seeds] Querying ${queryConfig.group}`);
    const rows = await fetchSparql(occupationSparql(queryConfig), queryConfig.group);
    for (const row of rows) {
      upsertRecord(recordsByQid, row, queryConfig.group);
    }
    await wait(1400);
  }

  for (const queryConfig of groupQueries) {
    console.log(`[celebrity-seeds] Querying ${queryConfig.group}`);
    const rows = await fetchSparql(groupSparql(queryConfig), queryConfig.group);
    for (const row of rows) {
      upsertRecord(recordsByQid, row, queryConfig.group);
    }
    await wait(1400);
  }

  const records = dedupeRecords(recordsByQid);
  const seeds = records.map(toSeed);
  const ruleRoots = buildRuleRoots(records);
  const totalAliases = seeds.reduce((total, seed) => total + seed.aliases.length, 0);

  const file = `// Generated by tools/build-celebrity-seeds.mjs.
// Source: Wikidata Query Service, ranked by wikibase:sitelinks.
// Do not edit this file manually; update the generator and rerun npm run build:celebrity-seeds.

export type GeneratedCelebrityReferenceSeed = {
  aliases?: string[];
  imageHash?: string | null;
  imageUrl?: string | null;
  name: string;
  region: string;
  sourceUrl?: string | null;
};

export const generatedCelebrityReferenceStats = ${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "Wikidata Query Service",
    totalAliases,
    totalSeeds: seeds.length,
    totalRuleRoots: ruleRoots.length,
  }, null, 2)} as const;

export const generatedCelebrityReferenceSeeds: GeneratedCelebrityReferenceSeed[] = ${JSON.stringify(seeds, null, 2)};

export const celebrityRuleRoots: string[] = ${JSON.stringify(ruleRoots, null, 2)};
`;

  await fs.writeFile(outputPath, file, "utf8");
  console.log(`[celebrity-seeds] Wrote ${seeds.length} seeds and ${totalAliases} aliases to ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
