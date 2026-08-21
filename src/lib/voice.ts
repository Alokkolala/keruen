import { useCallback, useRef, useState } from 'react'
import { api } from './data'

/**
 * Голосовой ввод двумя путями.
 *
 * Web Speech API даёт текст прямо во время речи — это красиво и бесплатно,
 * но его нет в Safari на iPhone: там кнопка микрофона молча ничего не делала.
 * Поэтому если его нет — пишем звук через MediaRecorder и расшифровываем на
 * сервере. Заодно это единственный путь для казахского: Web Speech его не знает.
 */

type State = 'idle' | 'listening' | 'transcribing'

// Что браузер реально умеет писать: Chrome отдаёт webm, Safari — mp4.
function pickMime(): { mime: string; format: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates: [string, string][] = [
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/webm', 'webm'],
    ['audio/mp4', 'mp4'],
    ['audio/aac', 'aac'],
    ['audio/ogg;codecs=opus', 'ogg'],
  ]
  for (const [mime, format] of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, format }
  }
  return null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('не смог прочитать запись'))
    r.onload = () => {
      const s = String(r.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.readAsDataURL(blob)
  })
}

export function useVoice(onText: (text: string) => void) {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<any>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  const stop = useCallback(() => {
    recognition.current?.stop()
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }, [])

  const start = useCallback(async () => {
    setError(null)

    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (SR) {
      const rec = new SR()
      rec.lang = 'ru-RU'
      rec.interimResults = true
      rec.continuous = false
      rec.onresult = (e: any) => {
        const said = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join(' ')
        onText(said)
      }
      rec.onerror = (e: any) => {
        // no-speech и aborted — не ошибки, человек просто промолчал.
        if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') {
          setError('Не расслышал — попробуйте ещё раз или напишите текстом')
        }
        setState('idle')
      }
      rec.onend = () => setState('idle')
      recognition.current = rec
      setState('listening')
      rec.start()
      return
    }

    // Safari на iPhone: пишем и расшифровываем на сервере.
    const picked = pickMime()
    if (!picked || !navigator.mediaDevices?.getUserMedia) {
      setError('Браузер не умеет записывать звук — напишите текстом')
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Нужен доступ к микрофону')
      return
    }

    const rec = new MediaRecorder(stream, { mimeType: picked.mime })
    chunks.current = []
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)

    rec.onstop = async () => {
      // Дорожку надо закрыть, иначе на телефоне остаётся гореть индикатор.
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks.current, { type: picked.mime })
      if (blob.size < 2000) {
        setState('idle')
        setError('Слишком коротко — скажите фразу целиком')
        return
      }
      setState('transcribing')
      try {
        const audio = await blobToBase64(blob)
        const r = await api<{ text: string; note?: string }>('transcribe', {
          audio,
          format: picked.format,
        })
        if (r.text) onText(r.text)
        else setError(r.note ?? 'Не разобрал речь')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось расшифровать')
      } finally {
        setState('idle')
      }
    }

    recorder.current = rec
    setState('listening')
    rec.start()
  }, [onText])

  const toggle = useCallback(() => {
    if (state === 'listening') stop()
    else if (state === 'idle') start()
  }, [state, start, stop])

  return { state, error, toggle, clearError: () => setError(null) }
}
