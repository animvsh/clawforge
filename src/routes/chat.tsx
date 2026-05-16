import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { createProject } from "@/lib/clawforge/projects";
import { Link } from "@tanstack/react-router";
import { AgentPromptComposer } from "@/components/clawforge/AgentPromptComposer";

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

  function handleSubmit() {
    const clean = prompt.trim();
    if (!clean) return;
    setPrompt(""); // clear so animation can resume after navigation
    const project = createProject(clean);
    void navigate({
      to: "/workspace/$projectId",
      params: { projectId: project.id },
    });
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
            New Agent
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
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl flex flex-col items-center">

          {/* Heading */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-white">
              What agent will you forge today?
            </h1>
            <p className="mt-4 text-sm text-white/40 leading-relaxed max-w-md">
              Describe the workflow. ClawForge builds the agent, tools, policies, memory, and live graph.
            </p>
          </div>

          {/* Composer */}
          <AgentPromptComposer
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleSubmit}
            ctaLabel="Forge agent"
            showPlanToggle={false}
          />

        </div>
      </div>
    </div>
  );
}