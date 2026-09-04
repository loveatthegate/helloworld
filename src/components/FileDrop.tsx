import type { ChangeEvent, DragEvent } from "react";
import { useState } from "react";
import { Upload } from "lucide-react";

export function FileDrop({
  accept,
  label,
  hint,
  file,
  files,
  multiple,
  onFile,
  onFiles,
}: {
  accept: string;
  label: string;
  hint: string;
  file?: File | null;
  files?: File[];
  multiple?: boolean;
  onFile?: (file: File) => void;
  onFiles?: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);

  const apply = (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    const next = Array.from(list);
    if (multiple) onFiles?.(next);
    else onFile?.(next[0]!);
  };

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    apply(event.target.files);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    apply(event.dataTransfer.files);
  };

  const summary = multiple
    ? files?.length
      ? `${files.length} 个文件，共 ${(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(2)} MB`
      : hint
    : file
      ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
      : hint;
  const title = multiple
    ? files?.length
      ? files.map((f) => f.name).join("、")
      : label
    : file
      ? file.name
      : label;

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
        over ? "border-teal-2 bg-teal-50" : "border-slate-300 bg-white hover:border-teal-2"
      }`}
    >
      <Upload className="mb-3 text-teal" />
      <div className="font-medium text-slate-800">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{summary}</div>
      <input type="file" accept={accept} className="hidden" multiple={multiple} onChange={pick} />
    </label>
  );
}
