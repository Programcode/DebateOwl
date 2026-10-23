import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  children: string;
  className?: string;
  /** Render inside a line of text (label: value rows): paragraphs become spans. */
  inline?: boolean;
}

export function Markdown({ children, className, inline = false }: MarkdownProps) {
  return (
    <ReactMarkdown
      className={cn(inline ? 'inline wrap-anywhere' : 'prose prose-sm dark:prose-invert max-w-none wrap-break-word wrap-anywhere', className)}
      components={{
        p: ({ children }) => inline ? <span>{children}</span> : <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        h1: ({ children }) => <h1 className="text-lg font-bold mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
        code: ({ children }) => <code className="bg-muted px-1 py-0.5 rounded text-xs">{children}</code>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 italic">{children}</blockquote>,
        // Model output links open beside the app and never leak the referrer.
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 wrap-anywhere">
            {children}
          </a>
        ),
        // Never load an image a model asked for: a prompt-injected source could
        // put the student's work in the image URL and fetch it without a click.
        img: ({ alt, src }) => (
          <a href={src} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 wrap-anywhere">
            {alt || src}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
