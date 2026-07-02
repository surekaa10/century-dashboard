import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MODULES = [
  "assetProfile",
  "summaryDetail",
  "financialData",
  "defaultKeyStatistics",
  "incomeStatementHistory",
  "balanceSheetHistory",
  "cashflowStatementHistory",
  "recommendationTrend",
  "institutionOwnership",
  "insiderTransactions",
  "upgradeDowngradeHistory",
].join(",");

function n(v: unknown, fallback = 0): number {
  const raw = v as { raw?: number } | number | null | undefined;
  if (typeof raw === "number") return isFinite(raw) ? raw : fallback;
  if (raw && typeof raw === "object" && "raw" in raw) {
    const r = raw.raw;
    return typeof r === "number" && isFinite(r) ? r : fallback;
  }
  return fallback;
}
function s(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "fmt" in v) return String((v as { fmt: string }).fmt ?? fallback);
  return fallback;
}
function fmtDate(ts: unknown): string {
  const raw = ts as { raw?: number } | number | null | undefined;
  const epoch = typeof raw === "number" ? raw : (raw as { raw?: number })?.raw;
  if (!epoch) return "";
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}

// GET /api/universe/quote?ticker=AAPL
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  try {
    const [summaryRes, chartRes] = await Promise.allSettled([
      fetch(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${MODULES}`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; century-dashboard/1.0)" }, cache: "no-store" },
      ),
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; century-dashboard/1.0)" }, cache: "no-store" },
      ),
    ]);

    // ── Parse quoteSummary ──────────────────────────────────────────────────────
    let D: Record<string, unknown> = {};
    if (summaryRes.status === "fulfilled" && summaryRes.value.ok) {
      const raw = (await summaryRes.value.json()) as { quoteSummary?: { result?: unknown[] } };
      D = (raw.quoteSummary?.result?.[0] ?? {}) as Record<string, unknown>;
    }

    const ap  = (D.assetProfile        ?? {}) as Record<string, unknown>;
    const sd  = (D.summaryDetail       ?? {}) as Record<string, unknown>;
    const fd  = (D.financialData       ?? {}) as Record<string, unknown>;
    const ks  = (D.defaultKeyStatistics ?? {}) as Record<string, unknown>;
    const rt  = (D.recommendationTrend  ?? {}) as Record<string, unknown>;

    // Income statements
    const incomeRaw = ((D.incomeStatementHistory as Record<string, unknown>)?.incomeStatementHistory ?? []) as Record<string, unknown>[];
    const income = incomeRaw.slice(0, 4).map((r) => ({
      date:            fmtDate(r.endDate),
      totalRevenue:    n(r.totalRevenue),
      grossProfit:     n(r.grossProfit),
      operatingIncome: n(r.operatingIncome),
      netIncome:       n(r.netIncome),
      ebitda:          n(r.ebitda),
    }));

    // Balance sheets
    const balRaw = ((D.balanceSheetHistory as Record<string, unknown>)?.balanceSheetStatements ?? []) as Record<string, unknown>[];
    const balance = balRaw.slice(0, 4).map((r) => ({
      date:             fmtDate(r.endDate),
      totalAssets:      n(r.totalAssets),
      totalLiabilities: n(r.totalLiab),
      totalEquity:      n(r.totalStockholderEquity),
      cash:             n(r.cash),
      totalDebt:        n(r.longTermDebt) + n(r.shortLongTermDebt),
    }));

    // Cashflow
    const cfRaw = ((D.cashflowStatementHistory as Record<string, unknown>)?.cashflowStatements ?? []) as Record<string, unknown>[];
    const cashflow = cfRaw.slice(0, 4).map((r) => {
      const op  = n(r.totalCashFromOperatingActivities);
      const cap = n(r.capitalExpenditures);
      return {
        date:               fmtDate(r.endDate),
        operatingCashflow:  op,
        capitalExpenditures: cap,
        freeCashFlow:       op + cap, // capex is negative
      };
    });

    // Analyst recommendation trend
    const recRaw = ((rt.trend) ?? []) as Record<string, unknown>[];
    const analystRecs = recRaw.slice(0, 4).map((r) => ({
      period:     s(r.period),
      strongBuy:  n(r.strongBuy),
      buy:        n(r.buy),
      hold:       n(r.hold),
      sell:       n(r.sell),
      strongSell: n(r.strongSell),
    }));

    // Institutional holders
    const instRaw = ((D.institutionOwnership as Record<string, unknown>)?.ownershipList ?? []) as Record<string, unknown>[];
    const institutions = instRaw.slice(0, 10).map((r) => ({
      name:       s(r.organization),
      shares:     n(r.position),
      pctHeld:    n(r.pctHeld) * 100,
      value:      n(r.value),
      reportDate: fmtDate(r.reportDate),
    }));

    // Insider transactions
    const insRaw = ((D.insiderTransactions as Record<string, unknown>)?.transactions ?? []) as Record<string, unknown>[];
    const insiderTxs = insRaw.slice(0, 10).map((r) => ({
      name:            s(r.filerName),
      relation:        s(r.relation),
      transactionDesc: s(r.transactionText),
      shares:          n(r.shares),
      value:           n(r.value),
      date:            fmtDate(r.startDate),
      ownership:       s(r.ownership),
    }));

    // Upgrade/downgrade history
    const udRaw = ((D.upgradeDowngradeHistory as Record<string, unknown>)?.history ?? []) as Record<string, unknown>[];
    const upgrades = udRaw.slice(0, 20).map((r) => {
      const to   = s(r.toGrade);
      const from = s(r.fromGrade);
      const action = s(r.action);
      let type: "up" | "down" | "init" | "main" = "main";
      if (action === "up")   type = "up";
      else if (action === "down") type = "down";
      else if (action === "init" || action === "reit") type = "init";
      return { firm: s(r.firm), toGrade: to, fromGrade: from, date: fmtDate(r.epochGradeDate), action: type };
    });

    // ── Parse price chart ───────────────────────────────────────────────────────
    let priceSeries: { dates: string[]; close: number[] } = { dates: [], close: [] };
    if (chartRes.status === "fulfilled" && chartRes.value.ok) {
      const cr = (await chartRes.value.json()) as {
        chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
      };
      const result = cr.chart?.result?.[0];
      if (result) {
        const ts  = result.timestamp ?? [];
        const cls = result.indicators?.quote?.[0]?.close ?? [];
        const dates: string[] = [];
        const close: number[] = [];
        for (let i = 0; i < ts.length; i++) {
          const c = cls[i];
          if (c != null && isFinite(c) && c > 0) {
            dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
            close.push(c);
          }
        }
        priceSeries = { dates, close };
      }
    }

    // ── Build response ──────────────────────────────────────────────────────────
    const quote = {
      ticker,
      name:              s(ap.longBusinessSummary ? sd : ap) || ticker,  // fallback
      price:             n(fd.currentPrice ?? sd.regularMarketPrice),
      change:            n(sd.regularMarketChange),
      changePct:         n(sd.regularMarketChangePercent),
      open:              n(sd.open ?? sd.regularMarketOpen),
      high:              n(sd.dayHigh ?? sd.regularMarketDayHigh),
      low:               n(sd.dayLow  ?? sd.regularMarketDayLow),
      volume:            n(sd.volume  ?? sd.regularMarketVolume),
      mktCap:            n(sd.marketCap),
      pe:                n(sd.trailingPE),
      eps:               n(ks.trailingEps),
      forwardPE:         n(sd.forwardPE),
      dividend:          n(sd.dividendRate),
      dividendYield:     n(sd.dividendYield) * 100,
      beta:              n(sd.beta ?? ks.beta),
      fiftyTwoWeekHigh:  n(sd.fiftyTwoWeekHigh),
      fiftyTwoWeekLow:   n(sd.fiftyTwoWeekLow),
      avgVolume:         n(sd.averageVolume),
      currency:          s(sd.currency ?? "USD"),
      exchange:          s(sd.exchange ?? ap.exchange ?? ""),
      sector:            s(ap.sector),
      industry:          s(ap.industry),
      description:       s(ap.longBusinessSummary),
      employees:         n(ap.fullTimeEmployees),
      country:           s(ap.country),
      website:           s(ap.website),
      // Financials
      revenue:           n(fd.totalRevenue),
      revenueGrowth:     n(fd.revenueGrowth) * 100,
      grossMargin:       n(fd.grossMargins) * 100,
      operatingMargin:   n(fd.operatingMargins) * 100,
      netMargin:         n(fd.profitMargins) * 100,
      roe:               n(fd.returnOnEquity) * 100,
      roa:               n(fd.returnOnAssets) * 100,
      debtToEquity:      n(fd.debtToEquity),
      currentRatio:      n(fd.currentRatio),
      freeCashFlow:      n(fd.freeCashflow),
      // Analyst
      targetMean:        n(fd.targetMeanPrice),
      targetHigh:        n(fd.targetHighPrice),
      targetLow:         n(fd.targetLowPrice),
      recommendationKey: s(fd.recommendationKey),
      numAnalysts:       n(fd.numberOfAnalystOpinions),
      // Ownership
      institutionalOwnership: n(ks.heldPercentInstitutions) * 100,
      insiderOwnership:       n(ks.heldPercentInsiders) * 100,
      shortFloat:             n(ks.shortPercentOfFloat) * 100,
      // Arrays
      income,
      balance,
      cashflow,
      analystRecs,
      institutions,
      insiderTxs,
      upgrades,
      priceSeries,
    };

    return NextResponse.json({ quote }, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
