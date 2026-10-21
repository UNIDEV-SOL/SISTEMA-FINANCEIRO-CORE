export interface CurrencyResponse {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  active: boolean;
  order: number;
}

export interface AdminCurrencyResponse extends CurrencyResponse {
  userCount: number;
}
