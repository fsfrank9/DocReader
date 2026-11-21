export const ENCODING_OPTIONS = [
  { value: 'auto', label: '自动识别' },
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gb18030', label: 'GBK / GB18030' },
  { value: 'big5', label: 'Big5 繁体中文' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
  { value: 'utf-16be', label: 'UTF-16 BE' },
  { value: 'windows-1252', label: 'Windows-1252' },
  { value: 'shift_jis', label: 'Shift JIS 日文' },
];

const aliases = {
  ascii: 'utf-8',
  'utf-8-sig': 'utf-8',
  'utf-16': 'utf-16le',
  'utf-16-le': 'utf-16le',
  'utf-16-be': 'utf-16be',
  gb2312: 'gb18030',
  gbk: 'gb18030',
  big5hkscs: 'big5',
  'big5-hkscs': 'big5',
  cp932: 'shift_jis',
  cp1252: 'windows-1252',
};

function unicodeEncoding(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';

  // BOM-less UTF-16 English contains zero bytes in every other position.
  const sample = bytes.subarray(0, 512);
  let evenZeros = 0;
  let oddZeros = 0;
  sample.forEach((byte, index) => {
    if (byte === 0) index % 2 ? oddZeros++ : evenZeros++;
  });
  if (oddZeros > sample.length / 8 && evenZeros === 0) return 'utf-16le';
  if (evenZeros > sample.length / 8 && oddZeros === 0) return 'utf-16be';
  return null;
}

export async function decodeText(blob, requestedEncoding = 'auto') {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let encoding = requestedEncoding === 'auto' ? unicodeEncoding(bytes) : requestedEncoding;

  if (!encoding) {
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
    } catch {
      const { detect } = await import('jschardet');
      const result = detect(bytes.subarray(0, 200000), {
        detectEncodings: ['utf-8', 'utf-16-le', 'utf-16-be', 'gb18030', 'big5hkscs', 'cp932', 'windows-1252'],
      });
      encoding = result.encoding?.toLowerCase() || 'gb18030';
    }
  }

  const decoder = new TextDecoder(aliases[encoding.toLowerCase()] || encoding);
  return { text: decoder.decode(bytes), encoding: decoder.encoding };
}
