import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUp, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { ClawForgeFrame } from "@/components/clawforge/ClawForgeFrame";
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

function ChatPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit() {
    const clean = prompt.trim();
    if (!clean) return;
    setSubmitting(true);
    const project = createProject(clean);
    // Brief delay then navigate
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
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
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

      {/* Centered chat area */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Heading */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-semibold text-white">Describe your agent</h1>
            <p className="mt-3 text-sm text-white/48">
              Tell me what your NemoClaw agent should do — I'll generate the workflow, tools, and policies automatically.
            </p>
          </div>

          {/* Chat messages */}
          <div className="mb-6 flex flex-col gap-3">
            {/* Example prompts shown as user messages */}
            <div className="max-w-[85%] self-end rounded-2xl rounded-br-md border border-white/10 bg-[#141414] px-5 py-3 text-sm text-white/70">
              Monitor system logs, detect suspicious activity, write incident reports, and ask before executing any command.
            </div>
            <div className="max-w-[85%] self-end rounded-2xl rounded-br-md border border-white/10 bg-[#141414] px-5 py-3 text-sm text-white/70">
              Act as a GitHub triage agent — read issues, find critical bugs, draft responses, and confirm before posting.
            </div>
          </div>

          {/* Input form */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
            className="relative overflow-hidden rounded-2xl border border-white/12 bg-[#141414] shadow-[0_8px_40px_rgba(0,0,0,0.4)]"
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Describe your NemoClaw agent... (e.g. 'Monitor system logs, detect anomalies, write reports, ask before running commands')"
              className="w-full resize-none border-0 bg-transparent px-6 py-5 pr-16 text-base leading-relaxed text-white outline-none placeholder:text-white/28"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <button
              type="submit"
              disabled={!prompt.trim() || submitting}
              className="absolute bottom-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-white text-black transition hover:bg-white/88 disabled:opacity-40"
              aria-label="Generate agent"
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>

          <p className="mt-3 text-center text-xs text-white/25">
            Press Enter to generate · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}