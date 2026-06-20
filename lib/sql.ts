import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

let _db: NeonQueryFunction<false, false> | null = null

function getDb(): NeonQueryFunction<false, false> {
  if (!_db) _db = neon(process.env.POSTGRES_URL!)
  return _db
}

// Proxy lazily forwards tagged template calls and property access (e.g. .transaction) to neon
export const sql = new Proxy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function () {} as unknown as NeonQueryFunction<false, false>,
  {
    apply(_target, _thisArg, args) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (getDb() as any)(...args)
    },
    get(_target, prop) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (getDb() as any)[prop]
    },
  }
)
