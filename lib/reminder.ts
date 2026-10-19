// Weekly balance reminder: a group picks a day of the week and the app posts the outstanding balances
// in the group chat. The scheduler (Vercel Cron, see vercel.json) runs once a day at a fixed time,
// so the day is the group's choice and the time is the same for every group.

export const REMINDER_TZ = 'Asia/Singapore'
export const REMINDER_TIME_LABEL = '9 am' // vercel.json runs it at 01:00 UTC; Vercel may start it a little late
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export const isReminderDay = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Today in Singapore: the calendar date and the weekday (0 = Sunday), for a given moment
export function singaporeToday(now: Date = new Date()): { date: string; day: number } {
  const date = now.toLocaleDateString('en-CA', { timeZone: REMINDER_TZ }) // YYYY-MM-DD
  const weekday = now.toLocaleDateString('en-US', { timeZone: REMINDER_TZ, weekday: 'short' })
  return { date, day: SHORT.indexOf(weekday) }
}
