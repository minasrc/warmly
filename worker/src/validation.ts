import { z, type ZodType } from "zod"
import { HttpError } from "./http-error"

export async function parseJson<T>(request: Request, schema: ZodType<T>) {
  try {
    return schema.parse(await request.json())
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new HttpError(400, "bad_request", "Request body is invalid")
    }
    throw error
  }
}

export function parseId(value: string) {
  const result = z.uuid().safeParse(value)
  if (!result.success) throw new HttpError(400, "bad_request", "Identifier is invalid")
  return result.data
}
