-- SELECT * FROM public.members;

-- SELECT pg_get_serial_sequence('deposit', 'id');

-- TRUNCATE TABLE servicefee cascade;
-- SELECT setval('public.servicefee_id_seq', 1);
TRUNCATE TABLE draw cascade;
SELECT setval('public.draw_id_seq', 1);
TRUNCATE TABLE lottosetting cascade;
SELECT setval('public.lottosetting_id_seq', 1);
TRUNCATE TABLE winners cascade;
SELECT setval('public.winners_id_seq', 1);
TRUNCATE TABLE deposit cascade;
SELECT setval('public.deposit_id_seq', 1);
TRUNCATE TABLE lottonumbers cascade;
SELECT setval('public.lottonumbers_id_seq', 1);
-- TRUNCATE TABLE members cascade;
-- SELECT setval('public.members_id_seq', 1);
