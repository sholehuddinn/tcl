import { authed, json, readJson } from "@/src/server/http";
import { idParam, itemsReplaceSchema } from "@/src/server/schemas";
import { replaceItems } from "@/src/server/services/receiving";

export const PUT = authed<{ id: string }>(async ({ req, actor, params }) => {
  const { id } = idParam.parse(params);
  const { items } = await readJson(req, itemsReplaceSchema);
  return json({ data: await replaceItems(actor, id, items) });
});
