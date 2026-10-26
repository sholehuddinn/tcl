"use client";

import { useState, type FormEvent } from "react";
import { api, errorText, useApi } from "@/src/client/api";
import { useSession } from "@/src/client/session";
import type { Paged, Product } from "@/src/client/types";
import { Alert, Button, Card, Field, formatNumber, Input, PageHeader, Pager, Table } from "@/src/client/ui";

export default function ProductsPage() {
  const { user } = useSession();
  const isSupervisor = user.role === "SUPERVISOR";
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Product>>(
    `/products?page=${page}&pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  );

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      await api("/products", { method: "POST", body: { sku, name, unit } });
      setNotice(`Produk ${sku.toUpperCase()} dibuat.`);
      setSku("");
      setName("");
      setUnit("pcs");
      reload();
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(product: Product) {
    try {
      await api(`/products/${product.id}`, { method: "PATCH", body: { isActive: !product.isActive } });
      reload();
    } catch (e) {
      setFormError(errorText(e));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Produk" />

      {isSupervisor && (
        <Card>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr_auto] sm:items-end">
            <Field label="SKU" hint="Huruf besar/angka, mis. BRG-001">
              <Input value={sku} onChange={(e) => setSku(e.target.value)} required maxLength={32} />
            </Field>
            <Field label="Nama produk">
              <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} />
            </Field>
            <Field label="Satuan">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} required maxLength={20} />
            </Field>
            <Button type="submit" disabled={busy}>
              Tambah produk
            </Button>
          </form>
          <div className="mt-3 space-y-2 empty:hidden">
            {formError && <Alert>{formError}</Alert>}
            {notice && <Alert kind="success">{notice}</Alert>}
          </div>
        </Card>
      )}

      <Input
        placeholder="Cari SKU atau nama..."
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        className="max-w-sm"
      />

      {error && <Alert>{error}</Alert>}
      <Table
        head={["SKU", "Nama", "Satuan", "Stok", "Status", ...(isSupervisor ? ["Aksi"] : [])]}
        empty={!loading && data?.data.length === 0 ? "Belum ada produk." : undefined}
      >
        {data?.data.map((p) => (
          <tr key={p.id}>
            <td className="px-3 py-2 font-mono">{p.sku}</td>
            <td className="px-3 py-2">{p.name}</td>
            <td className="px-3 py-2">{p.unit}</td>
            <td className="px-3 py-2 tabular-nums">{formatNumber(p.quantity)}</td>
            <td className="px-3 py-2">{p.isActive ? "Aktif" : "Nonaktif"}</td>
            {isSupervisor && (
              <td className="px-3 py-2">
                <Button variant="secondary" onClick={() => toggle(p)}>
                  {p.isActive ? "Nonaktifkan" : "Aktifkan"}
                </Button>
              </td>
            )}
          </tr>
        ))}
      </Table>
      {data && <Pager meta={data.meta} onPage={setPage} />}
    </div>
  );
}
