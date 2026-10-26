export function formatDocumentNumber(n: number): string {
  return `RCV-${String(n).padStart(6, "0")}`;
}

/** Terima "RCV-000012" atau "12"; null bila bukan nomor dokumen. */
export function parseDocumentNumber(input: string): number | null {
  const match = /^(?:RCV-)?0*(\d{1,9})$/i.exec(input.trim());
  return match ? Number(match[1]) : null;
}

export type Page = { page: number; pageSize: number };

export function pageArgs({ page, pageSize }: Page) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageMeta({ page, pageSize }: Page, total: number) {
  return { page, pageSize, total };
}
