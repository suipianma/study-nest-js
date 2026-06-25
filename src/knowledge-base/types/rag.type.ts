export interface RagChunk {
  chunkId: number;
  documentId: number;
  documentName: string;
  knowledgeBaseId: number;
  page?: number | null;
  content: string;
  score: number;
}

export interface RagCitation {
  chunkId: number;
  documentName: string;
  page?: number | null;
  snippet: string;
  score: number;
}
