-- ============================================================
-- Schéma Matube — à coller dans Supabase (SQL Editor > New query)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Profils (un profil par utilisateur, lié à auth.users)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_url text,
  bio text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Les profils sont visibles par tous"
  on public.profiles for select
  using (true);

create policy "Un utilisateur modifie uniquement son propre profil"
  on public.profiles for update
  using (auth.uid() = id);

-- Création automatique du profil à l'inscription
-- (le nom d'utilisateur est passé dans les options.data.username lors du signUp)
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'utilisateur_' || substr(new.id::text, 1, 8))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Vidéos
-- ------------------------------------------------------------
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'Tout',
  video_url text not null,
  thumbnail_url text,
  duration_seconds int not null default 0,
  views_count bigint not null default 0,
  likes_count bigint not null default 0,
  created_at timestamptz not null default now()
);

create index videos_category_idx on public.videos (category);
create index videos_user_id_idx on public.videos (user_id);
create index videos_created_at_idx on public.videos (created_at desc);

alter table public.videos enable row level security;

create policy "Les vidéos sont visibles par tous"
  on public.videos for select
  using (true);

create policy "Un utilisateur publie ses propres vidéos"
  on public.videos for insert
  with check (auth.uid() = user_id);

create policy "Un utilisateur modifie ou supprime ses propres vidéos"
  on public.videos for update using (auth.uid() = user_id);

create policy "Un utilisateur supprime ses propres vidéos"
  on public.videos for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Likes
-- ------------------------------------------------------------
create table public.likes (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

alter table public.likes enable row level security;

create policy "Les likes sont visibles par tous"
  on public.likes for select using (true);

create policy "Un utilisateur gère ses propres likes"
  on public.likes for insert with check (auth.uid() = user_id);

create policy "Un utilisateur retire ses propres likes"
  on public.likes for delete using (auth.uid() = user_id);

-- Maintenir videos.likes_count à jour automatiquement
create function public.handle_like_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.videos set likes_count = likes_count + 1 where id = new.video_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.videos set likes_count = greatest(likes_count - 1, 0) where id = old.video_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger on_like_change
  after insert or delete on public.likes
  for each row execute function public.handle_like_change();

-- ------------------------------------------------------------
-- Abonnements (subscriber s'abonne à channel)
-- ------------------------------------------------------------
create table public.subscriptions (
  subscriber_id uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscriber_id, channel_id),
  check (subscriber_id <> channel_id)
);

alter table public.subscriptions enable row level security;

create policy "Les abonnements sont visibles par tous"
  on public.subscriptions for select using (true);

create policy "Un utilisateur gère ses propres abonnements"
  on public.subscriptions for insert with check (auth.uid() = subscriber_id);

create policy "Un utilisateur retire ses propres abonnements"
  on public.subscriptions for delete using (auth.uid() = subscriber_id);

-- ------------------------------------------------------------
-- Vues
-- ------------------------------------------------------------
create table public.views (
  id bigint generated always as identity primary key,
  video_id uuid not null references public.videos(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index views_video_id_idx on public.views (video_id);

alter table public.views enable row level security;

create policy "Tout le monde peut enregistrer une vue"
  on public.views for insert with check (true);

create policy "Un utilisateur voit uniquement les vues de ses propres vidéos"
  on public.views for select
  using (
    exists (
      select 1 from public.videos
      where videos.id = views.video_id and videos.user_id = auth.uid()
    )
  );

-- Maintenir videos.views_count à jour automatiquement
create function public.handle_new_view()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.videos set views_count = views_count + 1 where id = new.video_id;
  return new;
end;
$$;

create trigger on_new_view
  after insert on public.views
  for each row execute function public.handle_new_view();
