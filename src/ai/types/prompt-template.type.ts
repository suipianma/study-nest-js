export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  role: string;
  task: string;
  contextLabel: string;
  contextPlaceholder?: string;
  constraints: string[];
  outputFormat: string;
}

export interface PromptTemplateListItem {
  id: string;
  name: string;
  description: string;
  contextLabel: string;
  contextPlaceholder?: string;
}
