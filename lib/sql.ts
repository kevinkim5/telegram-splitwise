import { neon } from '@neondatabase/serverless'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _neon: any = null

function getNeon() {
  if (!_neon) _neon = neon(process.env.POSTGRES_URL!)
  return _neon
}

export const sql = async (
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<{ rows: Record<string, unknown>[] }> => {
  const rows: Record<string, unknown>[] = await getNeon()(strings, ...values)
  return { rows }
}
