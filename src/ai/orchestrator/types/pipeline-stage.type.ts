import { PipelineContext } from './pipeline-context.type';
import { PipelineInput } from './pipeline-input.type';

export interface PipelineStage {
  readonly name: string;
  execute(ctx: PipelineContext, input: PipelineInput): Promise<void>;
}
