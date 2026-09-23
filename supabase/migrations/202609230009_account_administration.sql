-- Role changes use a session-scoped, audited function. No client role writes.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(public.current_app_role()='admin',false);
$$;

create table public.admin_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id),
  target_user_id uuid references public.profiles(id),
  incident_id uuid references public.incidents(id),
  action text not null,
  reason text not null check(char_length(reason) between 10 and 1000),
  previous_value text,
  new_value text,
  created_at timestamptz not null default now()
);
alter table public.admin_events enable row level security;
revoke all on public.admin_events from anon,authenticated;
grant select on public.admin_events to authenticated;
create policy "administrators read administration audit" on public.admin_events
  for select to authenticated using(public.is_admin());

revoke update on public.profiles from authenticated;
grant update(display_name) on public.profiles to authenticated;
create or replace function public.protect_profile_role() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.role is distinct from new.role and auth.role() is distinct from 'service_role'
    and not public.is_admin() then raise exception 'Administrator access required'; end if;
  new.updated_at=now();
  return new;
end;
$$;

create function public.admin_change_role(p_user_id uuid,p_role public.app_role,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare previous_role public.app_role;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_user_id=auth.uid() then raise exception 'Administrators cannot change their own role'; end if;
  if p_role is null or p_reason is null or char_length(trim(p_reason)) not between 10 and 1000 then raise exception 'A reason is required'; end if;
  select role into previous_role from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  update public.profiles set role=p_role where id=p_user_id;
  insert into public.admin_events(actor_id,target_user_id,action,reason,previous_value,new_value)
    values(auth.uid(),p_user_id,'role_changed',trim(p_reason),previous_role::text,p_role::text);
end;
$$;
revoke all on function public.admin_change_role(uuid,public.app_role,text) from public,anon;
grant execute on function public.admin_change_role(uuid,public.app_role,text) to authenticated;

create function public.admin_pause_incident(p_incident_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare previous_state public.safety_state;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 10 and 1000 then raise exception 'A reason is required'; end if;
  select safety_state into previous_state from public.incidents where id=p_incident_id for update;
  if not found then raise exception 'Incident not found'; end if;
  update public.incidents set safety_state='missions_paused',updated_at=now() where id=p_incident_id;
  update public.missions set state='paused',updated_at=now() where incident_id=p_incident_id and state='open';
  insert into public.admin_events(actor_id,incident_id,action,reason,previous_value,new_value)
    values(auth.uid(),p_incident_id,'missions_paused',trim(p_reason),previous_state::text,'missions_paused');
  insert into public.incident_events(incident_id,actor_id,type,payload)
    values(p_incident_id,auth.uid(),'admin_safety_pause',jsonb_build_object('reason',private.redact_location_text(trim(p_reason))));
end;
$$;
revoke all on function public.admin_pause_incident(uuid,text) from public,anon;
grant execute on function public.admin_pause_incident(uuid,text) to authenticated;
