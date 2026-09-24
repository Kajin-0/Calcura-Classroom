export function formatJoinCode(code: string) {
  return code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}
