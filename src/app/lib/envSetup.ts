import path from 'path';
import dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), '.env');

const mask = (value?: string | null) => {
  if (!value) return 'undefined';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
};

if (typeof window === 'undefined') {
  const result = dotenv.config({ path: envPath, override: true });
  if (result.error) {
    console.warn('[envSetup] Failed to load .env file', result.error.message);
  } else {
    const keyPreview = mask(process.env.OPENAI_API_KEY ?? null);
    console.info('[envSetup] Loaded environment from .env (OPENAI_API_KEY=%s)', keyPreview);
  }
}
