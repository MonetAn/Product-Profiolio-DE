import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DescriptionMarkdownProps {
  content: string;
  className?: string;
}

/** Renders initiative description with basic Markdown (bold, italic, links, lists). */
export function DescriptionMarkdown({ content, className }: DescriptionMarkdownProps) {
  return (
    <div className={`description-content ${className ?? ''}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
