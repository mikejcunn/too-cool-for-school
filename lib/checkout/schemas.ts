import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email');
export const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Enter a phone number')
  .max(25)
  .regex(/^[0-9+().\-\s]+$/, 'Enter a valid phone number');

const fulfillmentBase = {
  customerName: z.string().trim().min(1, 'Enter your name').max(120),
  customerEmail: emailSchema,
  customerPhone: phoneSchema,
  notes: z.string().trim().max(500).optional().or(z.literal('')),
};

export const fulfillmentSchema = z.discriminatedUnion('fulfillmentMethod', [
  z.object({
    fulfillmentMethod: z.literal('classroom'),
    classroomId: z.string().uuid('Pick a teacher'),
    studentName: z.string().trim().min(1, "Enter the student's name").max(120),
  }),
  z.object({
    fulfillmentMethod: z.literal('pickup'),
    pickupEventId: z.string().uuid('Pick an event'),
    studentName: z.string().trim().max(120).optional().or(z.literal('')),
  }),
]);

/** Online checkout submission. Card token comes from Runner.js in the browser. */
export const placeOrderInputSchema = z
  .object({
    ...fulfillmentBase,
    accountToken: z.string().min(1, 'Card details are missing'),
    expiration: z.string().trim().optional(),
    nameOnCard: z.string().trim().max(120).optional(),
    billingZip: z.string().trim().max(12).optional(),
    recaptchaToken: z.string().optional(),
    idempotencyKey: z.string().uuid(),
  })
  .and(fulfillmentSchema);

export type PlaceOrderInput = z.infer<typeof placeOrderInputSchema>;

export const cartQuantitySchema = z.number().int().min(0).max(50);

export type PlaceOrderErrorCode =
  | 'EMPTY_CART'
  | 'INVALID'
  | 'NOT_CONFIGURED'
  | 'RECAPTCHA_FAILED'
  | 'PRICE_CHANGED'
  | 'OUT_OF_STOCK'
  | 'PREORDER_CLOSED'
  | 'UNAVAILABLE'
  | 'DECLINED'
  | 'PAYMENT_UNCERTAIN'
  | 'ERROR';

export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNumber: string; publicToken: string }
  | { ok: false; code: PlaceOrderErrorCode; message: string; details?: Record<string, unknown> };
