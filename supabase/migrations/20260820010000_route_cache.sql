-- Кэш настоящих ответов OSRM, не подмена их числом.
-- Публичный router.project-osrm.org режет запросы из датацентров: с Vercel
-- он отвечает то за 7 секунд, то не отвечает вовсе, и на демо это самое
-- слабое звено. Дорога между Актау и Шетпе между запросами не меняется,
-- поэтому первый успешный ответ сохраняем и переиспользуем.
create table if not exists route_cache (
  from_id      text not null references points(id),
  to_id        text not null references points(id),
  distance_km  numeric not null,
  duration_min numeric not null,
  fetched_at   timestamptz not null default now(),
  primary key (from_id, to_id)
);

alter table route_cache enable row level security;
drop policy if exists demo_all on route_cache;
create policy demo_all on route_cache for all using (true) with check (true);
