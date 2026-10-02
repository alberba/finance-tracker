export function getFinanceNamespace(request: Request): string | undefined {
  return request.headers.get("x-finance-namespace") || undefined;
}
