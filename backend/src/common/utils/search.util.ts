export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

export function createLikePattern(input: string, mode: 'contains' | 'startsWith' | 'endsWith' | 'exact' = 'contains'): string {
  const escaped = escapeLikePattern(input);
  switch (mode) {
    case 'startsWith':
      return `${escaped}%`;
    case 'endsWith':
      return `%${escaped}`;
    case 'exact':
      return escaped;
    case 'contains':
    default:
      return `%${escaped}%`;
  }
}