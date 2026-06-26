import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Mirrored from APEX Research Platform (apex-platform-steel.vercel.app) W26-2025 cycle.
// Vote credits reflect analyst consensus weighting across 13 eligible analysts.
const IDEAS = [
  { id: "IDEA-001", ticker: "NVDA", dir: "LONG", entry: 875.50, stop: 810.00, target: 1052.00, hold: "3-6M", posSize: 2.5, conv: 9, expRet: 20.2, rr: 2.68, finalScore: 89.1, totalCredits: 3420, rank: 1, approvalStatus: "APPROVED", thesis: "Dominant AI infrastructure play. Blackwell GPU ramp accelerating data center demand. CUDA moat unassailable with 85% market share. H200 supply constraints easing Q3.", sector: "Technology" },
  { id: "IDEA-002", ticker: "MSFT", dir: "LONG", entry: 425.20, stop: 398.00, target: 490.00, hold: "2-4M", posSize: 3.0, conv: 8, expRet: 15.2, rr: 2.38, finalScore: 84.2, totalCredits: 2850, rank: 2, approvalStatus: "APPROVED", thesis: "Copilot monetization exceeding expectations. Azure AI services driving 28%+ cloud revenue growth. Enterprise AI adoption at inflection point with Fabric platform gaining traction.", sector: "Technology" },
  { id: "IDEA-003", ticker: "META", dir: "LONG", entry: 520.80, stop: 478.00, target: 630.00, hold: "4-8M", posSize: 2.0, conv: 8, expRet: 21.0, rr: 2.56, finalScore: 82.8, totalCredits: 2640, rank: 3, approvalStatus: "APPROVED", thesis: "Llama 3 driving advertising efficiency gains 18%+ YoY. Threads monetization unlocking new TAM. Reality Labs losses stabilizing at ~$5B/qtr.", sector: "Technology" },
  { id: "IDEA-004", ticker: "GS",   dir: "LONG", entry: 462.30, stop: 435.00, target: 520.00, hold: "2-3M", posSize: 1.5, conv: 7, expRet: 12.5, rr: 2.12, finalScore: 76.8, totalCredits: 1980, rank: 4, approvalStatus: "PENDING", thesis: "IB revenue recovery accelerating with M&A pipeline at 3-year highs. Trading desk outperformance in volatile macro. Marcus consumer segment dragging less than feared.", sector: "Financials" },
  { id: "IDEA-005", ticker: "TSLA", dir: "SHORT", entry: 248.50, stop: 275.00, target: 190.00, hold: "2-4M", posSize: 1.0, conv: 7, expRet: 23.5, rr: 2.20, finalScore: 73.9, totalCredits: 1840, rank: 5, approvalStatus: "PENDING", thesis: "Margin compression continuing with EV price war intensifying globally. FSD still years from regulatory approval. BYD taking share in every market. Robotaxi hype priced in.", sector: "Consumer" },
  { id: "IDEA-006", ticker: "AMZN", dir: "LONG", entry: 195.40, stop: 182.00, target: 225.00, hold: "3-5M", posSize: 2.0, conv: 8, expRet: 15.2, rr: 2.20, finalScore: 72.9, totalCredits: 1720, rank: 6, approvalStatus: "PENDING", thesis: "AWS re-acceleration to 22%+ growth driven by AI workloads. Advertising achieving Google-like margins. Retail profitability inflection with $10B+ operating income run rate.", sector: "Technology" },
  { id: "IDEA-007", ticker: "XOM",  dir: "SHORT", entry: 118.20, stop: 126.00, target: 98.00,  hold: "3-6M", posSize: 1.0, conv: 6, expRet: 17.1, rr: 2.59, finalScore: 67.8, totalCredits: 1320, rank: 7, approvalStatus: "PENDING", thesis: "Oil demand destruction accelerating from EV adoption. Pioneer synergies fully priced in. Permian cost curve under pressure from service inflation.", sector: "Energy" },
  { id: "IDEA-008", ticker: "GOOGL", dir: "LONG", entry: 178.60, stop: 165.00, target: 210.00, hold: "3-5M", posSize: 2.5, conv: 7, expRet: 17.6, rr: 2.32, finalScore: 68.6, totalCredits: 1280, rank: 8, approvalStatus: "REVIEW", thesis: "Search resilience underestimated. AI Overviews driving monetization of new query types. YouTube Shorts at parity. Waymo robotaxi fleet acceleration optionality.", sector: "Technology" },
  { id: "IDEA-009", ticker: "JPM",  dir: "LONG", entry: 215.40, stop: 200.00, target: 240.00, hold: "2-4M", posSize: 1.5, conv: 6, expRet: 11.4, rr: 1.60, finalScore: 62.7, totalCredits: 980,  rank: 9, approvalStatus: "REVIEW", thesis: "Fortress balance sheet for rate normalization. IB recovery underpriced. Consumer credit more resilient than consensus. Buyback authorization at record levels.", sector: "Financials" },
  { id: "IDEA-010", ticker: "AAPL", dir: "LONG", entry: 192.30, stop: 178.00, target: 220.00, hold: "4-6M", posSize: 2.0, conv: 6, expRet: 14.4, rr: 1.94, finalScore: 61.8, totalCredits: 840,  rank: 10, approvalStatus: "REVIEW", thesis: "Apple Intelligence super-cycle upgrade beginning. Services approaching $110B run rate. India manufacturing diversification de-risking supply chain concentration risk.", sector: "Technology" },
];

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
