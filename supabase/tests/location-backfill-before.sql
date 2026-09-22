-- Fixture to load after migration 006 and before migration 007.
insert into auth.users(id) values ('90000000-0000-4000-8000-000000000001');
insert into public.incidents(id,created_by,category,location,location_label)
 values ('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','foam',
 public.st_geogfromtext('POINT(77.123456 28.654321)'),'Private legacy address');
insert into public.observations(id,incident_id,author_id,category,observed_at,location,description,idempotency_key)
 values ('90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002',
 '90000000-0000-4000-8000-000000000001','foam',now(),public.st_geogfromtext('POINT(77.123456 28.654321)'),
 'Foam at 28.654321, 77.123456','legacy-backfill');
insert into public.missions(id,incident_id,type,evidence_gap,instructions,safety_message,target_location)
 values ('90000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000002','repeat_observation',
 'Repeat needed','Stay on path','Do not enter water',public.st_geogfromtext('POINT(77.123456 28.654321)'));
