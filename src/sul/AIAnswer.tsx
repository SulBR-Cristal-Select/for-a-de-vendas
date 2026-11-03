import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
/** Markdown sem HTML bruto, mantendo a tipografia e os tokens da SulBR. */
export default function AIAnswer({text}:{text:string}) {
 return <div className="sul-ai-answer text-body"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{table:({children})=><div className="sul-ai-table"><table>{children}</table></div>,a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>}}>{text}</ReactMarkdown></div>;
}
