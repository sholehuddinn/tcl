"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorText } from "@/src/client/api";
import { Alert, Button, Card, Field, Input } from "@/src/client/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: { username, password } });
      router.replace("/receiving");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Penerimaan Barang Gudang</h1>
        <p className="mb-4 text-sm text-zinc-500">Masuk dengan akun operator atau supervisor.</p>
        <form onSubmit={onSubmit} className="space-y-3">
          {error && <Alert>{error}</Alert>}
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Memproses..." : "Masuk"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
