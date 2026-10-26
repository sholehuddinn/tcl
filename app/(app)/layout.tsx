import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/src/client/AppShell";

// Hook runtime (usePathname/useParams) di dalam AppShell dan halaman anak harus berada di bawah
// Suspense agar kompatibel dengan prerendering `cacheComponents`.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-500">Memuat...</p>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
