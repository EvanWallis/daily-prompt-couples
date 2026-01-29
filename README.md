# Daily Prompt (Couples)

One shared prompt per day. Two one‑sentence answers revealed only after both submit.

## Setup
1. Create a Supabase project.
2. Enable **Email** provider in Auth (magic link).
3. In Auth settings, add redirect URLs:
   - `http://localhost:3000/today`
   - `https://your-vercel-domain.vercel.app/today`
4. Create the tables + RLS policies below.
5. Copy `.env.example` → `.env.local` and fill in values.
6. Run locally: `npm install` then `npm run dev`.

## Supabase SQL
Run these in the SQL editor:

```sql
-- tables
create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  join_code text unique,
  user_a uuid not null,
  user_b uuid,
  created_at timestamp with time zone default now()
);

create table if not exists public.daily_prompt (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references public.pairs(id) on delete cascade,
  date text not null,
  tone text not null,
  less_therapy boolean not null default false,
  prompt text not null,
  created_at timestamp with time zone default now(),
  unique (pair_id, date)
);

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references public.pairs(id) on delete cascade,
  date text not null,
  user_id uuid not null,
  answer text not null,
  created_at timestamp with time zone default now(),
  unique (pair_id, date, user_id)
);

-- RLS
alter table public.pairs enable row level security;
alter table public.daily_prompt enable row level security;
alter table public.responses enable row level security;

create policy "Pairs are visible to members"
  on public.pairs for select
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "Pairs insert by auth user"
  on public.pairs for insert
  with check (auth.uid() = user_a);

create policy "Pairs update by members"
  on public.pairs for update
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "Daily prompt visible to members"
  on public.daily_prompt for select
  using (
    exists (
      select 1 from public.pairs
      where pairs.id = daily_prompt.pair_id
        and (pairs.user_a = auth.uid() or pairs.user_b = auth.uid())
    )
  );

create policy "Daily prompt insert by members"
  on public.daily_prompt for insert
  with check (
    exists (
      select 1 from public.pairs
      where pairs.id = daily_prompt.pair_id
        and (pairs.user_a = auth.uid() or pairs.user_b = auth.uid())
    )
  );

create policy "Responses visible to members"
  on public.responses for select
  using (
    exists (
      select 1 from public.pairs
      where pairs.id = responses.pair_id
        and (pairs.user_a = auth.uid() or pairs.user_b = auth.uid())
    )
  );

create policy "Responses insert by members"
  on public.responses for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.pairs
      where pairs.id = responses.pair_id
        and (pairs.user_a = auth.uid() or pairs.user_b = auth.uid())
    )
  );

create policy "Responses update by owner"
  on public.responses for update
  using (auth.uid() = user_id);
```

## Environment variables (Vercel)
Set these for Production + Preview:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
