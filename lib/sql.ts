import { neon } from '@neondatabase/serverless'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _neon: any = neon(process.env.POSTGRES_URL!)

export const sql = async (
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<{ rows: Record<string, unknown>[] }> => {
  const rows: Record<string, unknown>[] = await _neon(strings, ...values)
  return { rows }
}
