/**
 * Detecta o erro "app sem permissao/capacidade" da Graph API (Meta) numa resposta
 * de erro do axios. O backend (Instagram/Messenger) sinaliza esse caso com o codigo
 * `ERR_META_APP_NO_PERMISSION`; tambem fazemos fallback por substring caso a mensagem
 * crua da Meta chegue ao front por outro caminho.
 *
 * Quando verdadeiro, a UI deve orientar o usuario a cadastrar um app proprio.
 */
export function isMetaAppPermissionError(err: any): boolean {
  const data = err?.response?.data;

  if (data?.error === "ERR_META_APP_NO_PERMISSION") return true;

  const haystack = [data?.error, data?.details, data?.message, err?.message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("does not have permission") ||
    haystack.includes("does not have the capability") ||
    haystack.includes("does not support") ||
    haystack.includes("application does not")
  );
}
