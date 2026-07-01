-- AI-tapahtumien lokitus: sama taulu (ai_usage_events) käyttöön myös Gemini-virheiden ja
-- mallien fallbackien seurantaan. detail-sarake pitää metatiedot (esim. HTTP-status, malli),
-- jotta voidaan mitata kuinka usein ensisijainen malli ruuhkautuu (503) ja fallback laukeaa.
-- kind erottaa rivit: 'food_estimate' = onnistunut arvio (kiintiö), 'gemini_error' / 'gemini_fallback' = seuranta.
alter table "public"."ai_usage_events" add column if not exists "detail" "jsonb";
