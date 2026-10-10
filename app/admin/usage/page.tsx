import { sql } from '@/lib/sql'
import { signOut } from '@/auth'
import { ensureSchema } from '@/lib/db'
import { SCANS_PER_HOUR } from '@/lib/receipt-limits'
import { AdminNav } from '../AdminNav'

export const dynamic = 'force-dynamic'

const TZ = 'Asia/Singapore' // days are counted in Singapore time
const grey = '#9ca3af'

// receipt_scans has one row per receipt read by the AI (a scan that fails is removed again), so
// these counts are the calls that actually used the quota.
async function load() {
  const run = () => Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int                                      AS last_hour,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE ${TZ})::date = (NOW() AT TIME ZONE ${TZ})::date)::int    AS today,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int                                      AS d7,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int                                     AS d30,
        COUNT(*)::int                                                                                            AS total,
        COUNT(DISTINCT telegram_user_id) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int             AS users30,
        MIN(created_at)                                                                                          AS since
      FROM receipt_scans
    `,
    sql`
      SELECT (created_at AT TIME ZONE ${TZ})::date::text AS day, COUNT(*)::int AS scans
      FROM receipt_scans
      WHERE created_at > NOW() - INTERVAL '16 days'
      GROUP BY 1
    `,
    sql`
      WITH latest AS (
        SELECT DISTINCT ON (telegram_user_id) telegram_user_id, first_name, last_name, username
        FROM members ORDER BY telegram_user_id, created_at DESC
      )
      SELECT
        rs.telegram_user_id::text AS telegram_user_id,
        l.first_name, l.last_name, l.username,
        COUNT(*) FILTER (WHERE rs.created_at > NOW() - INTERVAL '1 hour')::int                                     AS last_hour,
        COUNT(*) FILTER (WHERE (rs.created_at AT TIME ZONE ${TZ})::date = (NOW() AT TIME ZONE ${TZ})::date)::int   AS today,
        COUNT(*) FILTER (WHERE rs.created_at > NOW() - INTERVAL '7 days')::int                                     AS d7,
        COUNT(*) FILTER (WHERE rs.created_at > NOW() - INTERVAL '30 days')::int                                    AS d30,
        COUNT(*)::int                                                                                              AS total,
        MAX(rs.created_at)                                                                                         AS last_scan
      FROM receipt_scans rs
      LEFT JOIN latest l ON l.telegram_user_id = rs.telegram_user_id
      GROUP BY rs.telegram_user_id, l.first_name, l.last_name, l.username
      ORDER BY d30 DESC, total DESC
      LIMIT 100
    `,
  ])
  try {
    return await run()
  } catch {
    await ensureSchema() // the table is created by the app's schema step; make sure it exists
    return run()
  }
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: '#fff', borderRadius: '12px', padding: '0.75rem 0.875rem', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: '0.6875rem', color: grey, marginTop: '0.125rem' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.625rem', color: grey }}>{sub}</div>}
    </div>
  )
}

export default async function AdminUsagePage() {
  const [[totals], perDayRows, users] = await load()

  // The last 14 days including today, zero-filled, newest first (days in Singapore time)
  const counts = new Map(perDayRows.map(r => [r.day as string, Number(r.scans)]))
  const days: { day: string; scans: number }[] = []
  const todaySg = new Date().toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
  for (let i = 0; i < 14; i++) {
    const d = new Date(`${todaySg}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ day: key, scans: counts.get(key) ?? 0 })
  }
  const max = Math.max(1, ...days.map(d => d.scans))
  const fmtDay = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ })

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '1.5rem 1rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Split Admin</h1>
        <form action={async () => {
          'use server'
          await signOut({ redirectTo: '/admin/login' })
        }}>
          <button type="submit" style={{ fontSize: '0.8125rem', color: '#6b7280', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer' }}>
            Sign out
          </button>
        </form>
      </div>
      <p style={{ color: '#6b7280', fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
        Receipt scans (Gemini) · days in Singapore time · limit {SCANS_PER_HOUR} scans per person per hour
      </p>

      <AdminNav active="usage" />

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Stat label="last hour" value={Number(totals?.last_hour ?? 0)} />
        <Stat label="today" value={Number(totals?.today ?? 0)} />
        <Stat label="last 7 days" value={Number(totals?.d7 ?? 0)} />
        <Stat label="last 30 days" value={Number(totals?.d30 ?? 0)} sub={`${Number(totals?.users30 ?? 0)} people`} />
      </div>
      <p style={{ fontSize: '0.6875rem', color: grey, marginBottom: '1.25rem', paddingLeft: '0.25rem' }}>
        {Number(totals?.total ?? 0)} scans in total{totals?.since ? `, since ${new Date(totals.since as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })}` : ''}
      </p>

      {/* Per day */}
      <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: grey, marginBottom: '0.5rem', paddingLeft: '0.25rem' }}>
        Per day (last 14)
      </p>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '0.5rem 1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', marginBottom: '1.5rem' }}>
        {days.map(d => (
          <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0', fontSize: '0.8125rem' }}>
            <span style={{ width: 84, color: '#6b7280', flexShrink: 0 }}>{fmtDay(d.day)}</span>
            <div style={{ flex: 1, height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(d.scans / max) * 100}%`, height: '100%', background: '#2563eb', borderRadius: 4 }} />
            </div>
            <span style={{ width: 28, textAlign: 'right', fontWeight: 600, color: d.scans ? '#111827' : '#d1d5db' }}>{d.scans}</span>
          </div>
        ))}
      </div>

      {/* Per person */}
      <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: grey, marginBottom: '0.5rem', paddingLeft: '0.25rem' }}>
        By person
      </p>
      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
        {users.length === 0 && <div style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.875rem' }}>No receipts scanned yet.</div>}
        {users.map((u, i) => {
          const name = u.first_name ? `${u.first_name}${u.last_name ? ` ${u.last_name}` : ''}` : `User ${u.telegram_user_id}`
          const atLimit = Number(u.last_hour) >= SCANS_PER_HOUR
          return (
            <div key={String(u.telegram_user_id)} style={{ padding: '0.75rem 1rem', borderBottom: i === users.length - 1 ? 'none' : '0.5px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem' }}>
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                  {name}
                  {u.username ? <span style={{ color: grey, fontWeight: 400 }}> @{String(u.username)}</span> : null}
                  {atLimit && <span style={{ marginLeft: 6, fontSize: '0.625rem', fontWeight: 700, color: '#b91c1c', background: '#fee2e2', borderRadius: 999, padding: '1px 8px' }}>at hourly limit</span>}
                </span>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', flexShrink: 0 }}>{Number(u.d30)}<span style={{ color: grey, fontWeight: 400, fontSize: '0.6875rem' }}> / 30d</span></span>
              </div>
              <div style={{ fontSize: '0.75rem', color: grey, marginTop: '0.125rem' }}>
                {Number(u.today)} today · {Number(u.d7)} in 7d · {Number(u.total)} total · last {fmtWhen(u.last_scan as string)}
                {' · '}<span style={{ color: '#d1d5db' }}>ID {String(u.telegram_user_id)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
