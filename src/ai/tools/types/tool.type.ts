export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Array<{ name: string; description: string; required?: boolean }>;
  execute: (args: Record<string, string>) => Promise<string>;
}

export interface ToolCall {
  tool: string;
  args: Record<string, string>;
  raw: string;
}

export interface ToolCallEvent {
  phase: 'tool_call';
  tool: string;
  args: Record<string, string>;
}

export interface ToolResultEvent {
  phase: 'tool_result';
  tool: string;
  result: string;
  error?: string;
}
