import 'reflect-metadata';
import { CAPABILITIES, CAPABILITIES_KEY } from '../../common/authz';
import { DeclarationsController } from './declarations.controller';

describe('DeclarationsController authorization', () => {
  it('requires declaration management for create and lifecycle routes', () => {
    expect(Reflect.getMetadata(CAPABILITIES_KEY, DeclarationsController.prototype.create)).toContain(CAPABILITIES.DECLARATION_MANAGE);
    expect(Reflect.getMetadata(CAPABILITIES_KEY, DeclarationsController.prototype.setStatus)).toContain(CAPABILITIES.DECLARATION_MANAGE);
    expect(Reflect.getMetadata(CAPABILITIES_KEY, DeclarationsController.prototype.createVersion)).toContain(CAPABILITIES.DECLARATION_MANAGE);
    expect(Reflect.getMetadata(CAPABILITIES_KEY, DeclarationsController.prototype.getByOrg)).toContain(CAPABILITIES.DECLARATION_MANAGE);
  });

  it('leaves trainee pending and acceptance routes available to authenticated users', () => {
    expect(Reflect.getMetadata(CAPABILITIES_KEY, DeclarationsController.prototype.getPending)).toBeUndefined();
    expect(Reflect.getMetadata(CAPABILITIES_KEY, DeclarationsController.prototype.accept)).toBeUndefined();
  });
});
