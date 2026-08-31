import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as Sentry from '@sentry/react';
import { describe, expect, it } from 'vitest';
import { STAGING_CAPTURE_POLICY } from '../../playwright.config';

function readProjectFile(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('runtime integration contracts', () => {
  it('uses Sentry SDK capabilities that exist in the installed package', () => {
    expect(typeof Sentry.logger.info).toBe('function');
    expect(typeof Sentry.metrics.count).toBe('function');
    expect(typeof Sentry.metrics.distribution).toBe('function');
  });

  it('disables every authenticated staging browser capture channel', () => {
    expect(STAGING_CAPTURE_POLICY).toEqual({
      trace: 'off',
      screenshot: 'off',
      video: 'off',
    });

    const workflow = readProjectFile('.github/workflows/staging-e2e.yml');
    expect(workflow).not.toContain('actions/upload-artifact');
    expect(workflow).not.toContain('test-results/**/*.webm');
  });

  it('keeps pull-request browser checks separate from Docker publication', () => {
    const workflow = readProjectFile('.github/workflows/deploy.yml');
    const browserJob = workflow.slice(
      workflow.indexOf('  browser-tests:'),
      workflow.indexOf('  docker:'),
    );
    const dockerJob = workflow.slice(workflow.indexOf('  docker:'));

    expect(browserJob).toContain("if: github.event_name == 'pull_request'");
    expect(browserJob).toContain('npm run test:e2e');
    expect(dockerJob).toContain("if: github.event_name != 'pull_request'");
    expect(dockerJob).toContain('needs: quality');
    expect(dockerJob).not.toContain('playwright');
  });
});
