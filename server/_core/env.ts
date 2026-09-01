export const ENV = {
  // Database — Railway MySQL injects MYSQL_URL, other hosts use DATABASE_URL
  databaseUrl: process.env.DATABASE_URL ?? process.env.MYSQL_URL ?? "",
  // Auth
  jwtSecret: process.env.JWT_SECRET ?? "",
  // (Optional) OpenAI for AI features - falls back gracefully if not set
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "",
  // File storage
  storageDir: process.env.STORAGE_DIR ?? "",
  // Admin
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  isProduction: process.env.NODE_ENV === "production",
};
