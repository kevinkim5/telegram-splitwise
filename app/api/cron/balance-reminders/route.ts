import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { sql } from '@/lib/sql'
import { ensureSchema } from '@/lib/db'
import { postGroupBalances } from '@/lib/notify-group'
import { failedResult, isReminderDay, singaporeToday, type ReminderResult } from '@/lib/reminder'

export const maxDuration = 30

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // never run open: without a secret nobody can trigger it
  const given = request.headers.get('authorization') ?? ''
  const want = `Bearer ${secret}`
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

// Called once a day by Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
// Posts the outstanding balances in every group whose weekly reminder is set for today (Singapore
// time). A group that is all settled up is skipped. A group is claimed for today before its message
// goes out, so a repeated call the same day cannot post twice; if posting fails the claim is released.
//   ?dry=1   list the groups that would be reminded, send nothing
//   ?day=N   pretend today is weekday N (0 = Sunday), for testing
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error('Balance reminders: CRON_SECRET is not set, refusing to run')
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // the first run after a deploy can come before anyone has opened the app, which is what adds the reminder columns
  await ensureSchema()

  const url = new URL(request.url)
  const dry = url.searchParams.get('dry') === '1'
  const dayParam = url.searchParams.get('day')
  const today = singaporeToday()
  const day = dayParam === null ? today.day : Number(dayParam)
  if (!isReminderDay(day)) return NextResponse.json({ error: 'day must be 0-6' }, { status: 400 })

  if (dry) {
    const due = await sql`
      SELECT id, title FROM groups
      WHERE reminder_day = ${day} AND deleted_at IS NULL AND reminder_last_sent_on IS DISTINCT FROM ${today.date}::date
    `
    return NextResponse.json({ dry: true, day, date: today.date, due: due.map(g => ({ id: g.id, title: g.title })) })
  }

  // Claim today's groups in one statement; only the caller that wins the claim sends
  const claimed = await sql`
    UPDATE groups SET reminder_last_sent_on = ${today.date}::date
    WHERE reminder_day = ${day} AND deleted_at IS NULL AND reminder_last_sent_on IS DISTINCT FROM ${today.date}::date
    RETURNING id, chat_id, title
  `

  let sent = 0, settled = 0
  const failed: number[] = []
  for (let i = 0; i < claimed.length; i += 5) { // a few at a time: groups are few, Telegram is quick
    await Promise.all(claimed.slice(i, i + 5).map(async g => {
      let result: ReminderResult
      try {
        const r = await postGroupBalances({ id: g.id as number, title: g.title as string }, String(g.chat_id))
        if (r.ok) result = 'posted'
        else if (r.settled) result = 'settled'
        else {
          console.error(`Balance reminder not sent (group ${g.id}): ${r.error}${r.detail ? ` (${r.detail})` : ''}`)
          result = failedResult(r.detail ?? r.error)
        }
      } catch (e) {
        console.error(`Balance reminder error (group ${g.id}):`, e)
        result = failedResult(e instanceof Error ? e.message : String(e))
      }
      if (result === 'posted') sent++
      else if (result === 'settled') settled++
      else {
        failed.push(g.id as number)
        // not delivered: release today's claim so a manual rerun can retry it
        await sql`UPDATE groups SET reminder_last_sent_on = NULL WHERE id = ${g.id} AND reminder_last_sent_on = ${today.date}::date`.catch(() => {})
      }
      // keep what happened, so it can be checked after the (one hour) logs are gone; never fails the run
      await sql`UPDATE groups SET reminder_last_run_at = NOW(), reminder_last_result = ${result} WHERE id = ${g.id}`.catch(() => {})
    }))
  }

  console.log(JSON.stringify({ evt: 'balance_reminders', date: today.date, day, due: claimed.length, sent, settled, failed: failed.length }))
  return NextResponse.json({ day, date: today.date, due: claimed.length, sent, settled, failed })
}
