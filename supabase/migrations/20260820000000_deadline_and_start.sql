-- Срок доставки хранится настоящей датой, а не фразой «к пятнице».
-- started_at — момент, когда отправитель подтвердил погрузку.
-- До этого ETA на /track считался от created_at и врал на всё время поиска машины.
alter table orders add column if not exists started_at timestamptz;
