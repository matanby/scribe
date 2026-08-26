import React, { useState, useRef, useEffect } from 'react';
import { NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react';
import { Check, Copy, ChevronDown, Code, Search } from 'lucide-react';

const LANGUAGES = [
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
  'csharp',
  'swift',
  'java',
  'kotlin',
  'markdown',
  'graphql',
  'diff',
  'ruby',
  'php',
  'lua',
  'r',
  'perl'
];

export const CodeBlockComponent: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
}) => {
  const [copied, setCopied] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const currentLanguage = node.attrs.language || 'auto';

  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setSearchFilter('');
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when opened
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard
      .writeText(node.textContent)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        // Don't claim success when the clipboard write was rejected.
        console.error('Failed to copy code block:', err);
      });
  };

  const handleSelectLanguage = (lang: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    updateAttributes({ language: lang === 'auto' ? null : lang });
    setIsDropdownOpen(false);
    setSearchFilter('');
  };

  const filteredLanguages = LANGUAGES.filter(l => 
    l.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <NodeViewWrapper className="relative my-4 rounded-xl overflow-visible border border-[var(--border-color)] bg-[#18181c] text-[#e4e4e7] shadow-sm select-none font-mono">
      {/* Code Block Header */}
      <div 
        contentEditable={false}
        className="flex items-center justify-between px-3.5 py-1.5 bg-[#131316] border-b border-white/5 text-xs text-gray-400 select-none rounded-t-xl"
      >
        <div className="relative" ref={dropdownRef}>
          {/* Custom Language Dropdown Trigger */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsDropdownOpen(!isDropdownOpen);
            }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-white/10 text-gray-300 hover:text-white transition-colors text-[11px] font-mono capitalize"
            title="Select programming language"
          >
            <Code size={12} className="text-amber-400 shrink-0" />
            <span className="font-medium">{currentLanguage}</span>
            <ChevronDown size={10} className={`text-gray-400 transition-transform duration-150 ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Floating Dropdown Menu */}
          {isDropdownOpen && (
            <div 
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute left-0 top-full mt-1.5 w-48 max-h-60 rounded-xl bg-[#202025] border border-white/10 shadow-2xl z-50 overflow-hidden flex flex-col py-1"
            >
              {/* Search Filter Box */}
              <div className="px-2 py-1 border-b border-white/10 flex items-center gap-1.5 text-gray-400">
                <Search size={11} className="shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search language..."
                  className="bg-transparent text-[11px] text-white placeholder-gray-500 focus:outline-none w-full"
                />
              </div>

              {/* Languages List */}
              <div className="overflow-y-auto max-h-48 py-1">
                {filteredLanguages.length > 0 ? (
                  filteredLanguages.map(lang => (
                    <button
                      key={lang}
                      type="button"
                      onClick={(e) => handleSelectLanguage(lang, e)}
                      className={`w-full text-left px-3 py-1 text-[11px] font-mono flex items-center justify-between hover:bg-amber-500/20 hover:text-amber-300 transition-colors capitalize ${
                        currentLanguage === lang ? 'text-amber-400 font-semibold bg-white/5' : 'text-gray-300'
                      }`}
                    >
                      <span>{lang}</span>
                      {currentLanguage === lang && <Check size={11} className="text-amber-400" />}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-[11px] text-gray-500 text-center">
                    No language found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 1-Click Copy Button */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
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
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono selection:bg-amber-500/30 text-gray-200 m-0 bg-transparent border-0">
        <NodeViewContent as="code" className={currentLanguage !== 'auto' ? `language-${currentLanguage}` : ''} />
      </pre>
    </NodeViewWrapper>
  );
};
