# Icons on cards: where they come from and what their licences ask

A card can carry one icon, beside its name (journey J36). They come from two sources:

- [theSVG](https://thesvg.org) (`@thesvg/static` on npm, MIT for its code), which records a
  licence for every icon. The app ships only the icons listed in
  `apps/web/tech-icons.allow.json`.
- Cloudflare's own documentation, for Cloudflare's products (R2, D1, KV and the like), which
  theSVG does not have: `apps/web/tech-icons-cloudflare/`, see "Cloudflare" below.

## What is in

Made by `apps/web/scripts/tech-icons-allow.mjs` from theSVG's manifest at the tag of the npm
version (5,943 icons at 4.0.14):

| Set | Icons | Licence | What it asks |
| --- | --- | --- | --- |
| Brands and tools | 4,274 | CC0-1.0 (3,409), MIT (760), Apache-2.0 (92), BSD (13) | Nothing, or keeping the licence text: `tech-icons/NOTICE.txt` |
| Community | 52 | Apache-2.0, MIT, BSD-3-Clause, CC0-1.0 | The same |
| AWS Architecture Icons | 739 | CC BY-ND 2.0 | Name the source; **pass them on unchanged** |
| Azure | 626 | MIT, as theSVG publishes them | Keep the licence text |
| Google Cloud | 214 | Apache-2.0 | Keep the licence text |
| Kubernetes | 38 | Apache-2.0 | Keep the licence text |
| Cloudflare products | 125 | CC BY 4.0, from Cloudflare | Name the source and the licence, say what was changed (nothing) |

## Cloudflare

The icons Cloudflare's documentation shows beside its products, from
[cloudflare/cloudflare-docs](https://github.com/cloudflare/cloudflare-docs), folder `src/icons`,
at the commit named in `apps/web/tech-icons-cloudflare/SOURCE.json`. Fetched by
`apps/web/scripts/cloudflare-icons.mjs <commit>`, which checks every file against the id the
repository lists for it; a test checks the same on every run. In the library they are named
`cf-<file>` and form a set of their own.

- **The grant** (README of that repository, read 2026-11-25): "Except as otherwise noted,
  Cloudflare and any contributors grant you a license to the Cloudflare Developer Documentation
  and other content in this repository under the Creative Commons Attribution 4.0 International
  Public License". CC BY 4.0 lets the files be copied and passed on, also changed and for money,
  with a credit: who made them, the licence, the source, and whether they were changed. The
  credit is in `tech-icons/NOTICE.txt` and in the icon picker.
- **What it does not grant** (same README): "The licenses for this project do not grant you
  rights to use any Cloudflare names, logos, or trademarks." An icon on a card says "this runs
  on R2", which names the product and claims nothing more; no licence covers that, here as for
  every other brand's icon.
- **Left out:** the marks of other owners that the docs show (Devin, Pulumi, Terraform, Google
  Tag Gateway) and Cloudflare's own logo, which is a logo and comes from theSVG.
- **The icons keep CC BY 4.0**, not the Apache-2.0 of the app's code: the repository's `NOTICE`
  says so.

## What is left out, on purpose

- Icons theSVG marks as trademark or brand use only, fair use, proprietary, custom or unknown
  (about 600, OpenAI's logo among them): no licence lets us pass the file on.
- Icons under GPL, AGPL, MPL or share-alike licences: their terms reach further than a picture.
- Flags and sign-in badges: nobody attaches them to a card.

## Rules that keep the licences

1. **Never change an icon.** Not its colours, not its shape, no cropping. The app shows the
   file as it is, as an `<img>`, on a white chip in both themes. CC BY-ND forbids changed
   copies, and brand guidelines ask the same.
   Where the set has several drawings of one icon, the app may pick among them (the one
   for a light ground where the usual one is white, `forLightGround` in
   `apps/web/tech-icons.vite.ts`); it still shows that file as it is.
2. **Only icons of the two lists are served** (`tech-icons.vite.ts`): theSVG's allow-list and
   Cloudflare's `SOURCE.json`. To add one, run the script of its source again (against a newer
   theSVG, or a newer commit of Cloudflare's docs); never copy an icon in by hand.
3. **The notice goes out with the icons**: `tech-icons/NOTICE.txt` in every build, and a line in
   the icon picker with each icon's licence on hover.
4. **Icons say what something is made with or runs on.** They are not the app's own logo and
   stand for no endorsement. Names and logos stay trademarks of their owners, whatever the
   file's licence says.
5. **Upgrading `@thesvg/static`** means running the script with the manifest of the same version
   and reading the diff of the allow-list: a licence may have changed.

## Not checked by us

- That AWS publishes its icons under CC BY-ND 2.0 is theSVG's statement. AWS's own page says
  customers and partners may use the icons to draw architecture diagrams, which is what a card's
  icon does.
- That the Azure icons are MIT is theSVG's statement too. Microsoft's own terms for its icon
  download allow them in architecture diagrams and forbid changing them; the rules above keep
  to that as well.
- Whether Cloudflare sees these drawings as logos. Most are plain glyphs (a bucket for R2, a
  cylinder for D1); Workers' and Pages' are the products' marks. Cloudflare's trademark page asks
  for written permission to use its logos and names no diagram use. Asking costs a mail to
  Cloudflare's press address.
- When the app goes to other people, a lawyer's look at this page is cheap.
