import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Mirrored from the Research Ballot platform (github.com/workadityanambiar-wq/apex-platform,
// lib/data.ts) — W26-2025 cycle. The platform stores its ballot as static seed data; this
// route reproduces it 1:1 so the dashboard tab reflects the real ballot, including analyst
// authorship, catalysts/risks and the full score breakdown.

// Analyst roster (id -> display name + title), from the platform's USERS.
const ANALYSTS: Record<string, { name: string; title: string }> = {
  "meyyappan.lakshmanan": { name: "Meyyappan Lakshmanan", title: "Sr. Research Analyst" },
  "saakshi.shingare": { name: "Saakshi Shingare", title: "Research Analyst" },
  "intissar.elkhadiri": { name: "Intissar El Khadiri", title: "Senior Research Analyst" },
  "aditya.nambiar": { name: "Aditya Nambiar", title: "Research Analyst" },
  "labiba.angona": { name: "Labiba Zoha Angona", title: "Research Analyst" },
  "dnyanada.kulkarni": { name: "Dnyanada Kulkarni", title: "Senior Research Analyst" },
  "jagpavit.bhurjee": { name: "Jagpavit Bhurjee", title: "Research Analyst" },
  "vritti.shah": { name: "Vritti Shah", title: "Research Analyst" },
  "fenil.gala": { name: "Fenil Gala", title: "Research Analyst" },
  "kriti.toshniwal": { name: "Kriti Toshniwal", title: "Research Analyst" },
};

// Sector per idea, from the platform's PORT0 portfolio mapping.
const SECTOR: Record<string, string> = {
  NVDA: "Technology", MSFT: "Technology", META: "Technology", GS: "Financials",
  TSLA: "Consumer", AMZN: "Technology", XOM: "Energy", GOOGL: "Technology",
  JPM: "Financials", AAPL: "Technology",
};

// IDEAS0, verbatim from the platform's lib/data.ts.
const SOURCE_IDEAS = [
  { id: "IDEA-001", ticker: "NVDA", assetClass: "US Equities", dir: "LONG", entry: 875.50, stop: 810.00, target: 1052.00, hold: "3-6M", posSize: 2.5, conv: 9, expRet: 20.2, expDD: -7.5, rr: 2.68, thesis: "Dominant AI infrastructure play. Blackwell GPU ramp accelerating data center demand. CUDA moat unassailable with 85% market share. H200 supply constraints easing Q3.", catalysts: ["Q3 earnings beat", "Blackwell ramp announcement", "Azure/GCP capex expansion"], risks: ["Export restriction tightening", "AMD MI300X share gains", "Valuation compression"], authorId: "meyyappan.lakshmanan", submittedAt: "2025-06-23T09:15Z", totalCredits: 3420, rank: 1, pmScore: 91.2, skillScore: 87.5, rrScore: 89.3, quantScore: 85.1, finalScore: 89.1, approvalStatus: "APPROVED" },
  { id: "IDEA-002", ticker: "MSFT", assetClass: "US Equities", dir: "LONG", entry: 425.20, stop: 398.00, target: 490.00, hold: "2-4M", posSize: 3.0, conv: 8, expRet: 15.2, expDD: -6.4, rr: 2.38, thesis: "Copilot monetization exceeding expectations. Azure AI services driving 28%+ cloud revenue growth. Enterprise AI adoption at inflection point with Fabric platform gaining traction.", catalysts: ["Azure AI revenue acceleration", "Copilot enterprise penetration", "FY26 guidance raise"], risks: ["Google Workspace competition", "Macro slowdown in enterprise spend", "OpenAI dependency"], authorId: "saakshi.shingare", submittedAt: "2025-06-23T10:30Z", totalCredits: 2850, rank: 2, pmScore: 85.3, skillScore: 82.1, rrScore: 85.7, quantScore: 83.4, finalScore: 84.2, approvalStatus: "APPROVED" },
  { id: "IDEA-003", ticker: "META", assetClass: "US Equities", dir: "LONG", entry: 520.80, stop: 478.00, target: 630.00, hold: "4-8M", posSize: 2.0, conv: 8, expRet: 21.0, expDD: -8.2, rr: 2.56, thesis: "Llama 3 driving advertising efficiency gains 18%+ YoY. Threads monetization unlocking new TAM. Reality Labs losses stabilizing at ~$5B/qtr.", catalysts: ["Ad revenue acceleration Q3", "Threads MAU milestone", "WhatsApp Business monetization"], risks: ["FTC antitrust action", "TikTok regulation reversal", "Reality Labs burn escalation"], authorId: "intissar.elkhadiri", submittedAt: "2025-06-23T11:00Z", totalCredits: 2640, rank: 3, pmScore: 83.7, skillScore: 80.9, rrScore: 86.2, quantScore: 81.5, finalScore: 82.8, approvalStatus: "APPROVED" },
  { id: "IDEA-004", ticker: "GS", assetClass: "US Equities", dir: "LONG", entry: 462.30, stop: 435.00, target: 520.00, hold: "2-3M", posSize: 1.5, conv: 7, expRet: 12.5, expDD: -5.9, rr: 2.12, thesis: "IB revenue recovery accelerating with M&A pipeline at 3-year highs. Trading desk outperformance in volatile macro. Marcus consumer segment dragging less than feared.", catalysts: ["M&A fee recognition Q3-Q4", "Fed rate cut cycle beneficiary", "Trading revenue beat"], risks: ["Credit loss provisions", "Regulatory capital requirements", "Marcus consumer losses"], authorId: "aditya.nambiar", submittedAt: "2025-06-23T13:45Z", totalCredits: 1980, rank: 4, pmScore: 76.4, skillScore: 78.2, rrScore: 77.8, quantScore: 74.3, finalScore: 76.8, approvalStatus: "PENDING" },
  { id: "IDEA-005", ticker: "TSLA", assetClass: "US Equities", dir: "SHORT", entry: 248.50, stop: 275.00, target: 190.00, hold: "2-4M", posSize: 1.0, conv: 7, expRet: 23.5, expDD: -10.7, rr: 2.20, thesis: "Margin compression continuing with EV price war intensifying globally. FSD still years from regulatory approval. BYD taking share in every market. Robotaxi hype priced in.", catalysts: ["Q2 delivery miss", "FSD recall potential", "BYD market share data"], risks: ["Robotaxi announcement beats", "Short squeeze dynamics", "Elon catalyst tweet"], authorId: "labiba.angona", submittedAt: "2025-06-23T14:00Z", totalCredits: 1840, rank: 5, pmScore: 74.8, skillScore: 71.5, rrScore: 75.2, quantScore: 72.8, finalScore: 73.9, approvalStatus: "PENDING" },
  { id: "IDEA-006", ticker: "AMZN", assetClass: "US Equities", dir: "LONG", entry: 195.40, stop: 182.00, target: 225.00, hold: "3-5M", posSize: 2.0, conv: 8, expRet: 15.2, expDD: -6.9, rr: 2.20, thesis: "AWS re-acceleration to 22%+ growth driven by AI workloads. Advertising achieving Google-like margins. Retail profitability inflection with $10B+ operating income run rate.", catalysts: ["AWS backlog conversion", "Prime Day revenue beat", "Advertising margin expansion"], risks: ["Antitrust regulatory scrutiny", "Capex expansion concerns", "Retail macro headwinds"], authorId: "dnyanada.kulkarni", submittedAt: "2025-06-23T15:30Z", totalCredits: 1720, rank: 6, pmScore: 72.1, skillScore: 74.8, rrScore: 73.5, quantScore: 71.2, finalScore: 72.9, approvalStatus: "PENDING" },
  { id: "IDEA-007", ticker: "XOM", assetClass: "US Equities", dir: "SHORT", entry: 118.20, stop: 126.00, target: 98.00, hold: "3-6M", posSize: 1.0, conv: 6, expRet: 17.1, expDD: -6.6, rr: 2.59, thesis: "Oil demand destruction accelerating from EV adoption. Pioneer synergies fully priced in. Permian cost curve under pressure from service inflation.", catalysts: ["Oil price breakdown below $75", "EV adoption data surprise", "OPEC+ agreement breakdown"], risks: ["Geopolitical supply disruption", "Strong buyback program", "Energy rotation trade"], authorId: "jagpavit.bhurjee", submittedAt: "2025-06-24T09:00Z", totalCredits: 1320, rank: 7, pmScore: 68.3, skillScore: 65.7, rrScore: 70.4, quantScore: 66.9, finalScore: 67.8, approvalStatus: "PENDING" },
  { id: "IDEA-008", ticker: "GOOGL", assetClass: "US Equities", dir: "LONG", entry: 178.60, stop: 165.00, target: 210.00, hold: "3-5M", posSize: 2.5, conv: 7, expRet: 17.6, expDD: -7.6, rr: 2.32, thesis: "Search resilience underestimated. AI Overviews driving monetization of new query types. YouTube Shorts at parity. Waymo robotaxi fleet acceleration optionality.", catalysts: ["AI Overviews monetization", "YouTube Q3 acceleration", "Cloud growth re-acceleration"], risks: ["DOJ antitrust remedy severity", "OpenAI search threat", "Ad market softening"], authorId: "vritti.shah", submittedAt: "2025-06-24T10:15Z", totalCredits: 1280, rank: 8, pmScore: 67.5, skillScore: 70.2, rrScore: 68.9, quantScore: 68.4, finalScore: 68.6, approvalStatus: "REVIEW" },
  { id: "IDEA-009", ticker: "JPM", assetClass: "US Equities", dir: "LONG", entry: 215.40, stop: 200.00, target: 240.00, hold: "2-4M", posSize: 1.5, conv: 6, expRet: 11.4, expDD: -7.1, rr: 1.60, thesis: "Fortress balance sheet for rate normalization. IB recovery underpriced. Consumer credit more resilient than consensus. Buyback authorization at record levels.", catalysts: ["NIM expansion from rate cuts", "IB pipeline conversion", "Buyback acceleration"], risks: ["Commercial real estate exposure", "Consumer credit deterioration", "Regulatory capital increases"], authorId: "fenil.gala", submittedAt: "2025-06-24T11:30Z", totalCredits: 980, rank: 9, pmScore: 63.2, skillScore: 62.8, rrScore: 60.5, quantScore: 63.7, finalScore: 62.7, approvalStatus: "REVIEW" },
  { id: "IDEA-010", ticker: "AAPL", assetClass: "US Equities", dir: "LONG", entry: 192.30, stop: 178.00, target: 220.00, hold: "4-6M", posSize: 2.0, conv: 6, expRet: 14.4, expDD: -7.4, rr: 1.94, thesis: "Apple Intelligence super-cycle upgrade beginning. Services approaching $110B run rate. India manufacturing diversification de-risking supply chain concentration risk.", catalysts: ["iPhone 17 AI upgrade cycle", "Services margin expansion", "India production ramp"], risks: ["China revenue concentration", "AI feature differentiation vs Samsung", "App Store regulatory changes"], authorId: "kriti.toshniwal", submittedAt: "2025-06-24T14:00Z", totalCredits: 840, rank: 10, pmScore: 60.8, skillScore: 63.4, rrScore: 62.1, quantScore: 61.5, finalScore: 61.8, approvalStatus: "REVIEW" },
] as const;

const IDEAS = SOURCE_IDEAS.map((i) => {
  const analyst = ANALYSTS[i.authorId];
  return {
    id: i.id,
    ticker: i.ticker,
    dir: i.dir,
    entry: i.entry,
    stop: i.stop,
    target: i.target,
    hold: i.hold,
    posSize: i.posSize,
    conv: i.conv,
    expRet: i.expRet,
    expDD: i.expDD,
    rr: i.rr,
    finalScore: i.finalScore,
    totalCredits: i.totalCredits,
    rank: i.rank,
    approvalStatus: i.approvalStatus,
    thesis: i.thesis,
    catalysts: i.catalysts,
    risks: i.risks,
    sector: SECTOR[i.ticker] ?? "—",
    assetClass: i.assetClass,
    author: analyst?.name ?? i.authorId,
    authorTitle: analyst?.title ?? "Analyst",
    submittedAt: i.submittedAt,
    scores: { pm: i.pmScore, skill: i.skillScore, rr: i.rrScore, quant: i.quantScore },
  };
});

const totalMarketCredits = IDEAS.reduce((a, i) => a + i.totalCredits, 0);

export async function GET() {
  return NextResponse.json({
    weekId: "W26-2025",
    generatedAt: new Date().toISOString(),
    totalMarketCredits,
    ideasCount: IDEAS.length,
    source: "https://apex-platform-steel.vercel.app",
    ideas: IDEAS,
  });
}
