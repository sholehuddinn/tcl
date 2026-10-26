import { json, open } from "@/src/server/http";
import { checkHealth } from "@/src/server/services/health";

export const GET = open(async () => json(await checkHealth()));
