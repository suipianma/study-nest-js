import { Injectable } from '@nestjs/common';
import { RAG_CHUNK_OVERLAP, RAG_CHUNK_SIZE } from './constants';

export interface ChunkPiece {
  index: number;
  content: string;
  start: number;
  end: number;
}

@Injectable()
export class ChunkService {
  split(
    text: string,
    options: { size?: number; overlap?: number } = {},
  ): ChunkPiece[] {
    const raw = text.replace(/\r\n/g, '\n').trim();
    if (!raw) return [];

    const size = Math.max(options.size ?? RAG_CHUNK_SIZE, 200);
    const overlap = Math.max(options.overlap ?? RAG_CHUNK_OVERLAP, 0);

    const paragraphs = this.splitParagraphs(raw);
    const merged = this.mergeParagraphs(paragraphs, size);
    const pieces: string[] = [];

    for (const block of merged) {
      if (block.length <= size) {
        pieces.push(block);
        continue;
      }
      pieces.push(...this.splitLongBlock(block, size, overlap));
    }

    return pieces
      .map((content, index) => content.trim())
      .filter(Boolean)
      .map((content, index) => ({
        index,
        content,
        start: 0,
        end: content.length,
      }));
  }

  /** 按空行/单换行拆段落，保留章节标题行 */
  private splitParagraphs(text: string): string[] {
    const lines = text.split('\n');
    const paragraphs: string[] = [];
    let buffer: string[] = [];

    const flush = () => {
      const joined = buffer.join('\n').trim();
      if (joined) paragraphs.push(joined);
      buffer = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flush();
        continue;
      }

      const isHeading =
        /^第[一二三四五六七八九十百\d]+[章节篇]/.test(trimmed) ||
        /^[一二三四五六七八九十]+[、.]/.test(trimmed) ||
        /^(\d+(\.\d+)*[、.\s])/.test(trimmed);

      if (isHeading && buffer.length > 0) {
        flush();
      }

      buffer.push(trimmed);
    }
    flush();

    return paragraphs.length > 0 ? paragraphs : [text];
  }

  /** 将短段落合并到接近目标长度，避免碎片化 */
  private mergeParagraphs(paragraphs: string[], size: number): string[] {
    const result: string[] = [];
    let buffer = '';

    const flush = () => {
      if (buffer.trim()) result.push(buffer.trim());
      buffer = '';
    };

    for (const paragraph of paragraphs) {
      if (!buffer) {
        buffer = paragraph;
        continue;
      }

      const candidate = `${buffer}\n\n${paragraph}`;
      if (candidate.length <= size) {
        buffer = candidate;
      } else {
        flush();
        buffer = paragraph;
      }
    }
    flush();

    return result;
  }

  /** 超长段落按句号拆分，仍超长则回退字符窗 */
  private splitLongBlock(
    block: string,
    size: number,
    overlap: number,
  ): string[] {
    const sentences = block.split(/(?<=[。！？；\n])/);
    const result: string[] = [];
    let buffer = '';

    const flush = () => {
      if (!buffer.trim()) return;
      if (buffer.length <= size) {
        result.push(buffer.trim());
      } else {
        result.push(...this.splitByWindow(buffer, size, overlap));
      }
      buffer = '';
    };

    for (const sentence of sentences) {
      if (!sentence) continue;
      const candidate = buffer + sentence;
      if (candidate.length <= size) {
        buffer = candidate;
      } else {
        flush();
        buffer = sentence;
      }
    }
    flush();

    return result;
  }

  private splitByWindow(
    text: string,
    size: number,
    overlap: number,
  ): string[] {
    const effectiveOverlap = Math.min(overlap, size - 1);
    const step = Math.max(size - effectiveOverlap, 1);
    const result: string[] = [];

    for (let start = 0; start < text.length; start += step) {
      const end = Math.min(start + size, text.length);
      const content = text.slice(start, end).trim();
      if (content) result.push(content);
      if (end >= text.length) break;
    }

    return result;
  }
}
