import type { BlueprintResponse } from "@/lib/clawforge/types";
import { useEffect, useState } from "react";

type EditablePolicyEffect = "allowed" | "approval_required" | "blocked";

const deploymentSteps = [
  "NemoClaw sandbox created",
  "Policy pack loaded",
  "Tool permissions locked",
  "Memory boundaries initialized",
  "Live audit stream armed",
  "Agent running inside NemoClaw",
];

const policyOptions: { label: string; value: EditablePolicyEffect }[] = [
  { label: "Allow", value: "allowed" },
  { label: "Approval required", value: "approval_required" },
  { label: "Blocked", value: "blocked" },
];

function policyLabel(effect: string) {
  if (effect === "allow") return "allow";
  if (effect === "deny") return "deny";
  return "pause";
}

function toolBehavior(permission: string) {
  if (permission === "blocked") return "NemoClaw blocks this action.";
  if (permission === "approval_required") return "NemoClaw pauses for approval.";
  if (permission === "read_only") return "NemoClaw keeps this read-only.";
  return "NemoClaw allows this inside policy.";
}

function permissionToPolicyLabel(permission: EditablePolicyEffect) {
  if (permission === "blocked") return "deny";
  if (permission === "approval_required") return "pause";
  return "allow";
}

function escapeYaml(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function downloadText(filename: string, text: string, contentType: string) {
  const blob = new Blob([text], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createInitialPolicies(blueprint: BlueprintResponse): Record<string, EditablePolicyEffect> {
  return Object.fromEntries(
    blueprint.tools.map((tool) => [
      tool.id,
      tool.permission === "blocked" || tool.permission === "approval_required"
        ? tool.permission
        : "allowed",
    ]),
  );
}

export function BlueprintReview({
  blueprint,
  onDeployed,
}: {
  blueprint: BlueprintResponse;
  onDeployed?: (agentId: string) => void;
}) {
  const [deploying, setDeploying] = useState(false);
  const [showPolicyEditor, setShowPolicyEditor] = useState(true);
  const [toolPolicies, setToolPolicies] = useState<Record<string, EditablePolicyEffect>>(() =>
    createInitialPolicies(blueprint),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToolPolicies(createInitialPolicies(blueprint));
  }, [blueprint]);

  const editedPolicyPreview = blueprint.tools
    .map(
      (tool) =>
        `  - ${tool.action}: ${permissionToPolicyLabel(toolPolicies[tool.id] ?? "allowed")}`,
    )
    .join("\n");
  const exportedPolicies = blueprint.tools.map((tool) => ({
    tool: tool.name,
    action: tool.action,
    effect: permissionToPolicyLabel(toolPolicies[tool.id] ?? "allowed"),
    reason:
      blueprint.policies.find((policy) => policy.action === tool.action)?.reason ||
      "Policy edited before NemoClaw deployment.",
  }));
  const exportBaseName = `${blueprint.agent_name.toLowerCase()}-nemoclaw`;
  const summaryFields = [
    ["Agent Name", blueprint.agent_name],
    ["Workflow Type", "Incident Response"],
    ["Runtime", "NemoClaw"],
    ["Reasoning Model", "NVIDIA Nemotron"],
    ["Sandbox Status", "Configured"],
    ["Policy Mode", "Enforced"],
    ["Memory", "Enabled"],
    ["Audit Logs", "Enabled"],
  ];

  async function deploy() {
    setDeploying(true);
    setError(null);
    try {
      const response = await fetch("/api/agents/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blueprint_id: blueprint.blueprint_id,
          policy_overrides: toolPolicies,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error?.message || "Deploy failed.");
      onDeployed?.(data.agent_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed.");
    } finally {
      setDeploying(false);
    }
  }

  function exportPolicyYaml() {
    const yaml = [
      "nemoclaw_policy_pack:",
      `  blueprint_id: ${escapeYaml(blueprint.blueprint_id)}`,
      `  agent_name: ${escapeYaml(blueprint.agent_name)}`,
      "  rules:",
      ...exportedPolicies.map((policy) =>
        [
          `    - action: ${escapeYaml(policy.action)}`,
          `      effect: ${escapeYaml(policy.effect)}`,
          `      tool: ${escapeYaml(policy.tool)}`,
          `      reason: ${escapeYaml(policy.reason)}`,
        ].join("\n"),
      ),
    ].join("\n");
    downloadText(`${exportBaseName}-policy.yaml`, yaml, "application/x-yaml;charset=utf-8");
  }

  function exportToolMap() {
    const toolMap = blueprint.tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      action: tool.action,
      permission: permissionToPolicyLabel(toolPolicies[tool.id] ?? "allowed"),
      risk_level: tool.risk_level,
      enabled: tool.enabled,
      nemoclaw_behavior: toolBehavior(toolPolicies[tool.id] ?? "allowed"),
    }));
    downloadText(
      `${exportBaseName}-tool-map.json`,
      JSON.stringify({ blueprint_id: blueprint.blueprint_id, tools: toolMap }, null, 2),
      "application/json;charset=utf-8",
    );
  }

  function exportMemoryRules() {
    downloadText(
      `${exportBaseName}-memory-rules.json`,
      JSON.stringify(
        { blueprint_id: blueprint.blueprint_id, memory_rules: blueprint.memory_schema },
        null,
        2,
      ),
      "application/json;charset=utf-8",
    );
  }

  function exportBlueprint() {
    downloadText(
      `${exportBaseName}-blueprint.json`,
      JSON.stringify(
        {
          ...blueprint,
          policy_pack: exportedPolicies,
          config_preview: undefined,
        },
        null,
        2,
      ),
      "application/json;charset=utf-8",
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
          <div className="mb-4 text-[11px] uppercase tracking-[0.28em] text-white/40">
            review before deploy
          </div>
          <h3 className="text-3xl font-semibold tracking-tight">
            Your NemoClaw blueprint is ready.
          </h3>
          <p className="mt-4 text-sm leading-relaxed text-white/65">
            {blueprint.description}. {blueprint.goal}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
            {summaryFields.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
                <div className="mt-1 text-white/80">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={deploy}
              disabled={deploying}
              className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {deploying ? "Deploying in NemoClaw..." : "Deploy in NemoClaw"}
            </button>
            <button
              type="button"
              onClick={() => setShowPolicyEditor((current) => !current)}
              className="rounded-xl border border-white/20 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/[0.05]"
            >
              Edit Policies
            </button>
          </div>
          {error && <div className="mt-3 text-sm text-rose-200">{error}</div>}
          {deploying && (
            <div className="mt-5 grid gap-2">
              {deploymentSteps.map((step) => (
                <div
                  key={step}
                  className="flex items-center gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2 text-xs text-emerald-100/80"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/15 text-[10px]">
                    ✓
                  </span>
                  {step}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">workflow</div>
          <div className="mt-5 grid gap-3">
            {blueprint.workflow_steps.map((step, index) => (
              <div key={step.id} className="grid grid-cols-[32px_1fr] gap-3">
                <div className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-[10px] text-white/45">
                  {index + 1}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white/85">{step.title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-white/50">
                    {step.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
            tool permission map
          </div>
          <button
            type="button"
            onClick={() => setToolPolicies(createInitialPolicies(blueprint))}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 transition hover:bg-white/[0.05]"
          >
            Reset Policies
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <div className="grid grid-cols-[1fr_0.7fr_0.7fr_1fr] border-b border-white/10 bg-white/[0.04] px-4 py-3 text-[10px] uppercase tracking-[0.16em] text-white/35">
            <div>Tool</div>
            <div>Policy</div>
            <div>Risk</div>
            <div>NemoClaw Behavior</div>
          </div>
          {showPolicyEditor ? (
            blueprint.tools.map((tool) => (
              <div
                key={tool.id}
                className="grid gap-3 border-b border-white/[0.06] px-4 py-4 text-sm last:border-0 md:grid-cols-[1fr_0.7fr_0.7fr_1fr]"
              >
                <div>
                  <div className="font-semibold text-white/90">{tool.name}</div>
                  <div className="mt-1 text-xs leading-relaxed text-white/50">{tool.purpose}</div>
                </div>
                <div>
                  <select
                    value={toolPolicies[tool.id] ?? "allowed"}
                    onChange={(event) =>
                      setToolPolicies((current) => ({
                        ...current,
                        [tool.id]: event.target.value as EditablePolicyEffect,
                      }))
                    }
                    className="h-9 w-full rounded-lg border border-white/10 bg-black px-2 text-xs text-white/75 outline-none focus:border-white/30"
                  >
                    {policyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-white/65">{tool.risk_level}</div>
                <div className="text-white/65">
                  {toolBehavior(toolPolicies[tool.id] ?? "allowed")}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-4 text-sm text-white/55">
              Policy editor hidden. Use Edit Policies to review or change allow, pause, and deny
              rules before deployment.
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
            NemoClaw policy pack
          </div>
          <div className="mt-4 grid gap-3">
            {blueprint.policies.map((policy) => (
              <div key={policy.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white/85">{policy.name}</div>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/55">
                    {policyLabel(policy.effect)}
                  </span>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
                  {policy.action}
                </div>
                <div className="mt-2 text-xs leading-relaxed text-white/50">{policy.reason}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">memory rules</div>
          <div className="mt-4 grid gap-3">
            {blueprint.memory_schema.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="text-sm font-semibold text-white/85">{item.name}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
                  {item.type}
                </div>
                <div className="mt-2 text-xs leading-relaxed text-white/50">{item.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
          deploy checklist
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {deploymentSteps.map((step) => (
            <div
              key={step}
              className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2 text-xs text-emerald-100/80"
            >
              {step}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
          export NemoClaw config
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <button
            type="button"
            onClick={exportPolicyYaml}
            className="rounded-xl border border-white/10 px-3 py-3 text-left text-xs font-semibold text-white/75 transition hover:bg-white/[0.05]"
          >
            Policy YAML
          </button>
          <button
            type="button"
            onClick={exportToolMap}
            className="rounded-xl border border-white/10 px-3 py-3 text-left text-xs font-semibold text-white/75 transition hover:bg-white/[0.05]"
          >
            Tool map JSON
          </button>
          <button
            type="button"
            onClick={exportMemoryRules}
            className="rounded-xl border border-white/10 px-3 py-3 text-left text-xs font-semibold text-white/75 transition hover:bg-white/[0.05]"
          >
            Memory rules JSON
          </button>
          <button
            type="button"
            onClick={exportBlueprint}
            className="rounded-xl border border-white/10 px-3 py-3 text-left text-xs font-semibold text-white/75 transition hover:bg-white/[0.05]"
          >
            Agent blueprint JSON
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#06070a]">
        <div className="border-b border-white/[0.07] px-5 py-3 text-[11px] uppercase tracking-[0.24em] text-white/45">
          generated config preview
        </div>
        <pre className="overflow-x-auto p-5 text-xs leading-relaxed text-white/65">
          {`${blueprint.config_preview}\nedited_policy_pack:\n${editedPolicyPreview}`}
        </pre>
      </div>
    </div>
  );
}
