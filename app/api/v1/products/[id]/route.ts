import { authed, json, readJson } from "@/src/server/http";
import { idParam, productUpdateSchema } from "@/src/server/schemas";
import { getProduct, updateProduct } from "@/src/server/services/products";

type P = { id: string };

export const GET = authed<P>(async ({ params }) => {
  const { id } = idParam.parse(params);
  return json({ data: await getProduct(id) });
});

export const PATCH = authed<P>(async ({ req, actor, params }) => {
  const { id } = idParam.parse(params);
  const input = await readJson(req, productUpdateSchema);
  return json({ data: await updateProduct(actor, id, input) });
});
