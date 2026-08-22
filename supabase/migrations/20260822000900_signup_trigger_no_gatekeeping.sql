-- Reverts the sign-up gatekeeping added in 20260822000800.
--
-- That migration tried to tell admin-created accounts from self-service ones
-- inside the signup trigger, using `invited_at` or an `app_metadata` flag. Both
-- are unavailable at INSERT time: GoTrue inserts the auth.users row first and
-- applies invited_at / app_metadata in a subsequent UPDATE. The trigger
-- therefore rejected legitimate admin invitations as well.
--
-- Account creation is not gated here any more. It is controlled by:
--   1. Supabase Auth "Allow new users to sign up" (the authoritative switch —
--      the admin API bypasses it, self-service does not), and
--   2. the app: the bootstrap form and the admin "add member" form both go
--      through server actions that use the secret key, so they keep working
--      with self-service sign-up disabled.
--
-- The trigger keeps its original job: provision a profile, and make the very
-- first account the admin.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_others bigint;
begin
  -- The row being inserted is already visible here, so exclude it.
  select count(*) into v_others from auth.users u where u.id <> new.id;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case when v_others = 0 then 'admin'::public.app_role
         else 'member'::public.app_role end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
