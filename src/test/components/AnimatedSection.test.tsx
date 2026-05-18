import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AnimatedSection, StaggeredContainer } from '@/components/ui/animated-section';

describe('AnimatedSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children', () => {
    render(<AnimatedSection><span>Hello</span></AnimatedSection>);
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('starts with opacity-0 class', () => {
    const { container } = render(<AnimatedSection><span>Test</span></AnimatedSection>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('opacity-0');
  });

  it('becomes visible after delay', () => {
    const { container } = render(<AnimatedSection delay={100}><span>Test</span></AnimatedSection>);
    act(() => { vi.advanceTimersByTime(100); });
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('opacity-100');
  });

  it('becomes visible immediately with 0 delay', () => {
    const { container } = render(<AnimatedSection delay={0}><span>Test</span></AnimatedSection>);
    act(() => { vi.advanceTimersByTime(0); });
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('opacity-100');
  });

  it('applies custom className', () => {
    const { container } = render(<AnimatedSection className="my-class"><span>Test</span></AnimatedSection>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('my-class');
  });

  it('has transition classes', () => {
    const { container } = render(<AnimatedSection><span>Test</span></AnimatedSection>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('transition-all');
  });

  it('has translate-y-2 before visible', () => {
    const { container } = render(<AnimatedSection delay={500}><span>Test</span></AnimatedSection>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('translate-y-2');
  });

  it('has translate-y-0 after visible', () => {
    const { container } = render(<AnimatedSection delay={100}><span>Test</span></AnimatedSection>);
    act(() => { vi.advanceTimersByTime(100); });
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('translate-y-0');
  });
});

describe('StaggeredContainer', () => {
  it('renders children', () => {
    render(<StaggeredContainer><span>Child 1</span><span>Child 2</span></StaggeredContainer>);
    expect(screen.getByText('Child 1')).toBeDefined();
    expect(screen.getByText('Child 2')).toBeDefined();
  });

  it('applies staggered-container class', () => {
    const { container } = render(<StaggeredContainer><span>Test</span></StaggeredContainer>);
    expect(container.querySelector('.staggered-container')).not.toBeNull();
  });

  it('applies custom className', () => {
    const { container } = render(<StaggeredContainer className="extra"><span>Test</span></StaggeredContainer>);
    const div = container.querySelector('.staggered-container') as HTMLElement;
    expect(div.className).toContain('extra');
  });

  it('sets --stagger-ms CSS variable', () => {
    const { container } = render(<StaggeredContainer staggerMs={300}><span>Test</span></StaggeredContainer>);
    const div = container.querySelector('.staggered-container') as HTMLElement;
    expect(div.style.getPropertyValue('--stagger-ms')).toBe('300ms');
  });

  it('uses default staggerMs of 200', () => {
    const { container } = render(<StaggeredContainer><span>Test</span></StaggeredContainer>);
    const div = container.querySelector('.staggered-container') as HTMLElement;
    expect(div.style.getPropertyValue('--stagger-ms')).toBe('200ms');
  });

  it('renders style element', () => {
    const { container } = render(<StaggeredContainer><span>Test</span></StaggeredContainer>);
    const style = container.querySelector('style');
    expect(style).not.toBeNull();
  });
});
