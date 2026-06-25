import { Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { DocumentParser, ParsedDocument } from './parser.interface';

@Injectable()
export class PdfParser implements DocumentParser {
  async parse(fileBuffer: Buffer): Promise<ParsedDocument> {
    const parser = new PDFParse({ data: fileBuffer });
    const result = await parser.getText();
    await parser.destroy();

    const pages =
      result.pages
        ?.map((item) => ({
          page: item.num,
          text: item.text?.trim() ?? '',
        }))
        .filter((item) => item.text.length > 0) ?? [];

    return {
      text: result.text ?? '',
      pages: pages.length > 0 ? pages : undefined,
    };
  }
}
