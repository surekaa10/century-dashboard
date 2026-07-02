"use client";

import type { BookView } from "@/lib/books";

const BOOKS: {
  key: BookView;
  label: string;
  inactive: string;
  active: string;
}[] = [
  {
    key: "investment",
    label: "Investment",
    inactive: "text-slate-500 border-transparent hover:text-blue-300 hover:border-blue-500/30",
    active: "text-blue-300 border-blue-500/60 bg-blue-500/10",
  },
  {
    key: "combined",
    label: "Combined",
    inactive: "text-slate-500 border-transparent hover:text-slate-300 hover:border-slate-500/30",
    active: "text-slate-200 border-slate-500/50 bg-slate-500/10",
  },
  {
    key: "trading",
    label: "Trading",
    inactive: "text-slate-500 border-transparent hover:text-orange-300 hover:border-orange-500/30",
    active: "text-orange-300 border-orange-500/60 bg-orange-500/10",
  },
  {
    key: "simulated",
    label: "Simulated",
    inactive: "text-slate-500 border-transparent hover:text-violet-300 hover:border-violet-500/30",
    active: "text-violet-300 border-violet-500/60 bg-violet-500/10",
  },
];

export default function BookSelector({
  activeBook,
  onChange,
  onClassify,
}: {
  activeBook: BookView;
  onChange: (book: BookView) => void;
  onClassify: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 pb-1 pt-2 sm:px-6">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-slate-600">
        View
      </span>
      <div className="flex rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5">
        {BOOKS.map(({ key, label, inactive, active }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`rounded-md border px-3 py-1 text-xs font-semibold transition ${
              activeBook === key ? active : inactive
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        onClick={onClassify}
        title="Assign positions to Investment or Trading book"
        className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-slate-500 transition hover:border-white/20 hover:text-slate-300"
      >
        ⚙ Classify
      </button>
    </div>
  );
}
