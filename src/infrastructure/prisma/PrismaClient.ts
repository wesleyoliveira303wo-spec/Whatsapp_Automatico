import { PrismaClient } from '@prisma/client';

// Singleton Prisma client for the whole application
export const prisma = new PrismaClient();