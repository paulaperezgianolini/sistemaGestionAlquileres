-- Ámbito · Complejos, unidades y cocheras
-- Ejecutar una sola vez después de 001_core.sql.

begin;

create extension if not exists btree_gist;

create table if not exists public.complexes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  address text not null default '',
  city text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists complexes_org_name_unique
on public.complexes (organization_id, lower(name));

alter table public.properties
  add column if not exists complex_id uuid references public.complexes(id) on delete restrict;

alter table public.properties
  add column if not exists unit_label text not null default '';

create table if not exists public.parking_spaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  complex_id uuid not null references public.complexes(id) on delete restrict,
  code text not null,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists parking_spaces_complex_code_unique
on public.parking_spaces (organization_id, complex_id, lower(code));

create table if not exists public.parking_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  parking_space_id uuid not null references public.parking_spaces(id) on delete restrict,
  contract_id uuid not null references public.contracts(id) on delete restrict,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.validate_property_complex()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.complex_id is distinct from old.complex_id
     and exists (
       select 1
       from public.contracts ct
       join public.parking_assignments pa on pa.contract_id = ct.id
       where ct.property_id = new.id
     ) then
    raise exception 'No se puede cambiar el complejo de una unidad con historial de cocheras.';
  end if;

  if new.complex_id is not null and not exists (
    select 1 from public.complexes c
    where c.id = new.complex_id
      and c.organization_id = new.organization_id
  ) then
    raise exception 'El complejo seleccionado no pertenece a la organización.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_property_complex on public.properties;
create trigger validate_property_complex
before insert or update on public.properties
for each row execute procedure public.validate_property_complex();

create or replace function public.validate_parking_space_complex()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.complex_id is distinct from old.complex_id
     and exists (
       select 1 from public.parking_assignments pa
       where pa.parking_space_id = new.id
     ) then
    raise exception 'No se puede cambiar el complejo de una cochera con historial de asignaciones.';
  end if;

  if not exists (
    select 1 from public.complexes c
    where c.id = new.complex_id
      and c.organization_id = new.organization_id
  ) then
    raise exception 'El complejo seleccionado no pertenece a la organización.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_parking_space_complex on public.parking_spaces;
create trigger validate_parking_space_complex
before insert or update on public.parking_spaces
for each row execute procedure public.validate_parking_space_complex();

create or replace function public.validate_contract_parking_complex()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_complex uuid;
begin
  select p.complex_id into unit_complex
  from public.properties p
  where p.id = new.property_id
    and p.organization_id = new.organization_id;

  if exists (
    select 1
    from public.parking_assignments pa
    join public.parking_spaces ps on ps.id = pa.parking_space_id
    where pa.contract_id = new.id
      and ps.complex_id is distinct from unit_complex
  ) then
    raise exception 'La nueva unidad no pertenece al complejo de la cochera asignada.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_contract_parking_complex on public.contracts;
create trigger validate_contract_parking_complex
before insert or update on public.contracts
for each row execute procedure public.validate_contract_parking_complex();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'parking_assignments_no_overlap'
      and conrelid = 'public.parking_assignments'::regclass
  ) then
    alter table public.parking_assignments
      add constraint parking_assignments_no_overlap
      exclude using gist (
        parking_space_id with =,
        daterange(start_date, end_date + 1, '[)') with &&
      );
  end if;
end $$;

create or replace function public.validate_parking_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_complex uuid;
  space_complex uuid;
  contract_start date;
  contract_end date;
begin
  select p.complex_id, c.start_date, c.end_date
    into unit_complex, contract_start, contract_end
  from public.contracts c
  join public.properties p on p.id = c.property_id
  where c.id = new.contract_id
    and c.organization_id = new.organization_id
    and p.organization_id = new.organization_id;

  if not found then
    raise exception 'El contrato seleccionado no pertenece a la organización.';
  end if;

  if unit_complex is null then
    raise exception 'La unidad del contrato debe estar vinculada a un complejo.';
  end if;

  select ps.complex_id into space_complex
  from public.parking_spaces ps
  where ps.id = new.parking_space_id
    and ps.organization_id = new.organization_id;

  if not found then
    raise exception 'La cochera seleccionada no pertenece a la organización.';
  end if;

  if unit_complex <> space_complex then
    raise exception 'La cochera y la unidad deben pertenecer al mismo complejo.';
  end if;

  if new.start_date < contract_start or new.end_date > contract_end then
    raise exception 'Las fechas de la cochera deben estar dentro de la vigencia del contrato.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_parking_assignment on public.parking_assignments;
create trigger validate_parking_assignment
before insert or update on public.parking_assignments
for each row execute procedure public.validate_parking_assignment();

do $$
declare table_item text;
begin
  foreach table_item in array array['complexes','parking_spaces','parking_assignments'] loop
    execute format('drop trigger if exists set_update_metadata on public.%I', table_item);
    execute format('create trigger set_update_metadata before update on public.%I for each row execute procedure public.set_update_metadata()', table_item);
    execute format('drop trigger if exists set_insert_metadata on public.%I', table_item);
    execute format('create trigger set_insert_metadata before insert on public.%I for each row execute procedure public.set_insert_metadata()', table_item);
    execute format('drop trigger if exists audit_row_change on public.%I', table_item);
    execute format('create trigger audit_row_change after insert or update or delete on public.%I for each row execute procedure public.audit_row_change()', table_item);
  end loop;
end $$;

alter table public.complexes enable row level security;
alter table public.parking_spaces enable row level security;
alter table public.parking_assignments enable row level security;

grant select, insert, update, delete on
  public.complexes,
  public.parking_spaces,
  public.parking_assignments
to authenticated;

revoke execute on function public.validate_property_complex() from public, anon, authenticated;
revoke execute on function public.validate_parking_space_complex() from public, anon, authenticated;
revoke execute on function public.validate_contract_parking_complex() from public, anon, authenticated;
revoke execute on function public.validate_parking_assignment() from public, anon, authenticated;

do $$
declare table_item text;
begin
  foreach table_item in array array['complexes','parking_spaces','parking_assignments'] loop
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

commit;
