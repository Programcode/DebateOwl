import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from '@/components/ui/markdown';

describe('Markdown', () => {
  it('renders plain text', () => {
    render(<Markdown>Hello world</Markdown>);
    expect(screen.getByText('Hello world')).toBeDefined();
  });

  it('renders bold text', () => {
    const { container } = render(<Markdown>**bold text**</Markdown>);
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe('bold text');
  });

  it('renders italic text', () => {
    const { container } = render(<Markdown>*italic text*</Markdown>);
    const em = container.querySelector('em');
    expect(em).not.toBeNull();
    expect(em!.textContent).toBe('italic text');
  });

  it('renders unordered lists', () => {
    const { container } = render(<Markdown>{'- item 1\n- item 2'}</Markdown>);
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(2);
  });

  it('renders ordered lists', () => {
    const { container } = render(<Markdown>{'1. first\n2. second'}</Markdown>);
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
  });

  it('renders h1 headings', () => {
    const { container } = render(<Markdown># Heading 1</Markdown>);
    const h1 = container.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1!.textContent).toBe('Heading 1');
  });

  it('renders h2 headings', () => {
    const { container } = render(<Markdown>## Heading 2</Markdown>);
    const h2 = container.querySelector('h2');
    expect(h2).not.toBeNull();
    expect(h2!.textContent).toBe('Heading 2');
  });

  it('renders h3 headings', () => {
    const { container } = render(<Markdown>### Heading 3</Markdown>);
    const h3 = container.querySelector('h3');
    expect(h3).not.toBeNull();
    expect(h3!.textContent).toBe('Heading 3');
  });

  it('renders inline code', () => {
    const { container } = render(<Markdown>Use `code` here</Markdown>);
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe('code');
  });

  it('renders blockquotes', () => {
    const { container } = render(<Markdown>{'> This is a quote'}</Markdown>);
    const blockquote = container.querySelector('blockquote');
    expect(blockquote).not.toBeNull();
  });

  it('renders links', () => {
    const { container } = render(<Markdown>[click here](https://example.com)</Markdown>);
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('https://example.com');
  });

  it('handles empty string', () => {
    const { container } = render(<Markdown>{''}</Markdown>);
    expect(container.querySelector('.prose')).not.toBeNull();
  });

  it('applies custom className', () => {
    const { container } = render(<Markdown className="custom-class">text</Markdown>);
    expect(container.querySelector('.custom-class')).not.toBeNull();
  });

  it('applies prose class by default', () => {
    const { container } = render(<Markdown>text</Markdown>);
    expect(container.querySelector('.prose')).not.toBeNull();
  });

  it('renders multiple paragraphs', () => {
    const { container } = render(<Markdown>{'Paragraph 1\n\nParagraph 2'}</Markdown>);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(2);
  });
});
