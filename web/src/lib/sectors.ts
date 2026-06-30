// Dynamic asset-class / sector classification driven by MT5 instrument metadata
// (the folder `path` + the `full_name`/description) rather than a hardcoded
// ticker map. Resolution is hierarchical, most-authoritative first:
//
//   1. PATH  — the MT5 folder segregates by asset class / venue, e.g.
//              "US EQUITY\\NVIDA", "Metals\\GOLD_CASH", "Currency Index\\DOLIDX_*".
//   2. GICS phrase match on the full name (+ symbol) — for equities/ETFs whose
//      name carries a sector theme, e.g. "Roundhill Memory ETF" (→ Semiconductors),
//      "ARK Genomic Revolution ETF" (→ Health Care).
//   3. Structural fallbacks — generic clues (e.g. a "_CASH" spot suffix) consulted
//      only when neither path nor name resolves the asset class.
//
// Callers may pass a bare symbol string (back-compatible) or an object carrying
// the MT5 `full_name`/`path`; richer input yields a more precise result.

export interface ClassifyInput {
  symbol: string;
  full_name?: string;   // MT5 description / full instrument name
  fullName?: string;    // camelCase alias — the web Position type uses this
  path?: string;        // MT5 folder path, e.g. "US EQUITY\\NVIDA"
}

export interface Classification {
  assetClass: string;   // Equity | Index | Commodity | FX | Crypto | Other
  sector: string;       // GICS-style sector
  industry: string;     // GICS sub-sector (kept as `industry` for existing UI bindings)
}

const OTHER: Classification = { assetClass: "Other", sector: "Other", industry: "Other" };

// Some MT5 descriptions carry a stray BOM / control char (e.g. a leading U+FEFF).
function clean(s: string | undefined): string {
  // eslint-disable-next-line no-control-regex
  return (s ?? "").replace(/[\u0000-\u001F\u007F\uFEFF]/g, "").trim();
}

const has = (hay: string, needles: string[]) => needles.some((n) => hay.includes(n));

// ── GICS phrase table — generalized sector words, never tickers ─────────────────
interface Rule { any: string[]; sector: string; industry: string }
const GICS_RULES: Rule[] = [
  { any: ["GENOMIC", "BIOTECH", "PHARMA", "HEALTH", "THERAPEUT", "MEDICAL", "LIFE SCIENCE"],
    sector: "Health Care", industry: "Biotech & Genomics" },
  { any: ["SEMICONDUCTOR", "MEMORY", "HARDWARE", "DRAM", "CHIP", "SEMI"],
    sector: "Information Technology", industry: "Semiconductors & Semiconductor Equipment" },
  { any: ["SOFTWARE", "CLOUD", "SAAS", "INTERNET", "FINTECH", "SERVICES"],
    sector: "Information Technology", industry: "Software & Services" },
  { any: ["AEROSPACE", "DEFENC", "DEFENS", "INDUSTRIAL", "MACHINERY"],
    sector: "Industrials", industry: "Aerospace & Defence" },
  { any: ["BANK", "FINANCIAL", "INSURANCE", "CAPITAL MARKET"],
    sector: "Financials", industry: "Banks & Financials" },
  { any: ["RETAIL", "CONSUMER", "E-COMMERCE", "ECOMMERCE"],
    sector: "Consumer Discretionary", industry: "Retail & Consumer" },
];

// GICS phrase match against the full name plus the symbol token.
function fromName(name: string, symbol: string): Classification | null {
  const hay = `${name} ${symbol}`.toUpperCase();
  for (const r of GICS_RULES) if (has(hay, r.any)) return { assetClass: "Equity", sector: r.sector, industry: r.industry };
  return null;
}

// Issuer-name → GICS reference, keyed on generalized company-name tokens (NOT
// tickers). Consulted only AFTER the path and thematic-phrase rules fail — it
// recovers the sector for single-name equities whose MT5 description is just the
// company name ("NVIDIA Corporation") with no sector word to phrase-match.
const ISSUER_GICS: Rule[] = [
  { any: ["NVIDIA", "BROADCOM", "MICRON", "QUALCOMM", "TEXAS INSTRUMENT", "ASML", "TAIWAN SEMICONDUCTOR", "ADVANCED MICRO"],
    sector: "Information Technology", industry: "Semiconductors & Semiconductor Equipment" },
  { any: ["MICROSOFT", "PALANTIR", "ORACLE", "SALESFORCE", "ADOBE", "SERVICENOW", "SNOWFLAKE"],
    sector: "Information Technology", industry: "Software & Services" },
  { any: ["LUMENTUM", "APPLE", "CISCO", "DELL", "HEWLETT", "ARISTA"],
    sector: "Information Technology", industry: "Technology Hardware & Equipment" },
  { any: ["ALPHABET", "GOOGLE", "META PLATFORM", "FACEBOOK", "NETFLIX", "WALT DISNEY"],
    sector: "Communication Services", industry: "Media & Interactive" },
  { any: ["AMAZON", "TESLA", "NIKE", "MCDONALD", "HOME DEPOT", "STARBUCKS", "BOOKING"],
    sector: "Consumer Discretionary", industry: "Retail & Consumer" },
  { any: ["LILLY", "PFIZER", "MERCK", "JOHNSON & JOHNSON", "NOVO NORDISK", "ASTRAZENECA", "ABBVIE", "AMGEN"],
    sector: "Health Care", industry: "Pharmaceuticals" },
  { any: ["RHEINMETALL", "BOEING", "LOCKHEED", "RAYTHEON", "GENERAL DYNAMICS", "CATERPILLAR", "HONEYWELL"],
    sector: "Industrials", industry: "Aerospace & Defence" },
  { any: ["JPMORGAN", "GOLDMAN", "MORGAN STANLEY", "BANK OF AMERICA", "WELLS FARGO", "CITIGROUP", "VISA", "MASTERCARD"],
    sector: "Financials", industry: "Banks & Financials" },
];

function fromIssuer(name: string, symbol: string): Classification | null {
  const hay = `${name} ${symbol}`.toUpperCase();
  for (const r of ISSUER_GICS) if (has(hay, r.any)) return { assetClass: "Equity", sector: r.sector, industry: r.industry };
  return null;
}

// 1) Asset-class segregation from the MT5 folder path (most authoritative).
function fromPath(path: string, name: string, symbol: string): Classification | null {
  const p = path.toUpperCase();
  if (!p) return null;

  if (has(p, ["FOREX", "CURRENCY"]) || /(^|[^A-Z])FX([^A-Z]|$)/.test(p)) {
    const idx = has(p, ["INDEX", "IDX"]);
    return { assetClass: "FX", sector: "Macro / FX", industry: idx ? "FX Index" : "Currencies" };
  }
  if (has(p, ["CRYPTO", "DIGITAL"])) return { assetClass: "Crypto", sector: "Digital Assets", industry: "Cryptocurrency" };
  if (has(p, ["METAL"])) return { assetClass: "Commodity", sector: "Commodities", industry: "Metals" };
  if (has(p, ["AGRI", "SOFTS", "GRAIN"])) return { assetClass: "Commodity", sector: "Commodities", industry: "Agriculture / Softs" };
  if (has(p, ["ENERGY", "OIL", "GAS"])) return { assetClass: "Commodity", sector: "Commodities", industry: "Energy" };
  if (has(p, ["COMMODIT"])) return { assetClass: "Commodity", sector: "Commodities", industry: "Physical Assets" };

  if (has(p, ["EQUITY", "STOCK", "SHARE", "ETF"])) {
    const gics = fromName(name, symbol) ?? fromIssuer(name, symbol);
    if (gics) return gics;
    const region = has(p, ["US "]) || p.startsWith("US") ? "US" : has(p, ["EURO", "EU "]) ? "European" : "";
    return { assetClass: "Equity", sector: "Other", industry: region ? `${region} Equity (Unclassified)` : "Equity (Unclassified)" };
  }
  if (has(p, ["INDICES", "INDEX"])) return { assetClass: "Index", sector: "Equity Index", industry: "Index" };
  return null;
}

// 3) Generic structural clues — only when path + name don't resolve the asset class.
function fromStructure(symbol: string, name: string): Classification | null {
  const s = symbol.toUpperCase();
  const hay = `${name} ${s}`.toUpperCase();
  if (s.endsWith("_CASH")) {
    // a cash/spot product; in this book these are physical commodities
    if (has(hay, ["GOLD", "SILVER", "XAU", "XAG", "PLATIN", "PALLAD", "COPPER"]))
      return { assetClass: "Commodity", sector: "Commodities", industry: "Metals" };
    if (has(hay, ["COCOA", "COFFEE", "SUGAR", "WHEAT", "CORN", "SOY", "COTTON"]))
      return { assetClass: "Commodity", sector: "Commodities", industry: "Agriculture / Softs" };
    return { assetClass: "Commodity", sector: "Commodities", industry: "Physical Assets" };
  }
  if (s.includes("IDX") || s.includes("INDEX")) return { assetClass: "FX", sector: "Macro / FX", industry: "FX Index" };
  return null;
}

export function classify(input: string | ClassifyInput): Classification {
  const o = typeof input === "string" ? { symbol: input } : input;
  const symbol = clean(o.symbol);
  const name = clean(o.full_name ?? o.fullName);
  const path = clean(o.path);

  return fromPath(path, name, symbol)
    ?? fromName(name, symbol)
    ?? fromIssuer(name, symbol)
    ?? fromStructure(symbol, name)
    ?? OTHER;
}
