import { z } from 'zod';

export const SafeWebUrlSchema = z.string().url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  },
  'URLs must use http or https',
);
