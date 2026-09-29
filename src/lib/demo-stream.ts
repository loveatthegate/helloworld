import { useEffect } from "react";
import { touchDemoStream } from "./api";

export function useDemoStream(on: boolean) {
  useEffect(() => {
    if (!on) return;
    void touchDemoStream().catch(() => undefined);
    const timer = setInterval(() => void touchDemoStream().catch(() => undefined), 8000);
    return () => clearInterval(timer);
  }, [on]);
}
