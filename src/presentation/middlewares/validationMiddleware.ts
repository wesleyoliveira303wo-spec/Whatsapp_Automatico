import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

// Generic validation middleware for body, params or query
export const validate = (schema: ZodSchema<unknown>, property: 'body' | 'params' | 'query' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[property];
    const result = schema.safeParse(data);
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return res.status(400).json({ error: 'Invalid request data', details: errors });
    }
    // replace the original data with parsed data (to get proper types/coercions)
    req[property] = result.data;
    next();
  };
};
