import type { FastifyInstance } from 'fastify';
import { createOrder } from '../orders/service';
import { z } from 'zod';

const CreateOrderBody = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })),
  note: z.string().optional(),
});

const OrderResponse = z.object({
  id: z.string(),
  total: z.number(),
  status: z.enum(['pending', 'paid']),
});

export default async function orderRoutes(app: FastifyInstance) {
  app.post('/orders', { schema: { body: CreateOrderBody, response: { 201: OrderResponse } } }, async (req, reply) => {
    const order = await createOrder(req.body);
    reply.status(201);
    return order;
  });
}
