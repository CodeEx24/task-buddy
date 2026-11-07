import { emailSchema, maskEmail, normalizeOtpInput, otpCodeSchema } from './schema';

describe('emailSchema', () => {
  it.each([
    ['jane@example.com', 'jane@example.com'],
    ['  Jane.Doe@Example.COM ', 'jane.doe@example.com'],
  ])('accepts %p as %p', (input, expected) => {
    expect(emailSchema.parse(input)).toBe(expected);
  });

  it.each(['', 'jane', 'jane@', '@example.com', 'jane@example', `${'a'.repeat(250)}@example.com`])(
    'rejects %p',
    (input) => {
      expect(emailSchema.safeParse(input).success).toBe(false);
    },
  );
});

describe('otpCodeSchema / normalizeOtpInput', () => {
  it('accepts exactly six digits', () => {
    expect(otpCodeSchema.safeParse('123456').success).toBe(true);
    for (const bad of ['12345', '1234567', '12a456', ' 123456', '']) {
      expect(otpCodeSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('strips separators from pasted codes and caps at six digits', () => {
    expect(normalizeOtpInput('123 456')).toBe('123456');
    expect(normalizeOtpInput('12-34-56-78')).toBe('123456');
    expect(normalizeOtpInput('abc')).toBe('');
  });
});

describe('maskEmail', () => {
  it('keeps the first letter and the domain only', () => {
    expect(maskEmail('jane@example.com')).toBe('j•••@example.com');
    expect(maskEmail('not-an-email')).toBe('•••');
  });
});
