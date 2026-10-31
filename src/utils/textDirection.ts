export const RTL_REGEX = /[\u0590-\u05FF\uFB1D-\uFB4F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const LTR_REGEX = /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/;

export function getDirection(text: string): 'rtl' | 'ltr' | 'auto' {
  for (const char of text) {
    if (RTL_REGEX.test(char)) return 'rtl';
    if (LTR_REGEX.test(char)) return 'ltr';
  }
  return 'auto';
}
