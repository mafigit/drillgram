// A made-up Miro board as Miro's vector PDF export draws one (2026-11-26): the board's grey
// ground, a white frame without its title, filled sticky notes, shapes as outlines, connectors as
// open lines with a filled arrowhead, and captions as free text beside the line. Written here so
// that no binary file is kept; the page is 600 by 400 points, y up as PDF has it.

const CONTENT = `
0.95 0.95 0.95 rg 0 0 600 400 re f
1 1 1 rg 300 60 220 280 re f
1 0.97 0.62 rg 320 260 60 60 re f
1 0.97 0.62 rg 440 260 60 60 re f
0.2 0.2 0.2 RG 0.6 w 380 290 m 434 290 l S
0.2 0.2 0.2 rg 434 287 m 440 290 l 434 293 l h f
0 0 0 RG 0.6 w
130 200 m 130 216.6 116.6 230 100 230 c 83.4 230 70 216.6 70 200 c 70 183.4 83.4 170 100 170 c 116.6 170 130 183.4 130 200 c h S
0.9 0.16 0.06 RG 130 200 m 314 280 l S
0.9 0.16 0.06 rg 313 276 m 320 280 l 313 284 l h f
0 0 0 RG 100 80 m 130 50 l 100 20 l 70 50 l h S
0 0 0 rg
BT /F1 8 Tf 340 287 Td (Cart) Tj ET
BT /F1 8 Tf 462 287 Td (Pay) Tj ET
BT /F1 5 Tf 398 293 Td (Goes to) Tj ET
BT /F1 6 Tf 86 198 Td (Orders DB) Tj ET
BT /F1 6 Tf 88 48 Td (Decide) Tj ET
BT /F1 8 Tf 40 370 Td (Notes for later) Tj ET
`

/** The PDF file, with its cross-reference table, as a PDF reader expects it. */
export function madeUpBoardPdf(): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${CONTENT.length} >>\nstream${CONTENT}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let file = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(file.length)
    file += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = file.length
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) file += `${String(offset).padStart(10, '0')} 00000 n \n`
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(file)
}
