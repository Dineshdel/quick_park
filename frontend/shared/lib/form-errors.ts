import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/shared/lib/api';

/** Maps an API error onto a react-hook-form form: field details to fields, the rest to `root`. */
export function applyApiError<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>) {
  if (err instanceof ApiError) {
    if (err.details?.length) {
      for (const d of err.details) setError(d.path as Path<T>, { message: d.message });
    }
    setError('root', { message: err.message });
  } else {
    setError('root', { message: 'Network error, please try again' });
  }
}
