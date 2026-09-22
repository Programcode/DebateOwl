import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as Sentry from '@sentry/react';
import { describe, expect, it } from 'vitest';
import { STAGING_CAPTURE_POLICY } from '../../playwright.config';

describe('runtime integration contracts', () => {
  it('uses Sentry SDK capabilities that exist in the installed package', () => {
    expect(typeof Sentry.logger.info).toBe('function');
    expect(typeof Sentry.metrics.count).toBe('function');
    expect(typeof Sentry.metrics.distribution).toBe('function');
  });

  // Staging e2e signs in as a real user, so captures would carry that session.
  it('disables every authenticated staging browser capture channel', () => {
    expect(STAGING_CAPTURE_POLICY).toEqual({
      trace: 'off',
      screenshot: 'off',
      video: 'off',
    });

    const workflow = readFileSync(path.resolve(process.cwd(), '.github/workflows/staging-e2e.yml'), 'utf8');
    expect(workflow).not.toContain('actions/upload-artifact');
    expect(workflow).toContain('head_sha=${GITHUB_SHA}&event=push&status=success');
    expect(workflow).toContain('if [ "$successful_runs" -ne 1 ]');
  });
});
