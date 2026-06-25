export interface ParsedPage {
  page: number;
  text: string;
}

export interface ParsedDocument {
  text: string;
  pages?: ParsedPage[];
}

export interface DocumentParser {
  parse(fileBuffer: Buffer): Promise<ParsedDocument>;
}
