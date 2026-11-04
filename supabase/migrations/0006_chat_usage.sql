-- 0012 chat assistant: daily question counts for the chat Edge Function. Run after 0005_city_webcams.sql.
-- No conversation is stored anywhere. A row holds only a key (a user id, a salted SHA-256 of the visitor's IP, or
-- 'global' for the site-wide cap), a UTC date and a count. Only the service role reads or writes it, through the two
-- functions below; signed-in users and visitors have no access at all.

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

-- Takes one question for p_key on today's UTC date, only if the key is under p_limit and the global row is under
-- p_global_limit. Both rows are locked in a fixed order (global first), so concurrent calls queue and can't overshoot.
-- Returns one row: ok, the key's count after the call, and which limit was hit ('limit', 'busy' or null).
create function public.chat_take(p_key text, p_limit int, p_global_limit int)
returns table (ok boolean, used integer, hit text)
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  g integer;
  k integer;
begin
  insert into public.chat_usage (key, day) values ('global', today), (p_key, today) on conflict do nothing;
  select c.count into g from public.chat_usage c where c.key = 'global' and c.day = today for update;
  select c.count into k from public.chat_usage c where c.key = p_key and c.day = today for update;
  if k >= p_limit then
    return query select false, k, 'limit'::text;
    return;
  end if;
  if g >= p_global_limit then
    return query select false, k, 'busy'::text;
    return;
  end if;
  update public.chat_usage c set count = c.count + 1 where c.key = 'global' and c.day = today;
  update public.chat_usage c set count = c.count + 1 where c.key = p_key and c.day = today returning c.count into k;
  return query select true, k, null::text;
end;
$$;

revoke execute on function public.chat_take(text, int, int) from public, anon, authenticated;
grant execute on function public.chat_take(text, int, int) to service_role;

-- Gives back a question taken today (the Workers AI call failed): one off the key's row and the global row, never
-- below 0. Returns the key's count after the call.
create function public.chat_refund(p_key text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  k integer;
begin
  update public.chat_usage c set count = greatest(c.count - 1, 0) where c.key = 'global' and c.day = today;
  update public.chat_usage c set count = greatest(c.count - 1, 0) where c.key = p_key and c.day = today returning c.count into k;
  return coalesce(k, 0);
end;
$$;

revoke execute on function public.chat_refund(text) from public, anon, authenticated;
grant execute on function public.chat_refund(text) to service_role;
