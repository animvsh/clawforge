import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUp, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { createProject } from "@/lib/clawforge/projects";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "New Agent — ClawForge" },
      {
        name: "description",
        content: "Describe your NemoClaw agent in plain English.",
      },
    ],
  }),
  component: ChatPage,
});

const examplePrompts = [
  "Monitor system logs, detect suspicious activity, write incident reports, and ask before executing any command.",
  "GitHub triage agent — read issues, find critical bugs, draft responses, and confirm before posting.",
  "Email inbox assistant — summarize important emails, draft replies, and ask before sending.",
  "Research agent — research a topic, save sources, write a brief, and ask before publishing.",
];

function ChatPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(nextPrompt?: string) {
    const clean = (nextPrompt ?? prompt).trim();
    if (!clean) return;
    if (!nextPrompt) setPrompt(clean);
    setSubmitting(true);
    const project = createProject(clean);
    window.setTimeout(() => {
      void navigate({
        to: "/workspace/$projectId",
        params: { projectId: project.id },
      });
    }, 400);
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-sm text-white/48 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Link>
          <div className="h-4 w-px bg-white/20" />
          <span className="text-[11px] uppercase tracking-[0.28em] text-white/40">
            New NemoClaw Agent
          </span>
        </div>
        <Link
          to="/dashboard"
          className="text-[11px] uppercase tracking-[0.24em] text-white/48 transition hover:text-white"
        >
          Dashboard
        </Link>
      </header>

      {/* Full-height centered content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-xl flex flex-col items-center">

          {/* Heading */}
          <div className="mb-10 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-white">
              Describe your agent
            </h1>
            <p className="mt-4 text-sm text-white/40 leading-relaxed max-w-md">
              Tell me what your NemoClaw agent should do — I'll generate the workflow, policies, and tools automatically.
            </p>
          </div>

          {/* Suggested prompt chips — directly above the textarea */}
          <div className="mb-4 flex flex-col gap-2 w-full">
            {examplePrompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSubmit(p)}
                className="w-full text-left rounded-xl border border-white/[0.07] bg-white/[0.03] px-5 py-3 text-sm text-white/50 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-white/80"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Textarea */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
            className="relative w-full overflow-hidden rounded-2xl border border-white/12 bg-[#141414] shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Or describe your own agent here..."
              className="w-full resize-none border-0 bg-transparent px-6 pt-5 pb-16 text-base text-white leading-relaxed outline-none placeholder:text-white/25"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <div className="absolute bottom-4 left-6 right-16 flex items-center justify-between">
              <span className="text-xs text-white/20">
                Enter to generate &nbsp;·&nbsp; Shift+Enter for new line
              </span>
              <button
                type="submit"
                disabled={!prompt.trim() || submitting}
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-black transition hover:bg-white/88 disabled:opacity-30"
                aria-label="Generate agent"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}