"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { SessionContext } from "./session";
import { ROLE_LABEL, type User } from "./types";
import { Button } from "./ui";

const NAV = [
  { href: "/receiving", label: "Penerimaan" },
  { href: "/products", label: "Produk" },
  { href: "/inventory", label: "Stok" },
  { href: "/transactions", label: "Riwayat" },
];

/** Membungkus halaman terautentikasi: memuat sesi, menampilkan navigasi, dan tombol keluar. */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api<{ data: { user: User } }>("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  if (!user) return <p className="p-6 text-sm text-zinc-500">Memuat...</p>;

  return (
    <SessionContext.Provider value={{ user, logout }}>
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-semibold">Gudang</span>
          <nav className="flex flex-1 flex-wrap gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-blue-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {user.fullName} · {ROLE_LABEL[user.role]}
          </span>
          <Button variant="secondary" onClick={logout}>
            Keluar
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4">{children}</main>
    </SessionContext.Provider>
  );
}
