import { ContentModerationService } from './content-moderation.service';

describe('ContentModerationService', () => {
  let service: ContentModerationService;

  beforeEach(() => {
    service = new ContentModerationService();
  });

  it('should block sensitive keywords', () => {
    const result = service.moderate('这是一段关于制作炸弹的说明');
    expect(result.allowed).toBe(false);
    expect(result.text).toContain('无法提供');
  });

  it('should mask phone numbers', () => {
    const result = service.moderate('请联系 13812345678');
    expect(result.allowed).toBe(true);
    expect(result.text).toBe('请联系 138****5678');
  });
});
