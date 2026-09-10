-- Execute once in the SQL Editor of your Supabase project.
-- All access is enforced in PostgreSQL and private Storage, not by UI visibility.
create table public.admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
create policy admins_read_self on public.admins for select to authenticated using (user_id = (select auth.uid()));
grant select on public.admins to authenticated;
revoke insert, update, delete on public.admins from anon, authenticated;

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table public.projects (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(title) between 1 and 120),
 category text not null check (category in ('Cozinhas','Quartos','Salas','Escritórios')),
 description text not null check (char_length(description) between 1 and 500),
 price_min numeric(12,2) not null check(price_min >= 0),
 price_max numeric(12,2) not null check(price_max >= price_min),
 tone text not null default 'sand' check(tone in ('sand','olive','clay','walnut')),
 created_at timestamptz not null default now()
);
alter table public.projects enable row level security;
create policy projects_read on public.projects for select to anon, authenticated using (true);
create policy projects_insert_admin on public.projects for insert to authenticated with check ((select public.is_admin()));
create policy projects_update_admin on public.projects for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.projects to anon, authenticated;
grant insert on public.projects to authenticated;
revoke update, delete on public.projects from anon, authenticated;
grant update(title,category,description,price_min,price_max,tone) on public.projects to authenticated;

create table public.requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid references public.projects(id) on delete set null,
 customer_name text not null check(char_length(customer_name) between 1 and 100),
 contact text not null check(char_length(contact) between 8 and 30),
 environment text not null check(environment in ('Cozinhas','Quartos','Salas','Escritórios','Outro ambiente')),
 description text not null check(char_length(description) between 20 and 5000),
 status text not null default 'Recebida' check(status in ('Recebida','Em análise','Orçamento enviado','Concluída')),
 created_at timestamptz not null default now()
);
create index requests_owner on public.requests(user_id);
alter table public.requests enable row level security;
create policy requests_read_owner_admin on public.requests for select to authenticated using (user_id=(select auth.uid()) or (select public.is_admin()));
create policy requests_insert_owner on public.requests for insert to authenticated with check (user_id=(select auth.uid()) and status='Recebida');
create policy requests_update_admin on public.requests for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy requests_cleanup_owner on public.requests for delete to authenticated using (user_id=(select auth.uid()) and status='Recebida');
grant select, insert, delete on public.requests to authenticated;
revoke update on public.requests from anon, authenticated;
grant update(status) on public.requests to authenticated;

create table public.request_photos (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.requests(id) on delete cascade,
 path text not null unique check(char_length(path) < 250)
);
create index request_photos_request on public.request_photos(request_id);
alter table public.request_photos enable row level security;
create policy photos_read_owner_admin on public.request_photos for select to authenticated using (
 exists(select 1 from public.requests r where r.id=request_id and (r.user_id=(select auth.uid()) or (select public.is_admin())))
);
create policy photos_insert_owner on public.request_photos for insert to authenticated with check (
 split_part(path,'/',1)=(select auth.uid())::text and split_part(path,'/',2)=request_id::text and
 exists(select 1 from public.requests r where r.id=request_id and r.user_id=(select auth.uid()) and r.status='Recebida')
);
grant select,insert on public.request_photos to authenticated;
revoke update,delete on public.request_photos from anon,authenticated;

create function public.limit_request_photos() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 perform 1 from public.requests where id=new.request_id for update;
 if (select count(*) from public.request_photos where request_id=new.request_id)>=5 then
  raise exception 'Maximum five photos per request';
 end if;
 return new;
end;
$$;
create trigger limit_request_photos before insert on public.request_photos for each row execute function public.limit_request_photos();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('request-photos','request-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy storage_upload_owner on storage.objects for insert to authenticated with check (
 bucket_id='request-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and
 exists(select 1 from public.requests r where r.id::text=(storage.foldername(name))[2] and r.user_id=(select auth.uid()) and r.status='Recebida')
);
create policy storage_read_owner_admin on storage.objects for select to authenticated using (
 bucket_id='request-photos' and exists(select 1 from public.requests r where r.id::text=(storage.foldername(name))[2] and r.user_id::text=(storage.foldername(name))[1] and (r.user_id=(select auth.uid()) or (select public.is_admin())))
);
create policy storage_cleanup_owner on storage.objects for delete to authenticated using (
 bucket_id='request-photos' and (storage.foldername(name))[1]=(select auth.uid())::text
);

