import type { ChangeEvent, DragEvent } from "react";
import { useState } from "react";
import { Upload } from "lucide-react";

export function FileDrop({
  accept,
  label,
  hint,
  file,
  onFile,
}: {
  accept: string;
  label: string;
  hint: string;
  file: File | null;
  onFile: (file: File) => void;
}) {
  const [over, setOver] = useState(false);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0];
    if (next) onFile(next);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const next = event.dataTransfer.files?.[0];
    if (next) onFile(next);
  };

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
      <div className="font-medium text-slate-800">{file ? file.name : label}</div>
      <div className="mt-1 text-sm text-slate-500">
        {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : hint}
      </div>
      <input type="file" accept={accept} className="hidden" onChange={pick} />
    </label>
  );
}
