"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/src/client/api";
import { STATUS_LABEL, type DocumentStatus, type DocumentSummary, type Paged } from "@/src/client/types";
import { Alert, formatDateTime, formatNumber, Input, PageHeader, Pager, StatusBadge, Table } from "@/src/client/ui";

const STATUSES = Object.keys(STATUS_LABEL) as DocumentStatus[];

export default function ReceivingListPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  const { data, error, loading } = useApi<Paged<DocumentSummary>>(`/receiving-documents?${params}`);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dokumen Penerimaan"
        actions={
          <Link href="/receiving/new" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Buat dokumen
          </Link>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Cari nomor, pemasok, atau referensi..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          aria-label="Filter status"
        >
          <option value="">Semua status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {error && <Alert>{error}</Alert>}
      <Table
        head={["Nomor", "Pemasok", "Referensi", "Item", "Diterima / Diharapkan", "Status", "Dibuat"]}
        empty={!loading && data?.data.length === 0 ? "Belum ada dokumen." : undefined}
      >
        {data?.data.map((d) => (
          <tr key={d.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <td className="px-3 py-2 font-mono">
              <Link href={`/receiving/${d.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                {d.number}
              </Link>
            </td>
            <td className="px-3 py-2">{d.supplierName}</td>
            <td className="px-3 py-2">{d.referenceNo ?? "-"}</td>
            <td className="px-3 py-2">{d.itemCount}</td>
            <td className="px-3 py-2 tabular-nums">
              {formatNumber(d.receivedTotal)} / {formatNumber(d.expectedTotal)}
            </td>
            <td className="px-3 py-2">
              <StatusBadge status={d.status} />
            </td>
            <td className="px-3 py-2">{formatDateTime(d.createdAt)}</td>
          </tr>
        ))}
      </Table>
      {data && <Pager meta={data.meta} onPage={setPage} />}
    </div>
  );
}
