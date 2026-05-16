import type { MemoryItem } from "@/lib/clawforge/types";

export function MemoryTimeline({ memory }: { memory: MemoryItem[] }) {
  return (
    <div className="grid gap-3">
      {memory.map((item) => (
        <div key={item.id} className="border border-white/10 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{item.type}</div>
          <div className="mt-1 text-xs leading-relaxed text-white/62">{item.content}</div>
        </div>
      ))}
      {!memory.length && <div className="text-xs text-white/38">No memory updates yet.</div>}
    </div>
  );
}
