"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface HeaderAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
}

type RegisterFn = (id: string, action: HeaderAction | null) => void;

const HeaderActionContext = createContext<RegisterFn | null>(null);

export function HeaderActionProvider({ register, children }: { register: RegisterFn; children: ReactNode }) {
  return <HeaderActionContext.Provider value={register}>{children}</HeaderActionContext.Provider>;
}

/**
 * Näkymä julkaisee yläpalkin ensisijaisen toiminnon (esim. "+ Mittaus") ilman
 * prop-plumbausta. `id` erottaa rekisteröijät (vain aktiivisen näkymän action
 * on kerrallaan ei-null). `onClick` saa aina tuoreen sulkeuman ref:in kautta.
 */
export function useHeaderAction(id: string, action: HeaderAction | null) {
  const register = useContext(HeaderActionContext);
  const handlerRef = useRef(action?.onClick);
  handlerRef.current = action?.onClick;

  const label = action?.label;
  const Icon = action?.icon;

  useEffect(() => {
    if (!register) {
      return;
    }
    if (!label) {
      register(id, null);
      return;
    }
    register(id, { label, icon: Icon, onClick: () => handlerRef.current?.() });
    return () => register(id, null);
  }, [register, id, label, Icon]);
}
