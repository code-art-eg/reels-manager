"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slug";
import type { TagKind } from "@/lib/types";

const KIND_CHIP: Record<TagKind, string> = {
  style: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  client:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
};

/**
 * Free-form tag entry. Existing tags are offered as suggestions, but anything
 * can be typed — the vocabulary is meant to grow as the team uses it. The value
 * is mirrored into a hidden input as JSON for the server action.
 */
export function TagInput({
  name,
  kind,
  label,
  suggestions,
  defaultValue = [],
  placeholder,
}: {
  name: string;
  kind: TagKind;
  label: string;
  suggestions: string[];
  defaultValue?: string[];
  placeholder?: string;
}) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSlugs = useMemo(
    () => new Set(tags.map((t) => slugify(t))),
    [tags],
  );

  const matches = useMemo(() => {
    const term = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => !selectedSlugs.has(slugify(s)))
      .filter((s) => (term ? s.toLowerCase().includes(term) : true))
      .slice(0, 8);
  }, [draft, suggestions, selectedSlugs]);

  function add(value: string) {
    const name = value.trim().replace(/\s+/g, " ");
    if (!name || !slugify(name)) return;
    if (selectedSlugs.has(slugify(name))) {
      setDraft("");
      return;
    }
    setTags((prev) => [...prev, name]);
    setDraft("");
  }

  function remove(index: number) {
    setTags((prev) => prev.filter((_, i) => i !== index));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter must not submit the form while composing a tag.
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && !draft && tags.length) {
      remove(tags.length - 1);
    }
  }

  const showSuggestions = focused && matches.length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-sm font-medium"
        onClick={() => inputRef.current?.focus()}
      >
        {label}
      </label>

      <input type="hidden" name={name} value={JSON.stringify(tags)} />

      <div className="relative">
        <div
          className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 shadow-sm focus-within:ring-1 focus-within:ring-ring"
          onClick={() => inputRef.current?.focus()}
        >
          {tags.map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                KIND_CHIP[kind],
              )}
            >
              {tag}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(index);
                }}
                aria-label={`Remove ${tag}`}
                className="opacity-60 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}

          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            // Delay so a suggestion click lands before the list unmounts.
            onBlur={() => {
              setTimeout(() => setFocused(false), 120);
              if (draft.trim()) add(draft);
            }}
            placeholder={tags.length === 0 ? placeholder : ""}
            className="h-6 flex-1 border-0 p-0 shadow-none focus-visible:ring-0 min-w-[8ch]"
          />
        </div>

        {showSuggestions && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
            {matches.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  add(suggestion);
                  inputRef.current?.focus();
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Press Enter to add. New {label.toLowerCase()} are created automatically.
      </p>
    </div>
  );
}
