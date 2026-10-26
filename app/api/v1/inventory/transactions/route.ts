import { authed, json, parseQuery } from "@/src/server/http";
import { transactionListQuery } from "@/src/server/schemas";
import { listTransactions } from "@/src/server/services/inventory";

export const GET = authed(async ({ req }) => {
  return json(await listTransactions(parseQuery(req, transactionListQuery)));
});
