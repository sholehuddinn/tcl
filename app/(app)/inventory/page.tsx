"use client";

import { useState } from "react";
import { useApi } from "@/src/client/api";
import type { InventoryRow, Paged } from "@/src/client/types";
import { Alert, formatDateTime, formatNumber, Input, PageHeader, Pager, Table } from "@/src/client/ui";

export default function InventoryPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<Paged<InventoryRow>>(
    `/inventory?page=${page}&pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Stok Tersedia" />
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
        head={["SKU", "Produk", "Satuan", "Stok", "Diperbarui"]}
        empty={!loading && data?.data.length === 0 ? "Belum ada data stok." : undefined}
      >
        {data?.data.map((row) => (
          <tr key={row.productId}>
            <td className="px-3 py-2 font-mono">{row.sku}</td>
            <td className="px-3 py-2">{row.name}</td>
            <td className="px-3 py-2">{row.unit}</td>
            <td className="px-3 py-2 font-medium tabular-nums">{formatNumber(row.quantity)}</td>
            <td className="px-3 py-2">{formatDateTime(row.updatedAt)}</td>
          </tr>
        ))}
      </Table>
      {data && <Pager meta={data.meta} onPage={setPage} />}
    </div>
  );
}
