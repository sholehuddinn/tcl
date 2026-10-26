import { authed, json, parseQuery } from "@/src/server/http";
import { inventoryListQuery } from "@/src/server/schemas";
import { listInventory } from "@/src/server/services/inventory";

export const GET = authed(async ({ req }) => {
  return json(await listInventory(parseQuery(req, inventoryListQuery)));
});
