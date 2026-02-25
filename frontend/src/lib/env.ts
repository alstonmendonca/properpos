// Environment variable validation
// Validates all required environment variables at build/runtime using Zod

import { z } from 'zod';

const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z
    .string()
    .url('NEXT_PUBLIC_API_URL must be a valid URL')
    .default('/api/v1'),
  NEXT_PUBLIC_APP_NAME: z
    .string()
    .min(1, 'NEXT_PUBLIC_APP_NAME is required')
    .default('ProperPOS'),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url('NEXT_PUBLIC_APP_URL must be a valid URL')
    .default('https://properpos.com'),
  NEXT_PUBLIC_API_LOGGING: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),
});

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

function validateEnv() {
  // Client-side env vars (NEXT_PUBLIC_*)
  const clientResult = clientEnvSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_LOGGING: process.env.NEXT_PUBLIC_API_LOGGING,
  });

  if (!clientResult.success) {
    const formatted = clientResult.error.flatten().fieldErrors;
    console.error('Invalid environment variables:', formatted);
    throw new Error(
      `Invalid environment variables:\n${Object.entries(formatted)
        .map(([key, errors]) => `  ${key}: ${(errors as string[]).join(', ')}`)
        .join('\n')}`
    );
  }

  // Server-side env vars (only validate on server)
  if (typeof window === 'undefined') {
    const serverResult = serverEnvSchema.safeParse({
      NODE_ENV: process.env.NODE_ENV,
    });

    if (!serverResult.success) {
      const formatted = serverResult.error.flatten().fieldErrors;
      console.error('Invalid server environment variables:', formatted);
      throw new Error(
        `Invalid server environment variables:\n${Object.entries(formatted)
          .map(([key, errors]) => `  ${key}: ${(errors as string[]).join(', ')}`)
          .join('\n')}`
      );
    }

    return { ...clientResult.data, ...serverResult.data };
  }

  return clientResult.data;
}

export const env = validateEnv();
