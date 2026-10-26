import { Prisma } from "@prisma/client";
import { assertRole, type Actor } from "../auth";
import { prisma } from "../db";
import { Errors } from "../errors";
import type { ProductCreate, ProductListQuery, ProductUpdate } from "../schemas";
import { pageArgs, pageMeta } from "./format";

type ProductWithStock = Prisma.ProductGetPayload<{ include: { inventory: true } }>;

export function toProductDto(product: ProductWithStock) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    unit: product.unit,
    isActive: product.isActive,
    quantity: product.inventory?.quantity ?? 0,
    createdAt: product.createdAt,
  };
}

export async function listProducts(query: ProductListQuery) {
  const where: Prisma.ProductWhereInput = {
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.q
      ? {
          OR: [
            { sku: { contains: query.q, mode: "insensitive" } },
            { name: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { inventory: true },
      orderBy: { sku: "asc" },
      ...pageArgs(query),
    }),
    prisma.product.count({ where }),
  ]);
  return { data: rows.map(toProductDto), meta: pageMeta(query, total) };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: { inventory: true } });
  if (!product) throw Errors.notFound("Produk");
  return toProductDto(product);
}

export async function createProduct(actor: Actor, input: ProductCreate) {
  assertRole(actor, "SUPERVISOR");
  try {
    const product = await prisma.product.create({
      data: {
        sku: input.sku,
        name: input.name,
        unit: input.unit,
        inventory: { create: { quantity: 0 } }, // stok awal 0 dibuat bersama produk
      },
      include: { inventory: true },
    });
    return toProductDto(product);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw Errors.skuExists(input.sku);
    }
    throw error;
  }
}

export async function updateProduct(actor: Actor, id: string, input: ProductUpdate) {
  assertRole(actor, "SUPERVISOR");
  try {
    const product = await prisma.product.update({
      where: { id },
      data: input,
      include: { inventory: true },
    });
    return toProductDto(product);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw Errors.notFound("Produk");
    }
    throw error;
  }
}
