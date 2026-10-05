// Supabase Edge Function entry for the game API.
//
// The routes, replay engine and signing code live in server/ and are shared
// with the Node entry (server/index.js); this file only hosts them. Requests
// arrive as /api/<route>, so the app is mounted under the function's name.
import './node-globals.ts'
import { createApp } from '../../../server/app.js'

const app = createApp({ basePath: '/api', edge: true })

app.listen(Number(Deno.env.get('PORT') ?? 8000))
