# Test audiobooks

Drop Libation output here. This folder is the root of the **Audiobooks** library on the dev server (`D:/Projects/VoxSilo/media/audiobooks`).

It sits outside the `audiobookshelf/` git repo, so nothing you put here will be committed.

## What Libation actually produces

One flat folder per book at the library root — no author or series directories:

```
media/audiobooks/
└── The Final Empire [B002V0QCYU]/
    ├── The Final Empire_ Mistborn Book 1 [B002V0QCYU].mp3
    ├── The Final Empire_ Mistborn Book 1 [B002V0QCYU].jpg
    ├── The Final Empire_ Mistborn Book 1 [B002V0QCYU].metadata.json
    ├── Icon.ico
    └── desktop.ini
```

The folder uses `<title short>` (truncated at the first colon) plus the ASIN; the files use the full title with the colon replaced by an underscore. `Icon.ico` and `desktop.ini` are Windows folder-icon decoration — audiobookshelf ignores them.

**This default layout works well as-is. Do not restructure it.** A flat layout would normally cost you the author, because audiobookshelf's folder parser expects `{Author}/{Book}` — but Libation writes a full ID3 tag set that the scanner reads at higher confidence than the path:

| Tag | Value | Becomes |
| --- | --- | --- |
| `artist` | Brandon Sanderson | Author |
| `composer` | Michael Kramer | Narrator |
| `title` | The Final Empire | Title |
| `SUBTITLE` / `TIT3` | Mistborn Book 1 | Subtitle |
| `SERIES` | The Mistborn Saga | Series |
| `PART` | 1 | Series sequence |
| `publisher` | Macmillan Audio | Publisher |
| `date` | 2008-12-28 | Published date |
| `genre` | Epic, Action & Adventure | Genre |
| `AUDIBLE_ASIN` | B002V0QCYU | ASIN |

Chapters are embedded too (47–143 per book in the current set), so nothing needs a conversion or merge step. `.mp3` is fine; `.m4b` is not required.

### Converting the `.metadata.json` sidecar

Libation writes a full Audible API dump next to each book — `publisher_summary` (a long HTML description), `category_ladders` (genres), and crucially `series[].sequence`. Audiobookshelf ignores it, because its own sidecar scanner looks for a file named exactly `metadata.json` and Libation names its file `<title> [ASIN].metadata.json`.

Run the converter to translate it:

```bash
node scripts/libation-to-abs.mjs "D:/Projects/VoxSilo/media/audiobooks"
```

It writes an abs-format `metadata.json` into each book folder, skipping any that already have one (`--force` to overwrite, `--dry-run` to preview). Because `absMetadata` sits **last** in audiobookshelf's default `metadataPrecedence`, the generated file wins over both the folder name and the ID3 tags. Force a rescan afterwards.

This matters most for **series ordering**. The ID3 `SERIES`/`PART` tags are inconsistent across a set — in this library they put *The Final Empire* in `The Mistborn Saga` but *The Well of Ascension* and *The Hero of Ages* in `The Cosmere`, splitting the trilogy across two series with no usable order. The sidecar's `series[]` array carries the correct series **and** a `sequence`, so after conversion all three land in The Mistborn Saga as #1, #2, #3.

Conversion also recovers the real description, four genres per book instead of one, the publisher, and the publication date.

Re-run it whenever you add books; existing files are left alone.


## Scanning

The watcher is live on this folder, so new books are usually picked up automatically. To force a full rescan:

```bash
curl -X POST "http://localhost:3333/audiobookshelf/api/libraries/$LIB/scan?force=1" -H "Authorization: Bearer $TOKEN"
```

Deleting files does **not** remove the library rows — they are flagged `isMissing` and keep showing in the grid. Clear them with:

```bash
curl -X DELETE "http://localhost:3333/audiobookshelf/api/libraries/$LIB/issues" -H "Authorization: Bearer $TOKEN"
```

ffmpeg and ffprobe are installed: audiobookshelf downloads them itself from ffbinaries on first boot, into `audiobookshelf/`.
