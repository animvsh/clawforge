import type { MemoryItem } from "@/lib/clawforge/types";

export function MemoryTimeline({ memory }: { memory: MemoryItem[] }) {
  return (
    <div className="grid gap-2">
      {memory.slice(-5).map((item, index) => (
        <div
          key={`${item.id}-${index}`}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{item.type}</div>
            <div className="text-[10px] text-white/30">
              {new Date(item.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
          <div className="mt-1 text-xs leading-relaxed text-white/65">{item.content}</div>
        </div>
      ))}
      {!memory.length && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/45">
          No memory items yet.
        </div>
      )}
    </div>
  );
}
