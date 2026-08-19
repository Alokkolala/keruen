import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, TabBar, TitleBar, Button } from '../ui/Shell'
import { Icon } from '../ui/Icon'
import { api } from '../lib/data'

const EXAMPLES = [
  '3 тонны стройматериала из Актау в Шетпе к пятнице',
  '2 тонны оборудования Жанаозен — Актау, нужны двое грузчиков',
]

interface Parsed {
  cargo: string | null
  weight_t: number | null
  from_id: string | null
  to_id: string | null
  loaders: number
  deadline_hint: string | null
  raw_text: string
}

export default function NewOrder() {
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const recRef = useRef<any>(null)

  function toggleVoice() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) {
      setError('Браузер не поддерживает распознавание речи — напишите текстом')
      return
    }
    if (listening) {
      recRef.current?.stop()
      return
    }
    const rec = new SR()
    rec.lang = 'ru-RU'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e: any) => {
      const said = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join(' ')
      setText(said)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  async function submit() {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const parsed = await api<Parsed>('parse', { text })
      sessionStorage.setItem('keruen:draft', JSON.stringify(parsed))
      nav('/confirm')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <Header />
      <TitleBar title="Новый заказ" sub="Опишите груз текстом или голосом" />

      <section className="card p-3">
        <div className="bg-bg relative rounded-[18px] p-3.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Нужно отправить 3 т стройматериалов из Актау в Шетпе завтра утром"
            className="placeholder:text-muted w-full resize-none bg-transparent pr-12 text-[14px] leading-5 outline-none"
          />
          <button
            onClick={toggleVoice}
            aria-label="Продиктовать"
            className={`absolute top-2.5 right-2.5 flex h-11 w-11 items-center justify-center rounded-full shadow-[0_2px_10px_rgb(0_0_0/0.1)] transition ${
              listening ? 'bg-yellow scale-110' : 'bg-card'
            }`}
          >
            <Icon name="mic" size={20} />
          </button>
          <div className="bg-card text-muted mt-2 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px]">
            <Icon name="wave" size={14} className={listening ? 'text-yellow-ink animate-pulse' : ''} />
            {listening ? 'Слушаю…' : 'или продиктуйте голосом'}
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <img src="/assets/ill-truck-boxes.png" alt="" className="h-24 w-[150px] object-contain" />
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => setText(e)}
            className="bg-card text-muted rounded-full px-3 py-2 text-left text-[11.5px]"
          >
            {e}
          </button>
        ))}
      </div>

      {error && <p className="text-[12.5px] text-red-600">{error}</p>}

      <Button onClick={submit} disabled={busy || !text.trim()}>
        {busy ? 'Разбираю заявку…' : 'Продолжить'}
      </Button>

      <TabBar role="shipper" />
    </div>
  )
}
