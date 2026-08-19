-- KERUEN — схема. Выполнить целиком в Supabase → SQL Editor.
-- Безопасно перезапускать: всё через drop/create.

drop table if exists offers cascade;
drop table if exists legs cascade;
drop table if exists orders cascade;
drop table if exists carriers cascade;
drop table if exists points cascade;

-- Точка на карте. kind различает межгород и адрес внутри города:
-- заказ хранит плечи между точками, поэтому внутригородская доставка —
-- это просто заказ из одного короткого плеча.
create table points (
  id         text primary key,
  name       text not null,
  kind       text not null default 'settlement', -- city | settlement | address
  parent_id  text references points(id),
  lat        double precision not null,
  lon        double precision not null
);

create table carriers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  vehicle     text not null,
  body        text not null,          -- тент | борт | реф
  capacity_t  numeric not null,
  rating      numeric not null default 4.8,
  base_id     text references points(id),
  free_from   timestamptz,            -- когда освободится
  free_at_id  text references points(id), -- и где
  online      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table orders (
  id            uuid primary key default gen_random_uuid(),
  raw_text      text,                 -- что сказал отправитель
  cargo         text,
  weight_t      numeric,
  from_id       text references points(id),
  to_id         text references points(id),
  from_address  text,
  to_address    text,
  loaders       int not null default 0,
  deadline      timestamptz,
  status        text not null default 'draft',
  -- draft | searching | negotiating | assigned | in_transit | done | cancelled
  distance_km   numeric,
  duration_min  numeric,
  fuel_cost     numeric,
  price_min     numeric,
  price_max     numeric,
  price_final   numeric,
  weather       jsonb,
  agent_log     jsonb not null default '[]'::jsonb,
  carrier_id    uuid references carriers(id),
  empty_km      numeric,              -- сколько порожних убрали этой сделкой
  created_at    timestamptz not null default now()
);

-- Плечо маршрута. Заказ = список плеч, а не пара откуда/куда.
create table legs (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references orders(id) on delete cascade,
  seq          int not null,
  from_id      text references points(id),
  to_id        text references points(id),
  distance_km  numeric,
  duration_min numeric,
  source       text not null default 'osrm', -- osrm | estimate
  loaded       boolean not null default true
);

-- Предложение агента перевозчику + торг.
create table offers (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references orders(id) on delete cascade,
  carrier_id   uuid references carriers(id),
  price        numeric not null,
  counter      numeric,
  status       text not null default 'sent', -- sent | countered | accepted | declined
  reason       text,                          -- почему агент выбрал этого
  created_at   timestamptz not null default now()
);

create index on orders (status);
create index on offers (order_id);
create index on legs (order_id);

-- Демо без логина: открываем чтение и запись всем.
-- Для продакшена сюда придёт auth.uid() — сейчас это осознанное упрощение.
alter table points   enable row level security;
alter table carriers enable row level security;
alter table orders   enable row level security;
alter table legs     enable row level security;
alter table offers   enable row level security;

create policy demo_all on points   for all using (true) with check (true);
create policy demo_all on carriers for all using (true) with check (true);
create policy demo_all on orders   for all using (true) with check (true);
create policy demo_all on legs     for all using (true) with check (true);
create policy demo_all on offers   for all using (true) with check (true);

-- Realtime: два телефона видят одно состояние.
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table offers;

-- Точки Мангистау (реальные координаты)
insert into points (id, name, kind, lat, lon) values
  ('aktau',      'Актау',          'city',       43.6410, 51.1980),
  ('shetpe',     'Шетпе',          'settlement', 44.1667, 52.1167),
  ('beineu',     'Бейнеу',         'settlement', 45.3167, 55.2000),
  ('zhanaozen',  'Жанаозен',       'city',       43.3414, 52.8619),
  ('fort',       'Форт-Шевченко',  'settlement', 44.5089, 50.2653),
  ('sai-utes',   'Сай-Утес',       'settlement', 44.3167, 54.0333),
  ('munaily',    'Мунайлы',        'settlement', 43.7500, 51.3000),
  ('kuryk',      'Курык',          'settlement', 43.1911, 51.6522),
  ('taushyk',    'Таушык',         'settlement', 44.3167, 51.3000),
  ('zhetybai',   'Жетыбай',        'settlement', 43.5833, 52.0833);

insert into carriers (name, vehicle, body, capacity_t, rating, base_id, online) values
  ('Ерлан Т.',  'ГАЗель Next', 'тент', 5,  4.9, 'aktau',     true),
  ('Нурлан С.', 'Isuzu Forward','борт', 8,  4.7, 'aktau',     true),
  ('Даурен К.', 'КамАЗ 65117', 'борт', 15, 4.6, 'zhanaozen', true),
  ('Асхат Б.',  'ГАЗель',      'тент', 3,  4.8, 'shetpe',    true),
  ('Марат Ж.',  'Hyundai HD78','реф',  5,  4.9, 'aktau',     true);
