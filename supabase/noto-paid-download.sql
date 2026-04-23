-- Supabase storage bucket for Noto downloads
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

