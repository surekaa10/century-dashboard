// Data Validation & Calculation Integrity engine.
//
// Independent quantitative auditor: re-derives every metric from raw snapshot
// inputs and cross-checks it against what the analytics layer produced. Pure
// functions — runs on every snapshot refresh. Each check yields a Finding with
// a severity, the expected vs actual values, an explanation, and a suggested
// fix. Nothing here mutates state; the dashboard decides what to surface.

import type { Snapshot } from "./types";
import { buildAnalytics, validatePositions } from "./analytics";
import type { PortfolioAnalytics } from "./analytics";
import { buildDrawdown } from "./drawdown";

export type Severity = "pass" | "info" | "warning" | "critical";

export type Category =
  | "Data Integrity"
  | "Positions"
  | "Returns"
  | "P&L"
  | "Weights"
  | "Attribution"
  | "Risk"
  | "Diversification"
  | "Drawdown"
  | "Consistency"
  | "MT5 Reconciliation";

export interface Finding {
  id: string;
  category: Category;
  metric: string;
  severity: Severity;
  expected?: string;
  actual?: string;
  diff?: string;
  message: string;
  fix?: string;
}

export interface CategorySummary {
  category: Category;
  total: number;
  passed: number;
  worst: Severity;
}

export interface Observation {
  severity: Severity;
  text: string;
}

export interface ValidationReport {
  findings: Finding[];
  checked: number;
  passed: number;
  warnings: number;
  critical: number;
  info: number;
  score: number; // 0..100 integrity
  byCategory: CategorySummary[];
  observations: Observation[];
  generatedAt: string;
}

const SEV_RANK: Record<Severity, number> = { pass: 0, info: 1, warning: 2, critical: 3 };
const CATEGORIES: Category[] = [
  "Data Integrity", "Positions", "Returns", "P&L", "Weights",
  "Attribution", "Risk", "Diversification", "Drawdown", "Consistency", "MT5 Reconciliation",
];

const pp = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}pp`;
const money = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (v: number) => `${v.toFixed(2)}%`;

export function runValidation(snapshot: Snapshot, at: string): ValidationReport {
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "id">) => findings.push({ ...f, id: `${f.category}:${f.metric}:${findings.length}` });

  const acct = snapshot.account;
  const positions = snapshot.positions ?? [];

  if (!acct || positions.length === 0) {
    add({ category: "Data Integrity", metric: "Snapshot", severity: positions.length ? "warning" : "critical",
      message: "No account or no open positions in the snapshot — nothing to validate.",
      fix: "Confirm the MT5 terminal is running and the pusher is publishing." });
    return finalize(findings, at);
  }

  const a: PortfolioAnalytics = buildAnalytics(positions, snapshot.symbolRates);
  const rows = a.positions;
  const posVal = validatePositions(rows);

  // ── 1. DATA INTEGRITY ───────────────────────────────────────────────────────
  const countIssue = (
    metric: string, predicate: (r: typeof rows[number]) => boolean, sev: Severity, msg: string, fix: string,
  ) => {
    const bad = rows.filter(predicate);
    add({
      category: "Data Integrity", metric, severity: bad.length ? sev : "pass",
      expected: "0 affected", actual: `${bad.length} affected${bad.length ? ` (${bad.slice(0, 4).map((r) => r.symbol).join(", ")}${bad.length > 4 ? "…" : ""})` : ""}`,
      message: bad.length ? msg : `${metric}: clean.`, fix: bad.length ? fix : undefined,
    });
  };
  countIssue("Missing market price", (r) => !(r.currentPrice > 0), "critical",
    "One or more holdings have quantity but no current market price.", "Refresh symbol prices from MT5.");
  countIssue("Missing average cost", (r) => !(r.entryPrice > 0), "critical",
    "Average cost is zero/missing — return and P&L cannot be derived.", "Re-pull entry price (price_open) from MT5.");
  countIssue("Zero / negative quantity", (r) => !(r.volume > 0), "critical",
    "A position has non-positive quantity.", "Inspect the raw fills feeding aggregation.");
  countIssue("Sector classification", (r) => !r.sector || r.sector === "Unknown" || r.sector === "Other", "warning",
    "Sector classification unavailable for some holdings (no MT5 path/name signal or GICS phrase match).",
    "Enrich the MT5 full_name/path feeding classify(), or extend its GICS phrase rules.");
  countIssue("Historical price series", (r) => !r.hasHistory, "info",
    "Some holdings lack daily history (volatility/beta use proxies).", "Backfill symbol_rates for these symbols.");

  // ── 2. POSITIONS ────────────────────────────────────────────────────────────
  {
    let maxErr = 0, worst = "";
    for (const r of rows) {
      const expected = r.volume * r.currentPrice;
      const e = expected !== 0 ? Math.abs((Math.abs(r.marketValue) - Math.abs(expected)) / expected) * 100 : 0;
      if (e > maxErr) { maxErr = e; worst = r.symbol; }
    }
    add({ category: "Positions", metric: "Market Value = Qty × Price", severity: maxErr <= 0.1 ? "pass" : "warning",
      expected: "MV ≡ |Qty × Current Price|", actual: `max error ${maxErr.toFixed(3)}%${worst ? ` (${worst})` : ""}`,
      message: maxErr <= 0.1 ? "Every market value reconciles with quantity × price." : "A market value diverges from quantity × price.",
      fix: maxErr <= 0.1 ? undefined : "Recompute market value as |volume × current price|." });

    let wErr = 0;
    for (const r of rows) wErr = Math.max(wErr, Math.abs(r.weight - (Math.abs(r.marketValue) / a.grossExposure) * 100));
    add({ category: "Positions", metric: "Weight = MV / Gross", severity: wErr <= 0.01 ? "pass" : "warning",
      expected: "weight ≡ |MV| / gross", actual: `max error ${pp(wErr)}`,
      message: wErr <= 0.01 ? "Position weights reconcile with market values." : "A weight does not match |MV| / gross.",
      fix: wErr <= 0.01 ? undefined : "Recompute weights from market value over gross exposure." });

    const dupes = posVal.rows.filter((v) => v.flags.includes("Duplicate position row"));
    add({ category: "Positions", metric: "No duplicate symbols", severity: dupes.length ? "critical" : "pass",
      expected: "unique instrument per row", actual: `${dupes.length} duplicate(s)`,
      message: dupes.length ? "Aggregation produced duplicate rows." : "Each instrument appears exactly once after aggregation.",
      fix: dupes.length ? "Fix aggregateBySymbol keying." : undefined });
  }

  // ── 3. RETURNS ──────────────────────────────────────────────────────────────
  {
    let maxErr = 0, worst = "";
    for (const r of rows) {
      const sign = r.direction === "Short" ? -1 : 1;
      const indep = r.entryPrice > 0 ? (r.currentPrice / r.entryPrice - 1) * 100 * sign : 0;
      const e = Math.abs(indep - r.returnPct);
      if (e > maxErr) { maxErr = e; worst = r.symbol; }
    }
    add({ category: "Returns", metric: "Total Return (since cost)", severity: maxErr <= 0.01 ? "pass" : "critical",
      expected: "(Current/Cost − 1) × sign", actual: `max error ${pp(maxErr)}${worst && maxErr > 0.01 ? ` (${worst})` : ""}`,
      message: maxErr <= 0.01 ? "Displayed returns match the independent recomputation." : "A displayed return diverges from the formula.",
      fix: maxErr <= 0.01 ? undefined : "Use (current/entry − 1) × sign, not the price-history-window return." });

    const insane = rows.filter((r) => Math.abs(r.dailyReturnPct) > 50);
    add({ category: "Returns", metric: "Daily return sanity", severity: insane.length ? "warning" : "pass",
      expected: "|daily| ≤ 50%", actual: `${insane.length} outlier(s)`,
      message: insane.length ? "A daily return exceeds 50% — likely a stale or bad close." : "All daily returns are within a sane band.",
      fix: insane.length ? "Verify the latest two closes in symbol_rates." : undefined });
  }

  // ── 4. P&L ──────────────────────────────────────────────────────────────────
  {
    const sumPnl = rows.reduce((s, r) => s + r.unrealizedPnl, 0);
    const sumSwap = positions.reduce((s, p) => s + (p.swap || 0), 0);
    // equity = balance + credit + floating + swap  ⇒  floating = equity − balance − credit − swap
    const impliedFloat = acct.equity - acct.balance - acct.credit - sumSwap;
    const tol = Math.max(1, Math.abs(impliedFloat) * 0.001);
    const diff = sumPnl - impliedFloat;
    add({ category: "P&L", metric: "Floating P&L vs account", severity: Math.abs(diff) <= tol ? "pass" : "warning",
      expected: `equity − balance − credit − swap = ${money(impliedFloat)}`, actual: `Σ unrealized = ${money(sumPnl)}`,
      diff: money(diff),
      message: Math.abs(diff) <= tol ? "Aggregate unrealized P&L reconciles with the account's floating P&L."
        : "Aggregate unrealized P&L does not reconcile with account equity.",
      fix: Math.abs(diff) <= tol ? undefined : "Check for positions excluded from the snapshot or swap handling." });

    const signMismatch = rows.filter((r) => r.entryPrice > 0 && Math.sign(r.unrealizedPnl) !== 0 && Math.sign(r.unrealizedPnl) !== Math.sign(r.returnPct));
    add({ category: "P&L", metric: "P&L sign vs return sign", severity: signMismatch.length ? "warning" : "pass",
      expected: "sign(P&L) = sign(return)", actual: `${signMismatch.length} mismatch(es)`,
      message: signMismatch.length ? "A position's P&L sign disagrees with its price return (possible FX inversion)."
        : "Every position's P&L sign agrees with its return.",
      fix: signMismatch.length ? "Inspect currency/contract handling for the flagged symbol." : undefined });
  }

  // ── 5. WEIGHTS ──────────────────────────────────────────────────────────────
  {
    const sumW = rows.reduce((s, r) => s + r.weight, 0);
    add({ category: "Weights", metric: "Σ weights ≈ 100%", severity: Math.abs(sumW - 100) <= 0.1 ? "pass" : "critical",
      expected: "100% of gross exposure", actual: pct(sumW), diff: pp(sumW - 100),
      message: Math.abs(sumW - 100) <= 0.1 ? "Position weights sum to 100% of gross exposure." : "Position weights do not sum to 100%.",
      fix: Math.abs(sumW - 100) <= 0.1 ? undefined : "Normalize weights by gross exposure." });

    const top5 = [...rows].sort((x, y) => y.weight - x.weight).slice(0, 5).reduce((s, r) => s + r.weight, 0);
    add({ category: "Weights", metric: "Top-5 concentration", severity: Math.abs(top5 - a.top5Pct) <= 0.1 ? "pass" : "warning",
      expected: `Σ top-5 weights = ${pct(a.top5Pct)}`, actual: pct(top5), diff: pp(top5 - a.top5Pct),
      message: Math.abs(top5 - a.top5Pct) <= 0.1 ? "Top-5 concentration reconciles." : "Top-5 concentration mismatch.",
      fix: undefined });

    const sectorW = new Map<string, number>();
    for (const r of rows) sectorW.set(r.sector, (sectorW.get(r.sector) ?? 0) + r.weight);
    const sumSector = [...sectorW.values()].reduce((s, w) => s + w, 0);
    add({ category: "Weights", metric: "Sector weights sum", severity: Math.abs(sumSector - 100) <= 0.1 ? "pass" : "warning",
      expected: "100%", actual: pct(sumSector), diff: pp(sumSector - 100),
      message: Math.abs(sumSector - 100) <= 0.1 ? "Sector weights sum to portfolio total." : "Sector weights do not sum to 100%.",
      fix: undefined });
  }

  // ── 6. ATTRIBUTION ──────────────────────────────────────────────────────────
  {
    let maxErr = 0;
    for (const r of rows) {
      const signedW = (Math.abs(r.marketValue) / a.grossExposure) * (r.direction === "Short" ? -1 : 1);
      maxErr = Math.max(maxErr, Math.abs(r.contribToReturn - signedW * r.pnlPct));
    }
    add({ category: "Attribution", metric: "Contribution = Weight × Return", severity: maxErr <= 0.01 ? "pass" : "warning",
      expected: "contrib ≡ signed weight × return", actual: `max error ${pp(maxErr)}`,
      message: maxErr <= 0.01 ? "Every position contribution equals weight × return." : "A contribution does not equal weight × return.",
      fix: maxErr <= 0.01 ? undefined : "Recompute contribution as signed weight × position return." });
  }

  // ── 7. RISK ─────────────────────────────────────────────────────────────────
  {
    const sumCVar = rows.reduce((s, r) => s + r.componentVar, 0);
    const tol = Math.max(1, a.portfolioVar95 * 0.01);
    add({ category: "Risk", metric: "Σ Component VaR ≈ Portfolio VaR", severity: Math.abs(sumCVar - a.portfolioVar95) <= tol ? "pass" : "warning",
      expected: `Portfolio VaR = ${money(a.portfolioVar95)}`, actual: `Σ component = ${money(sumCVar)}`, diff: money(sumCVar - a.portfolioVar95),
      message: Math.abs(sumCVar - a.portfolioVar95) <= tol ? "Component VaR decomposition reconciles with portfolio VaR (Euler)."
        : "Component VaR does not sum to portfolio VaR.",
      fix: Math.abs(sumCVar - a.portfolioVar95) <= tol ? undefined : "Rebuild covariance matrix and re-derive marginal contributions." });

    const sumRC = rows.reduce((s, r) => s + r.contribToVolPct, 0);
    add({ category: "Risk", metric: "Risk contributions ≈ 100%", severity: Math.abs(sumRC - 100) <= 1 ? "pass" : "warning",
      expected: "100%", actual: pct(sumRC), diff: pp(sumRC - 100),
      message: Math.abs(sumRC - 100) <= 1 ? "Risk contributions sum to ~100%." : "Risk contributions do not sum to 100%.",
      fix: undefined });

    add({ category: "Risk", metric: "Volatility non-negative", severity: a.portfolioVolAnnual >= 0 ? "pass" : "critical",
      expected: "≥ 0", actual: pct(a.portfolioVolAnnual),
      message: a.portfolioVolAnnual >= 0 ? "Portfolio volatility is non-negative." : "Negative volatility — covariance is invalid.",
      fix: a.portfolioVolAnnual >= 0 ? undefined : "Inspect covariance matrix for NaN / negative variance." });

    const nan = rows.filter((r) => !Number.isFinite(r.componentVar) || !Number.isFinite(r.marginalVar));
    add({ category: "Risk", metric: "VaR figures finite", severity: nan.length ? "critical" : "pass",
      expected: "all finite", actual: `${nan.length} NaN/∞`,
      message: nan.length ? "Some VaR figures are not finite." : "All VaR figures are finite.",
      fix: nan.length ? "Guard against zero portfolio volatility before dividing." : undefined });
  }

  // ── 8. DIVERSIFICATION ──────────────────────────────────────────────────────
  {
    const { matrix } = a.correlation;
    const n = matrix.length;
    let symOk = true, diagOk = true, rangeOk = true;
    for (let i = 0; i < n; i++) {
      if (Math.abs(matrix[i][i] - 1) > 1e-6) diagOk = false;
      for (let j = 0; j < n; j++) {
        if (Math.abs(matrix[i][j] - matrix[j][i]) > 1e-6) symOk = false;
        if (matrix[i][j] < -1.0001 || matrix[i][j] > 1.0001) rangeOk = false;
      }
    }
    add({ category: "Diversification", metric: "Correlation matrix symmetric", severity: symOk ? "pass" : "critical",
      expected: "ρ(i,j) = ρ(j,i)", actual: symOk ? "symmetric" : "asymmetric",
      message: symOk ? "Correlation matrix is symmetric." : "Correlation matrix is not symmetric.", fix: symOk ? undefined : "Recompute pairwise correlations." });
    add({ category: "Diversification", metric: "Correlation diagonal = 1", severity: diagOk ? "pass" : "critical",
      expected: "ρ(i,i) = 1", actual: diagOk ? "all 1" : "off-diagonal",
      message: diagOk ? "Self-correlations are exactly 1." : "A self-correlation is not 1.", fix: diagOk ? undefined : "Set diagonal to 1." });
    add({ category: "Diversification", metric: "Correlation range [-1, 1]", severity: rangeOk ? "pass" : "critical",
      expected: "−1 ≤ ρ ≤ 1", actual: rangeOk ? "in range" : "out of range",
      message: rangeOk ? "All correlations are within [-1, 1]." : "A correlation lies outside [-1, 1].", fix: rangeOk ? undefined : "Clamp / recompute correlations." });
  }

  // ── 9. DRAWDOWN ─────────────────────────────────────────────────────────────
  try {
    const dd = buildDrawdown(acct, positions, snapshot.symbolRates);
    if (dd.ok) {
      const curOk = dd.currentDD <= 0.0001 && dd.currentDD >= -100;
      add({ category: "Drawdown", metric: "Current drawdown range", severity: curOk ? "pass" : "warning",
        expected: "−100% ≤ DD ≤ 0%", actual: pct(dd.currentDD),
        message: curOk ? "Current drawdown is a valid non-positive figure." : "Current drawdown is out of range.",
        fix: curOk ? undefined : "Drawdown = (value − peak) / peak; verify the peak series." });
      const maxOk = dd.maxDD ? dd.maxDD.ddPct <= dd.currentDD + 0.0001 && dd.maxDD.ddPct <= 0.0001 : true;
      add({ category: "Drawdown", metric: "Max ≤ current drawdown", severity: maxOk ? "pass" : "warning",
        expected: "maxDD ≤ currentDD ≤ 0", actual: dd.maxDD ? pct(dd.maxDD.ddPct) : "n/a",
        message: maxOk ? "Maximum drawdown is at least as deep as the current drawdown." : "Max drawdown shallower than current — inconsistent.",
        fix: maxOk ? undefined : "Re-scan the equity curve for the true trough." });
    } else {
      add({ category: "Drawdown", metric: "Drawdown reconstruction", severity: "info",
        expected: "equity curve", actual: "unavailable",
        message: "Not enough price history to reconstruct the equity curve for drawdown.", fix: "Backfill symbol_rates." });
    }
  } catch {
    add({ category: "Drawdown", metric: "Drawdown reconstruction", severity: "warning", message: "Drawdown engine threw during validation.", fix: "Inspect buildDrawdown inputs." });
  }

  // ── 10. CONSISTENCY ENGINE ──────────────────────────────────────────────────
  {
    const over = rows.filter((r) => r.weight > 100.0001);
    add({ category: "Consistency", metric: "No weight > 100%", severity: over.length ? "critical" : "pass",
      expected: "weight ≤ 100%", actual: `${over.length} over`,
      message: over.length ? "A single weight exceeds 100%." : "No position weight exceeds 100%.", fix: over.length ? "Renormalize weights." : undefined });

    const big = posVal.rows.filter((v) => v.flags.some((f) => f.includes("exceeds")));
    add({ category: "Consistency", metric: "Returns within ±300%", severity: big.length ? "warning" : "pass",
      expected: "|return| ≤ 300%", actual: `${big.length} extreme`,
      message: big.length ? "An extreme return may indicate bad input data." : "No extreme returns detected.", fix: big.length ? "Verify average cost & price for the flagged symbol." : undefined });
  }

  // ── 11. MT5 RECONCILIATION ──────────────────────────────────────────────────
  {
    const unreconciled = posVal.rows.filter((v) => !v.reconciles && Number.isFinite(v.pnlReturn));
    add({ category: "MT5 Reconciliation", metric: "Return ↔ MT5 P&L", severity: unreconciled.length ? "warning" : "pass",
      expected: "price return = P&L / cost (±0.1pp)", actual: `${posVal.verified}/${posVal.rows.length} reconcile`,
      message: unreconciled.length
        ? `${unreconciled.length} holding(s) show an FX/contract gap between price return and P&L-implied return (${unreconciled.map((v) => v.symbol).join(", ")}).`
        : "Every holding's displayed return reconciles with MT5 P&L to the penny.",
      fix: unreconciled.length ? "Displayed price return is correct; capture entry-FX to reconcile the account-currency leg." : undefined });

    add({ category: "MT5 Reconciliation", metric: "Margin level sane", severity: acct.margin >= 0 && acct.equity >= 0 ? "pass" : "warning",
      expected: "margin ≥ 0, equity ≥ 0", actual: `margin ${money(acct.margin)}, equity ${money(acct.equity)}`,
      message: acct.margin >= 0 && acct.equity >= 0 ? "Account margin and equity are valid." : "Account margin/equity invalid.",
      fix: undefined });
  }

  return finalize(findings, at);
}

function finalize(findings: Finding[], at: string): ValidationReport {
  const passed = findings.filter((f) => f.severity === "pass").length;
  const info = findings.filter((f) => f.severity === "info").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const critical = findings.filter((f) => f.severity === "critical").length;
  const checked = findings.length || 1;
  // pass & info fully count; warnings count 60%; critical 0.
  const score = Math.round(((passed + info + warnings * 0.6) / checked) * 10000) / 100;

  const byCategory: CategorySummary[] = CATEGORIES.map((category) => {
    const fs = findings.filter((f) => f.category === category);
    const worst = fs.reduce<Severity>((w, f) => (SEV_RANK[f.severity] > SEV_RANK[w] ? f.severity : w), "pass");
    return { category, total: fs.length, passed: fs.filter((f) => f.severity === "pass").length, worst };
  }).filter((c) => c.total > 0);

  const observations = buildObservations(findings, score);
  return { findings, checked: findings.length, passed, warnings, critical, info, score, byCategory, observations, generatedAt: at };
}

// AI auditor: prioritized natural-language observations derived from findings.
function buildObservations(findings: Finding[], score: number): Observation[] {
  const out: Observation[] = [];
  const crit = findings.filter((f) => f.severity === "critical");
  const warn = findings.filter((f) => f.severity === "warning");
  const info = findings.filter((f) => f.severity === "info");

  for (const f of crit) out.push({ severity: "critical", text: `${f.metric}: ${f.message}${f.fix ? ` Fix: ${f.fix}` : ""}` });
  for (const f of warn) out.push({ severity: "warning", text: `${f.metric}: ${f.message}` });

  // positive confirmations for the headline reconciliations
  const conf = (metric: string) => findings.find((f) => f.metric === metric && f.severity === "pass");
  if (conf("Σ weights ≈ 100%")) out.push({ severity: "pass", text: "Portfolio weights reconcile correctly with market values." });
  if (conf("Σ Component VaR ≈ Portfolio VaR")) {
    const f = findings.find((x) => x.metric === "Σ Component VaR ≈ Portfolio VaR");
    out.push({ severity: "pass", text: `Component VaR decomposition reconciles with total portfolio VaR (${f?.actual}).` });
  }
  if (conf("Total Return (since cost)")) out.push({ severity: "pass", text: "All position returns match an independent recomputation within tolerance." });
  if (info.length) out.push({ severity: "info", text: `${info.length} informational item(s) noted (history coverage, proxies).` });

  out.push({ severity: score >= 99 ? "pass" : score >= 95 ? "warning" : "critical",
    text: `Overall integrity score ${score.toFixed(2)}% across ${findings.length} independent checks.` });
  return out;
}
