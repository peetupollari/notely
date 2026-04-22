create table if not exists public.noto_download_purchases (
    stripe_checkout_session_id text primary key,
    customer_email text not null,
    stripe_customer_id text,
    stripe_payment_intent_id text,
    stripe_payment_link_id text,
    amount_total integer,
    currency text,
    checkout_status text not null default 'open',
    payment_status text not null default 'unpaid',
    has_download_access boolean not null default false,
    livemode boolean not null default false,
    checkout_created_at timestamptz,
    paid_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    raw_checkout_session jsonb not null default '{}'::jsonb
);

create index if not exists noto_download_purchases_email_idx
    on public.noto_download_purchases (lower(customer_email));

create index if not exists noto_download_purchases_paid_email_idx
    on public.noto_download_purchases (lower(customer_email))
    where has_download_access;

alter table public.noto_download_purchases enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_proc
        where proname = 'set_noto_download_purchases_updated_at'
          and pronamespace = 'public'::regnamespace
    ) then
        create function public.set_noto_download_purchases_updated_at()
        returns trigger
        language plpgsql
        as $fn$
        begin
            new.updated_at := timezone('utc', now());
            return new;
        end;
        $fn$;
    end if;
end;
$$;

drop trigger if exists set_noto_download_purchases_updated_at on public.noto_download_purchases;

create trigger set_noto_download_purchases_updated_at
before update on public.noto_download_purchases
for each row
execute function public.set_noto_download_purchases_updated_at();

create or replace function public.get_my_noto_download_access()
returns table (
    email text,
    has_access boolean,
    paid_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
    current_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
    if current_email = '' then
        raise exception 'email_required';
    end if;

    return query
    select
        current_email,
        exists (
            select 1
            from public.noto_download_purchases purchases
            where lower(purchases.customer_email) = current_email
              and purchases.has_download_access
        ),
        (
            select max(purchases.paid_at)
            from public.noto_download_purchases purchases
            where lower(purchases.customer_email) = current_email
              and purchases.has_download_access
        );
end;
$$;

grant execute on function public.get_my_noto_download_access() to authenticated;

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'noto-downloads',
    'noto-downloads',
    false,
    500000000,
    array[
        'application/octet-stream',
        'application/vnd.microsoft.portable-executable',
        'application/x-msdownload'
    ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
