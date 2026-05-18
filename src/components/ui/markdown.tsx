import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <ReactMarkdown
      className={cn('prose prose-sm dark:prose-invert max-w-none break-words', className)}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
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
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
