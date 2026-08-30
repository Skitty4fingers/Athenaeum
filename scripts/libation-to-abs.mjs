#!/usr/bin/env node
/**
 * Convert Libation's Audible metadata sidecars into audiobookshelf metadata.json.
 *
 * Libation writes `<title> [ASIN].metadata.json` next to each book — a raw dump
 * of the Audible product API. Audiobookshelf has its own sidecar scanner but it
 * only looks for a file named exactly `metadata.json`, so Libation's file is
 * ignored and a lot of good metadata never lands.
 *
 * This maps the useful subset into the schema audiobookshelf understands
 * (see server/utils/generators/abmetadataGenerator.js). Because `absMetadata`
 * runs last in the default metadataPrecedence, the generated file wins over
 * both the folder name and the ID3 tags.
 *
 * The big win is series: the sidecar carries `series[].sequence`, so books get
 * a real series *and* an order, which the ID3 SERIES/PART tags get wrong or
 * omit for parts of a set.
 *
 * Usage:
 *   node scripts/libation-to-abs.mjs <library-dir> [--dry-run] [--force]
 *
 *   --dry-run  print what would be written, touch nothing
 *   --force    overwrite an existing metadata.json (default: skip)
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…'
}

/**
 * Audible summaries are HTML. Audiobookshelf sanitises descriptions on scan,
 * but converting to clean text here keeps the stored value readable in any
 * client and avoids markup leaking into list views.
 */
function htmlToText(html) {
  if (typeof html !== 'string' || !html.trim()) return null

  return (
    html
      // Block-level breaks become newlines before tags are stripped.
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*p\s*>/gi, '\n\n')
      .replace(/<\s*\/\s*(div|li|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&([a-z]+);/gi, (match, name) => HTML_ENTITIES[name.toLowerCase()] ?? match)
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || null
  )
}

/** Audible nests genres in category ladders; flatten and de-duplicate. */
function extractGenres(ladders) {
  if (!Array.isArray(ladders)) return []
  const seen = new Set()
  for (const entry of ladders) {
    for (const rung of entry?.ladder ?? []) {
      if (rung?.name) seen.add(rung.name)
    }
  }
  return [...seen]
}

/** `[{ title, sequence }]` -> `["The Mistborn Saga #1"]`, the form abs parses. */
function extractSeries(series) {
  if (!Array.isArray(series)) return []
  return series
    .filter((s) => s?.title)
    .map((s) => {
      const sequence = s.sequence != null && String(s.sequence).trim() !== '' ? String(s.sequence).trim() : null
      return sequence ? `${s.title} #${sequence}` : s.title
    })
}

function titleCaseLanguage(language) {
  if (typeof language !== 'string' || !language) return null
  return language.charAt(0).toUpperCase() + language.slice(1)
}

function convert(sidecar) {
  const issueDate = typeof sidecar.issue_date === 'string' ? sidecar.issue_date : null
  const publishedYear = issueDate && /^\d{4}/.test(issueDate) ? issueDate.slice(0, 4) : null

  const metadata = {
    title: sidecar.title ?? null,
    subtitle: sidecar.subtitle ?? null,
    authors: (sidecar.authors ?? []).map((a) => a?.name).filter(Boolean),
    narrators: (sidecar.narrators ?? []).map((n) => n?.name).filter(Boolean),
    series: extractSeries(sidecar.series),
    genres: extractGenres(sidecar.category_ladders),
    publishedYear,
    publishedDate: issueDate,
    publisher: sidecar.publisher_name ?? null,
    description: htmlToText(sidecar.publisher_summary) ?? htmlToText(sidecar.merchandising_summary),
    asin: sidecar.asin ?? null,
    language: titleCaseLanguage(sidecar.language),
    abridged: sidecar.format_type === 'abridged',
    explicit: sidecar.is_adult_product === true
  }

  // The scanner skips null/undefined, but omitting them keeps the file legible.
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || (Array.isArray(value) && value.length === 0)) delete metadata[key]
  }
  return metadata
}

async function findBookDirs(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const dirs = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    dirs.push(path.join(root, entry.name))
  }
  return dirs
}

async function findSidecar(dir) {
  const files = await readdir(dir)
  // Libation names it "<title> [ASIN].metadata.json"; never match abs's own file.
  return files.filter((f) => f.toLowerCase().endsWith('.metadata.json') && f.toLowerCase() !== 'metadata.json').map((f) => path.join(dir, f))[0]
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  const root = args.find((a) => !a.startsWith('--'))

  if (!root) {
    console.error('Usage: node scripts/libation-to-abs.mjs <library-dir> [--dry-run] [--force]')
    process.exit(1)
  }
  if (!existsSync(root) || !(await stat(root)).isDirectory()) {
    console.error(`Not a directory: ${root}`)
    process.exit(1)
  }

  const dirs = await findBookDirs(root)
  let written = 0
  let skipped = 0
  let missing = 0

  for (const dir of dirs) {
    const name = path.basename(dir)
    const sidecarPath = await findSidecar(dir)

    if (!sidecarPath) {
      console.log(`  –  ${name}\n       no Libation sidecar, skipping`)
      missing++
      continue
    }

    const outPath = path.join(dir, 'metadata.json')
    if (existsSync(outPath) && !force) {
      console.log(`  =  ${name}\n       metadata.json exists, skipping (use --force)`)
      skipped++
      continue
    }

    let sidecar
    try {
      sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'))
    } catch (err) {
      console.error(`  !  ${name}\n       unreadable sidecar: ${err.message}`)
      missing++
      continue
    }

    const metadata = convert(sidecar)
    const summary = [metadata.series?.join(', ') || 'no series', `${metadata.genres?.length ?? 0} genres`, metadata.description ? `${metadata.description.length} char description` : 'no description'].join(' · ')

    console.log(`  ${dryRun ? '?' : '+'}  ${name}\n       ${summary}`)

    if (!dryRun) {
      await writeFile(outPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
    }
    written++
  }

  console.log()
  console.log(dryRun ? `Dry run: ${written} would be written, ${skipped} skipped, ${missing} without sidecar.` : `Wrote ${written} metadata.json file(s), ${skipped} skipped, ${missing} without sidecar.`)
  if (!dryRun && written > 0) {
    console.log('Trigger a forced rescan for audiobookshelf to pick these up.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
