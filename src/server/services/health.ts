import { prisma } from "../db";
import { AppError } from "../errors";

export async function checkHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" as const };
  } catch (error) {
    console.error("[health] database tidak terjangkau", error instanceof Error ? error.message : error);
    throw new AppError(503, "SERVICE_UNAVAILABLE", "Database tidak terjangkau.");
  }
}
