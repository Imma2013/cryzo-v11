"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Check, ChevronDown } from "lucide-react";
import type { ModelSelection } from "@/lib/ai/models";
import { REASONING_EFFORTS, providerReasoningOptions, type ReasoningEffort } from "@/lib/ai/reasoning-config";

type ModelSummary = { id: string; reasoningEfforts?: string[] };
type Catalog = { providers?: Record<string, { models?: ModelSummary[] }> };
let cachedCatalog: Catalog | undefined;
let loadingCatalog: Promise<Catalog> | undefined;
async function readCatalog(): Promise<Catalog> {
  if (cachedCatalog) return cachedCatalog;
  if (!loadingCatalog) loadingCatalog = fetch("/api/models/catalog", { cache: "no-store" })
    .then(async res => { if (!res.ok) throw Error("Model catalog unavailable"); return res.json() as Promise<Catalog>; })
    .then(data => (cachedCatalog = data))
    .finally(() => { loadingCatalog = undefined; });
  return loadingCatalog;
}

export function ReasoningPicker({ selection, onChange }: {
  selection: ModelSelection;
  onChange: (next: ModelSelection) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog>(cachedCatalog || {});
  const [open, setOpen] = useState(false);
  useEffect(() => { let active = true; void readCatalog().then(data => { if (active) setCatalog(data); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const efforts = useMemo(() => {
    const found = catalog.providers?.[selection.providerId]?.models?.find(model => model.id === selection.modelId)?.reasoningEfforts;
    return (found || []).filter((effort): effort is ReasoningEffort =>
      effort === "default" || (REASONING_EFFORTS.some(value => value === effort) &&
        Boolean(providerReasoningOptions(selection.providerId, selection.modelId, effort))));
  }, [catalog, selection.providerId, selection.modelId]);
  useEffect(() => { setOpen(false); }, [selection.modelId, selection.providerId]);
  // No supported effort metadata: keep provider defaults, never advertise fake tiers.
  if (efforts.length <= 1) return null;
  const current = selection.reasoningEffort && efforts.includes(selection.reasoningEffort)
    ? selection.reasoningEffort : "default";
  const label = (value: string) => value === "default" ? "Default" : value === "xhigh" ? "Extra High" : value.charAt(0).toUpperCase() + value.slice(1);
  return <div className="relative shrink-0">
    <button type="button" aria-label="Reasoning effort" aria-expanded={open} aria-haspopup="menu"
      onClick={() => setOpen(value => !value)}
      className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white">
      <BrainCircuit size={15} aria-hidden="true"/><span>{label(current)}</span><ChevronDown size={12}/>
    </button>
    {open && <>
      <button type="button" aria-label="Close reasoning menu" className="fixed inset-0 z-[76] cursor-default" onClick={() => setOpen(false)} />
      <div role="menu" aria-label="Reasoning effort" className="absolute bottom-full right-0 z-[77] mb-2 min-w-36 rounded-xl border border-zinc-700 bg-zinc-950 p-1.5 text-sm shadow-2xl">
        {efforts.map(level => <button key={level} type="button" role="menuitemradio" aria-checked={current === level}
          onClick={() => { onChange({ ...selection, reasoningEffort: level }); setOpen(false); }}
          className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800">
          {label(level)} {current === level && <Check size={14}/>}</button>)}
      </div>
    </>}
  </div>;
}
