-- Bound public, read-only share analytics and reject malformed tokens before hashing.
-- Safe to re-run. No data is modified.

create or replace function public._share_ok(t text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  -- admin_create_share_link generates 32 random bytes as 64 lowercase hex characters.
  if t is null then return false; end if;
  if char_length(t) <> 64 then return false; end if;
  if t !~ '^[0-9a-f]{64}$' then return false; end if;
  return exists (
    select 1 from public.admin_share_links
    where token_hash = public._share_hash(t)
      and revoked_at is null
      and expires_at > now()
  );
end;
$$;
revoke all on function public._share_ok(text) from public, anon, authenticated;

create or replace function public.share_registrations_by_day(link_token text, days int default 30)
returns table (day date, registrations bigint)
language plpgsql stable security definer set search_path = public as $$
declare bounded_days int := least(greatest(coalesce(days, 30), 1), 366);
begin
  if not public._share_ok(link_token) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select d::date, count(p.id)
    from generate_series(
      (current_date - (bounded_days - 1))::timestamp,
      current_date::timestamp,
      interval '1 day'
    ) d
    left join public.profiles p on p.created_at::date = d::date
    group by d order by d;
end;
$$;
revoke all on function public.share_registrations_by_day(text, int) from public, anon, authenticated;
grant execute on function public.share_registrations_by_day(text, int) to anon, authenticated;
