"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorText, useApi } from "@/src/client/api";
import { emptyRow, ItemsEditor, toPayload, type ItemRow } from "@/src/client/ItemsEditor";
import type { Paged, Product, ReceivingDocument } from "@/src/client/types";
import { Alert, Button, Card, Field, Input, PageHeader } from "@/src/client/ui";

export default function NewDocumentPage() {
  const router = useRouter();
  const { data: products } = useApi<Paged<Product>>("/products?isActive=true&pageSize=100");

  const [supplierName, setSupplierName] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ItemRow[]>(() => [emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = toPayload(rows);
    if (typeof payload === "string") return setError(payload);

    setBusy(true);
    setError(null);
    try {
      const res = await api<{ data: ReceivingDocument }>("/receiving-documents", {
        method: "POST",
        body: {
          supplierName,
          ...(referenceNo ? { referenceNo } : {}),
          ...(expectedDate ? { expectedDate } : {}),
          ...(notes ? { notes } : {}),
          items: payload.items,
        },
      });
      router.push(`/receiving/${res.data.id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Buat Dokumen Penerimaan" />
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Card className="grid gap-3 sm:grid-cols-2">
          <Field label="Pemasok">
            <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} required maxLength={150} />
          </Field>
          <Field label="No. referensi (surat jalan / PO)">
            <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Tanggal diharapkan">
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
          <Field label="Catatan">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </Field>
        </Card>
        <Card>
          <h2 className="mb-2 font-medium">Item</h2>
          <ItemsEditor rows={rows} products={products?.data ?? []} onChange={setRows} />
        </Card>
        <Button type="submit" disabled={busy}>
          {busy ? "Menyimpan..." : "Simpan sebagai draft"}
        </Button>
      </form>
    </div>
  );
}
