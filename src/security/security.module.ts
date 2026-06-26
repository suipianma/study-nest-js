import { Global, Module } from '@nestjs/common';
import { ContentModerationService } from './content-moderation.service';
import { PromptGuardService } from './prompt-guard.service';

@Global()
@Module({
  providers: [PromptGuardService, ContentModerationService],
  exports: [PromptGuardService, ContentModerationService],
})
export class SecurityModule {}
