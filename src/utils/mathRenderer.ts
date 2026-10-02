import katex from 'katex';
import 'katex/dist/katex.min.css';

export function renderMath(latex: string, displayMode: boolean): string {
  return katex.renderToString(latex || '\\dots', { throwOnError: false, displayMode });
}
