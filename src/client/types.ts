export type Role = "OPERATOR" | "SUPERVISOR";
export type DocumentStatus = "DRAFT" | "OPEN" | "PARTIALLY_RECEIVED" | "COMPLETED" | "CANCELLED";

export type User = { id: string; username: string; fullName: string; role: Role };

export type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  isActive: boolean;
  quantity: number;
  createdAt: string;
};

export type PageMeta = { page: number; pageSize: number; total: number };
export type Paged<T> = { data: T[]; meta: PageMeta };

export type DocumentSummary = {
  id: string;
  number: string;
  supplierName: string;
  referenceNo: string | null;
  status: DocumentStatus;
  itemCount: number;
  expectedTotal: number;
  receivedTotal: number;
  createdAt: string;
};

export type DocumentItem = {
  id: string;
  product: Product;
  expectedQty: number;
  receivedQty: number;
  remainingQty: number;
};

export type Receipt = {
  id: string;
  itemId: string;
  quantity: number;
  notes: string | null;
  receivedBy: User;
  receivedAt: string;
};

export type ReceivingDocument = DocumentSummary & {
  expectedDate: string | null;
  notes: string | null;
  isFullyReceived: boolean;
  cancelReason: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdBy: User;
  items: DocumentItem[];
  receipts: Receipt[];
};

export type InventoryRow = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  updatedAt: string;
};

export type InventoryTransaction = {
  id: string;
  type: "RECEIPT";
  productId: string;
  sku: string;
  productName: string;
  quantityDelta: number;
  balanceAfter: number;
  documentId: string;
  documentNumber: string;
  createdBy: string;
  createdAt: string;
};

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Terbuka",
  PARTIALLY_RECEIVED: "Diterima Sebagian",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

export const ROLE_LABEL: Record<Role, string> = {
  OPERATOR: "Operator",
  SUPERVISOR: "Supervisor",
};
