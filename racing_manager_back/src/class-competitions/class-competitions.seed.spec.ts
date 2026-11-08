import { fieldForSeeding } from './class-competitions.service';

describe('fieldForSeeding', () => {
  it('seeds a standalone final with every participant (mass start)', () => {
    expect(
      fieldForSeeding(null, [], ['registration-1', 'registration-2']),
    ).toEqual(['registration-1', 'registration-2']);
  });

  it('de-duplicates participants for a standalone final', () => {
    expect(fieldForSeeding(null, [], ['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('keeps the qualified field when a source stage exists', () => {
    expect(
      fieldForSeeding(
        { sourceStageId: 'sf', qualifierStatus: 'QQ' },
        ['qualified-1'],
        ['qualified-1', 'other'],
      ),
    ).toEqual(['qualified-1']);
  });
});
