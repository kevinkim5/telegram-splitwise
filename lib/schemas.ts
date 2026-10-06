import { z } from 'zod'

const currency = z.string().regex(/^[A-Z]{3}$/, 'currency must be a 3-letter uppercase code')

export const expenseBodySchema = z.object({
  description:        z.string().min(1).max(500),
  total_amount:       z.number().finite().positive(),
  currency:           currency.optional(),
  paid_by_member_id:  z.number().int().positive(),
  split_type:         z.enum(['equal', 'custom']),
  splits: z.array(z.object({
    member_id: z.number().int().positive(),
    amount:    z.number().finite().positive().optional(),
  })).min(1),
  date:     z.string().optional(),
  category: z.string().max(100).nullable().optional(),
})

export const settlementBodySchema = z.object({
  from_member_id: z.number().int().positive(),
  to_member_id:   z.number().int().positive(),
  amount:         z.number().finite().positive(),
  currency:       currency.optional(),
})

// Several settlements recorded together (one per currency). Currency is required here.
export const settlementBatchBodySchema = z.object({
  settlements: z.array(z.object({
    from_member_id: z.number().int().positive(),
    to_member_id:   z.number().int().positive(),
    amount:         z.number().finite().positive(),
    currency,
  })).min(1).max(20),
})

export const settingsBodySchema = z.object({
  currency,
})
