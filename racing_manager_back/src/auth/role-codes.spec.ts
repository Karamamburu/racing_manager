import {
  ADMIN_ROLE_CODES,
  RoleCode,
  TIMING_OPERATE_ROLE_CODES,
} from './role-codes';

describe('role codes', () => {
  describe('REFEREE', () => {
    it('is a role code', () => {
      expect(RoleCode.REFEREE).toBe('REFEREE');
    });
  });

  describe('TIMING_OPERATE_ROLE_CODES', () => {
    it('contains REFEREE and ADMINISTRATOR', () => {
      expect(TIMING_OPERATE_ROLE_CODES).toContain(RoleCode.REFEREE);
      expect(TIMING_OPERATE_ROLE_CODES).toContain(RoleCode.ADMINISTRATOR);
    });

    it('does not contain ORGANIZER', () => {
      expect(TIMING_OPERATE_ROLE_CODES).not.toContain(RoleCode.ORGANIZER);
    });

    it('has exactly two entries', () => {
      expect(TIMING_OPERATE_ROLE_CODES).toHaveLength(2);
    });
  });

  describe('ADMIN_ROLE_CODES', () => {
    it('stays unchanged as ADMINISTRATOR and ORGANIZER', () => {
      expect(ADMIN_ROLE_CODES).toEqual([
        RoleCode.ADMINISTRATOR,
        RoleCode.ORGANIZER,
      ]);
    });

    it('does not gain REFEREE', () => {
      expect(ADMIN_ROLE_CODES).not.toContain(RoleCode.REFEREE);
    });
  });
});
