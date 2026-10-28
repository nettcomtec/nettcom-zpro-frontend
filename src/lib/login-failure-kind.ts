// Login (senha e chave mestra): separa "o servidor não respondeu" de "o servidor
// recusou". O interceptor do `api` rejeita com o próprio response quando houve
// resposta HTTP e com o AxiosError quando não houve (sem internet, DNS, prazo,
// CORS de um 502 do proxy). Sem isto, toda falha sem código conhecido virava
// "E-mail ou senha incorretos" — inclusive o celular em modo avião.
//
// Só decide quando o código do backend não foi reconhecido: recusa com código
// (credencial, licença, horário...) continua com a mensagem dela.
export type LoginFailureKind = "network" | "server" | null;

export function getLoginFailureKind(error: unknown): LoginFailureKind {
  if (!error || typeof error !== "object") return null;
  const err = error as { status?: unknown; isAxiosError?: unknown };
  if (typeof err.status === "number" && err.status > 0) {
    return err.status >= 500 ? "server" : null;
  }
  // AxiosError sem status = a requisição não teve resposta. Exceção comum de JS
  // (sem a marca do axios) não é falha de rede: segue o caminho de antes.
  return err.isAxiosError === true ? "network" : null;
}
