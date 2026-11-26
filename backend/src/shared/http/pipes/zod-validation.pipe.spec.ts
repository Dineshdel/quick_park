import { registerSchema } from '@qp/validation';
import { AppException } from '../app-exception';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(registerSchema);

  it('returns parsed (normalised) data', () => {
    const out = pipe.transform({ name: ' Asha ', email: ' A@B.COM ', password: 'tamarind-kite-42', role: 'VEHICLE_OWNER' });
    expect(out).toEqual({ name: 'Asha', email: 'a@b.com', password: 'tamarind-kite-42', role: 'VEHICLE_OWNER' });
  });

  it('throws VALIDATION_FAILED with per-field details', () => {
    try {
      pipe.transform({ email: 'bad' });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppException);
      const err = e as AppException;
      expect(err.getStatus()).toBe(400);
      expect(err.code).toBe('VALIDATION_FAILED');
      expect((err.details as { path: string }[]).map((d) => d.path)).toEqual(
        expect.arrayContaining(['name', 'email', 'password', 'role']),
      );
    }
  });
});
