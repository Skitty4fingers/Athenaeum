#!/usr/bin/env node
// Listens for GitHub's push webhook and, on a push to main, runs the
// local-only `local-deploy.yml` workflow via `act` — rebuilding the fork's
// Docker image and restarting the local container. See the README's
// "Local auto-deploy" section for the full chain (Tailscale Funnel -> this
// receiver -> act -> docker).
//
// Config (all via env, with sane local defaults):
//   PORT                default 9001
//   WEBHOOK_SECRET_FILE default <repo root>/.webhook-secret (gitignored)
//   ACT_ENV_FILE        default <repo root>/.act.local.env  (gitignored)
//   REPO_ROOT           default two directories up from this script

import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = process.env.REPO_ROOT ?? path.resolve(__dirname, '..')
const PORT = Number(process.env.PORT ?? 9001)
const WEBHOOK_SECRET_FILE = process.env.WEBHOOK_SECRET_FILE ?? path.join(REPO_ROOT, '.webhook-secret')
const ACT_ENV_FILE = process.env.ACT_ENV_FILE ?? path.join(REPO_ROOT, '.act.local.env')
const LOG_FILE = path.join(REPO_ROOT, 'audiobookshelf', 'docker-data', 'local-deploy.log')

const secret = readFileSync(WEBHOOK_SECRET_FILE, 'utf8').trim()

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`
  console.log(stamped)
  try {
    appendFileSync(LOG_FILE, stamped + '\n')
  } catch {
    // Best-effort file logging — stdout above is authoritative if this fails.
  }
}

function verifySignature(rawBody, signatureHeader) {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signatureHeader)
  return a.length === b.length && timingSafeEqual(a, b)
}

let deploying = false

function runDeploy() {
  if (deploying) {
    log('Deploy already in progress — skipping this trigger, next push will still catch the latest commit.')
    return
  }
  deploying = true
  log('Push to main verified — running `act workflow_dispatch` for local-deploy.yml')

  const act = spawn('act', ['workflow_dispatch', '-W', '.github/workflows/local-deploy.yml', '--env-file', ACT_ENV_FILE], {
    cwd: REPO_ROOT,
    shell: true
  })
  act.stdout.on('data', (d) => log(`[act] ${d.toString().trimEnd()}`))
  act.stderr.on('data', (d) => log(`[act] ${d.toString().trimEnd()}`))
  act.on('close', (code) => {
    log(`Deploy finished with exit code ${code}`)
    deploying = false
  })
}

const server = createServer((req, res) => {
  // Path-agnostic on purpose: this server has exactly one job, and the
  // reverse proxy in front of it (Tailscale Serve's --set-path mount)
  // strips the /webhook prefix before forwarding, so the request arrives
  // here as POST / rather than POST /webhook.
  if (req.method !== 'POST') {
    res.writeHead(404).end()
    return
  }

  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks)

    if (!verifySignature(rawBody, req.headers['x-hub-signature-256'])) {
      log(`Rejected webhook delivery: bad signature (event=${req.headers['x-github-event']})`)
      res.writeHead(401).end()
      return
    }

    // Respond immediately — GitHub times out deliveries after ~10s, and a
    // full build+redeploy takes much longer than that.
    res.writeHead(202).end()

    const event = req.headers['x-github-event']
    if (event !== 'push') {
      log(`Ignored webhook delivery: event=${event}, not a push`)
      return
    }

    let payload
    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch {
      log('Ignored webhook delivery: could not parse JSON body')
      return
    }

    if (payload.ref !== 'refs/heads/main') {
      log(`Ignored push to ${payload.ref} (not main)`)
      return
    }

    log(`Push to main: ${payload.before?.slice(0, 7)} -> ${payload.after?.slice(0, 7)} by ${payload.pusher?.name}`)
    runDeploy()
  })
})

server.listen(PORT, '127.0.0.1', () => {
  log(`GitHub webhook receiver listening on 127.0.0.1:${PORT}/webhook`)
})
