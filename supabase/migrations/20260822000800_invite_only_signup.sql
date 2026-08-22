-- Make the instance invite-only.
--
-- Self-service sign-up is allowed for exactly one case: an empty instance needs
-- a first account, and that account becomes the admin. After that, accounts may
-- only be created by an admin (invitation, or the bootstrap script).
--
-- This is enforced in the signup trigger rather than only in the UI, because the
-- Supabase auth endpoint is reachable directly with the publishable key.

-- Lets the sign-up screen decide whether to offer the bootstrap form. Reads
-- auth.users (not profiles) so an account without a profile row still counts.
create or replace function public.signup_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from auth.users);
$$;

grant execute on function public.signup_available() to anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_others bigint;
  v_admin_created boolean;
begin
  -- The row being inserted is already visible here, so exclude it.
  select count(*) into v_others from auth.users u where u.id <> new.id;

  -- `invited_at` is set by inviteUserByEmail. `created_by_admin` lives in
  -- app_metadata, which clients cannot set through the public signup endpoint,
  -- so both signals are trustworthy.
  v_admin_created :=
    new.invited_at is not null
    or coalesce(new.raw_app_meta_data ->> 'created_by_admin', '') = 'true';

  if v_others > 0 and not v_admin_created then
    raise exception
      'Sign-up is disabled. Ask an administrator to invite you.'
      using errcode = 'check_violation';
  end if;

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
