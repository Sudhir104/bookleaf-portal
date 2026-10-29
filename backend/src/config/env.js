import 'dotenv/config';

for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key} (see .env.example)`);
    process.exit(1);
  }
}

// All secrets live here and are read from the environment only.
// Nothing in this object is ever sent to the frontend.
export const env = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  groqApiKey: process.env.GROQ_API_KEY || '',
  triageModel: process.env.GROQ_TRIAGE_MODEL || 'llama-3.1-8b-instant',
  draftModel: process.env.GROQ_DRAFT_MODEL || 'llama-3.3-70b-versatile',
  referenceDate: process.env.REFERENCE_DATE || '',
};
