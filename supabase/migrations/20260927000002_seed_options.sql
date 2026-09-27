-- =============================================================================
-- Curated option dataset (V1): Indian domestic trips, INR.
--
-- cost_per_person = ESTIMATED on-ground cost per person for the typical
-- duration: mid-range stay on twin sharing, food, local transport and core
-- activities. EXCLUDES travel to/from the destination. It is an estimate,
-- not live pricing, and the UI says so on every card.
--
-- availability_windows = the commonly published recommended SEASON (monsoon
-- closures, road openings, park zones) from Oct 2026 through Dec 2027.
--
-- Sources and reasoning per destination: docs/dataset.md. Reviewed 2026-09.
-- sort_order is the curated deterministic order (ranking tie-break rule 5).
-- =============================================================================

insert into public.options
  (slug, name, type, cost_per_person, availability_windows, description,
   typical_duration_days, activities, tags, sort_order)
values
  ('goa', 'Goa', 'beach', 18000,
   '[{"start":"2026-10-15","end":"2027-05-31"},{"start":"2027-10-15","end":"2027-12-31"}]',
   'Beaches, shacks and old Portuguese quarters. North Goa is lively; South Goa is quieter. Monsoon (June–September) closes most beach shacks and water sports.',
   4, '{beaches_swimming,water_sports,nightlife,food_markets,cafes}',
   '{beach,nightlife,relaxed}', 10),

  ('gokarna', 'Gokarna', 'beach', 9000,
   '[{"start":"2026-10-01","end":"2027-03-31"},{"start":"2027-10-01","end":"2027-12-31"}]',
   'A small temple town on the Karnataka coast with a chain of quieter beaches linked by coastal walking trails.',
   3, '{beaches_swimming,trekking,cafes,yoga_wellness}',
   '{beach,quiet,coastal walks}', 20),

  ('coorg', 'Coorg (Kodagu)', 'hills', 12000,
   '[{"start":"2026-10-01","end":"2027-05-31"},{"start":"2027-10-01","end":"2027-12-31"}]',
   'Coffee country in the Western Ghats: estate homestays, waterfalls and gentle hikes. Very heavy rain June–September.',
   3, '{plantations,trekking,food_markets,scenic_drives}',
   '{coffee estates,homestays,misty}', 30),

  ('munnar', 'Munnar', 'hills', 11000,
   '[{"start":"2026-10-01","end":"2027-05-31"},{"start":"2027-09-15","end":"2027-12-31"}]',
   'Rolling tea estates at around 1,600 m in Kerala, with viewpoints, short treks and Eravikulam National Park.',
   3, '{plantations,trekking,scenic_drives,photography}',
   '{tea gardens,cool weather,viewpoints}', 40),

  ('rishikesh', 'Rishikesh', 'adventure', 10000,
   '[{"start":"2026-10-01","end":"2027-06-30"},{"start":"2027-09-16","end":"2027-12-31"}]',
   'Ganga-side town known for white-water rafting, riverside camps and yoga. Commercial rafting is closed 1 July–15 September for the monsoon.',
   3, '{rafting,camping,yoga_wellness,cafes,trekking}',
   '{rafting,riverside camps,yoga}', 50),

  ('jim-corbett', 'Jim Corbett National Park', 'wildlife', 16000,
   '[{"start":"2026-10-15","end":"2027-06-15"},{"start":"2027-10-15","end":"2027-12-31"}]',
   'India''s oldest national park, in the Kumaon foothills. Jeep safaris in the core zones; most core zones close for the monsoon (Jhirna stays open).',
   3, '{safari,photography,scenic_drives}',
   '{tiger reserve,jeep safaris,forest}', 60),

  ('jaipur', 'Jaipur', 'heritage', 12000,
   '[{"start":"2026-10-01","end":"2027-03-15"},{"start":"2027-10-01","end":"2027-12-31"}]',
   'The Pink City: Amber Fort, City Palace, stepwells and bazaars. Summers (April–June) are very hot.',
   3, '{forts_palaces,food_markets,photography}',
   '{forts,bazaars,Rajasthan}', 70),

  ('udaipur', 'Udaipur', 'heritage', 14000,
   '[{"start":"2026-10-01","end":"2027-03-31"},{"start":"2027-10-01","end":"2027-12-31"}]',
   'Lakeside palaces and rooftop cafés in southern Rajasthan, with boat rides on Lake Pichola.',
   3, '{forts_palaces,boating,food_markets,cafes,photography}',
   '{lakes,palaces,rooftop cafés}', 80),

  ('hampi', 'Hampi', 'heritage', 8000,
   '[{"start":"2026-10-15","end":"2027-02-28"},{"start":"2027-10-15","end":"2027-12-31"}]',
   'Ruins of the Vijayanagara capital (UNESCO World Heritage) among giant boulders, best explored by bicycle. Hot from March.',
   3, '{forts_palaces,photography,trekking,boating}',
   '{ruins,boulders,UNESCO}', 90),

  ('alleppey', 'Alleppey (Alappuzha)', 'backwaters', 9000,
   '[{"start":"2026-10-01","end":"2027-03-31"},{"start":"2027-09-15","end":"2027-12-31"}]',
   'Kerala backwaters by houseboat: an overnight cruise on the canals and lagoons with meals cooked on board.',
   2, '{boating,food_markets,photography,yoga_wellness}',
   '{houseboats,canals,slow travel}', 100),

  ('spiti', 'Spiti Valley', 'high_mountains', 30000,
   '[{"start":"2027-06-15","end":"2027-10-10"}]',
   'High-altitude desert valley (Kaza is ~3,800 m) with monasteries and long mountain drives. The Manali–Kaza road over Kunzum Pass is typically open only mid-June to mid-October.',
   7, '{scenic_drives,trekking,photography,camping}',
   '{high altitude,monasteries,road trip}', 110);
