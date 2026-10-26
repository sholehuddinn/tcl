// Seed idempoten (upsert). Password dibaca dari environment variable, tidak pernah di-hardcode.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} wajib diisi untuk seed`);
  return value;
}

async function seedUsers() {
  const users = [
    { username: "operator", fullName: "Operator Gudang", role: "OPERATOR" as const, password: requiredEnv("SEED_OPERATOR_PASSWORD") },
    { username: "supervisor", fullName: "Supervisor Gudang", role: "SUPERVISOR" as const, password: requiredEnv("SEED_SUPERVISOR_PASSWORD") },
  ];
  for (const { password, ...user } of users) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { username: user.username },
      create: { ...user, passwordHash },
      update: { fullName: user.fullName, role: user.role, passwordHash, isActive: true },
    });
  }
  console.log(`seed: ${users.length} pengguna`);
}

async function seedDemoProducts() {
  const products = [
    { sku: "BRG-001", name: "Beras Premium 5 kg", unit: "karung" },
    { sku: "BRG-002", name: "Minyak Goreng 2 L", unit: "botol" },
    { sku: "BRG-003", name: "Gula Pasir 1 kg", unit: "pak" },
    { sku: "BRG-004", name: "Tepung Terigu 1 kg", unit: "pak" },
    { sku: "BRG-005", name: "Mi Instan Goreng", unit: "dus" },
  ];
  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      create: { ...product, inventory: { create: { quantity: 0 } } },
      update: {},
    });
  }
  console.log(`seed: ${products.length} produk contoh`);
}

async function main() {
  await seedUsers();
  if (process.env.SEED_DEMO_DATA === "true") await seedDemoProducts();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
