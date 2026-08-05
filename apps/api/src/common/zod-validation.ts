import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parseWithZod<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new BadRequestException(result.error.issues.map((issue) => issue.message));
}
