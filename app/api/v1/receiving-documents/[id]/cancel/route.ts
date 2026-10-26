import { authed, json, readJson } from "@/src/server/http";
import { cancelSchema, idParam } from "@/src/server/schemas";
import { cancelDocument } from "@/src/server/services/receiving";

export const POST = authed<{ id: string }>(async ({ req, actor, params }) => {
  const { id } = idParam.parse(params);
  const { reason } = await readJson(req, cancelSchema);
  return json({ data: await cancelDocument(actor, id, reason) });
});
