/**
 * Native renderer — still-deck PDF.
 *
 * Writes the multi-page "carousel as a document" export (the LinkedIn document
 * post format the previous engine also produced) without adding a PDF library: a
 * PDF is a small file format, and one JPEG per page via `DCTDecode` is all this
 * needs. Dependency-free and deterministic.
 *
 * Node-only module.
 */

/** A minimal PDF needs a byte length, not a string length. */
const len = (value) => Buffer.byteLength(value, 'latin1');

/**
 * @param {Array<{ jpeg: Buffer, width: number, height: number }>} pages
 * @param {{ title?: string }} options
 * @returns {Buffer} the PDF bytes
 */
export function buildImagePdf(pages, { title = 'Carousel' } = {}) {
  if (!pages.length) throw new Error('A still deck needs at least one page.');
  const chunks = [];
  const offsets = [];
  let cursor = 0;
  const push = (value) => {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1');
    chunks.push(buffer);
    cursor += buffer.length;
  };
  const startObject = (number) => {
    offsets[number] = cursor;
    push(`${number} 0 obj\n`);
  };

  const pageCount = pages.length;
  // Object numbering: 1 catalog, 2 pages, 3 info, then per page: page + image + content.
  const pageObjectNumber = (i) => 4 + i * 3;
  const imageObjectNumber = (i) => 5 + i * 3;
  const contentObjectNumber = (i) => 6 + i * 3;

  push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');

  startObject(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject(2);
  push(`<< /Type /Pages /Count ${pageCount} /Kids [${pages.map((_, i) => `${pageObjectNumber(i)} 0 R`).join(' ')}] >>\nendobj\n`);

  startObject(3);
  push(`<< /Title (${String(title).replace(/[()\\]/g, '')}) /Producer (MavenSync Native Motion) >>\nendobj\n`);

  pages.forEach((page, index) => {
    // A4-ish pages keep the document readable while the image is centred.
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 36;
    const scale = Math.min((pageWidth - margin * 2) / page.width, (pageHeight - margin * 2) / page.height);
    const drawWidth = page.width * scale;
    const drawHeight = page.height * scale;
    const drawX = (pageWidth - drawWidth) / 2;
    const drawY = (pageHeight - drawHeight) / 2;

    startObject(pageObjectNumber(index));
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index} ${imageObjectNumber(index)} 0 R >> >> /Contents ${contentObjectNumber(index)} 0 R >>\nendobj\n`);

    startObject(imageObjectNumber(index));
    push(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
    push(page.jpeg);
    push('\nendstream\nendobj\n');

    const content = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im${index} Do\nQ\n`;
    startObject(contentObjectNumber(index));
    push(`<< /Length ${len(content)} >>\nstream\n${content}endstream\nendobj\n`);
  });

  const xrefOffset = cursor;
  const totalObjects = 4 + pageCount * 3;
  const xref = [`xref\n0 ${totalObjects}\n`, '0000000000 65535 f \n'];
  for (let number = 1; number < totalObjects; number += 1) {
    xref.push(`${String(offsets[number] ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  push(xref.join(''));
  push(`trailer\n<< /Size ${totalObjects} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(chunks);
}
