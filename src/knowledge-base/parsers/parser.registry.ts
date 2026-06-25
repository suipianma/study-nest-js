import { UnsupportedMediaTypeException } from '@nestjs/common';
import { extname } from 'path';
import { DocxParser } from './docx.parser';
import { DocumentParser } from './parser.interface';
import { PdfParser } from './pdf.parser';
import { TextParser } from './text.parser';

export function resolveParser(
  mimeType: string,
  filename: string,
  parsers: {
    textParser: TextParser;
    pdfParser: PdfParser;
    docxParser: DocxParser;
  },
): DocumentParser {
  const lowerMime = mimeType.toLowerCase();
  const extension = extname(filename).toLowerCase();

  if (
    lowerMime.startsWith('text/') ||
    ['.txt', '.md', '.markdown'].includes(extension)
  ) {
    return parsers.textParser;
  }

  if (lowerMime === 'application/pdf' || extension === '.pdf') {
    return parsers.pdfParser;
  }

  if (
    lowerMime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extension === '.docx'
  ) {
    return parsers.docxParser;
  }

  throw new UnsupportedMediaTypeException('暂不支持该文件类型');
}
