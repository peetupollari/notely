-- Safe, additive referral setup for the existing Noto waitlist.
-- This does not delete or truncate anything.

do $$
begin
    if to_regclass('public.waitlist_emails') is null then
        raise exception 'public.waitlist_emails must already exist before running this script.';
    end if;
end;
$$;

alter table public.waitlist_emails
    add column if not exists referred_by_code text,
    add column if not exists referred_by_user_id uuid,
    add column if not exists referred_at timestamptz;

create table if not exists public.waitlist_referrals (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    referral_code text not null unique,
    referral_count integer not null default 0,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.waitlist_referral_events (
    id bigint generated always as identity primary key,
    referrer_user_id uuid not null references auth.users(id) on delete cascade,
    referrer_email text not null,
    referral_code text not null,
    referred_email text not null unique,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists waitlist_referral_events_referrer_user_id_idx
    on public.waitlist_referral_events (referrer_user_id);

create index if not exists waitlist_referral_events_referral_code_idx
    on public.waitlist_referral_events (referral_code);

alter table public.waitlist_referrals enable row level security;
alter table public.waitlist_referral_events enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'waitlist_referrals'
          and policyname = 'waitlist_referrals_select_own'
    ) then
        create policy waitlist_referrals_select_own
            on public.waitlist_referrals
            for select
            to authenticated
            using (auth.uid() = user_id);
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'waitlist_referral_events'
          and policyname = 'waitlist_referral_events_select_own'
    ) then
        create policy waitlist_referral_events_select_own
            on public.waitlist_referral_events
            for select
            to authenticated
            using (auth.uid() = referrer_user_id);
    end if;
end;
$$;

create or replace function public.noto_random_referral_code(code_length integer default 6)
returns text
language plpgsql
set search_path = public
as $$
declare
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    output_code text := '';
    letter_index integer;
begin
    if code_length < 1 then
        raise exception 'code_length must be at least 1';
    end if;

    for letter_index in 1..code_length loop
        output_code := output_code || substr(
            alphabet,
            1 + floor(random() * length(alphabet))::integer,
            1
        );
    end loop;

    return output_code;
end;
$$;

create or replace function public.waitlist_email_exists(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.waitlist_emails
        where lower(email) = lower(trim(check_email))
    );
$$;

create or replace function public.get_or_create_my_referral()
returns table (
    user_id uuid,
    email text,
    referral_code text,
    referral_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    current_user_id uuid := auth.uid();
    current_email text := '';
    referral_row public.waitlist_referrals%rowtype;
    attempt_count integer := 0;
begin
    if current_user_id is null then
        raise exception 'auth_required';
    end if;

    select lower(trim(coalesce(auth_users.email, '')))
    into current_email
    from auth.users as auth_users
    where auth_users.id = current_user_id;

    if coalesce(current_email, '') = '' then
        current_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
    end if;

    if coalesce(current_email, '') = '' then
        raise exception 'email_required';
    end if;

    if not exists (
        select 1
        from public.waitlist_emails
        where lower(waitlist_emails.email) = current_email
    ) then
        raise exception 'waitlist_email_required';
    end if;

    select *
    into referral_row
    from public.waitlist_referrals
    where waitlist_referrals.user_id = current_user_id
       or lower(waitlist_referrals.email) = current_email
    order by case when waitlist_referrals.user_id = current_user_id then 0 else 1 end
    limit 1;

    if found then
        update public.waitlist_referrals
        set email = current_email,
            updated_at = timezone('utc', now())
        where waitlist_referrals.user_id = referral_row.user_id
        returning * into referral_row;

        return query
        select
            referral_row.user_id,
            referral_row.email,
            referral_row.referral_code,
            referral_row.referral_count;
        return;
    end if;

    loop
        attempt_count := attempt_count + 1;

        begin
            insert into public.waitlist_referrals (
                user_id,
                email,
                referral_code
            )
            values (
                current_user_id,
                current_email,
                public.noto_random_referral_code(6)
            )
            returning * into referral_row;

            exit;
        exception
            when unique_violation then
                if attempt_count >= 25 then
                    raise exception 'referral_code_generation_failed';
                end if;
        end;
    end loop;

    return query
    select
        referral_row.user_id,
        referral_row.email,
        referral_row.referral_code,
        referral_row.referral_count;
end;
$$;

create or replace function public.join_waitlist_with_referral(
    waitlist_email text,
    referral_code text default null
)
returns table (
    inserted boolean,
    already_joined boolean,
    referral_applied boolean,
    normalized_email text,
    referrer_user_id uuid,
    referrer_email text,
    applied_referral_code text,
    referral_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    clean_email text := lower(trim(coalesce(waitlist_email, '')));
    clean_code text := nullif(left(upper(regexp_replace(coalesce(referral_code, ''), '[^A-Za-z0-9]', '', 'g')), 6), '');
    referrer_row public.waitlist_referrals%rowtype;
    current_referral_count integer := 0;
    should_apply_referral boolean := false;
begin
    if clean_email = '' then
        raise exception 'valid_email_required';
    end if;

    if clean_code is not null then
        select *
        into referrer_row
        from public.waitlist_referrals
        where waitlist_referrals.referral_code = clean_code;

        if found and lower(referrer_row.email) <> clean_email then
            should_apply_referral := true;
            current_referral_count := referrer_row.referral_count;
        end if;
    end if;

    begin
        insert into public.waitlist_emails (
            email,
            referred_by_code,
            referred_by_user_id,
            referred_at
        )
        values (
            clean_email,
            case when should_apply_referral then referrer_row.referral_code else null end,
            case when should_apply_referral then referrer_row.user_id else null end,
            case when should_apply_referral then timezone('utc', now()) else null end
        );
    exception
        when unique_violation then
            return query
            select
                false,
                true,
                false,
                clean_email,
                referrer_row.user_id,
                referrer_row.email,
                null::text,
                current_referral_count;
            return;
    end;

    if should_apply_referral then
        insert into public.waitlist_referral_events (
            referrer_user_id,
            referrer_email,
            referral_code,
            referred_email
        )
        values (
            referrer_row.user_id,
            referrer_row.email,
            referrer_row.referral_code,
            clean_email
        )
        on conflict (referred_email) do nothing;

        update public.waitlist_referrals as waitlist_referrals_row
        set referral_count = waitlist_referrals_row.referral_count + 1,
            updated_at = timezone('utc', now())
        where waitlist_referrals_row.user_id = referrer_row.user_id
        returning waitlist_referrals_row.referral_count
        into current_referral_count;
    end if;

    return query
    select
        true,
        false,
        should_apply_referral,
        clean_email,
        referrer_row.user_id,
        referrer_row.email,
        case when should_apply_referral then referrer_row.referral_code else null end,
        current_referral_count;
end;
$$;

grant select on public.waitlist_referrals to authenticated;
grant select on public.waitlist_referral_events to authenticated;

grant execute on function public.waitlist_email_exists(text) to anon, authenticated;
grant execute on function public.get_or_create_my_referral() to authenticated;
grant execute on function public.join_waitlist_with_referral(text, text) to anon, authenticated;
