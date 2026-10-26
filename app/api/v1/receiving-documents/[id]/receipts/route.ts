import { Errors } from "@/src/server/errors";
import { authed, json, readJson } from "@/src/server/http";
import { idempotencyKeySchema, idParam, receiptCreateSchema } from "@/src/server/schemas";
import { recordReceipt } from "@/src/server/services/receiving";

export const POST = authed<{ id: string }>(async ({ req, actor, params }) => {
  const { id } = idParam.parse(params);

  const keyResult = idempotencyKeySchema.safeParse(req.headers.get("idempotency-key") ?? undefined);
  if (!keyResult.success) {
    throw Errors.validation("Header Idempotency-Key wajib diisi (1-100 karakter).", [
      { field: "Idempotency-Key", message: keyResult.error.issues[0]?.message ?? "tidak valid" },
    ]);
  }
  const input = await readJson(req, receiptCreateSchema);

  const { replayed, data } = await recordReceipt(actor, id, input, keyResult.data);
  return json({ replayed, data }, replayed ? 200 : 201);
});
