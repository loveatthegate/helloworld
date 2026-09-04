import { createContext, useContext, useState, type ReactNode } from "react";
import { getBranding, type Branding } from "./api";

const fallback: Branding = {
  systemName: "履职系统",
  tagline: "SOP 视觉核验",
  companyName: "",
  copyright: "© 履职系统",
  themeColor: "#0f766e",
  logoUrl: null,
  loginImageUrl: null,
};

function applyTheme(color: string) {
  const root = document.documentElement;
  root.style.setProperty("--color-teal", color);
  root.style.setProperty("--color-teal-2", color);
  root.style.setProperty("--brand", color);
}

function commitBranding(next: Branding) {
  applyTheme(next.themeColor || fallback.themeColor);
  document.title = next.systemName || fallback.systemName;
  return next;
}

const BrandingContext = createContext<{
  branding: Branding;
  apply: (next: Branding) => void;
  refresh: () => Promise<void>;
}>({
  branding: fallback,
  apply: () => undefined,
  refresh: async () => undefined,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(fallback);

  const apply = (next: Branding) => {
    setBranding(commitBranding(next));
  };

  const refresh = async () => {
    try {
      apply(await getBranding());
    } catch {
      applyTheme(fallback.themeColor);
    }
  };

  return <BrandingContext.Provider value={{ branding, apply, refresh }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
