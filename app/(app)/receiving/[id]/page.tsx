"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { api, errorText, newIdempotencyKey, useApi } from "@/src/client/api";
import { emptyRow, ItemsEditor, toPayload, type ItemRow } from "@/src/client/ItemsEditor";
import { useSession } from "@/src/client/session";
import type { DocumentItem, Paged, Product, ReceivingDocument } from "@/src/client/types";
import {
  Alert,
  Button,
  Card,
  Field,
  formatDateTime,
  formatNumber,
  Input,
  PageHeader,
  StatusBadge,
  Table,
} from "@/src/client/ui";

type DocResponse = { data: ReceivingDocument };

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const isSupervisor = user.role === "SUPERVISOR";
  const { data, error, loading, reload } = useApi<DocResponse>(`/receiving-documents/${id}`);
  const doc = data?.data;

  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      reload();
      return true;
    } catch (e) {
      setActionError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const post = (path: string, body?: unknown) =>
    api(`/receiving-documents/${id}/${path}`, { method: "POST", body });

  if (error) return <Alert>{error}</Alert>;
  if (!doc) return <p className="text-sm text-zinc-500">{loading ? "Memuat..." : "Dokumen tidak ditemukan."}</p>;

  const receivable = doc.status === "OPEN" || doc.status === "PARTIALLY_RECEIVED";
  const skuOf = (itemId: string) => doc.items.find((i) => i.id === itemId)?.product.sku ?? "-";

  return (
    <div className="space-y-4">
      <PageHeader
        title={doc.number}
        actions={
          <Link href="/receiving" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Kembali
          </Link>
        }
      />

      {actionError && <Alert>{actionError}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <Card className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-zinc-500">Status</div>
          <StatusBadge status={doc.status} />
        </div>
        <div>
          <div className="text-zinc-500">Pemasok</div>
          {doc.supplierName}
        </div>
        <div>
          <div className="text-zinc-500">No. referensi</div>
          {doc.referenceNo ?? "-"}
        </div>
        <div>
          <div className="text-zinc-500">Tanggal diharapkan</div>
          {doc.expectedDate ?? "-"}
        </div>
        <div>
          <div className="text-zinc-500">Dibuat oleh</div>
          {doc.createdBy.fullName} · {formatDateTime(doc.createdAt)}
        </div>
        <div>
          <div className="text-zinc-500">Total diterima / diharapkan</div>
          <span className="tabular-nums">
            {formatNumber(doc.receivedTotal)} / {formatNumber(doc.expectedTotal)}
          </span>
        </div>
        {doc.notes && (
          <div className="sm:col-span-3">
            <div className="text-zinc-500">Catatan</div>
            {doc.notes}
          </div>
        )}
        {doc.cancelReason && (
          <div className="sm:col-span-3">
            <div className="text-zinc-500">Alasan pembatalan</div>
            {doc.cancelReason}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {doc.status === "DRAFT" && (
          <>
            <Button disabled={busy} onClick={() => run(() => post("submit"), "Dokumen diajukan dan siap menerima barang.")}>
              Ajukan dokumen
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setEditing((v) => !v)}>
              {editing ? "Tutup editor item" : "Ubah item"}
            </Button>
          </>
        )}
        {isSupervisor && doc.status === "PARTIALLY_RECEIVED" && (
          <Button
            disabled={busy || !doc.isFullyReceived}
            title={doc.isFullyReceived ? undefined : "Semua item harus diterima penuh"}
            onClick={() => run(() => post("complete"), "Dokumen diselesaikan.")}
          >
            Selesaikan dokumen
          </Button>
        )}
        {isSupervisor && (doc.status === "DRAFT" || doc.status === "OPEN") && (
          <Button variant="danger" disabled={busy} onClick={() => setCancelling((v) => !v)}>
            Batalkan dokumen
          </Button>
        )}
      </div>
      {doc.status === "PARTIALLY_RECEIVED" && !doc.isFullyReceived && isSupervisor && (
        <p className="text-xs text-zinc-500">Dokumen baru dapat diselesaikan setelah semua item diterima penuh.</p>
      )}

      {cancelling && (
        <Card>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              const ok = await run(() => post("cancel", { reason }), "Dokumen dibatalkan.");
              if (ok) {
                setCancelling(false);
                setReason("");
              }
            }}
          >
            <div className="min-w-64 flex-1">
              <Field label="Alasan pembatalan">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={500} />
              </Field>
            </div>
            <Button type="submit" variant="danger" disabled={busy}>
              Konfirmasi batalkan
            </Button>
          </form>
        </Card>
      )}

      {editing && doc.status === "DRAFT" && (
        <EditItems
          doc={doc}
          onSaved={() => {
            setEditing(false);
            setNotice("Item diperbarui.");
            reload();
          }}
        />
      )}

      <h2 className="text-lg font-semibold">Item</h2>
      <Table head={["SKU", "Produk", "Diharapkan", "Diterima", "Sisa", ...(receivable ? ["Terima barang"] : [])]}>
        {doc.items.map((item) => (
          <tr key={item.id}>
            <td className="px-3 py-2 font-mono">{item.product.sku}</td>
            <td className="px-3 py-2">{item.product.name}</td>
            <td className="px-3 py-2 tabular-nums">{formatNumber(item.expectedQty)}</td>
            <td className="px-3 py-2 tabular-nums">{formatNumber(item.receivedQty)}</td>
            <td className="px-3 py-2 tabular-nums">{formatNumber(item.remainingQty)}</td>
            {receivable && (
              <td className="px-3 py-2">
                {item.remainingQty > 0 ? (
                  <ReceiveForm docId={doc.id} item={item} onDone={reload} onNotice={setNotice} />
                ) : (
                  <span className="text-green-700 dark:text-green-400">Lengkap</span>
                )}
              </td>
            )}
          </tr>
        ))}
      </Table>

      <h2 className="text-lg font-semibold">Riwayat penerimaan</h2>
      <Table
        head={["Waktu", "SKU", "Jumlah", "Diterima oleh", "Catatan"]}
        empty={doc.receipts.length === 0 ? "Belum ada penerimaan." : undefined}
      >
        {doc.receipts.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2">{formatDateTime(r.receivedAt)}</td>
            <td className="px-3 py-2 font-mono">{skuOf(r.itemId)}</td>
            <td className="px-3 py-2 tabular-nums">+{formatNumber(r.quantity)}</td>
            <td className="px-3 py-2">{r.receivedBy.fullName}</td>
            <td className="px-3 py-2">{r.notes ?? "-"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/**
 * Form penerimaan per item. Idempotency-Key dipertahankan selama isi form tidak berubah,
 * sehingga klik ganda atau kirim ulang setelah error jaringan tidak menambah stok dua kali.
 */
function ReceiveForm({
  docId,
  item,
  onDone,
  onNotice,
}: {
  docId: string;
  item: DocumentItem;
  onDone: () => void;
  onNotice: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState(String(item.remainingQty));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(newIdempotencyKey());

  async function submit(event: FormEvent) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) return setError("Jumlah harus bilangan bulat minimal 1.");
    if (qty > item.remainingQty) return setError(`Melebihi sisa (${item.remainingQty}).`);

    setBusy(true);
    setError(null);
    try {
      await api(`/receiving-documents/${docId}/receipts`, {
        method: "POST",
        headers: { "Idempotency-Key": keyRef.current },
        body: { itemId: item.id, quantity: qty, ...(notes ? { notes } : {}) },
      });
      keyRef.current = newIdempotencyKey();
      onNotice(`${item.product.sku}: ${qty} ${item.product.unit} diterima.`);
      setNotes("");
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          max={item.remainingQty}
          step={1}
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            keyRef.current = newIdempotencyKey();
          }}
          className="w-24"
          aria-label={`Jumlah diterima ${item.product.sku}`}
        />
        <Input
          placeholder="Catatan (opsional)"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            keyRef.current = newIdempotencyKey();
          }}
          maxLength={500}
          aria-label={`Catatan ${item.product.sku}`}
        />
        <Button type="submit" disabled={busy}>
          Terima
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

function EditItems({ doc, onSaved }: { doc: ReceivingDocument; onSaved: () => void }) {
  const { data: products } = useApi<Paged<Product>>("/products?isActive=true&pageSize=100");
  const [rows, setRows] = useState<ItemRow[]>(() =>
    doc.items.length > 0
      ? doc.items.map((i) => ({ ...emptyRow(), productId: i.product.id, expectedQty: String(i.expectedQty) }))
      : [emptyRow()],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const payload = toPayload(rows);
    if (typeof payload === "string") return setError(payload);
    setBusy(true);
    setError(null);
    try {
      await api(`/receiving-documents/${doc.id}/items`, { method: "PUT", body: payload });
      onSaved();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  // Produk yang sudah ada di dokumen tetap ditawarkan walau kemudian dinonaktifkan.
  const options = [...(products?.data ?? [])];
  for (const item of doc.items) if (!options.some((p) => p.id === item.product.id)) options.push(item.product);

  return (
    <Card className="space-y-3">
      <h2 className="font-medium">Ubah item (hanya saat Draft)</h2>
      {error && <Alert>{error}</Alert>}
      <ItemsEditor rows={rows} products={options} onChange={setRows} />
      <Button onClick={save} disabled={busy}>
        Simpan item
      </Button>
    </Card>
  );
}
