-- CreateEnum
CREATE TYPE "role" AS ENUM ('OPERATOR', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('DRAFT', 'OPEN', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "inventory_transaction_type" AS ENUM ('RECEIPT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(50) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "role" "role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sku" VARCHAR(32) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'pcs',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receiving_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "supplier_name" VARCHAR(150) NOT NULL,
    "reference_no" VARCHAR(100),
    "expected_date" DATE,
    "notes" VARCHAR(500),
    "status" "document_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "completed_by" UUID,
    "cancelled_by" UUID,
    "cancel_reason" VARCHAR(500),
    "submitted_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "receiving_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receiving_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "expected_qty" INTEGER NOT NULL,
    "received_qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receiving_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "notes" VARCHAR(500),
    "received_by" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "type" "inventory_transaction_type" NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "document_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "receiving_documents_number_key" ON "receiving_documents"("number");

-- CreateIndex
CREATE INDEX "receiving_documents_status_created_at_idx" ON "receiving_documents"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "receiving_documents_supplier_name_idx" ON "receiving_documents"("supplier_name");

-- CreateIndex
CREATE INDEX "receiving_items_product_id_idx" ON "receiving_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "receiving_items_document_id_product_id_key" ON "receiving_items"("document_id", "product_id");

-- CreateIndex
CREATE INDEX "receipts_item_id_received_at_idx" ON "receipts"("item_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_document_id_idempotency_key_key" ON "receipts"("document_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transactions_receipt_id_key" ON "inventory_transactions"("receipt_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_product_id_created_at_idx" ON "inventory_transactions"("product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_transactions_document_id_idx" ON "inventory_transactions"("document_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_created_at_idx" ON "inventory_transactions"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "receiving_documents" ADD CONSTRAINT "receiving_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_documents" ADD CONSTRAINT "receiving_documents_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_documents" ADD CONSTRAINT "receiving_documents_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_items" ADD CONSTRAINT "receiving_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "receiving_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_items" ADD CONSTRAINT "receiving_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "receiving_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "receiving_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "receiving_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Constraint tambahan (tidak didukung deklaratif oleh Prisma).
-- Lapis pertahanan terakhir bila ada bug di lapisan aplikasi.
-- ============================================================
ALTER TABLE "products"
  ADD CONSTRAINT "products_sku_format_chk" CHECK ("sku" ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$');

ALTER TABLE "receiving_items"
  ADD CONSTRAINT "receiving_items_expected_qty_chk" CHECK ("expected_qty" BETWEEN 1 AND 1000000),
  ADD CONSTRAINT "receiving_items_received_qty_chk" CHECK ("received_qty" >= 0 AND "received_qty" <= "expected_qty");

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_quantity_chk" CHECK ("quantity" BETWEEN 1 AND 1000000);

ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_quantity_chk" CHECK ("quantity" >= 0);

ALTER TABLE "inventory_transactions"
  ADD CONSTRAINT "inventory_transactions_delta_chk" CHECK ("quantity_delta" <> 0),
  ADD CONSTRAINT "inventory_transactions_balance_chk" CHECK ("balance_after" >= 0);

ALTER TABLE "receiving_documents"
  ADD CONSTRAINT "receiving_documents_cancel_reason_chk"
  CHECK ("status" <> 'CANCELLED' OR "cancel_reason" IS NOT NULL);

-- Riwayat transaksi stok bersifat append-only (BR-13).
CREATE FUNCTION prevent_inventory_transaction_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory_transactions bersifat append-only (% ditolak)', TG_OP;
END;
$$;

CREATE TRIGGER inventory_transactions_append_only
  BEFORE UPDATE OR DELETE ON "inventory_transactions"
  FOR EACH ROW EXECUTE FUNCTION prevent_inventory_transaction_mutation();
