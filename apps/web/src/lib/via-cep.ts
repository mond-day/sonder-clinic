export type ViaCepAddress = {
  postalCode: string;
  street: string;
  district: string;
  city: string;
  state: string;
};

/** Busca endereço brasileiro via ViaCEP. Retorna null se CEP inexistente. */
export async function lookupViaCep(postalCode: string): Promise<ViaCepAddress | null> {
  const digits = postalCode.replace(/\D/g, '');
  if (digits.length !== 8) {
    throw new Error('Informe um CEP com 8 dígitos.');
  }
  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Não foi possível consultar o CEP. Tente novamente.');
  }
  const data = await response.json() as {
    erro?: boolean;
    cep?: string;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };
  if (data.erro) return null;
  return {
    postalCode: digits,
    street: data.logradouro?.trim() ?? '',
    district: data.bairro?.trim() ?? '',
    city: data.localidade?.trim() ?? '',
    state: data.uf?.trim().toUpperCase() ?? '',
  };
}
