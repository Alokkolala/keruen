import type { Plugin, ViteDevServer } from 'vite'
import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Монтирует функции из /api в дев-сервер Vite, чтобы `npm run dev` работал
 * без Vercel CLI. В проде эти же файлы Vercel поднимает сам.
 */
export function apiPlugin(): Plugin {
  return {
    name: 'keruen-api',
    configureServer(server: ViteDevServer) {
      const dir = resolve(process.cwd(), 'api')
      if (!existsSync(dir)) return
      const routes = readdirSync(dir)
        .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
        .map((f) => f.replace(/\.ts$/, ''))

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const name = url.pathname.replace(/^\/api\//, '')
        if (!url.pathname.startsWith('/api/') || !routes.includes(name)) return next()

        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`)
          const handler = mod.default

          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const bodyText = Buffer.concat(chunks).toString('utf8')

          const fakeReq = Object.assign(req, {
            query: Object.fromEntries(url.searchParams),
            body: bodyText ? JSON.parse(bodyText) : {},
          })
          const fakeRes = Object.assign(res, {
            status(code: number) {
              res.statusCode = code
              return fakeRes
            },
            json(payload: unknown) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(payload))
              return fakeRes
            },
            send(payload: string) {
              res.end(payload)
              return fakeRes
            },
          })

          await handler(fakeReq, fakeRes)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      })
    },
  }
}
