do $$ begin
  if not exists (select 1 from private.observation_locations where observation_id='90000000-0000-4000-8000-000000000003'
    and public.st_y(exact_location::public.geometry)=28.654321 and source='legacy_unknown' and accuracy_meters is null)
    then raise exception 'Legacy observation exact location or metadata lost'; end if;
  if not exists (select 1 from private.incident_locations where incident_id='90000000-0000-4000-8000-000000000002'
    and location_label='Private legacy address') then raise exception 'Legacy private label lost'; end if;
  if not exists (select 1 from private.mission_locations where mission_id='90000000-0000-4000-8000-000000000004'
    and public.st_x(exact_location::public.geometry)=77.123456) then raise exception 'Legacy mission exact location lost'; end if;
  if exists (select 1 from public.incidents where id='90000000-0000-4000-8000-000000000002'
    and (location_label is not null or public.st_y(location::public.geometry)=28.654321)) then raise exception 'Legacy public location leaked'; end if;
  if exists (select 1 from public.observations where id='90000000-0000-4000-8000-000000000003'
    and (description like '%28.654321%' or public.st_y(location::public.geometry)=28.654321)) then raise exception 'Legacy public observation leaked'; end if;
end $$;
