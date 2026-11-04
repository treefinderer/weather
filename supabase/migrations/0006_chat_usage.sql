-- 0012 chat assistant: daily question counts for the chat Edge Function. Run after 0005_city_webcams.sql.
-- No conversation is stored anywhere. A row holds only a key (a user id, a salted SHA-256 of the visitor's IP,
-- 'global' for the site-wide cap or 'visitors' for the visitors' share of it), a UTC date and a count. Only the
-- service role reads or writes it, through the two functions below; signed-in users and visitors have no access.

-- --- Table ---

create table public.chat_usage (
  key text not null check (char_length(key) between 1 and 100),
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (key, day)
);

-- --- Row Level Security ---
-- Enabled with no policies, and every grant revoked, so anon and authenticated can't select, insert, update or delete.

alter table public.chat_usage enable row level security;
revoke all on public.chat_usage from public, anon, authenticated;

-- --- Functions (service role only) ---

-- Reserved keys: 'global' counts every question, 'visitors' counts questions from visitors who aren't signed in.
-- Neither can collide with a user id (a uuid) or a visitor key (64 hex characters).

-- Takes one question for p_key on today's UTC date, only if the key is under p_limit, the global row is under
-- p_global_limit and, for a visitor (p_visitor_limit not null), the 'visitors' row is under p_visitor_limit. The visitor
-- cap keeps visitors from using up the global cap, so signed-in users can still ask. Rows are always locked in the same
-- order (global, visitors, the key), so concurrent calls queue and can't overshoot.
-- Returns one row: ok, the key's count after the call, and which limit was hit ('limit', 'busy' or null).
create function public.chat_take(p_key text, p_limit int, p_global_limit int, p_visitor_limit int default null)
returns table (ok boolean, used integer, hit text)
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  g integer;
  v integer;
  k integer;
begin
  insert into public.chat_usage (key, day) values ('global', today), (p_key, today) on conflict do nothing;
  if p_visitor_limit is not null then
    insert into public.chat_usage (key, day) values ('visitors', today) on conflict do nothing;
  end if;
  select c.count into g from public.chat_usage c where c.key = 'global' and c.day = today for update;
  if p_visitor_limit is not null then
    select c.count into v from public.chat_usage c where c.key = 'visitors' and c.day = today for update;
  end if;
  select c.count into k from public.chat_usage c where c.key = p_key and c.day = today for update;
  if k >= p_limit then
    return query select false, k, 'limit'::text;
    return;
  end if;
  if g >= p_global_limit or (p_visitor_limit is not null and v >= p_visitor_limit) then
    return query select false, k, 'busy'::text;
    return;
  end if;
  update public.chat_usage c set count = c.count + 1 where c.key = 'global' and c.day = today;
  if p_visitor_limit is not null then
    update public.chat_usage c set count = c.count + 1 where c.key = 'visitors' and c.day = today;
  end if;
  update public.chat_usage c set count = c.count + 1 where c.key = p_key and c.day = today returning c.count into k;
  return query select true, k, null::text;
end;
$$;

revoke execute on function public.chat_take(text, int, int, int) from public, anon, authenticated;
grant execute on function public.chat_take(text, int, int, int) to service_role;

-- Gives back a question taken today (the Workers AI call failed): one off the key's row, the global row and, for a
-- visitor, the 'visitors' row, never below 0. Same lock order as chat_take. Returns the key's count after the call.
create function public.chat_refund(p_key text, p_visitor boolean default false)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  k integer;
begin
  update public.chat_usage c set count = greatest(c.count - 1, 0) where c.key = 'global' and c.day = today;
  if p_visitor then
    update public.chat_usage c set count = greatest(c.count - 1, 0) where c.key = 'visitors' and c.day = today;
  end if;
  update public.chat_usage c set count = greatest(c.count - 1, 0) where c.key = p_key and c.day = today returning c.count into k;
  return coalesce(k, 0);
end;
$$;

revoke execute on function public.chat_refund(text, boolean) from public, anon, authenticated;
grant execute on function public.chat_refund(text, boolean) to service_role;
