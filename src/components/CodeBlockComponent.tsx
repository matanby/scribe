import React, { useState } from 'react';
import { NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react';
import { Check, Copy, ChevronDown, Code } from 'lucide-react';

export const CodeBlockComponent: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
}) => {
  const [copied, setCopied] = useState(false);
  const currentLanguage = node.attrs.language || 'auto';

  const handleCopy = () => {
    navigator.clipboard.writeText(node.textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const languages = [
    'auto',
    'typescript',
    'javascript',
    'python',
    'bash',
    'shell',
    'json',
    'yaml',
    'sql',
    'html',
    'css',
    'rust',
    'go',
    'c',
    'cpp',
    'swift',
    'java',
    'kotlin',
    'markdown'
  ];

  return (
    <NodeViewWrapper className="relative group my-4 rounded-xl overflow-hidden border border-[var(--border-color)] bg-[#18181c] text-[#e4e4e7] shadow-sm select-none font-mono">
      {/* Code Block Header */}
      <div 
        contentEditable={false}
        className="flex items-center justify-between px-3.5 py-1.5 bg-[#121215] border-b border-white/5 text-xs text-gray-400 select-none"
      >
        <div className="flex items-center gap-1.5">
          <Code size={12} className="text-amber-500" />
          <div className="relative flex items-center">
            <select
              value={currentLanguage}
              onChange={(e) => updateAttributes({ language: e.target.value === 'auto' ? null : e.target.value })}
              className="bg-transparent text-gray-300 hover:text-white text-[11px] font-mono font-medium focus:outline-none cursor-pointer pr-4 appearance-none capitalize"
            >
              {languages.map(lang => (
                <option key={lang} value={lang} className="bg-[#18181c] text-gray-200">
                  {lang}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="pointer-events-none -ml-3 text-gray-400" />
          </div>
        </div>

        {/* 1-Click Copy Button */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-white transition-colors px-2 py-0.5 rounded hover:bg-white/10 active:scale-95"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Text Content */}
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono selection:bg-amber-500/30 text-gray-200">
        <NodeViewContent as="code" className={currentLanguage !== 'auto' ? `language-${currentLanguage}` : ''} />
      </pre>
    </NodeViewWrapper>
  );
};
