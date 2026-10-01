const env = process.env;
const isProd = env.NODE_ENV === 'production';

function parseTrustProxy(value) {
  if (value == null || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

export const config = {
  isProd,
  port: Number(env.PORT ?? 4000),
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/product-lab',
  jwtSecret: env.JWT_SECRET ?? '',
  adminEmail: (env.ADMIN_EMAIL ?? '').trim().toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD ?? '',
  sessionDays: Number(env.SESSION_DAYS ?? 7),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
  gemini: {
    apiKey: env.GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || 'gemini-3.8-flash',
  },
  vapid: {
    publicKey: env.VAPID_PUBLIC_KEY || '',
    privateKey: env.VAPID_PRIVATE_KEY || '',
    subject: env.VAPID_SUBJECT || '',
  },
  scheduler: env.SCHEDULER !== 'off' && env.NODE_ENV !== 'test',
};

export function assertConfig() {
  const missing = ['JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}. See .env.example.`);
  if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
  if (isProd && config.adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters in production.');
}
