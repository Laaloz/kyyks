export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const hCaptchaSiteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? "";

export const isHCaptchaConfigured = Boolean(hCaptchaSiteKey);
