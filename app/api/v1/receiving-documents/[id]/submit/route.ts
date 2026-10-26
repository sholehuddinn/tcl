import { authed, json } from "@/src/server/http";
import { idParam } from "@/src/server/schemas";
import { submitDocument } from "@/src/server/services/receiving";

export const POST = authed<{ id: string }>(async ({ actor, params }) => {
  const { id } = idParam.parse(params);
  return json({ data: await submitDocument(actor, id) });
});
