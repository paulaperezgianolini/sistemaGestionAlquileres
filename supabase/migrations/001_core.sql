-- Ámbito · Esquema central multiusuario
-- Ejecutar una sola vez en el SQL Editor del proyecto Supabase.

begin;

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.organizations (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Ámbito · Gestión inmobiliaria')
on conflict (id) do nothing;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  email text not null default '',
  full_name text not null default '',
  role text not null default 'operativo' check (role in ('admin','operativo')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_invites (
  email text primary key check (email = lower(email)),
  organization_id uuid not null references public.organizations(id),
  role text not null check (role in ('admin','operativo')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Administradora inicial autorizada por la titular del portal.
insert into public.access_invites (email, organization_id, role, active)
values ('paula.pgianolini@gmail.com', '00000000-0000-4000-8000-000000000001', 'admin', true)
on conflict (email) do update set role = excluded.role, active = true;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  address text not null,
  city text not null default '',
  property_type text not null default 'Departamento',
  bedrooms integer not null default 0 check (bedrooms >= 0),
  parking boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  full_name text not null,
  email text not null default '',
  phone text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  property_id uuid not null references public.properties(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  monthly_rent numeric(14,2) not null check (monthly_rent >= 0),
  adjustment_frequency_months integer not null check (adjustment_frequency_months between 1 and 60),
  last_adjustment_date date,
  due_day integer not null default 10 check (due_day between 1 and 31),
  deposit_amount numeric(14,2) not null default 0 check (deposit_amount >= 0),
  guarantee_type text not null default '',
  guarantee_detail text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  concept text not null check (concept in ('Alquiler','Expensas')),
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  due_date date not null,
  amount numeric(14,2) not null check (amount >= 0),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, concept, period)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  charge_id uuid not null references public.charges(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  paid_date date not null,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  effective_date date not null,
  rate numeric(10,4) not null check (rate >= 0),
  previous_rent numeric(14,2) not null check (previous_rent >= 0),
  new_rent numeric(14,2) not null check (new_rent >= 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id),
  actor_id uuid references auth.users(id) on delete set null,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE','EXPORT')),
  old_data jsonb,
  new_data jsonb,
  occurred_at timestamptz not null default now()
);

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select organization_id from public.profiles where user_id = auth.uid() and active = true $$;

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select role = 'admin' from public.profiles where user_id = auth.uid() and active = true), false) $$;

create or replace function public.set_profile_access(target_user uuid, new_role text, is_active boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.current_user_is_admin() then raise exception 'Acceso denegado'; end if;
  if new_role not in ('admin','operativo') then raise exception 'Rol inválido'; end if;
  update public.profiles
  set role = new_role, active = is_active, updated_at = now()
  where user_id = target_user and organization_id = public.current_organization_id();
end;
$$;

create or replace function public.set_access_invite(target_email text, access_role text, is_active boolean default true)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  normalized_email text := lower(trim(target_email));
begin
  if not public.current_user_is_admin() then raise exception 'Acceso denegado'; end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Correo inválido';
  end if;
  if access_role not in ('admin','operativo') then raise exception 'Rol inválido'; end if;

  insert into public.access_invites (email, organization_id, role, active, created_by)
  values (normalized_email, public.current_organization_id(), access_role, is_active, auth.uid())
  on conflict (email) do update
  set role = excluded.role, active = excluded.active;

  update public.profiles p
  set role = access_role, active = is_active, updated_at = now()
  from auth.users u
  where p.user_id = u.id
    and lower(coalesce(u.email,'')) = normalized_email
    and p.organization_id = public.current_organization_id();

  insert into public.audit_log (organization_id, actor_id, table_name, action, new_data)
  values (
    public.current_organization_id(), auth.uid(), 'access_invites', 'UPDATE',
    jsonb_build_object('email', normalized_email, 'role', access_role, 'active', is_active)
  );
end;
$$;

create or replace function public.log_export(report_name text, filters jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if public.current_organization_id() is null then raise exception 'Acceso denegado'; end if;
  insert into public.audit_log (organization_id, actor_id, table_name, action, new_data)
  values (public.current_organization_id(), auth.uid(), report_name, 'EXPORT', filters);
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  invited_role text;
begin
  select role into invited_role
  from public.access_invites
  where email = lower(coalesce(new.email,'')) and active = true;

  insert into public.profiles (user_id, organization_id, email, full_name, role)
  values (
    new.id,
    '00000000-0000-4000-8000-000000000001',
    lower(coalesce(new.email,'')),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email,''), '@', 1)),
    coalesce(invited_role, 'operativo')
  )
  on conflict (user_id) do nothing;
  if invited_role is null then
    update public.profiles set active = false where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles (user_id, organization_id, email, full_name, role, active)
select id, '00000000-0000-4000-8000-000000000001',
       lower(coalesce(email,'')),
       coalesce(raw_user_meta_data ->> 'full_name', split_part(coalesce(email,''), '@', 1)),
       coalesce((select role from public.access_invites where email = lower(auth.users.email) and active = true), 'operativo'),
       exists(select 1 from public.access_invites where email = lower(auth.users.email) and active = true)
from auth.users
on conflict (user_id) do nothing;

create or replace function public.set_update_metadata()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create or replace function public.set_insert_metadata()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.organization_id = public.current_organization_id();
  new.created_by = auth.uid();
  return new;
end;
$$;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  row_org uuid;
  row_id uuid;
begin
  row_org := coalesce((to_jsonb(new) ->> 'organization_id')::uuid, (to_jsonb(old) ->> 'organization_id')::uuid);
  row_id := coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid);
  insert into public.audit_log (organization_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (row_org, auth.uid(), tg_table_name, row_id, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

do $$
declare table_item text;
begin
  foreach table_item in array array['properties','tenants','contracts','charges'] loop
    execute format('drop trigger if exists set_update_metadata on public.%I', table_item);
    execute format('create trigger set_update_metadata before update on public.%I for each row execute procedure public.set_update_metadata()', table_item);
  end loop;
  foreach table_item in array array['properties','tenants','contracts','charges','receipts','adjustments'] loop
    execute format('drop trigger if exists set_insert_metadata on public.%I', table_item);
    execute format('create trigger set_insert_metadata before insert on public.%I for each row execute procedure public.set_insert_metadata()', table_item);
    execute format('drop trigger if exists audit_row_change on public.%I', table_item);
    execute format('create trigger audit_row_change after insert or update or delete on public.%I for each row execute procedure public.audit_row_change()', table_item);
  end loop;
end $$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.access_invites enable row level security;
alter table public.properties enable row level security;
alter table public.tenants enable row level security;
alter table public.contracts enable row level security;
alter table public.charges enable row level security;
alter table public.receipts enable row level security;
alter table public.adjustments enable row level security;
alter table public.audit_log enable row level security;

revoke all on all tables in schema public from anon;
grant select on public.organizations, public.profiles, public.audit_log to authenticated;
grant select, insert, update, delete on public.access_invites to authenticated;
grant select, insert, update, delete on public.properties, public.tenants, public.contracts, public.charges, public.receipts, public.adjustments to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;
revoke execute on function public.set_profile_access(uuid,text,boolean) from public, anon;
revoke execute on function public.set_access_invite(text,text,boolean) from public, anon;
revoke execute on function public.log_export(text,jsonb) from public, anon;
grant execute on function public.set_profile_access(uuid,text,boolean), public.set_access_invite(text,text,boolean), public.log_export(text,jsonb) to authenticated;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
using (id = public.current_organization_id());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (organization_id = public.current_organization_id());

drop policy if exists access_invites_select on public.access_invites;
create policy access_invites_select on public.access_invites for select to authenticated
using (organization_id = public.current_organization_id() and public.current_user_is_admin());
drop policy if exists access_invites_insert on public.access_invites;
create policy access_invites_insert on public.access_invites for insert to authenticated
with check (organization_id = public.current_organization_id() and public.current_user_is_admin());
drop policy if exists access_invites_update on public.access_invites;
create policy access_invites_update on public.access_invites for update to authenticated
using (organization_id = public.current_organization_id() and public.current_user_is_admin())
with check (organization_id = public.current_organization_id() and public.current_user_is_admin());
drop policy if exists access_invites_delete on public.access_invites;
create policy access_invites_delete on public.access_invites for delete to authenticated
using (organization_id = public.current_organization_id() and public.current_user_is_admin());
do $$
declare table_item text;
begin
  foreach table_item in array array['properties','tenants','contracts','charges','receipts','adjustments'] loop
    execute format('drop policy if exists %I_select on public.%I', table_item, table_item);
    execute format('create policy %I_select on public.%I for select to authenticated using (organization_id = public.current_organization_id())', table_item, table_item);
    execute format('drop policy if exists %I_insert on public.%I', table_item, table_item);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (organization_id = public.current_organization_id())', table_item, table_item);
    execute format('drop policy if exists %I_update on public.%I', table_item, table_item);
    execute format('create policy %I_update on public.%I for update to authenticated using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id())', table_item, table_item);
    execute format('drop policy if exists %I_delete on public.%I', table_item, table_item);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (organization_id = public.current_organization_id() and public.current_user_is_admin())', table_item, table_item);
  end loop;
end $$;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
using (organization_id = public.current_organization_id() and public.current_user_is_admin());

commit;
