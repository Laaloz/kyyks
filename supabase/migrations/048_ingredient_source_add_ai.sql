-- Reseptikirjan ulkopuolinen ruokaloggaus (MyFitnessPal-tyyli): lisätään AI-kuvasta
-- arvioiduille omille tuotteille oma provenienssiarvo 'ai' lähdetyyppiin.
-- HUOM: uutta enum-arvoa ei voi käyttää samassa transaktiossa kuin se lisätään,
-- joten tämä on omassa migraatiossaan ja arvoa käytetään vasta migraatiossa 049.
alter type public.ingredient_source add value if not exists 'ai';
