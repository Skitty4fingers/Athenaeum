import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Check, Copy, ExternalLink, HelpCircle, Smartphone } from 'lucide-react'

import { useAppName, useAuthStore } from '@/stores/auth'
import { basePath } from '@/lib/config'
import { Button } from '@/components/ui/button'

interface AppEntry {
  name: string
  tagline: string
  platforms: { label: string; url: string }[]
}

/**
 * Real, verified links — not guessed from memory. Prices/availability change
 * over time (ShelfPlayer's iOS pricing, whether the official app has an App
 * Store release at all) — worth a periodic recheck rather than assuming
 * these stay accurate forever.
 */
const APPS: AppEntry[] = [
  {
    name: 'Audiobookshelf (official)',
    tagline: 'The project’s own app. Free, open source, Android and iOS.',
    platforms: [
      { label: 'Android — Google Play', url: 'https://play.google.com/store/apps/details?id=com.audiobookshelf.app' },
      { label: 'iOS — TestFlight (no App Store release)', url: 'https://testflight.apple.com/join/wiic7QIW' }
    ]
  },
  {
    name: 'ShelfPlayer',
    tagline: 'A polished native iOS client, built in Swift. One-time purchase.',
    platforms: [{ label: 'iOS — App Store', url: 'https://apps.apple.com/us/app/shelfplayer/id6475221163' }]
  },
  {
    name: 'Absorb',
    tagline: 'Free, cross-platform, no ads or subscriptions. Offline downloads and Android Auto.',
    platforms: [
      { label: 'iOS — App Store', url: 'https://apps.apple.com/gb/app/absorb-for-audiobookshelf/id6760673498' },
      { label: 'Android — Google Play', url: 'https://play.google.com/store/apps/details?id=com.barnabas.absorb' }
    ]
  },
  {
    name: 'SoundLeaf',
    tagline: 'Native iOS client with CarPlay support. Free, with an optional paid theme pack.',
    platforms: [{ label: 'iOS — App Store', url: 'https://apps.apple.com/us/app/soundleaf/id6738635634' }]
  }
]

function getFaq(appName: string): { q: string; a: string }[] {
  return [
    {
      q: "I refreshed the page mid-book and playback stopped — did I lose my spot?",
      a: 'No. The player itself lives only in your browser tab’s memory, so a refresh always drops it, but your position is saved to the server every 15 seconds and on pause. A "Continue listening?" prompt offers to pick the same book back up.'
    },
    {
      q: 'Why can’t I read ebooks or listen to podcasts here?',
      a: `${appName} is deliberately audiobooks-only — that scope decision is documented in the project’s own roadmap. The underlying server still supports both, so any of the compatible mobile apps above will show them if your library has them.`
    },
  {
    q: 'Will the server address above still work if I’m away from home?',
    a: 'Only if this server is reachable from wherever you are — same Wi-Fi, a VPN back to your network, or a domain your household has set up to reach it from outside. If none of those apply, the address only works on your home network.'
  },
  {
    q: 'Can I be signed in on my phone and this browser at the same time?',
    a: 'Yes — sign-ins are independent per device. Playback position stays in sync either way, since it’s saved to the server rather than to any one device.'
  },
  {
    q: "A mobile app is asking for things this page doesn't mention — what do I put?",
    a: 'The three fields above (server address, username, and the password you sign in here with) are everything every one of these apps needs. Anything else they ask for is either optional or app-specific, not something this server requires.'
  }
  ]
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`${label} copied`)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy — your browser may be blocking clipboard access.')
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 text-sm">{value}</code>
        <Button variant="outline" size="icon" onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`} className="shrink-0">
          {copied ? <Check className="size-4 text-playing" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  )
}

export function HelpPage() {
  const appName = useAppName()
  const username = useAuthStore((s) => s.user?.username)
  const serverAddress = `${window.location.origin}${basePath}`
  const faq = getFaq(appName)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </Button>

      <div className="mb-6 flex items-center gap-2.5">
        <HelpCircle className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Help &amp; mobile apps</h1>
      </div>

      {/* Connection info */}
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <Smartphone className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Connect a mobile app</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Enter these into any of the apps below, along with the password you sign in here with.</p>

        <div className="mt-4 space-y-3">
          <CopyField label="Server address" value={serverAddress} />
          {username && <CopyField label="Username" value={username} />}
        </div>

        <p className="mt-3 text-xs text-muted-foreground/70">This address reflects however you're reaching {appName} right now — on the same network as this server, that's usually all a phone on the same Wi-Fi needs too.</p>
      </section>

      {/* Compatible apps */}
      <section className="mt-4 rounded-xl border bg-card p-5">
        <h2 className="text-sm font-medium">Compatible apps</h2>
        <p className="mt-1 text-sm text-muted-foreground">{appName} is a web client for the same audiobookshelf server these apps talk to — any of them work with your account.</p>

        <ul className="mt-4 space-y-3">
          {APPS.map((app) => (
            <li key={app.name} className="rounded-lg border bg-muted/30 p-3.5">
              <p className="text-sm font-medium">{app.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{app.tagline}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {app.platforms.map((p) => (
                  <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent">
                    {p.label}
                    <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className="mt-4 rounded-xl border bg-card p-5">
        <h2 className="text-sm font-medium">Frequently asked questions</h2>
        <div className="mt-3 divide-y">
          {faq.map((item) => (
            <details key={item.q} className="group py-2.5 first:pt-0 last:pb-0">
              <summary className="cursor-pointer list-none text-sm font-medium marker:content-none group-open:text-primary">{item.q}</summary>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
