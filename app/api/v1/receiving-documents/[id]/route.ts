import { authed, json } from "@/src/server/http";
import { idParam } from "@/src/server/schemas";
import { getDocument } from "@/src/server/services/receiving";

export const GET = authed<{ id: string }>(async ({ params }) => {
  const { id } = idParam.parse(params);
  return json({ data: await getDocument(id) });
});
