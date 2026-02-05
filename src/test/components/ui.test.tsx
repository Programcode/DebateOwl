// src/test/components/ui.test.tsx
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock ResizeObserver for Radix UI components
beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
        observe() { }
        unobserve() { }
        disconnect() { }
    };
});
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

describe('UI Components', () => {
    describe('Button', () => {
        it('renders with text', () => {
            render(<Button>Click me</Button>);
            expect(screen.getByText('Click me')).toBeDefined();
        });

        it('handles click events', () => {
            let clicked = false;
            render(<Button onClick={() => { clicked = true; }}>Click</Button>);
            fireEvent.click(screen.getByText('Click'));
            expect(clicked).toBe(true);
        });

        it('renders different variants', () => {
            const { rerender } = render(<Button variant="default">Default</Button>);
            expect(screen.getByText('Default')).toBeDefined();

            rerender(<Button variant="destructive">Destructive</Button>);
            expect(screen.getByText('Destructive')).toBeDefined();

            rerender(<Button variant="outline">Outline</Button>);
            expect(screen.getByText('Outline')).toBeDefined();

            rerender(<Button variant="ghost">Ghost</Button>);
            expect(screen.getByText('Ghost')).toBeDefined();
        });

        it('renders different sizes', () => {
            const { rerender } = render(<Button size="sm">Small</Button>);
            expect(screen.getByText('Small')).toBeDefined();

            rerender(<Button size="lg">Large</Button>);
            expect(screen.getByText('Large')).toBeDefined();
        });

        it('can be disabled', () => {
            render(<Button disabled>Disabled</Button>);
            expect(screen.getByText('Disabled')).toBeDisabled();
        });
    });

    describe('Input', () => {
        it('renders with placeholder', () => {
            render(<Input placeholder="Enter text..." />);
            expect(screen.getByPlaceholderText('Enter text...')).toBeDefined();
        });

        it('handles value changes', () => {
            render(<Input data-testid="input" />);
            const input = screen.getByTestId('input') as HTMLInputElement;
            fireEvent.change(input, { target: { value: 'test value' } });
            expect(input.value).toBe('test value');
        });

        it('can be disabled', () => {
            render(<Input disabled data-testid="input" />);
            expect(screen.getByTestId('input')).toBeDisabled();
        });

        it('renders different types', () => {
            const { rerender } = render(<Input type="text" data-testid="input" />);
            expect(screen.getByTestId('input')).toHaveAttribute('type', 'text');

            rerender(<Input type="password" data-testid="input" />);
            expect(screen.getByTestId('input')).toHaveAttribute('type', 'password');

            rerender(<Input type="email" data-testid="input" />);
            expect(screen.getByTestId('input')).toHaveAttribute('type', 'email');
        });
    });

    describe('Card', () => {
        it('renders card with all parts', () => {
            render(
                <Card>
                    <CardHeader>
                        <CardTitle>Title</CardTitle>
                        <CardDescription>Description</CardDescription>
                    </CardHeader>
                    <CardContent>Content</CardContent>
                    <CardFooter>Footer</CardFooter>
                </Card>
            );
            expect(screen.getByText('Title')).toBeDefined();
            expect(screen.getByText('Description')).toBeDefined();
            expect(screen.getByText('Content')).toBeDefined();
            expect(screen.getByText('Footer')).toBeDefined();
        });

        it('renders card without optional parts', () => {
            render(
                <Card>
                    <CardContent>Only content</CardContent>
                </Card>
            );
            expect(screen.getByText('Only content')).toBeDefined();
        });
    });

    describe('Badge', () => {
        it('renders with text', () => {
            render(<Badge>New</Badge>);
            expect(screen.getByText('New')).toBeDefined();
        });

        it('renders different variants', () => {
            const { rerender } = render(<Badge variant="default">Default</Badge>);
            expect(screen.getByText('Default')).toBeDefined();

            rerender(<Badge variant="secondary">Secondary</Badge>);
            expect(screen.getByText('Secondary')).toBeDefined();

            rerender(<Badge variant="destructive">Destructive</Badge>);
            expect(screen.getByText('Destructive')).toBeDefined();

            rerender(<Badge variant="outline">Outline</Badge>);
            expect(screen.getByText('Outline')).toBeDefined();
        });
    });

    describe('Textarea', () => {
        it('renders with placeholder', () => {
            render(<Textarea placeholder="Enter message..." />);
            expect(screen.getByPlaceholderText('Enter message...')).toBeDefined();
        });

        it('handles value changes', () => {
            render(<Textarea data-testid="textarea" />);
            const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;
            fireEvent.change(textarea, { target: { value: 'test message' } });
            expect(textarea.value).toBe('test message');
        });
    });

    describe('Label', () => {
        it('renders with text', () => {
            render(<Label>Field Label</Label>);
            expect(screen.getByText('Field Label')).toBeDefined();
        });

        it('associates with input via htmlFor', () => {
            render(
                <>
                    <Label htmlFor="test-input">Label</Label>
                    <Input id="test-input" />
                </>
            );
            expect(screen.getByLabelText('Label')).toBeDefined();
        });
    });

    describe('Tabs', () => {
        it('renders with tabs and content', () => {
            render(
                <Tabs defaultValue="tab1">
                    <TabsList>
                        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
                        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
                    </TabsList>
                    <TabsContent value="tab1">Content 1</TabsContent>
                    <TabsContent value="tab2">Content 2</TabsContent>
                </Tabs>
            );
            expect(screen.getByText('Tab 1')).toBeDefined();
            expect(screen.getByText('Tab 2')).toBeDefined();
            expect(screen.getByText('Content 1')).toBeDefined();
        });

        it('sets initial tab as active', () => {
            render(
                <Tabs defaultValue="tab1">
                    <TabsList>
                        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
                        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
                    </TabsList>
                    <TabsContent value="tab1">Content 1</TabsContent>
                    <TabsContent value="tab2">Content 2</TabsContent>
                </Tabs>
            );
            // Tab 1 should be active by default
            expect(screen.getByText('Tab 1').getAttribute('data-state')).toBe('active');
            // Tab 2 should be inactive by default
            expect(screen.getByText('Tab 2').getAttribute('data-state')).toBe('inactive');
        });
    });

    describe('Switch', () => {
        it('renders in off state', () => {
            render(<Switch data-testid="switch" />);
            expect(screen.getByTestId('switch')).toBeDefined();
        });

        it('toggles on click', () => {
            let checked = false;
            render(<Switch onCheckedChange={(v) => { checked = v; }} data-testid="switch" />);
            fireEvent.click(screen.getByTestId('switch'));
            expect(checked).toBe(true);
        });
    });

    describe('Slider', () => {
        it('renders with default value', () => {
            render(<Slider defaultValue={[50]} max={100} step={1} data-testid="slider" />);
            expect(screen.getByTestId('slider')).toBeDefined();
        });
    });

    describe('Progress', () => {
        it('renders with value', () => {
            render(<Progress value={75} data-testid="progress" />);
            expect(screen.getByTestId('progress')).toBeDefined();
        });

        it('renders at 0%', () => {
            render(<Progress value={0} data-testid="progress" />);
            expect(screen.getByTestId('progress')).toBeDefined();
        });

        it('renders at 100%', () => {
            render(<Progress value={100} data-testid="progress" />);
            expect(screen.getByTestId('progress')).toBeDefined();
        });
    });

    describe('Separator', () => {
        it('renders horizontal separator', () => {
            render(<Separator data-testid="separator" />);
            expect(screen.getByTestId('separator')).toBeDefined();
        });

        it('renders vertical separator', () => {
            render(<Separator orientation="vertical" data-testid="separator" />);
            expect(screen.getByTestId('separator')).toBeDefined();
        });
    });

    describe('ScrollArea', () => {
        it('renders with content', () => {
            render(
                <ScrollArea data-testid="scroll-area">
                    <div>Scrollable content</div>
                </ScrollArea>
            );
            expect(screen.getByText('Scrollable content')).toBeDefined();
        });
    });

    describe('Skeleton', () => {
        it('renders loading skeleton', () => {
            render(<Skeleton data-testid="skeleton" className="w-[100px] h-[20px]" />);
            expect(screen.getByTestId('skeleton')).toBeDefined();
        });
    });
});
