import { Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import { DocumentParser, ParsedDocument } from './parser.interface';

@Injectable()
export class DocxParser implements DocumentParser {
  async parse(fileBuffer: Buffer): Promise<ParsedDocument> {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return {
      text: result.value ?? '',
    };
  }
}
