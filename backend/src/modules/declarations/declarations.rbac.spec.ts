import { CAPABILITIES, ROLE_CAPABILITIES, capabilityAllowedInContext } from '../../common/authz';

describe('Declaration management authorization', () => {
  it('grants declaration management only to platform and hospital training administration', () => {
    expect(ROLE_CAPABILITIES.hospital_training_admin).toContain(CAPABILITIES.DECLARATION_MANAGE);
    expect(ROLE_CAPABILITIES.platform_owner).toContain(CAPABILITIES.DECLARATION_MANAGE);
    expect(ROLE_CAPABILITIES.system_admin).toContain(CAPABILITIES.DECLARATION_MANAGE);
    expect(ROLE_CAPABILITIES.trainee).not.toContain(CAPABILITIES.DECLARATION_MANAGE);
    expect(ROLE_CAPABILITIES.trainer).not.toContain(CAPABILITIES.DECLARATION_MANAGE);
    expect(ROLE_CAPABILITIES.academic_affairs).not.toContain(CAPABILITIES.DECLARATION_MANAGE);
  });

  it('allows the capability only from a hospital or platform context', () => {
    expect(capabilityAllowedInContext(CAPABILITIES.DECLARATION_MANAGE, 'hospital')).toBe(true);
    expect(capabilityAllowedInContext(CAPABILITIES.DECLARATION_MANAGE, 'platform')).toBe(true);
    expect(capabilityAllowedInContext(CAPABILITIES.DECLARATION_MANAGE, 'cluster')).toBe(false);
    expect(capabilityAllowedInContext(CAPABILITIES.DECLARATION_MANAGE, 'university')).toBe(false);
  });
});
