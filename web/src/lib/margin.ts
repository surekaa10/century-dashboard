import type { Account, Position } from "./types";
import { classify } from "./sectors";

export interface MarginPosition {
  symbol: string;
  assetClass: string;
  sector: string;
  direction: "Long" | "Short";
  volume: number;
  notional: number;
  marginUsed: number;
  impliedLeverage: number;
  maintenanceMargin: number;
  liqPrice: number;
  distToLiqPct: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface AssetClassMargin {
  assetClass: string;
  notional: number;
  marginUsed: number;
  count: number;
  pnl: number;
}

export interface StressScenario {
  label: string;
  description: string;
  pnlImpact: number;
  newEquity: number;
  newMarginLevel: number;
  marginCallTriggered: boolean;
  stopOutTriggered: boolean;
}

export interface MarginAnalytics {
  grossExposure: number;
  netExposure: number;
  portfolioLeverage: number;
  financingCost: number;
  floatingPnl: number;
  marginEfficiency: number;
  marginCallRisk: number;
  stopOutBuffer: number;
  equityDropToMarginCall: number;
  equityDropToStopOut: number;
  positions: MarginPosition[];
  byAssetClass: AssetClassMargin[];
  stressTests: StressScenario[];
}

// Aggregate multiple fills per symbol to one row
function aggregatePositions(positions: Position[]): Position[] {
  const map = new Map<string, Position>();
  for (const p of positions) {
    const key = p.symbol.trim();
    const ex = map.get(key);
    if (!ex) {
      map.set(key, { ...p, symbol: key });
    } else {
      const totalVol = ex.volume + p.volume;
      ex.entryPrice = (ex.entryPrice * ex.volume + p.entryPrice * p.volume) / totalVol;
      ex.volume = totalVol;
      ex.marketValue += p.marketValue;
      ex.unrealizedPnl += p.unrealizedPnl;
      ex.swap += p.swap;
    }
  }
  return [...map.values()];
}

// Compute PnL impact of a scenario by applying per-asset-class shocks
function computeScenarioPnl(
  positions: Position[],
  shock: Record<string, number>, // assetClass -> fraction, e.g. { Equity: -0.1 }
  defaultShock: number,
): number {
  let total = 0;
  for (const p of positions) {
    const { assetClass } = classify(p.symbol.trim());
    const s = shock[assetClass] ?? defaultShock;
    const notional = Math.abs(p.marketValue);
    const dirSign = p.direction === "Long" ? 1 : -1;
    total += dirSign * notional * s;
  }
  return total;
}

export function buildMarginAnalytics(
  account: Account,
  rawPositions: Position[],
): MarginAnalytics {
  const positions = aggregatePositions(rawPositions);

  const grossExposure = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0);
  const netExposure = positions.reduce(
    (s, p) => s + (p.direction === "Long" ? Math.abs(p.marketValue) : -Math.abs(p.marketValue)),
    0,
  );
  const floatingPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const financingCost = positions.reduce((s, p) => s + p.swap, 0);
  const portfolioLeverage = account.equity > 0 ? grossExposure / account.equity : 0;
  const marginEfficiency =
    account.margin > 0 ? (floatingPnl / account.margin) * 100 : 0;

  // Margin level = equity / margin * 100
  // Margin call at ~100%, stop-out at ~50%
  const MARGIN_CALL_LEVEL = 100;
  const STOP_OUT_LEVEL = 50;

  const equityForMarginCall =
    account.margin > 0 ? (MARGIN_CALL_LEVEL / 100) * account.margin : 0;
  const equityForStopOut =
    account.margin > 0 ? (STOP_OUT_LEVEL / 100) * account.margin : 0;

  const equityDropToMarginCall = Math.max(0, account.equity - equityForMarginCall);
  const equityDropToStopOut = Math.max(0, account.equity - equityForStopOut);
  const stopOutBuffer = equityDropToStopOut;

  // How close to margin call: 0% = safe, 100% = at margin call threshold
  const marginCallRisk =
    account.marginLevel > 0
      ? Math.min(100, Math.max(0, (MARGIN_CALL_LEVEL / account.marginLevel) * 100))
      : 0;

  // Per-position margin (proportional share of account.margin)
  const marginPositions: MarginPosition[] = positions.map((p) => {
    const notional = Math.abs(p.marketValue);
    const share = grossExposure > 0 ? notional / grossExposure : 0;
    const marginUsed = share * account.margin;
    const impliedLeverage = marginUsed > 0 ? notional / marginUsed : 0;
    const maintenanceMargin = marginUsed * 0.5;

    // Buffer available before stop-out, allocated proportionally.
    // distToLiq = posBuffer / notional: the % the price must move against us to hit stop-out.
    // This correctly handles any contract size since both posBuffer and notional are in $.
    const posBuffer = grossExposure > 0 ? stopOutBuffer * (notional / grossExposure) : 0;
    const distToLiqPct = notional > 0 ? Math.min(999, (posBuffer / notional) * 100) : 0;
    const priceMoveToLiq = (distToLiqPct / 100) * p.currentPrice;

    const liqPrice =
      p.direction === "Long"
        ? p.currentPrice - priceMoveToLiq
        : p.currentPrice + priceMoveToLiq;

    const { assetClass, sector } = classify(p.symbol);

    return {
      symbol: p.symbol,
      assetClass,
      sector,
      direction: p.direction,
      volume: p.volume,
      notional,
      marginUsed,
      impliedLeverage,
      maintenanceMargin,
      liqPrice,
      distToLiqPct,
      currentPrice: p.currentPrice,
      unrealizedPnl: p.unrealizedPnl,
    };
  });

  // Group by asset class
  const acMap = new Map<string, AssetClassMargin>();
  for (const mp of marginPositions) {
    const ex = acMap.get(mp.assetClass) ?? {
      assetClass: mp.assetClass,
      notional: 0,
      marginUsed: 0,
      count: 0,
      pnl: 0,
    };
    ex.notional += mp.notional;
    ex.marginUsed += mp.marginUsed;
    ex.count += 1;
    ex.pnl += mp.unrealizedPnl;
    acMap.set(mp.assetClass, ex);
  }
  const byAssetClass = [...acMap.values()].sort((a, b) => b.notional - a.notional);

  // Stress scenarios
  const makeScenario = (
    label: string,
    description: string,
    shock: Record<string, number>,
    defaultShock: number,
  ): StressScenario => {
    const pnlImpact = computeScenarioPnl(rawPositions, shock, defaultShock);
    const newEquity = account.equity + pnlImpact;
    const newMarginLevel = account.margin > 0 ? (newEquity / account.margin) * 100 : Infinity;
    return {
      label,
      description,
      pnlImpact,
      newEquity,
      newMarginLevel,
      marginCallTriggered: newMarginLevel < MARGIN_CALL_LEVEL,
      stopOutTriggered: newMarginLevel < STOP_OUT_LEVEL,
    };
  };

  const stressTests: StressScenario[] = [
    makeScenario("Market -5%", "Broad -5% drawdown", {}, -0.05),
    makeScenario("Market -10%", "Broad -10% correction", {}, -0.10),
    makeScenario("Market -15%", "Bear market decline", {}, -0.15),
    makeScenario("Market -20%", "Severe bear market", {}, -0.20),
    makeScenario(
      "Tech Rout -15%",
      "IT sector selloff, others -5%",
      { Equity: -0.05 },
      -0.05,
    ),
    makeScenario(
      "Vol Spike",
      "Volatility shock, equities -8%",
      { Equity: -0.08, Index: -0.08 },
      -0.04,
    ),
    makeScenario(
      "Rates Shock",
      "Rate hike 100bps, equities -7%",
      { Equity: -0.07, Index: -0.06, FX: -0.02 },
      -0.03,
    ),
    makeScenario(
      "Commodity Shock",
      "Commodities -15%, equities -3%",
      { Commodity: -0.15, Equity: -0.03, Index: -0.03 },
      -0.05,
    ),
    makeScenario(
      "Market +5%",
      "Broad +5% rally",
      {},
      0.05,
    ),
    makeScenario(
      "Market +10%",
      "Broad +10% recovery",
      {},
      0.10,
    ),
  ];

  return {
    grossExposure,
    netExposure,
    portfolioLeverage,
    financingCost,
    floatingPnl,
    marginEfficiency,
    marginCallRisk,
    stopOutBuffer,
    equityDropToMarginCall,
    equityDropToStopOut,
    positions: marginPositions,
    byAssetClass,
    stressTests,
  };
}
