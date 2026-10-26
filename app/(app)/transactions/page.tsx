"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/src/client/api";
import type { InventoryTransaction, Paged, Product } from "@/src/client/types";
import { Alert, formatDateTime, formatNumber, PageHeader, Pager, Table } from "@/src/client/ui";

export default function TransactionsPage() {
  const [productId, setProductId] = useState("");
  const [page, setPage] = useState(1);
  const { data: products } = useApi<Paged<Product>>("/products?pageSize=100");
  const { data, error, loading } = useApi<Paged<InventoryTransaction>>(
    `/inventory/transactions?page=${page}&pageSize=20${productId ? `&productId=${productId}` : ""}`,
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Riwayat Transaksi Stok" />
      <select
        value={productId}
        onChange={(e) => {
          setProductId(e.target.value);
          setPage(1);
        }}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        aria-label="Filter produk"
      >
        <option value="">Semua produk</option>
        {products?.data.map((p) => (
          <option key={p.id} value={p.id}>
            {p.sku} — {p.name}
          </option>
        ))}
      </select>

      {error && <Alert>{error}</Alert>}
      <Table
        head={["Waktu", "Jenis", "SKU", "Produk", "Perubahan", "Saldo setelah", "Dokumen", "Oleh"]}
        empty={!loading && data?.data.length === 0 ? "Belum ada transaksi." : undefined}
      >
        {data?.data.map((t) => (
          <tr key={t.id}>
            <td className="px-3 py-2">{formatDateTime(t.createdAt)}</td>
            <td className="px-3 py-2">Penerimaan</td>
            <td className="px-3 py-2 font-mono">{t.sku}</td>
            <td className="px-3 py-2">{t.productName}</td>
            <td className="px-3 py-2 tabular-nums text-green-700 dark:text-green-400">
              {t.quantityDelta > 0 ? "+" : ""}
              {formatNumber(t.quantityDelta)}
            </td>
            <td className="px-3 py-2 tabular-nums">{formatNumber(t.balanceAfter)}</td>
            <td className="px-3 py-2 font-mono">
              <Link href={`/receiving/${t.documentId}`} className="text-blue-600 hover:underline dark:text-blue-400">
                {t.documentNumber}
              </Link>
            </td>
            <td className="px-3 py-2">{t.createdBy}</td>
          </tr>
        ))}
      </Table>
      {data && <Pager meta={data.meta} onPage={setPage} />}
    </div>
  );
}
