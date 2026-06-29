export const RAG_CHUNK_SIZE = 800;
export const RAG_CHUNK_OVERLAP = 120;
/** 最终送入模型的片段数 */
export const RAG_TOP_K = 8;
/** 向量召回候选数（混合检索前先多捞） */
export const RAG_VECTOR_CANDIDATES = 24;
/** 关键词检索最多取多少条候选 */
export const RAG_KEYWORD_TOP_K = 16;
/** 向量相似度下限（提高可减少答非所问） */
export const RAG_SCORE_THRESHOLD = 0.55;
/** 仅关键词命中时的基础分 */
export const RAG_KEYWORD_BASE_SCORE = 0.72;
/** 向量+关键词双命中加分 */
export const RAG_HYBRID_BOOST = 0.12;
export const RAG_MAX_FILE_MB = 20;
export const QDRANT_COLLECTION = 'knowledge_base_chunks';
export const QDRANT_MEMORY_COLLECTION = 'memories';

export type KnowledgeBaseVisibility = 'private' | 'team' | 'public';
