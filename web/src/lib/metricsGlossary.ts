// Central metric dictionary. Every info icon and the searchable glossary read
// from here, so definitions stay consistent across the whole dashboard. Keep
// entries concise but complete: description, why it matters, formula, how to
// read it, an institutional benchmark, a worked example, and pitfalls.

export type Tone = "good" | "warn" | "bad" | "neutral";

export interface Band { range: string; label: string; tone: Tone }

export interface MetricInfo {
  key: string;
  title: string;
  category: string;
  description: string;
  why: string;
  formula?: string;
  bands?: Band[];
  interpretation?: string;
  benchmark?: string;
  example?: string;
  mistakes?: string;
  related?: string[];
}

const M: MetricInfo[] = [
  // ── Overview / structure ────────────────────────────────────────────────────
  {
    key: "portfolio-health-score", title: "Portfolio Health Score", category: "Overview",
    description: "An overall assessment of the portfolio based on return quality, diversification, concentration and risk.",
    why: "A declining health score often signals rising risk or deteriorating diversification before it shows up in P&L.",
    formula: "weighted blend of return, diversification,\nconcentration & risk sub-scores (0–100)",
    bands: [
      { range: "90–100", label: "Excellent", tone: "good" },
      { range: "75–89", label: "Strong", tone: "good" },
      { range: "60–74", label: "Moderate", tone: "warn" },
      { range: "< 60", label: "Needs attention", tone: "bad" },
    ],
    benchmark: "Institutional books typically run 70+.",
    related: ["sharpe", "hhi", "volatility"],
  },
  {
    key: "holdings-snapshot", title: "Holdings Snapshot", category: "Overview",
    description: "A one-glance view of portfolio structure: number of positions, exposure, and concentration.",
    why: "Structure drives risk. Knowing gross/net exposure and concentration is the starting point for every other analysis.",
    related: ["exposure-summary", "weight"],
  },
  {
    key: "exposure-summary", title: "Exposure Summary", category: "Overview",
    description: "Long, short, gross and net exposure of the book in account currency.",
    why: "Net exposure is your directional market bet; gross exposure is your total capital at work (and leverage).",
    formula: "Gross = Σ|MV|   Net = Σ long − Σ short",
    interpretation: "Net near 0 with high gross = market-neutral. Net ≈ gross = long-only directional.",
    related: ["weight", "market-value"],
  },
  {
    key: "market-value", title: "Market Value", category: "Positions",
    description: "Current value of a position: quantity times the latest market price.",
    why: "The basis for portfolio weight and the denominator for most exposure and contribution math.",
    formula: "Market Value = Quantity × Current Price",
    example: "200 shares × $69.88 = $13,976.",
    related: ["weight", "total-return"],
  },
  {
    key: "weight", title: "Portfolio Weight", category: "Positions",
    description: "A holding's share of the portfolio, by market value over gross exposure.",
    why: "Weights drive contribution and risk; an oversized weight concentrates both return and loss.",
    formula: "Weight = |Market Value| / Σ|Market Value|",
    example: "$52,340 / $610,220 = 8.58%.",
    interpretation: "Weights should sum to ~100% of gross exposure.",
    mistakes: "Deriving weight from cost basis, equity or margin instead of market value.",
    related: ["market-value", "hhi"],
  },
  {
    key: "total-return", title: "Total Return (since cost)", category: "Performance",
    description: "The true investment return of a holding from its average cost.",
    why: "It is the only return that reflects what you actually paid; price-window returns can be wildly misleading.",
    formula: "Return = (Current Price / Average Cost − 1) × sign",
    example: "(199.06 / 220.94 − 1) = −9.9% for a long.",
    interpretation: "Equals Unrealized P&L / Cost Basis for account-currency instruments.",
    mistakes: "Showing the price-history-window return, percent of portfolio, or P&L in dollars instead.",
    related: ["market-value", "weight"],
  },

  // ── Performance ─────────────────────────────────────────────────────────────
  {
    key: "performance-attribution", title: "Performance Attribution", category: "Performance",
    description: "Decomposes portfolio return into the contribution of each position, sector and factor.",
    why: "Tells you what actually drove performance, separating skill (selection) from allocation.",
    formula: "Total Return = Σ (Weight × Return)",
    related: ["position-contribution", "sector-contribution"],
  },
  {
    key: "position-contribution", title: "Position Contribution", category: "Performance",
    description: "How much each holding added to or subtracted from total portfolio return.",
    why: "Surfaces the handful of names that move the book — for better or worse.",
    formula: "Contribution = Weight × Return",
    interpretation: "All position contributions sum to the portfolio return.",
    related: ["performance-attribution", "sector-contribution"],
  },
  {
    key: "sector-contribution", title: "Sector Contribution", category: "Performance",
    description: "Aggregated return contribution grouped by sector.",
    why: "Reveals whether returns are broad-based or concentrated in one part of the market.",
    formula: "Σ (Position Contributions within sector)",
    related: ["position-contribution"],
  },
  {
    key: "alpha", title: "Alpha", category: "Performance",
    description: "Return earned above what the benchmark would predict for the portfolio's beta.",
    why: "Isolates manager skill from simply taking market exposure.",
    formula: "α = Rₚ − [R_f + β × (R_m − R_f)]",
    interpretation: "Positive alpha = outperformance after adjusting for risk taken.",
    benchmark: "Sustained positive alpha is rare and valuable.",
    related: ["beta", "sharpe"],
  },
  {
    key: "sharpe", title: "Sharpe Ratio", category: "Performance",
    description: "Risk-adjusted return: excess return per unit of total volatility.",
    why: "Lets you compare strategies on a level field — high return with high risk may be worse than modest steady return.",
    formula: "Sharpe = (Return − Risk-Free Rate) / Volatility",
    bands: [
      { range: "> 2", label: "Excellent", tone: "good" },
      { range: "1 – 2", label: "Good", tone: "good" },
      { range: "0 – 1", label: "Sub-par", tone: "warn" },
      { range: "< 0", label: "Losing", tone: "bad" },
    ],
    benchmark: "Institutional target typically > 1.",
    mistakes: "Comparing Sharpe across very different return frequencies without annualizing.",
    related: ["sortino", "volatility", "alpha"],
  },
  {
    key: "sortino", title: "Sortino Ratio", category: "Performance",
    description: "Like Sharpe but penalizes only downside volatility, not upside.",
    why: "Upside swings are not risk; Sortino rewards strategies that are volatile only when winning.",
    formula: "Sortino = (Return − Target) / Downside Deviation",
    interpretation: "Higher is better; usually exceeds the Sharpe ratio.",
    related: ["sharpe", "volatility"],
  },

  // ── Risk ────────────────────────────────────────────────────────────────────
  {
    key: "var", title: "Value at Risk (95%)", category: "Risk",
    description: "The loss the portfolio is not expected to exceed on a normal day, at 95% confidence.",
    why: "A single headline number for downside exposure that desks and risk committees track daily.",
    formula: "VaR = z₉₅ × σ_daily × Gross Exposure",
    example: "A 1-day VaR of $5,000 means 95% confidence the portfolio won't lose more than $5,000 in a day under normal conditions.",
    interpretation: "On ~1 day in 20 losses may exceed VaR — that is what CVaR measures.",
    mistakes: "Treating VaR as a worst case; it is a threshold, not a maximum.",
    related: ["cvar", "component-var", "marginal-var"],
  },
  {
    key: "cvar", title: "Conditional VaR (CVaR)", category: "Risk",
    description: "The average loss on the days when losses exceed VaR — the expected size of a tail event.",
    why: "Captures how bad the bad days are, which VaR alone ignores.",
    formula: "CVaR = E[ loss | loss > VaR ]",
    interpretation: "Always ≥ VaR; a large gap signals fat tails.",
    related: ["var", "tail-risk"],
  },
  {
    key: "marginal-var", title: "Marginal VaR", category: "Risk",
    description: "How much portfolio VaR changes for a small increase in a position's weight.",
    why: "Identifies which positions add the most risk at the margin — where to trim first.",
    formula: "MVaR_i = z₉₅ × (Σw)_i / σ_p",
    related: ["component-var", "var", "risk-contribution"],
  },
  {
    key: "component-var", title: "Component VaR", category: "Risk",
    description: "Each position's share of total portfolio VaR, accounting for correlations.",
    why: "Unlike standalone risk, it shows true contribution after diversification.",
    formula: "CVaR_i = weight_i × MVaR_i   (Σ = Portfolio VaR)",
    interpretation: "Component VaR sums to total portfolio VaR (Euler allocation).",
    related: ["marginal-var", "var", "risk-contribution"],
  },
  {
    key: "risk-contribution", title: "Risk Contribution", category: "Risk",
    description: "A position's percentage share of total portfolio risk.",
    why: "A name can be small by weight yet dominate risk; this catches that.",
    formula: "RC_i = Component VaR_i / Portfolio VaR",
    interpretation: "Contributions sum to ~100%. Compare to weight — risk above weight = risk concentration.",
    related: ["component-var", "marginal-var"],
  },
  {
    key: "beta", title: "Beta", category: "Risk",
    description: "Sensitivity of the portfolio (or a holding) to moves in the benchmark.",
    why: "Quantifies market exposure: how much you move when the market moves.",
    formula: "β = Cov(Portfolio, Benchmark) / Var(Benchmark)",
    bands: [
      { range: "> 1", label: "More volatile than market", tone: "warn" },
      { range: "= 1", label: "Moves with market", tone: "neutral" },
      { range: "0 – 1", label: "Defensive", tone: "good" },
      { range: "< 0", label: "Inverse to market", tone: "neutral" },
    ],
    related: ["alpha", "volatility", "market-beta"],
  },
  {
    key: "volatility", title: "Volatility", category: "Risk",
    description: "Annualized standard deviation of returns — how much the value swings.",
    why: "The core measure of uncertainty and the denominator of Sharpe and VaR.",
    formula: "σ_annual = σ_daily × √252",
    interpretation: "Higher volatility = wider range of outcomes. Must be non-negative.",
    related: ["sharpe", "var", "beta"],
  },

  // ── Diversification ─────────────────────────────────────────────────────────
  {
    key: "hhi", title: "Herfindahl Index (HHI)", category: "Diversification",
    description: "Concentration measure: the sum of squared portfolio weights.",
    why: "Low HHI means risk is spread; high HHI means a few names dominate.",
    formula: "HHI = Σ (Weightᵢ)²",
    bands: [
      { range: "< 0.10", label: "Diversified", tone: "good" },
      { range: "0.10 – 0.18", label: "Moderate", tone: "warn" },
      { range: "> 0.18", label: "Concentrated", tone: "bad" },
    ],
    interpretation: "1 / HHI gives the 'effective number of holdings'.",
    related: ["effective-bets", "weight"],
  },
  {
    key: "diversification-ratio", title: "Diversification Ratio", category: "Diversification",
    description: "Weighted-average volatility of holdings divided by actual portfolio volatility.",
    why: "Measures how much risk diversification actually removes.",
    formula: "DR = Σ(wᵢσᵢ) / σ_portfolio",
    interpretation: "A value above 1.5 generally indicates meaningful diversification benefit; 1.0 means none.",
    related: ["avg-correlation", "effective-bets"],
  },
  {
    key: "effective-bets", title: "Effective Number of Bets", category: "Diversification",
    description: "How many truly independent positions the portfolio behaves like.",
    why: "Twenty correlated holdings can act like two bets; this exposes hidden concentration.",
    formula: "1 / Σ(weightᵢ²)   (or via uncorrelated risk factors)",
    interpretation: "Higher is better; well below the holding count signals correlation drag.",
    related: ["hhi", "diversification-ratio"],
  },
  {
    key: "avg-correlation", title: "Average Correlation", category: "Diversification",
    description: "Mean pairwise correlation across holdings.",
    why: "High average correlation means positions fall together in a sell-off.",
    formula: "mean of off-diagonal correlation matrix entries",
    bands: [
      { range: "< 0.3", label: "Well diversified", tone: "good" },
      { range: "0.3 – 0.6", label: "Moderate", tone: "warn" },
      { range: "> 0.6", label: "Highly correlated", tone: "bad" },
    ],
    related: ["correlation-matrix", "diversification-ratio"],
  },
  {
    key: "correlation-matrix", title: "Correlation Matrix", category: "Diversification",
    description: "Pairwise correlations of holdings' returns.",
    why: "The raw material of diversification and portfolio risk math.",
    interpretation: "Must be symmetric, with a diagonal of 1 and all values within [-1, 1].",
    related: ["avg-correlation"],
  },

  // ── Factors ─────────────────────────────────────────────────────────────────
  {
    key: "factor-exposure", title: "Factor Exposure", category: "Factors",
    description: "The portfolio's sensitivity (beta) to systematic factors via proxy ETFs.",
    why: "Returns and risk are largely explained by factor tilts, not just stock picks.",
    formula: "regress portfolio returns on factor-proxy returns",
    mistakes: "Reading proxy-ETF betas as a full Barra/Axioma factor model — this is an approximation.",
    related: ["market-beta", "growth-factor", "value-factor"],
  },
  { key: "market-beta", title: "Market Beta", category: "Factors",
    description: "Exposure to the broad equity market factor.", why: "Your baseline market risk before any style tilts.",
    formula: "β vs market proxy (e.g. SPY)", related: ["beta", "factor-exposure"] },
  { key: "growth-factor", title: "Growth Factor", category: "Factors",
    description: "Tilt toward high-growth companies (high sales/earnings growth).", why: "Growth and value rotate; knowing your tilt explains regime performance.",
    related: ["value-factor", "factor-exposure"] },
  { key: "value-factor", title: "Value Factor", category: "Factors",
    description: "Tilt toward cheap stocks (low price-to-fundamentals).", why: "Value outperforms in some regimes and lags in others.",
    related: ["growth-factor", "factor-exposure"] },
  { key: "momentum", title: "Momentum Factor", category: "Factors",
    description: "Tilt toward recent winners.", why: "Momentum trends but suffers sharp crashes at reversals.",
    related: ["factor-exposure"] },
  { key: "quality", title: "Quality Factor", category: "Factors",
    description: "Tilt toward profitable, low-leverage, stable companies.", why: "Quality tends to cushion drawdowns.",
    related: ["factor-exposure"] },

  // ── Drawdown ────────────────────────────────────────────────────────────────
  {
    key: "current-drawdown", title: "Current Drawdown", category: "Drawdown",
    description: "Current decline from the portfolio's highest historical value.",
    why: "It is what investors actually feel — the gap from the high-water mark.",
    formula: "(Current Value − Peak Value) / Peak Value",
    benchmark: "Institutional comfort is typically below 10%.",
    interpretation: "Lower (closer to 0) indicates stronger downside protection.",
    related: ["max-drawdown", "recovery-time"],
  },
  {
    key: "max-drawdown", title: "Maximum Drawdown", category: "Drawdown",
    description: "The largest peak-to-trough decline over the period.",
    why: "The worst-case pain endured — a key gauge of strategy survivability.",
    formula: "min over time of (Value − Running Peak) / Running Peak",
    interpretation: "Always at least as deep as the current drawdown.",
    related: ["current-drawdown", "recovery-time"],
  },
  {
    key: "recovery-time", title: "Recovery Time", category: "Drawdown",
    description: "How long it takes to climb back to the prior peak after a drawdown.",
    why: "Two strategies with equal drawdown differ greatly if one recovers in weeks and the other in years.",
    formula: "days from trough back to high-water mark",
    related: ["recovery-pct", "max-drawdown"],
  },
  {
    key: "recovery-pct", title: "Recovery Percentage", category: "Drawdown",
    description: "The gain required from the current level to regain the prior peak.",
    why: "Drawdowns are asymmetric — a 50% loss needs a 100% gain to recover.",
    formula: "Peak / Current − 1",
    example: "Down 20% requires +25% to recover.",
    related: ["current-drawdown"],
  },

  // ── Stress ──────────────────────────────────────────────────────────────────
  {
    key: "historical-scenarios", title: "Historical Scenarios", category: "Stress",
    description: "Replays real historical crises (e.g. 2008, COVID crash) against current holdings.",
    why: "Shows how today's book would have fared in known regimes.",
    interpretation: "Position impacts sum to the total portfolio impact for each scenario.",
    related: ["stress-var", "monte-carlo"],
  },
  {
    key: "monte-carlo", title: "Monte Carlo Simulation", category: "Stress",
    description: "Thousands of randomized return paths to estimate the distribution of outcomes.",
    why: "Goes beyond single scenarios to map the full range of plausible losses.",
    formula: "simulate Σ correlated random returns → loss distribution",
    related: ["stress-var", "var"],
  },
  {
    key: "stress-var", title: "Stress VaR", category: "Stress",
    description: "Value at Risk computed under stressed (crisis-level) volatility and correlations.",
    why: "Normal-market VaR understates risk when correlations spike in a crisis.",
    related: ["var", "monte-carlo", "tail-risk"],
  },
  {
    key: "tail-risk", title: "Tail Risk", category: "Stress",
    description: "Exposure to rare, extreme losses in the far tail of the distribution.",
    why: "Tail events cause most blow-ups; sizing for them is what separates survivors.",
    related: ["cvar", "stress-var"],
  },

  // ── Tactical trading ────────────────────────────────────────────────────────
  {
    key: "tactical-health", title: "Tactical Health Score", category: "Tactical",
    description: "Composite of trading-execution quality: edge, consistency and risk control.",
    why: "Separates a healthy process from lucky outcomes.",
    related: ["expectancy", "profit-factor"],
  },
  {
    key: "r-multiple", title: "R Multiple", category: "Tactical",
    description: "Profit or loss on a trade expressed in units of the risk taken (R).",
    why: "Normalizes outcomes so a +3R win and a −1R loss are directly comparable.",
    formula: "R = (Exit − Entry) / (Entry − Initial Stop)",
    example: "Risk $100, make $300 → +3R.",
    related: ["expectancy"],
  },
  {
    key: "expectancy", title: "Expectancy", category: "Tactical",
    description: "Average profit or loss expected per trade, in R or currency.",
    why: "A positive expectancy is the mathematical definition of an edge.",
    formula: "Expectancy = (Win% × AvgWin) − (Loss% × AvgLoss)",
    interpretation: "Must be positive for a strategy to make money over time.",
    related: ["r-multiple", "profit-factor"],
  },
  {
    key: "profit-factor", title: "Profit Factor", category: "Tactical",
    description: "Gross profit divided by gross loss.",
    why: "A quick read on whether winners outweigh losers.",
    formula: "Profit Factor = Σ Wins / |Σ Losses|",
    bands: [
      { range: "> 1.75", label: "Strong", tone: "good" },
      { range: "1.25 – 1.75", label: "Healthy", tone: "good" },
      { range: "1.0 – 1.25", label: "Marginal", tone: "warn" },
      { range: "< 1.0", label: "Losing", tone: "bad" },
    ],
    related: ["expectancy"],
  },
  {
    key: "alpha-generation", title: "Alpha Generation", category: "Tactical",
    description: "Return generated beyond the benchmark from active trading decisions.",
    why: "Measures whether tactical activity actually adds value versus buy-and-hold.",
    related: ["alpha"],
  },

  // ── Trader DNA / decision ───────────────────────────────────────────────────
  {
    key: "trader-dna", title: "Trader DNA Score", category: "Trader DNA",
    description: "A composite profile of trading behaviour: decision quality, discipline and execution.",
    why: "Behavioural edge (or leakage) is often larger than analytical edge.",
    related: ["decision-quality", "discipline", "execution-quality"],
  },
  {
    key: "decision-quality", title: "Decision Quality", category: "Trader DNA",
    description: "Scores the soundness of the process behind each trade, independent of outcome.",
    why: "Good processes produce good results over time; rewarding lucky bad decisions is dangerous.",
    interpretation: "A rule-breaking winner scores low; a plan-following loser scores high.",
    related: ["outcome-quality", "discipline"],
  },
  {
    key: "outcome-quality", title: "Outcome Quality", category: "Trader DNA",
    description: "Scores the realized result of each trade (the P&L side).",
    why: "Paired with decision quality, it separates skill from luck.",
    related: ["decision-quality"],
  },
  {
    key: "discipline", title: "Discipline Score", category: "Trader DNA",
    description: "How consistently the trader follows their own rules (sizing, stops, plan adherence).",
    why: "Rule violations are the most common and most fixable source of losses.",
    related: ["decision-quality", "execution-quality"],
  },
  {
    key: "execution-quality", title: "Execution Quality", category: "Trader DNA",
    description: "How well entries and exits are timed versus the available price range (MFE/MAE).",
    why: "Leaving money on the table at exit quietly erodes otherwise good trades.",
    related: ["decision-quality", "discipline"],
  },
];

export const GLOSSARY: Record<string, MetricInfo> = Object.fromEntries(M.map((m) => [m.key, m]));
export const GLOSSARY_LIST: MetricInfo[] = M;

export function getMetric(key: string): MetricInfo | undefined {
  return GLOSSARY[key];
}

export function searchMetrics(query: string): MetricInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return M;
  return M
    .map((m) => {
      const hay = `${m.title} ${m.category} ${m.description} ${m.why} ${m.formula ?? ""}`.toLowerCase();
      let score = 0;
      if (m.title.toLowerCase().includes(q)) score += 10;
      if (m.title.toLowerCase().startsWith(q)) score += 10;
      if (m.category.toLowerCase().includes(q)) score += 4;
      if (hay.includes(q)) score += 1;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}
