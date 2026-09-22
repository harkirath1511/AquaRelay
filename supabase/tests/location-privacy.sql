-- psql -v ON_ERROR_STOP=1 -f supabase/tests/location-privacy.sql
-- Run after all migrations on a disposable Supabase/PostGIS database.
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end; $$;
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles set role='reviewer' where id='00000000-0000-4000-8000-000000000003';
insert into public.streams(id,name) values
 ('10000000-0000-4000-8000-000000000001','Stream A'),
 ('10000000-0000-4000-8000-000000000002','Stream B');
insert into public.incidents(id,created_by,stream_id,category,location,is_demo) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','foam',public.st_geogfromtext('POINT(-0.123456 51.501234)'),true);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
create temp table first_report as select * from public.submit_observation(
 '00000000-0000-4000-8000-000000000001','privacy-test-1','10000000-0000-4000-8000-000000000001','foam',51.501234,-0.123456,
 'Private doorstep',now(),'Foam at 51.501234, -0.123456','{"coordinates":[51.501234,-0.123456],"conditionVisible":true}','{}',12,'device');
select pg_temp.assert_true((select created_incident from first_report),'live report must not match demo');
select pg_temp.assert_true((select count(*)=1 from public.get_observation_location((select observation_id from first_report))),'reporter can read own exact point');
select pg_temp.assert_true((select latitude=51.501234 and longitude=-0.123456 and accuracy_meters=12 and source='device' from public.get_observation_location((select observation_id from first_report))),'exact point and metadata preserved');
select pg_temp.assert_true((select location_label is null and public.st_y(location::public.geometry)<>51.501234 from public.incidents where id=(select incident_id from first_report)),'public incident contains approximate point and no label');
select pg_temp.assert_true((select description not like '%51.501234%' and answers='{"conditionVisible":true}'::jsonb from public.observations where id=(select observation_id from first_report)),'alternate location carriers scrubbed');
select pg_temp.assert_true((select not created_incident from public.submit_observation(
 '00000000-0000-4000-8000-000000000001','privacy-test-2','10000000-0000-4000-8000-000000000001','foam',51.501235,-0.123456,null,now(),'Same stream','{}','{}',null,'map')),'same stream matches with exact coordinates');
select pg_temp.assert_true((select created_incident from public.submit_observation(
 '00000000-0000-4000-8000-000000000001','privacy-test-3','10000000-0000-4000-8000-000000000002','foam',51.501235,-0.123456,null,now(),'Different stream','{}','{}',null,'search')),'unrelated nearby stream stays separate');
select pg_temp.assert_true((select created_incident from public.submit_observation(
 '00000000-0000-4000-8000-000000000001','privacy-test-4',null,'foam',51.501235,-0.123456,null,now(),'Unknown stream','{}','{}',null,'map')),'unknown stream never guesses a match');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.get_observation_location((select observation_id from first_report))),'other user cannot read reporter exact point');
select pg_temp.assert_true((select count(*)=0 from private.incident_locations),'RLS protects direct incident location reads');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.observations','INSERT'),'cannot bypass RPC capture');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.list_available_missions(double precision,double precision,integer,public.mission_type,integer)','EXECUTE'),'no client access to exact spatial oracle');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from public.get_observation_location((select observation_id from first_report))),'reviewer can read exact point');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
insert into public.missions(id,incident_id,type,evidence_gap,instructions,safety_message,target_location)
 select '30000000-0000-4000-8000-000000000001',incident_id,'repeat_observation','Check persistence','Observe safely','Stay back',public.st_geogfromtext('POINT(-0.123456 51.501234)') from first_report;
grant select on first_report to service_role;
set local role service_role;
select pg_temp.assert_true((select count(*)=1 from private.observation_locations where observation_id=(select observation_id from first_report)),'trusted server reads exact point');
select pg_temp.assert_true((select count(*)=1 from public.list_available_missions(51.501234,-0.123456,100,null,25)
 where id='30000000-0000-4000-8000-000000000001' and latitude<>51.501234 and longitude<>-0.123456),'nearby search uses exact target and returns only approximate point');
select pg_temp.assert_true((select count(*)=0 from public.list_available_missions(51.52,-0.123456,100,null,25)
 where id='30000000-0000-4000-8000-000000000001'),'nearby search excludes distant target');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select impact_points=0 from public.submit_mission_response(
 '30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','far-response',51.52,-0.123456,now(),'Far from target','{}','{}',10,'device')),'far responses earn no points');
select pg_temp.assert_true((select location_quality_flag='far_from_target' from public.observations where idempotency_key='far-response'),'far response flagged');
select pg_temp.assert_true((select state='open' from public.missions where id='30000000-0000-4000-8000-000000000001'),'far response does not complete mission');
select pg_temp.assert_true((select replayed and impact_points=0 and location_quality_flag='far_from_target' from public.submit_mission_response(
 '30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','far-response',51.52,-0.123456,now(),'Far from target','{}','{}',10,'device')),'flag survives idempotent replay');
select pg_temp.assert_true((select impact_points=10 from public.submit_mission_response(
 '30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','near-response',51.501235,-0.123456,now(),'At target','{}','{}',null,'map')),'near response accepted using exact target');
select pg_temp.assert_true((select replayed and impact_points=10 from public.submit_mission_response(
 '30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','near-response',51.501235,-0.123456,now(),'At target','{}','{}',null,'map')),'replay remains idempotent');
reset role;
select pg_temp.assert_true(not has_schema_privilege('anon','private','USAGE'),'anonymous cannot use private schema');
select pg_temp.assert_true(not has_function_privilege('anon','public.get_observation_location(uuid)','EXECUTE'),'anonymous cannot read exact point RPC');
select pg_temp.assert_true(not has_table_privilege('authenticated','private.observation_locations','UPDATE'),'cannot forge metadata or owner');
insert into public.missions(id,incident_id,type,evidence_gap,instructions,safety_message)
 select '30000000-0000-4000-8000-000000000002',incident_id,'upstream_comparison','Compare upstream','Observe safely','Stay back' from first_report;
insert into public.missions(id,incident_id,type,evidence_gap,instructions,safety_message)
 values ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','repeat_observation','Demo','Demo','Demo');
set local role authenticated;
select pg_temp.assert_true((select location_quality_flag='target_unknown' and impact_points=0 from public.submit_mission_response(
 '30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','unknown-target',51.501234,-0.123456,now(),'Upstream report','{}','{}',null,'search')),'directional mission requires an actual target');
do $$ begin
  begin
    perform public.submit_mission_response('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','demo-response',51.501234,-0.123456,now(),'Live response','{}','{}',null,'map');
    raise exception 'Demo response accepted';
  exception when others then
    if sqlerrm <> 'Live responses cannot target demo incidents' then raise; end if;
  end;
end $$;
reset role;
select pg_temp.assert_true(public.st_equals(private.approximate_location(public.st_geogfromtext('POINT(-0.123456 51.501234)'))::public.geometry,
 private.approximate_location(public.st_geogfromtext('POINT(-0.123457 51.501235)'))::public.geometry),'same cell has a stable point');
select pg_temp.assert_true(public.st_y(private.approximate_location(public.st_geogfromtext('POINT(180 90)'))::public.geometry)<=90,'pole and dateline stay in bounds');
do $$ begin
  begin perform private.validate_location('NaN'::float8,0,10,'device'); raise exception 'NaN accepted'; exception when invalid_parameter_value then null; end;
  begin perform private.validate_location(0,0,null,'device'); raise exception 'Missing accuracy accepted'; exception when invalid_parameter_value then null; end;
  begin perform private.validate_location(0,0,10,'forged'); raise exception 'Invalid source accepted'; exception when invalid_parameter_value then null; end;
end $$;
set constraints all immediate;
rollback;
