import { Injectable } from '@nestjs/common';
import { DocumentParser, ParsedDocument } from './parser.interface';

@Injectable()
export class TextParser implements DocumentParser {
  async parse(fileBuffer: Buffer): Promise<ParsedDocument> {
    return {
      text: fileBuffer.toString('utf8'),
    };
  }
}
