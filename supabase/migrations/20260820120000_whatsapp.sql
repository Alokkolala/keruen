-- Телефоны и следы отправки в WhatsApp.

-- Куда писать перевозчику. Номер в любом виде — мост сам приведёт к формату.
alter table carriers add column if not exists phone text;

-- Номер отправителя: его агент даёт перевозчику, чтобы связаться напрямую.
alter table orders add column if not exists contact_phone text;

-- Чтобы не отправить одно и то же дважды при перезапуске моста,
-- и чтобы понять, на какое предложение пришёл ответ «да».
alter table offers add column if not exists wa_chat_id text;
alter table offers add column if not exists wa_sent_at timestamptz;

create index if not exists offers_wa_chat_idx on offers (wa_chat_id, status);

-- Демо-номер проставляется скриптом из окружения: в git номеров нет.
