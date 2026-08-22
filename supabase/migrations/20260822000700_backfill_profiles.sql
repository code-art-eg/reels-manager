-- Accounts that existed before the signup trigger was installed have no
-- profile row, which would leave them without a role (and invisible on the
-- Users page). Backfill them, and make sure the instance has an admin: the
-- earliest account is promoted if nobody is an admin yet.

insert into public.profiles (id, email, full_name, role)
select u.id,
       coalesce(u.email, ''),
       nullif(u.raw_user_meta_data ->> 'full_name', ''),
       'member'::public.app_role
  from auth.users u
 where not exists (
         select 1 from public.profiles p where p.id = u.id
       )
on conflict (id) do nothing;

update public.profiles
   set role = 'admin'
 where id = (
         select p.id
           from public.profiles p
           join auth.users u on u.id = p.id
          order by u.created_at
          limit 1
       )
   and not exists (
         select 1 from public.profiles where role = 'admin'
       );
