import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

const BrandingContext = createContext<{ branding: Branding; refresh: () => Promise<void> }>({
  branding: fallback,
  refresh: async () => undefined,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(fallback);

  const refresh = async () => {
    try {
      const next = await getBranding();
      setBranding(next);
      applyTheme(next.themeColor || fallback.themeColor);
      document.title = next.systemName || fallback.systemName;
    } catch {
      applyTheme(fallback.themeColor);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return <BrandingContext.Provider value={{ branding, refresh }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
