/**
 * pptx-core.mjs — build a widescreen PowerPoint package in the browser or in Node.
 *
 * Pure JavaScript: no filesystem, no Node built-ins, no dependencies. The caller supplies the
 * thumbnail bytes, which keeps the same code usable from the CLI and from a static site.
 *
 * A .pptx is a ZIP of OOXML parts. Entries are stored (uncompressed), which every consumer accepts.
 */

const SLIDE_W = 12192000;
const SLIDE_H = 6858000;
const MARGIN = 600000;

const ACCENT = 'FF3D3D';
const INK = 'E9EDF2';
const MUTED = '97A3B2';
const BG = '0B0D10';

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

/* ------------------------------------------------------------------ text helpers */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(text, max) {
  const s = String(text || '').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function run(text, { size = 1400, bold = false, italic = false, color = INK, link = null, underline = false } = {}) {
  const attrs = [
    'lang="en-US"',
    `sz="${size}"`,
    bold ? 'b="1"' : '',
    italic ? 'i="1"' : '',
    underline ? 'u="sng"' : '',
    'dirty="0"',
  ]
    .filter(Boolean)
    .join(' ');
  const linkXml = link ? `<a:hlinkClick r:id="${link}" tooltip="Watch on YouTube"/>` : '';
  return (
    `<a:r><a:rPr ${attrs}>` +
    `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
    `<a:latin typeface="Arial"/><a:cs typeface="Arial"/>` +
    linkXml +
    `</a:rPr><a:t>${esc(text)}</a:t></a:r>`
  );
}

function paragraph(content, { spaceAfter = 0, linePct = 90000, align = 'l' } = {}) {
  return (
    `<a:p><a:pPr algn="${align}">` +
    `<a:lnSpc><a:spcPct val="${linePct}"/></a:lnSpc>` +
    (spaceAfter ? `<a:spcAft><a:spcPts val="${spaceAfter}"/></a:spcAft>` : '') +
    `</a:pPr>${content}</a:p>`
  );
}

function textBox(id, name, x, y, w, h, paragraphs, { anchor = 't' } = {}) {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr>` +
    `<a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
  );
}

function rect(id, name, x, y, w, h, color) {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
  );
}

function picture(id, relId, linkRelId, x, y, w, h, name) {
  const link = linkRelId ? `<a:hlinkClick r:id="${linkRelId}" tooltip="Watch on YouTube"/>` : '';
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(name)}">${link}</p:cNvPr>` +
    `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

/* ------------------------------------------------------------------ slide geometry */

const IMAGE_W = 6300000;
const IMAGE_H = Math.round((IMAGE_W * 9) / 16);
const IMAGE_X = MARGIN;
const IMAGE_Y = Math.round((SLIDE_H - IMAGE_H) / 2);

const TEXT_X = IMAGE_X + IMAGE_W + 420000;
const TEXT_W = SLIDE_W - TEXT_X - MARGIN;
const RULE_X = TEXT_X - 150000;
const RULE_W = 30000;
const RULE_Y = IMAGE_Y;
const RULE_H = IMAGE_H;

/* ------------------------------------------------------------------ parts */

function slideXml(deck, slide, position, total, hasImage) {
  const shapes = [];

  if (hasImage) {
    shapes.push(picture(2, 'rId2', 'rId3', IMAGE_X, IMAGE_Y, IMAGE_W, IMAGE_H, 'Thumbnail'));
  }

  shapes.push(rect(3, 'Accent rule', RULE_X, RULE_Y, RULE_W, RULE_H, ACCENT));

  const kicker = paragraph(
    run(
      `${String(position).padStart(2, '0')} / ${String(total).padStart(2, '0')}   ${truncate(deck.title, 40).toUpperCase()}`,
      { size: 1100, bold: true, color: ACCENT }
    )
  );
  shapes.push(textBox(4, 'Kicker', TEXT_X, IMAGE_Y, TEXT_W, 300000, kicker));

  const titleY = IMAGE_Y + 380000;
  shapes.push(
    textBox(
      5,
      'Title',
      TEXT_X,
      titleY,
      TEXT_W,
      2050000,
      paragraph(run(truncate(slide.title, 180), { size: 2800, bold: true, color: INK }), { linePct: 92000 })
    )
  );

  const metaParts = [slide.author, slide.duration].filter(Boolean);
  const metaY = titleY + 2130000;
  shapes.push(
    textBox(6, 'Channel', TEXT_X, metaY, TEXT_W, 700000, paragraph(run(metaParts.join('  ·  ') || 'YouTube', { size: 1400, color: MUTED })))
  );

  if (slide.note) {
    shapes.push(
      textBox(
        7,
        'Note',
        TEXT_X,
        metaY + 650000,
        TEXT_W,
        900000,
        paragraph(run(truncate(slide.note, 240), { size: 1200, italic: true, color: MUTED }), { linePct: 100000 })
      )
    );
  }

  const linkY = IMAGE_Y + IMAGE_H - 620000;
  shapes.push(
    textBox(
      8,
      'Watch link',
      TEXT_X,
      linkY,
      TEXT_W,
      380000,
      paragraph(run('▶  Watch on YouTube', { size: 1400, bold: true, color: ACCENT, link: 'rId3', underline: true }))
    )
  );
  shapes.push(
    textBox(9, 'URL', TEXT_X, linkY + 420000, TEXT_W, 520000, paragraph(run(slide.url, { size: 1000, color: MUTED })))
  );

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld ${NS}><p:cSld>` +
    `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${BG}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` +
    `<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    shapes.join('') +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

function slideRels(slide, imageName) {
  const rels = [
    `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`,
    imageName ? `<Relationship Id="rId2" Type="${REL}/image" Target="../media/${imageName}"/>` : '',
    `<Relationship Id="rId3" Type="${REL}/hyperlink" Target="${esc(slide.url)}" TargetMode="External"/>`,
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${PKG_REL}">${rels.filter(Boolean).join('')}</Relationships>`
  );
}

function presentationXml(slideCount) {
  const ids = Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentation ${NS} saveSubsetFonts="1">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${ids}</p:sldIdLst>` +
    `<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}" type="screen16x9"/>` +
    `<p:notesSz cx="6858000" cy="9144000"/>` +
    `</p:presentation>`
  );
}

function presentationRels(slideCount) {
  const rels = [`<Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`];
  for (let i = 0; i < slideCount; i++) {
    rels.push(`<Relationship Id="rId${i + 2}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL}">${rels.join('')}</Relationships>`;
}

const EMPTY_TREE =
  `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
  `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>`;

function masterXml() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sldMaster ${NS}><p:cSld>` +
    `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${BG}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` +
    EMPTY_TREE +
    `</p:cSld>` +
    `<p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" ` +
    `accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
    `<p:txStyles>` +
    `<p:titleStyle><a:lvl1pPr><a:defRPr sz="2800" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:lvl1pPr></p:titleStyle>` +
    `<p:bodyStyle><a:lvl1pPr><a:defRPr sz="1400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:lvl1pPr></p:bodyStyle>` +
    `<p:otherStyle><a:lvl1pPr><a:defRPr sz="1400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:lvl1pPr></p:otherStyle>` +
    `</p:txStyles></p:sldMaster>`
  );
}

function layoutXml() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${EMPTY_TREE}</p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  );
}

function themeXml() {
  const fill = `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`;
  const line = `<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Slide Decks">` +
    `<a:themeElements>` +
    `<a:clrScheme name="Slide Decks">` +
    `<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>` +
    `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
    `<a:dk2><a:srgbClr val="0B0D10"/></a:dk2>` +
    `<a:lt2><a:srgbClr val="E9EDF2"/></a:lt2>` +
    `<a:accent1><a:srgbClr val="${ACCENT}"/></a:accent1>` +
    `<a:accent2><a:srgbClr val="FF8A4C"/></a:accent2>` +
    `<a:accent3><a:srgbClr val="45C4B0"/></a:accent3>` +
    `<a:accent4><a:srgbClr val="6FA8FF"/></a:accent4>` +
    `<a:accent5><a:srgbClr val="B08CFF"/></a:accent5>` +
    `<a:accent6><a:srgbClr val="FF6B9A"/></a:accent6>` +
    `<a:hlink><a:srgbClr val="FF6B6B"/></a:hlink>` +
    `<a:folHlink><a:srgbClr val="FF9A9A"/></a:folHlink>` +
    `</a:clrScheme>` +
    `<a:fontScheme name="Slide Decks">` +
    `<a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>` +
    `</a:fontScheme>` +
    `<a:fmtScheme name="Slide Decks">` +
    `<a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst>` +
    `<a:lnStyleLst>${line}${line}${line}</a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst>` +
    `</a:fmtScheme>` +
    `</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
  );
}

function contentTypesXml(slideCount) {
  const slides = Array.from(
    { length: slideCount },
    (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="jpg" ContentType="image/jpeg"/>` +
    `<Default Extension="jpeg" ContentType="image/jpeg"/>` +
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
    slides +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`
  );
}

function rootRelsXml() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${PKG_REL}">` +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`
  );
}

function coreXml(deck) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(deck.title)}</dc:title>` +
    `<dc:description>${esc(deck.description || 'YouTube video slide deck')}</dc:description>` +
    `<dc:creator>YouTube Slide Decks</dc:creator>` +
    `<cp:lastModifiedBy>YouTube Slide Decks</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    `</cp:coreProperties>`
  );
}

function appXml(slideCount) {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>YouTube Slide Decks</Application><Slides>${slideCount}</Slides>` +
    `<PresentationFormat>Widescreen</PresentationFormat></Properties>`
  );
}

function masterRelsXml() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL}">` +
    `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `<Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/>` +
    `</Relationships>`
  );
}

function layoutRelsXml() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL}">` +
    `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
    `</Relationships>`
  );
}

/* ------------------------------------------------------------------ zip (stored) */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

function u16(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function concat(chunks) {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : new Uint8Array(entry.data);
    const crc = crc32(data);

    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0x0021),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
    ]);

    const header = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0x0021),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
    ]);

    parts.push(local, name, data);
    central.push(header, name);
    offset += local.length + name.length + data.length;
  }

  const directory = concat(central);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(directory.length),
    u32(offset),
    u16(0),
  ]);

  return concat([...parts, directory, end]);
}

/* ------------------------------------------------------------------ builder */

/**
 * @param {object} deck deck.json contents
 * @param {(slide: object, index: number) => Promise<Uint8Array|null>} getImage thumbnail bytes
 * @returns {Promise<Uint8Array>} .pptx bytes
 */
export async function buildPptx(deck, getImage) {
  const slides = (deck.slides || []).filter((s) => s && s.videoId);
  const media = [];
  const slideParts = [];

  for (const [i, slide] of slides.entries()) {
    let image = null;
    if (getImage) {
      try {
        const bytes = await getImage(slide, i);
        if (bytes && bytes.length > 1000) image = new Uint8Array(bytes);
      } catch {
        image = null;
      }
    }
    const imageName = image ? `image${i + 1}.jpg` : null;
    if (image) media.push({ name: `ppt/media/${imageName}`, data: image });
    slideParts.push({ name: `ppt/slides/slide${i + 1}.xml`, data: slideXml(deck, slide, i + 1, slides.length, Boolean(image)) });
    slideParts.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: slideRels(slide, imageName) });
  }

  return zip([
    { name: '[Content_Types].xml', data: contentTypesXml(slides.length) },
    { name: '_rels/.rels', data: rootRelsXml() },
    { name: 'docProps/core.xml', data: coreXml(deck) },
    { name: 'docProps/app.xml', data: appXml(slides.length) },
    { name: 'ppt/presentation.xml', data: presentationXml(slides.length) },
    { name: 'ppt/_rels/presentation.xml.rels', data: presentationRels(slides.length) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: masterXml() },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: masterRelsXml() },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: layoutXml() },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: layoutRelsXml() },
    { name: 'ppt/theme/theme1.xml', data: themeXml() },
    ...slideParts,
    ...media,
  ]);
}
