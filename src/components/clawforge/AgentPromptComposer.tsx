import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface AgentPromptComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  suggestions?: string[];
  ctaLabel?: string;
  showPlanToggle?: boolean;
  onAttach?: () => void;
  placeholder?: string;
}

const DEFAULT_SUGGESTIONS = [
  "Build a receptionist agent for a pizza shop that answers calls, checks availability, and asks before texting customers…",
  "Create a security agent that monitors logs, detects suspicious behavior, and writes an incident report…",
  "Build a GitHub triage agent that reads issues, prioritizes bugs, and drafts responses for approval…",
  "Create an inbox agent that summarizes important emails and drafts replies before sending…",
  "Build a research agent that collects sources, writes a brief, and asks before publishing…",
];

export function AgentPromptComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  suggestions = DEFAULT_SUGGESTIONS,
  ctaLabel = "Forge agent",
  showPlanToggle,
  onAttach,
  placeholder = "Describe your agent…",
}: AgentPromptComposerProps) {
  const [typingText, setTypingText] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Animated typing effect — only starts after a delay to show "Describe your project..." first
  useEffect(() => {
    if (value) {
      setIsTyping(false);
      setTypingText("");
      return;
    }

    const current = suggestions[suggestionIndex] ?? suggestions[0];
    if (typingText === current) {
      const timeout = setTimeout(() => {
        setSuggestionIndex((i) => (i + 1) % suggestions.length);
        setTypingText("");
      }, 3000);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setTypingText(current.slice(0, typingText.length + 1));
    }, 40 + Math.random() * 30);

    return () => clearTimeout(timeout);
  }, [typingText, suggestionIndex, value, suggestions]);

  // Start typing animation after initial delay
  useEffect(() => {
    if (value) return;
    const delayTimer = window.setTimeout(() => {
      setIsTyping(true);
    }, 1200);
    return () => clearTimeout(delayTimer);
  }, [suggestions, value]);

  function handleSubmit() {
    if (!value.trim() || disabled) return;
    onSubmit?.();
  }

  const showPlaceholder = !value;
  // Hide native textarea placeholder when our animated overlay is active
  const textareaPlaceholder = showPlaceholder ? "" : placeholder;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Prompt box */}
      <div
        className="relative rounded-2xl border border-white/12 bg-[#141414] overflow-hidden"
        style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
      >
        {/* Animated placeholder overlay */}
        {showPlaceholder && (
          <div
            className="pointer-events-none absolute inset-0 flex items-start px-6 pt-5 pb-16"
            aria-hidden="true"
          >
            <span className="text-base text-white/40 leading-relaxed">
              Describe your project
              {typingText ? (
                <span className="text-white/25">
                  {" — "}
                  {typingText}
                  <span className="inline-block w-0.5 h-4 bg-white/40 ml-0.5 animate-pulse" />
                </span>
              ) : isTyping ? (
                <span className="text-white/25">
                  {" — "}
                  <span className="inline-block w-0.5 h-4 bg-white/40 ml-0.5 animate-pulse" />
                </span>
              ) : null}
            </span>
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          placeholder={textareaPlaceholder}
          disabled={disabled}
          className="w-full resize-none border-0 bg-transparent px-6 pt-5 pb-16 text-base text-white leading-relaxed outline-none placeholder:text-white/25 disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />

        {/* Bottom bar */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          {/* Left: context button */}
          <div className="flex items-center gap-2">
            {onAttach && (
              <button
                type="button"
                onClick={onAttach}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/40 transition hover:border-white/40 hover:text-white/80"
                aria-label="Attach context"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 1v12M1 7h12" />
                </svg>
              </button>
            )}
            {showPlanToggle && (
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/40 transition hover:border-white/40 hover:text-white/80"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="1" width="10" height="10" rx="2" />
                  <path d="M3 6h6M3 4h6M3 8h4" />
                </svg>
                Plan
              </button>
            )}
          </div>

          {/* Right: CTA */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
            className="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-30"
          >
            {ctaLabel}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 1l5 6-5 6M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="flex items-center justify-center">
        <span className="text-xs text-white/20">
          Enter to forge &nbsp;·&nbsp; Shift+Enter for new line
        </span>
      </div>
    </div>
  );
}