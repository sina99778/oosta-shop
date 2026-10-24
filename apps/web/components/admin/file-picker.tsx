"use client";

// Localized file input: the native control's "Choose File / No file chosen"
// can't be translated, so it is hidden behind a dashed drop zone. Click or drop.

import { useId, useState } from "react";
import type { DragEvent } from "react";
import { cn } from "@/lib/cn";

export type FilePickerLabels = {
  choose: string;
  none: string;
  selected: string; // "{n} files selected"
  drop: string;
};

export function FilePicker({
  labels,
  onFiles,
  accept = "image/*",
  multiple = false,
  disabled = false,
  label,
  className,
}: {
  labels: FilePickerLabels;
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const [names, setNames] = useState<string[]>([]);
  const [over, setOver] = useState(false);

  function take(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, multiple ? undefined : 1);
    if (files.length === 0) return;
    setNames(files.map((f) => f.name));
    onFiles(files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files);
  }

  const summary =
    names.length === 0
      ? labels.none
      : names.length === 1
        ? names[0]
        : labels.selected.replace("{n}", String(names.length));

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm text-muted">
          {label}
        </label>
      )}
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-[12px] border-2 border-dashed px-3 py-3 transition-colors",
          over ? "border-primary bg-primary/5" : "border-border hover:border-primary/60",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <span className="inline-flex h-9 shrink-0 items-center rounded-[8px] bg-ink px-3 text-xs font-bold text-[#f3eee4]">
          {labels.choose}
        </span>
        <span className="min-w-0 flex-1">
          <bdi className={cn("block truncate text-sm", names.length ? "font-bold" : "text-muted")}>
            {summary}
          </bdi>
          <span className="block text-[11px] text-muted">{labels.drop}</span>
        </span>
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
