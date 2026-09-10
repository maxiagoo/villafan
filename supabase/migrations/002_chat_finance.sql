-- Apply after schema.sql. Additive migration: preserves all existing records.
begin;
create table public.request_messages (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.requests(id) on delete restrict,
 sender_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 sender_role text not null default case when public.is_admin() then 'admin' else 'client' end check(sender_role in ('admin','client')),
 body text not null check(char_length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index messages_thread on public.request_messages(request_id,created_at,id);
alter table public.request_messages enable row level security;
create policy messages_read_participants on public.request_messages for select to authenticated using (
 exists(select 1 from public.requests r where r.id=request_id and (r.user_id=(select auth.uid()) or (select public.is_admin())))
);
create policy messages_send_participants on public.request_messages for insert to authenticated with check (
 sender_id=(select auth.uid()) and sender_role=case when (select public.is_admin()) then 'admin' else 'client' end and
 exists(select 1 from public.requests r where r.id=request_id and (r.user_id=(select auth.uid()) or (select public.is_admin())))
);
revoke all on public.request_messages from anon,authenticated;
grant select on public.request_messages to authenticated;
grant insert(id,request_id,body) on public.request_messages to authenticated;

create table public.money_movements (
 id uuid primary key default gen_random_uuid(),
 request_id uuid references public.requests(id) on delete restrict,
 direction text not null check(direction in ('entrada','saida')),
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),
 description text not null check(char_length(btrim(description)) between 3 and 300),
 method text not null check(method in ('Pix','Dinheiro','Cartão','Transferência','Outro')),
 occurred_on date not null,
 recorded_at timestamptz not null default now(),
 recorded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 reversal_of uuid unique references public.money_movements(id) on delete restrict,
 reversal_reason text,
 check ((reversal_of is null and reversal_reason is null) or (reversal_of is not null and char_length(btrim(reversal_reason)) between 3 and 300))
);
create index money_date on public.money_movements(occurred_on desc,recorded_at desc);
alter table public.money_movements enable row level security;
create policy money_read_admin on public.money_movements for select to authenticated using ((select public.is_admin()));
-- Writes only through checked RPCs. No UPDATE/DELETE, including for admins.
revoke all on public.money_movements from anon,authenticated;
grant select on public.money_movements to authenticated;

create function public.record_movement(p_id uuid,p_request_id uuid,p_direction text,p_amount_cents bigint,p_description text,p_method text,p_occurred_on date)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.money_movements;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_occurred_on>current_date then raise exception 'Future movements are not allowed'; end if;
 insert into public.money_movements(id,request_id,direction,amount_cents,description,method,occurred_on,recorded_by)
 values(p_id,p_request_id,p_direction,p_amount_cents,btrim(p_description),p_method,p_occurred_on,auth.uid()) on conflict(id) do nothing;
 select * into existing from public.money_movements where id=p_id;
 if existing.reversal_of is not null or existing.recorded_by<>auth.uid() or existing.request_id is distinct from p_request_id or existing.direction<>p_direction or existing.amount_cents<>p_amount_cents or existing.description<>btrim(p_description) or existing.method<>p_method or existing.occurred_on<>p_occurred_on then
  raise exception 'Idempotency conflict: review existing entry';
 end if;
 return existing.id;
end;
$$;

create function public.reverse_movement(p_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare original public.money_movements; reversal_id uuid;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if char_length(btrim(p_reason)) not between 3 and 300 or p_reason is null then raise exception 'Reversal reason required'; end if;
 select * into original from public.money_movements where id=p_id for update;
 if not found then raise exception 'Movement not found'; end if;
 if original.reversal_of is not null then raise exception 'Cannot reverse a reversal'; end if;
 select id into reversal_id from public.money_movements where reversal_of=p_id;
 if found then return reversal_id; end if;
 insert into public.money_movements(request_id,direction,amount_cents,description,method,occurred_on,recorded_by,reversal_of,reversal_reason)
 values(original.request_id,case when original.direction='entrada' then 'saida' else 'entrada' end,original.amount_cents,left('Estorno: '||original.description,300),original.method,current_date,auth.uid(),p_id,btrim(p_reason)) returning id into reversal_id;
 return reversal_id;
end;
$$;

create function public.money_summary() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 return (select jsonb_build_object('income',coalesce(sum(amount_cents) filter(where direction='entrada'),0),'expense',coalesce(sum(amount_cents) filter(where direction='saida'),0),'count',count(*)) from public.money_movements);
end;
$$;
revoke all on function public.record_movement(uuid,uuid,text,bigint,text,text,date) from public;
revoke all on function public.reverse_movement(uuid,text) from public;
revoke all on function public.money_summary() from public;
grant execute on function public.record_movement(uuid,uuid,text,bigint,text,text,date) to authenticated;
grant execute on function public.reverse_movement(uuid,text) to authenticated;
grant execute on function public.money_summary() to authenticated;
commit;
