// Normalized shapes for the dashboard. The raw snapshot.json (produced by the
// Python pusher) uses MT5-style keys with spaces; snapshot.ts maps them to these.

export interface Account {
  name: string;
  server: string;
  currency: string;
  leverage: number;
  balance: number;       // realized cash ledger (excludes credit)
  credit: number;        // broker-granted credit — kept distinct from balance
  equity: number;        // balance + credit + floating + swap
  margin: number;
  freeMargin: number;
  marginLevel: number;
}

export interface Position {
  symbol: string;
  direction: "Long" | "Short";
  volume: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  marketValue: number;
  swap: number;
  openTime: string;
  fullName?: string;   // MT5 instrument description (e.g. "ARK Genomic Revolution ETF")
  path?: string;       // MT5 folder path (e.g. "US EQUITY\\ARKG") — drives classify()
}

export interface Deal {
  ticket: number;
  time: string;
  symbol: string;
  type: number;
  entry: number;
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
}

export interface PriceSeries {
  dates: string[];   // ISO date strings, ascending
  close: number[];
}

export type SymbolRates = Record<string, PriceSeries>;

export interface Snapshot {
  ok: boolean;
  error: string;
  generatedAt: string;   // ISO UTC — when MT5 data was captured
  account: Account | null;
  positions: Position[];
  deals: Deal[];
  todayRealized: number;
  symbolRates: SymbolRates;   // daily closes per held symbol (from MT5)
}
