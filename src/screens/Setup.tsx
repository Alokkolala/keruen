import { Icon } from '../ui/Icon'

const STEPS = [
  {
    title: 'Создать проект в Supabase',
    body: 'supabase.com → New project. Регион ближе к Казахстану — eu-central.',
  },
  {
    title: 'Выполнить схему',
    body: 'SQL Editor → вставить содержимое supabase/schema.sql → Run. Создаст таблицы, точки Мангистау и перевозчиков.',
  },
  {
    title: 'Заполнить .env.local',
    body: 'Скопировать .env.example в .env.local. URL и anon key — в Project Settings → API. Ключ OpenRouter — на openrouter.ai/keys.',
  },
  { title: 'Перезапустить', body: 'npm run dev — Vite подхватывает переменные только при старте.' },
]

export default function Setup() {
  return (
    <div className="screen">
      <header className="flex items-center gap-2 pt-2">
        <img src="/assets/logo-mark.png" alt="" className="h-6 w-9 object-contain" />
        <span className="text-[21px] font-bold tracking-[0.14em]">KERUEN</span>
      </header>

      <section className="card p-4">
        <span className="bg-chip-y text-yellow-ink mb-3 flex h-10 w-10 items-center justify-center rounded-full">
          <Icon name="info" size={22} />
        </span>
        <h1 className="text-[22px] leading-tight font-bold">Осталось подключить базу</h1>
        <p className="text-muted mt-2 text-[13px] leading-[19px]">
          Интерфейс собран, агент готов. Не хватает только ключей — они нигде не зашиты в код
          и живут в <code className="bg-bg rounded px-1">.env.local</code>, который не попадает в git.
        </p>
      </section>

      {STEPS.map((s, i) => (
        <section key={s.title} className="card rise flex gap-3 p-3.5" style={{ animationDelay: `${i * 70}ms` }}>
          <span className="bg-yellow text-ink flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold">
            {i + 1}
          </span>
          <div>
            <p className="text-[14px] font-bold">{s.title}</p>
            <p className="text-muted mt-0.5 text-[12px] leading-[17px]">{s.body}</p>
          </div>
        </section>
      ))}

      <p className="text-muted text-center text-[11px]">
        Нужны: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
      </p>
    </div>
  )
}
