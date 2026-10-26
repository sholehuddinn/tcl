"use client";

import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { field?: string; message: string }[] = [],
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; headers?: Record<string, string> };

/** Pembungkus fetch ke /api/v1. 401 (selain saat login) mengarahkan ke halaman login. */
export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body, headers = {} } = options;
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login" && typeof window !== "undefined") {
      // Muat ulang penuh agar seluruh state klien dari sesi lama terbuang.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
    throw new ApiError(
      response.status,
      payload?.error ?? "UNKNOWN",
      payload?.message ?? "Terjadi kesalahan.",
      payload?.details,
    );
  }
  return payload as T;
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message));
    return details.length ? `${error.message} (${details.join("; ")})` : error.message;
  }
  return error instanceof Error ? error.message : "Terjadi kesalahan.";
}

/** UUID untuk Idempotency-Key; fallback bila crypto.randomUUID tidak tersedia (konteks non-HTTPS). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useApi<T>(path: string | null) {
  const [version, setVersion] = useState(0);
  const key = path === null ? null : `${path}#${version}`;
  // Data lama dipertahankan selama permintaan baru berjalan agar tabel tidak berkedip.
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({
    key: null,
    data: null,
    error: null,
  });

  useEffect(() => {
    if (path === null || key === null) return;
    let cancelled = false;
    api<T>(path)
      .then((result) => !cancelled && setState({ key, data: result, error: null }))
      .catch((e) => !cancelled && setState((prev) => ({ key, data: prev.data, error: errorText(e) })));
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data: state.data, error: state.error, loading: key !== null && state.key !== key, reload };
}
