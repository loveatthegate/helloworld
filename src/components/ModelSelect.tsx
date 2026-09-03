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
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-2"
    >
      {["gemini", "openai", "anthropic"].map((provider) => {
        const group = models.filter((m) => m.provider === provider);
        if (!group.length) return null;
        const label = provider === "gemini" ? "Google Gemini" : provider === "openai" ? "OpenAI" : "Anthropic";
        return (
          <optgroup key={provider} label={label}>
            {group.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.hint}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
