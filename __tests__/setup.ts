import { config } from 'dotenv';

// Prefer a dedicated test env, fall back to local dev env.
config({ path: '.env.test.local' });
config({ path: '.env.local' });
config({ path: '.env' });
