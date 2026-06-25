import { KnowledgeBaseService } from './knowledge-base.service';

describe('KnowledgeBaseService canAccess', () => {
  let service: KnowledgeBaseService;

  beforeEach(() => {
    service = new KnowledgeBaseService({} as any);
  });

  it('private: 仅 owner/admin 可访问', () => {
    const kb = { userId: 10, visibility: 'private' as const };

    expect(
      service.canAccess(kb, { userId: 10, role: 'user' }, 'user'),
    ).toBeTruthy();
    expect(
      service.canAccess(kb, { userId: 99, role: 'admin' }, 'user'),
    ).toBeTruthy();
    expect(
      service.canAccess(kb, { userId: 99, role: 'user' }, 'user'),
    ).toBeFalsy();
  });

  it('team: owner + 同角色 + admin 可访问', () => {
    const kb = { userId: 10, visibility: 'team' as const };

    expect(
      service.canAccess(kb, { userId: 10, role: 'user' }, 'user'),
    ).toBeTruthy();
    expect(
      service.canAccess(kb, { userId: 99, role: 'user' }, 'user'),
    ).toBeTruthy();
    expect(
      service.canAccess(kb, { userId: 99, role: 'admin' }, 'user'),
    ).toBeTruthy();
    expect(
      service.canAccess(kb, { userId: 99, role: 'editor' }, 'user'),
    ).toBeFalsy();
  });

  it('public: 所有登录用户可访问', () => {
    const kb = { userId: 10, visibility: 'public' as const };

    expect(
      service.canAccess(kb, { userId: 22, role: 'user' }, 'user'),
    ).toBeTruthy();
    expect(
      service.canAccess(kb, { userId: 33, role: 'editor' }, 'user'),
    ).toBeTruthy();
  });
});
