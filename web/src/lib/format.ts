export const fmtMoney = (v: number, dp = 2): string =>
  v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtSigned = (v: number, dp = 2): string =>
  (v >= 0 ? "+" : "") + fmtMoney(v, dp);

export const fmtPct = (v: number, dp = 2): string =>
  (v >= 0 ? "+" : "") + v.toFixed(dp) + "%";

export const fmtCompact = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return v.toFixed(0);
};

export const pnlClass = (v: number): string =>
  v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-slate-400";

export function agoLabel(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${(seconds / 3600).toFixed(1)}h ago`;
}
