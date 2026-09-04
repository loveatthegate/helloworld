import type { VlmModel } from "../lib/api";

export function ModelSelect({
  models,
  value,
  onChange,
}: {
  models: VlmModel[];
  value: string;
  onChange: (id: string) => void;
}) {
  const options = models.length ? models : [{ id: value, label: value, hint: "" }];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-2"
    >
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.hint ? `${m.label} · ${m.hint}` : m.label}
        </option>
      ))}
    </select>
  );
}
