// Brinson-Fachler (1985) Performance Attribution Engine
//
// Active Return = Allocation Effect + Selection Effect + Interaction Effect
//
// All three effects sum exactly to (Portfolio Return - Benchmark Return),
// modulo a reported residual from incomplete sector coverage.
//
// Formulas (per sector i):
//   Allocation  = (w_p - w_b) × (R_b_i - R_b)
//   Selection   = w_b          × (R_p_i - R_b_i)
//   Interaction = (w_p - w_b) × (R_p_i - R_b_i)

export interface BrinsonSector {
  sector: string;
  portfolioWeight: number;       // % of portfolio AUM
  benchmarkWeight: number;       // % of benchmark (S&P 500 GICS)
  activeWeight: number;          // portfolio − benchmark
  portfolioReturn: number;       // MV-weighted return of portfolio positions in sector (%)
  benchmarkSectorReturn: number; // sector ETF return for same period (%)
  allocationEffect: number;      // % points
  selectionEffect: number;       // % points
  interactionEffect: number;     // % points
  totalEffect: number;           // alloc + sel + inter
}

export interface BrinsonResult {
  sectors: BrinsonSector[];
  allocationEffect: number;
  selectionEffect: number;
  interactionEffect: number;
  totalActiveReturn: number;  // portfolio return − benchmark return
  portfolioReturn: number;
  benchmarkReturn: number;
  explainedReturn: number;    // alloc + sel + inter (should ≈ active return)
  residual: number;           // floating-point reconciliation gap
}

export interface RiskMetrics {
  portfolioVol: number;     // annualized % std dev of daily returns
  benchmarkVol: number;
  trackingError: number;    // annualized % std dev of daily active returns
  sharpeRatio: number;      // excess return over risk-free / portfolio vol
  informationRatio: number; // annualized active return / tracking error
  beta: number;             // regression slope vs benchmark daily returns
  alpha: number;            // Jensen's alpha, annualized %
  correlation: number;      // Pearson correlation of daily returns
  maxDrawdown: number;      // max % peak-to-trough in portfolio cumulative returns
  maxDrawdownBm: number;
  calmarRatio: number;      // annualized return / max drawdown
}

// ── S&P 500 sector weights (SSGA, approximate Q2 2025) ─────────────────────────
export const SP500_SECTOR_WEIGHTS: Record<string, number> = {
  "Information Technology": 0.320,
  "Financials":             0.133,
  "Health Care":            0.119,
  "Consumer Discretionary": 0.108,
  "Communication Services": 0.089,
  "Industrials":            0.085,
  "Consumer Staples":       0.057,
  "Energy":                 0.039,
  "Materials":              0.022,
  "Real Estate":            0.021,
  "Utilities":              0.021,
  "Commodities":            0.003,
  "Macro / FX":             0.001,
  "Digital Assets":         0.001,
  "Other":                  0.001,
};

// ── Sector → ETF proxy for benchmark sector returns ───────────────────────────
export const SECTOR_ETF: Record<string, string> = {
  "Information Technology": "XLK",
  "Financials":             "XLF",
  "Health Care":            "XLV",
  "Consumer Discretionary": "XLY",
  "Communication Services": "XLC",
  "Industrials":            "XLI",
  "Consumer Staples":       "XLP",
  "Energy":                 "XLE",
  "Materials":              "XLB",
  "Real Estate":            "XLRE",
  "Utilities":              "XLU",
  "Commodities":            "GLD",
  "Macro / FX":             "UUP",
  "Digital Assets":         "IBIT",
};

export type PriceSeries = { dates: string[]; close: number[] };

// ── Helpers ────────────────────────────────────────────────────────────────────

// Return % of a price series over the last `lookback` trading days.
// lookback = 0  → since inception (full series)
// lookback < 0  → YTD (from Jan 1 of current year)
// lookback > 0  → last N trading days
export function seriesReturn(series: PriceSeries, lookback: number): number {
  const n = series.dates.length;
  if (n < 2) return 0;
  const endIdx = n - 1;

  let startIdx: number;
  if (lookback === 0) {
    startIdx = 0;
  } else if (lookback < 0) {
    const jan1 = `${new Date().getUTCFullYear()}-01-01`;
    const found = series.dates.findIndex((d) => d >= jan1);
    startIdx = found < 0 ? 0 : Math.min(found, endIdx - 1);
  } else {
    startIdx = Math.max(0, endIdx - lookback);
  }

  const start = series.close[startIdx];
  const end = series.close[endIdx];
  if (!start || !isFinite(start) || !end || !isFinite(end)) return 0;
  return ((end / start) - 1) * 100;
}

// Align two date-indexed arrays — inner join by date
export function alignSeries(
  aDates: string[], aVals: number[],
  bDates: string[], bVals: number[],
): { aAligned: number[]; bAligned: number[] } {
  const bMap = new Map(bDates.map((d, i) => [d, bVals[i]]));
  const aAligned: number[] = [];
  const bAligned: number[] = [];
  for (let i = 0; i < aDates.length; i++) {
    const bv = bMap.get(aDates[i]);
    if (bv !== undefined) { aAligned.push(aVals[i]); bAligned.push(bv); }
  }
  return { aAligned, bAligned };
}

// Daily % returns from a price series
export function toDailyPct(series: PriceSeries): number[] {
  return series.close.map((c, i) => {
    if (i === 0) return 0;
    const prev = series.close[i - 1];
    return prev > 0 ? ((c / prev) - 1) * 100 : 0;
  });
}

// ── Brinson-Fachler computation ────────────────────────────────────────────────

export function computeBrinson(
  portfolioSectors: { sector: string; weight: number; returnPct: number }[],
  sectorRates: Record<string, PriceSeries>,
  benchmarkReturn: number,
  portfolioReturn: number,
  lookback: number,
): BrinsonResult {
  const activeReturn = portfolioReturn - benchmarkReturn;
  const portMap = new Map(portfolioSectors.map((s) => [s.sector, s]));

  // Union of portfolio sectors + benchmark sectors with meaningful weight
  const allSectors = new Set([
    ...portfolioSectors.map((s) => s.sector),
    ...Object.keys(SP500_SECTOR_WEIGHTS).filter((s) => SP500_SECTOR_WEIGHTS[s] >= 0.005),
  ]);

  const sectors: BrinsonSector[] = [];

  for (const sector of allSectors) {
    const ps = portMap.get(sector);
    const w_p = ps ? ps.weight / 100 : 0;
    const w_b = SP500_SECTOR_WEIGHTS[sector] ?? 0;
    const R_p = ps ? ps.returnPct : 0;

    const etfTicker = SECTOR_ETF[sector];
    const etfSeries = etfTicker ? sectorRates[etfTicker] : undefined;
    const R_b_i = etfSeries ? seriesReturn(etfSeries, lookback) : benchmarkReturn;
    const R_b = benchmarkReturn;

    const allocationEffect   = (w_p - w_b) * (R_b_i - R_b);
    const selectionEffect    = w_b * (R_p - R_b_i);
    const interactionEffect  = (w_p - w_b) * (R_p - R_b_i);
    const totalEffect        = allocationEffect + selectionEffect + interactionEffect;

    if (Math.abs(totalEffect) > 1e-5 || w_p > 0.001 || w_b > 0.001) {
      sectors.push({
        sector,
        portfolioWeight:       w_p * 100,
        benchmarkWeight:       w_b * 100,
        activeWeight:          (w_p - w_b) * 100,
        portfolioReturn:       R_p,
        benchmarkSectorReturn: R_b_i,
        allocationEffect,
        selectionEffect,
        interactionEffect,
        totalEffect,
      });
    }
  }

  const allocationEffect  = sectors.reduce((s, x) => s + x.allocationEffect, 0);
  const selectionEffect   = sectors.reduce((s, x) => s + x.selectionEffect, 0);
  const interactionEffect = sectors.reduce((s, x) => s + x.interactionEffect, 0);
  const explainedReturn   = allocationEffect + selectionEffect + interactionEffect;

  return {
    sectors: sectors.sort((a, b) => Math.abs(b.totalEffect) - Math.abs(a.totalEffect)),
    allocationEffect,
    selectionEffect,
    interactionEffect,
    totalActiveReturn: activeReturn,
    portfolioReturn,
    benchmarkReturn,
    explainedReturn,
    residual: activeReturn - explainedReturn,
  };
}

// ── Risk metrics vs benchmark ──────────────────────────────────────────────────

const ANNUALIZE = Math.sqrt(252);
const RFR_DAILY = 4.5 / 252; // 4.5% annualized risk-free rate

function mean(arr: number[]) { return arr.reduce((s, x) => s + x, 0) / arr.length; }
function variance(arr: number[], m: number) { return arr.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(arr.length - 1, 1); }

function maxDrawdownFromCum(cum: number[]): number {
  let peak = -Infinity, maxDD = 0;
  for (const v of cum) {
    if (v > peak) peak = v;
    const dd = peak - v;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

export function computeRiskMetrics(
  portfolioDates: string[],
  portfolioDailyPct: number[],  // daily % returns aligned to dates
  benchmarkSeries: PriceSeries,
): RiskMetrics {
  const bmDailyPct = toDailyPct(benchmarkSeries);
  const { aAligned: portAligned, bAligned: bmAligned } = alignSeries(
    portfolioDates, portfolioDailyPct, benchmarkSeries.dates, bmDailyPct,
  );

  const n = portAligned.length;
  if (n < 10) {
    return { portfolioVol: 0, benchmarkVol: 0, trackingError: 0, sharpeRatio: 0,
             informationRatio: 0, beta: 0, alpha: 0, correlation: 0,
             maxDrawdown: 0, maxDrawdownBm: 0, calmarRatio: 0 };
  }

  const pMean = mean(portAligned);
  const bMean = mean(bmAligned);
  const pVar  = variance(portAligned, pMean);
  const bVar  = variance(bmAligned, bMean);
  const pStd  = Math.sqrt(pVar);
  const bStd  = Math.sqrt(bVar);

  const activeDailyReturns = portAligned.map((p, i) => p - bmAligned[i]);
  const aMean = mean(activeDailyReturns);
  const aStd  = Math.sqrt(variance(activeDailyReturns, aMean));

  const portVol      = pStd * ANNUALIZE;
  const bmVol        = bStd * ANNUALIZE;
  const trackingError = aStd * ANNUALIZE;

  // Simple sum of daily % as proxy for total period return
  const totalPort = portAligned.reduce((s, x) => s + x, 0);
  const totalBm   = bmAligned.reduce((s, x) => s + x, 0);
  const annPort   = totalPort * (252 / n);
  const annBm     = totalBm  * (252 / n);
  const annActive = (totalPort - totalBm) * (252 / n);
  const rfr       = RFR_DAILY * 252;

  const sharpeRatio      = portVol > 0 ? (annPort - rfr) / portVol : 0;
  const informationRatio = trackingError > 0 ? annActive / trackingError : 0;

  const cov  = portAligned.reduce((s, p, i) => s + (p - pMean) * (bmAligned[i] - bMean), 0) / Math.max(n - 1, 1);
  const beta = bVar > 0 ? cov / bVar : 1;
  const alpha = annPort - (rfr + beta * (annBm - rfr));

  const correlation = pStd > 0 && bStd > 0 ? cov / (pStd * bStd) : 0;

  // Cumulative returns for max-drawdown
  const cumPort: number[] = [];
  const cumBm:   number[] = [];
  let sp = 0, sb = 0;
  for (let i = 0; i < n; i++) { sp += portAligned[i]; cumPort.push(sp); }
  for (let i = 0; i < n; i++) { sb += bmAligned[i];   cumBm.push(sb); }

  const maxDrawdown   = maxDrawdownFromCum(cumPort);
  const maxDrawdownBm = maxDrawdownFromCum(cumBm);
  const calmarRatio   = maxDrawdown > 0 ? annPort / maxDrawdown : 0;

  return { portfolioVol: portVol, benchmarkVol: bmVol, trackingError, sharpeRatio,
           informationRatio, beta, alpha, correlation, maxDrawdown, maxDrawdownBm, calmarRatio };
}
