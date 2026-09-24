export function escapePointer(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function decodePointerToken(token: string): string {
  return decodeURIComponent(token).replace(/~1/g, "/").replace(/~0/g, "~");
}

export function childPath(parent: string, key: string): string {
  return `${parent}/${escapePointer(key)}`;
}
