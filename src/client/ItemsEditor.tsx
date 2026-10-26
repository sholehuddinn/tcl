"use client";

import type { Product } from "./types";
import { Button, Input } from "./ui";

export type ItemRow = { key: number; productId: string; expectedQty: string };

let counter = 0;
export const emptyRow = (): ItemRow => ({ key: ++counter, productId: "", expectedQty: "" });

/** Konversi baris form ke payload API; mengembalikan teks error bila baris belum lengkap. */
export function toPayload(rows: ItemRow[]): { items: { productId: string; expectedQty: number }[] } | string {
  const items: { productId: string; expectedQty: number }[] = [];
  for (const [index, row] of rows.entries()) {
    const qty = Number(row.expectedQty);
    if (!row.productId) return `Baris ${index + 1}: pilih produk.`;
    if (!Number.isInteger(qty) || qty < 1) return `Baris ${index + 1}: jumlah harus bilangan bulat minimal 1.`;
    items.push({ productId: row.productId, expectedQty: qty });
  }
  if (items.length === 0) return "Tambahkan minimal satu item.";
  if (new Set(items.map((i) => i.productId)).size !== items.length) return "Produk tidak boleh duplikat.";
  return { items };
}

export function ItemsEditor({
  rows,
  products,
  onChange,
}: {
  rows: ItemRow[];
  products: Product[];
  onChange: (rows: ItemRow[]) => void;
}) {
  const update = (key: number, patch: Partial<ItemRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[1fr_8rem_auto] gap-2">
          <select
            value={row.productId}
            onChange={(e) => update(row.key, { productId: e.target.value })}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            aria-label="Produk"
          >
            <option value="">Pilih produk...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name} ({p.unit})
              </option>
            ))}
          </select>
          <Input
            type="number"
            min={1}
            step={1}
            placeholder="Jumlah"
            value={row.expectedQty}
            onChange={(e) => update(row.key, { expectedQty: e.target.value })}
            aria-label="Jumlah diharapkan"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={rows.length === 1}
            onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
          >
            Hapus
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => onChange([...rows, emptyRow()])}>
        + Tambah item
      </Button>
    </div>
  );
}
