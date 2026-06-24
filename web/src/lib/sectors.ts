// Asset-class / sector classification for the MT5 symbols this account trades.
// MT5 uses broker-specific names (NVIDA, AMAZON, GOOGLE_A, BRDCOM, DOLIDX_*…),
// so this is a manual map. Unknown symbols fall back to "Other".

export interface Classification {
  assetClass: string; // Equity | Index | Commodity | FX | Other
  sector: string;
  industry: string;
}

const MAP: Record<string, Classification> = {
  NVIDA: { assetClass: "Equity", sector: "Information Technology", industry: "Semiconductors" },
  NVDA: { assetClass: "Equity", sector: "Information Technology", industry: "Semiconductors" },
  DRAM: { assetClass: "Equity", sector: "Information Technology", industry: "Semiconductors" },
  BRDCOM: { assetClass: "Equity", sector: "Information Technology", industry: "Semiconductors" },
  AVGO: { assetClass: "Equity", sector: "Information Technology", industry: "Semiconductors" },
  MSFT: { assetClass: "Equity", sector: "Information Technology", industry: "Software & Services" },
  AMAZON: { assetClass: "Equity", sector: "Consumer Discretionary", industry: "Broadline Retail" },
  AMZN: { assetClass: "Equity", sector: "Consumer Discretionary", industry: "Broadline Retail" },
  GOOGLE_A: { assetClass: "Equity", sector: "Communication Services", industry: "Interactive Media" },
  GOOGL: { assetClass: "Equity", sector: "Communication Services", industry: "Interactive Media" },
  ELILILLY: { assetClass: "Equity", sector: "Health Care", industry: "Pharmaceuticals" },
  LLY: { assetClass: "Equity", sector: "Health Care", industry: "Pharmaceuticals" },
  RHMG: { assetClass: "Equity", sector: "Industrials", industry: "Aerospace & Defence" },
  GOLD_CASH: { assetClass: "Commodity", sector: "Commodities", industry: "Precious Metals" },
  XAUUSD: { assetClass: "Commodity", sector: "Commodities", industry: "Precious Metals" },
};

function prefixMatch(symbol: string): Classification | null {
  if (symbol.startsWith("DOLIDX")) return { assetClass: "FX", sector: "Macro / FX", industry: "USD Index" };
  if (symbol.startsWith("GOLD") || symbol.startsWith("XAU"))
    return { assetClass: "Commodity", sector: "Commodities", industry: "Precious Metals" };
  return null;
}

export function classify(symbol: string): Classification {
  const key = symbol.toUpperCase();
  if (MAP[key]) return MAP[key];
  const p = prefixMatch(key);
  if (p) return p;
  return { assetClass: "Other", sector: "Other", industry: "Other" };
}
