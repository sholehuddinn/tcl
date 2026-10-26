"use client";

import { createContext, useContext } from "react";
import type { User } from "./types";

export const SessionContext = createContext<{ user: User; logout: () => void } | null>(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession harus dipakai di dalam AppShell");
  return value;
}
