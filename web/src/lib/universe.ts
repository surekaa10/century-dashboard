// Investment Universe — Security Master types and seed data

export type AssetClass = "Equity" | "ETF" | "Crypto" | "Fixed Income" | "Commodity" | "Macro / FX";
export type Region = "US" | "Europe" | "Asia" | "EM" | "Global";
export type GICSsector =
  | "Information Technology" | "Financials" | "Health Care" | "Consumer Discretionary"
  | "Communication Services" | "Industrials" | "Consumer Staples" | "Energy"
  | "Materials" | "Real Estate" | "Utilities" | "Digital Assets" | "Commodities"
  | "Macro / FX" | "Multi-Sector";

export interface SecuritySeed {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  sector: GICSsector;
  region: Region;
  tags: string[];
}

export interface QuoteSummary {
  ticker: string;
  name: string;
  price: number;
  change: number;        // absolute $
  changePct: number;     // %
  open: number;
  high: number;
  low: number;
  volume: number;
  mktCap: number;
  pe: number;
  eps: number;
  forwardPE: number;
  dividend: number;
  dividendYield: number;
  beta: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  avgVolume: number;
  currency: string;
  exchange: string;
  sector: string;
  industry: string;
  description: string;
  employees: number;
  country: string;
  website: string;
  // Financials (TTM)
  revenue: number;
  revenueGrowth: number;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
  debtToEquity: number;
  currentRatio: number;
  freeCashFlow: number;
  // Analyst estimates
  targetMean: number;
  targetHigh: number;
  targetLow: number;
  recommendationKey: string;
  numAnalysts: number;
  // Ownership
  institutionalOwnership: number;
  insiderOwnership: number;
  shortFloat: number;
}

export interface IncomeRow {
  date: string;
  totalRevenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  ebitda: number;
}

export interface BalanceRow {
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cash: number;
  totalDebt: number;
}

export interface CashflowRow {
  date: string;
  operatingCashflow: number;
  capitalExpenditures: number;
  freeCashFlow: number;
}

export interface AnalystRec {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface InstitutionalHolder {
  name: string;
  shares: number;
  pctHeld: number;
  value: number;
  reportDate: string;
}

export interface InsiderTx {
  name: string;
  relation: string;
  transactionDesc: string;
  shares: number;
  value: number;
  date: string;
  ownership: string;
}

export interface UpgradeDowngrade {
  firm: string;
  toGrade: string;
  fromGrade: string;
  date: string;
  action: "up" | "down" | "init" | "main";
}

export interface SecurityDetail extends QuoteSummary {
  income: IncomeRow[];
  balance: BalanceRow[];
  cashflow: CashflowRow[];
  analystRecs: AnalystRec[];
  institutions: InstitutionalHolder[];
  insiderTxs: InsiderTx[];
  upgrades: UpgradeDowngrade[];
  priceSeries: { dates: string[]; close: number[] };
}

export interface BatchQuote {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  mktCap: number;
  volume: number;
  pe: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  currency: string;
  exchange: string;
}

export interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
  sector?: string;
}

// ── Universe Seed Securities (~50 across asset classes) ───────────────────────

export const UNIVERSE_SEEDS: SecuritySeed[] = [
  // ── US Mega-Cap Equities
  { ticker: "AAPL",  name: "Apple Inc.",                 assetClass: "Equity", sector: "Information Technology",  region: "US",     tags: ["mega-cap","consumer-tech","hardware"] },
  { ticker: "MSFT",  name: "Microsoft Corp.",            assetClass: "Equity", sector: "Information Technology",  region: "US",     tags: ["mega-cap","cloud","software"] },
  { ticker: "NVDA",  name: "NVIDIA Corp.",               assetClass: "Equity", sector: "Information Technology",  region: "US",     tags: ["mega-cap","AI","semiconductors"] },
  { ticker: "GOOGL", name: "Alphabet Inc.",              assetClass: "Equity", sector: "Communication Services",  region: "US",     tags: ["mega-cap","search","AI","advertising"] },
  { ticker: "AMZN",  name: "Amazon.com Inc.",            assetClass: "Equity", sector: "Consumer Discretionary",  region: "US",     tags: ["mega-cap","e-commerce","cloud"] },
  { ticker: "META",  name: "Meta Platforms Inc.",        assetClass: "Equity", sector: "Communication Services",  region: "US",     tags: ["mega-cap","social-media","AI"] },
  { ticker: "TSLA",  name: "Tesla Inc.",                 assetClass: "Equity", sector: "Consumer Discretionary",  region: "US",     tags: ["EV","autonomy","energy"] },
  { ticker: "BRK.B", name: "Berkshire Hathaway B",      assetClass: "Equity", sector: "Financials",              region: "US",     tags: ["conglomerate","value","Buffett"] },
  // ── Financials
  { ticker: "JPM",   name: "JPMorgan Chase & Co.",      assetClass: "Equity", sector: "Financials",              region: "US",     tags: ["bank","dividend","money-center"] },
  { ticker: "V",     name: "Visa Inc.",                  assetClass: "Equity", sector: "Financials",              region: "US",     tags: ["payments","network-effect"] },
  { ticker: "MA",    name: "Mastercard Inc.",            assetClass: "Equity", sector: "Financials",              region: "US",     tags: ["payments","network-effect"] },
  { ticker: "GS",    name: "Goldman Sachs Group",       assetClass: "Equity", sector: "Financials",              region: "US",     tags: ["investment-bank","trading"] },
  // ── Health Care
  { ticker: "UNH",   name: "UnitedHealth Group",        assetClass: "Equity", sector: "Health Care",             region: "US",     tags: ["managed-care","insurance","large-cap"] },
  { ticker: "LLY",   name: "Eli Lilly & Co.",           assetClass: "Equity", sector: "Health Care",             region: "US",     tags: ["pharma","GLP-1","large-cap"] },
  { ticker: "JNJ",   name: "Johnson & Johnson",         assetClass: "Equity", sector: "Health Care",             region: "US",     tags: ["pharma","dividend","diversified"] },
  // ── Energy
  { ticker: "XOM",   name: "Exxon Mobil Corp.",         assetClass: "Equity", sector: "Energy",                  region: "US",     tags: ["oil","dividend","integrated"] },
  { ticker: "CVX",   name: "Chevron Corp.",             assetClass: "Equity", sector: "Energy",                  region: "US",     tags: ["oil","dividend","integrated"] },
  // ── Industrials
  { ticker: "CAT",   name: "Caterpillar Inc.",          assetClass: "Equity", sector: "Industrials",             region: "US",     tags: ["machinery","infrastructure","dividend"] },
  { ticker: "HON",   name: "Honeywell International",   assetClass: "Equity", sector: "Industrials",             region: "US",     tags: ["conglomerate","aerospace","automation"] },
  // ── Consumer Staples
  { ticker: "PG",    name: "Procter & Gamble Co.",      assetClass: "Equity", sector: "Consumer Staples",        region: "US",     tags: ["dividend","defensive","FMCG"] },
  { ticker: "KO",    name: "Coca-Cola Co.",             assetClass: "Equity", sector: "Consumer Staples",        region: "US",     tags: ["dividend","defensive","beverages"] },
  // ── Materials
  { ticker: "FCX",   name: "Freeport-McMoRan Inc.",    assetClass: "Equity", sector: "Materials",               region: "US",     tags: ["copper","mining","cyclical"] },
  // ── ETFs — Broad Market
  { ticker: "SPY",   name: "SPDR S&P 500 ETF",         assetClass: "ETF",    sector: "Multi-Sector",            region: "US",     tags: ["index","large-cap","benchmark"] },
  { ticker: "QQQ",   name: "Invesco QQQ Trust",        assetClass: "ETF",    sector: "Information Technology",  region: "US",     tags: ["index","tech-heavy","nasdaq"] },
  { ticker: "IWM",   name: "iShares Russell 2000 ETF", assetClass: "ETF",    sector: "Multi-Sector",            region: "US",     tags: ["small-cap","cyclical"] },
  { ticker: "VEA",   name: "Vanguard FTSE Dev Mkts",   assetClass: "ETF",    sector: "Multi-Sector",            region: "Europe", tags: ["international","developed-market"] },
  { ticker: "EEM",   name: "iShares MSCI EM ETF",      assetClass: "ETF",    sector: "Multi-Sector",            region: "EM",     tags: ["emerging-market","China","India"] },
  // ── ETFs — Sector
  { ticker: "XLK",   name: "Tech Select Sector SPDR",  assetClass: "ETF",    sector: "Information Technology",  region: "US",     tags: ["sector","technology"] },
  { ticker: "XLF",   name: "Financial Select Sector",  assetClass: "ETF",    sector: "Financials",              region: "US",     tags: ["sector","financials"] },
  { ticker: "XLV",   name: "Health Care Select Sector",assetClass: "ETF",    sector: "Health Care",             region: "US",     tags: ["sector","health-care"] },
  { ticker: "XLE",   name: "Energy Select Sector SPDR",assetClass: "ETF",    sector: "Energy",                  region: "US",     tags: ["sector","energy"] },
  // ── ETFs — Fixed Income / Macro
  { ticker: "TLT",   name: "iShares 20+ Year Tsy",     assetClass: "Fixed Income", sector: "Macro / FX",       region: "US",     tags: ["bonds","duration","rates"] },
  { ticker: "HYG",   name: "iShares iBoxx HY Corp",    assetClass: "Fixed Income", sector: "Macro / FX",       region: "US",     tags: ["high-yield","credit","spreads"] },
  { ticker: "UUP",   name: "Invesco DB USD Bull ETF",  assetClass: "Macro / FX", sector: "Macro / FX",         region: "Global", tags: ["USD","currency","macro"] },
  // ── Commodities
  { ticker: "GLD",   name: "SPDR Gold Shares",         assetClass: "Commodity", sector: "Commodities",          region: "Global", tags: ["gold","safe-haven","inflation"] },
  { ticker: "SLV",   name: "iShares Silver Trust",     assetClass: "Commodity", sector: "Commodities",          region: "Global", tags: ["silver","industrial-metal"] },
  { ticker: "USO",   name: "US Oil Fund ETF",          assetClass: "Commodity", sector: "Commodities",          region: "Global", tags: ["crude-oil","WTI","energy"] },
  // ── Crypto-adjacent
  { ticker: "IBIT",  name: "iShares Bitcoin Trust",    assetClass: "Crypto", sector: "Digital Assets",          region: "US",     tags: ["bitcoin","spot-ETF","crypto"] },
  { ticker: "COIN",  name: "Coinbase Global Inc.",     assetClass: "Equity", sector: "Digital Assets",          region: "US",     tags: ["crypto-exchange","bitcoin","fintech"] },
  { ticker: "MSTR",  name: "MicroStrategy Inc.",       assetClass: "Equity", sector: "Digital Assets",          region: "US",     tags: ["bitcoin-proxy","leverage","software"] },
  // ── International
  { ticker: "BABA",  name: "Alibaba Group ADR",        assetClass: "Equity", sector: "Consumer Discretionary",  region: "Asia",   tags: ["China","e-commerce","cloud"] },
  { ticker: "TSM",   name: "Taiwan Semiconductor ADR", assetClass: "Equity", sector: "Information Technology",  region: "Asia",   tags: ["semiconductors","foundry","AI"] },
  { ticker: "ASML",  name: "ASML Holding N.V. ADR",   assetClass: "Equity", sector: "Information Technology",  region: "Europe", tags: ["semiconductors","lithography","EUV"] },
  { ticker: "SAP",   name: "SAP SE ADR",               assetClass: "Equity", sector: "Information Technology",  region: "Europe", tags: ["ERP","cloud","enterprise-software"] },
];

// Asset class color tokens
export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  "Equity":       "text-cyan-400 bg-cyan-400/10",
  "ETF":          "text-blue-400 bg-blue-400/10",
  "Crypto":       "text-violet-400 bg-violet-400/10",
  "Fixed Income": "text-green-400 bg-green-400/10",
  "Commodity":    "text-yellow-400 bg-yellow-400/10",
  "Macro / FX":   "text-orange-400 bg-orange-400/10",
};
