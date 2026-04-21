declare global {
  interface Window {
    ethereum?: {
      isMiniPay?: boolean
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    }
  }
}

export const IS_MINIPAY: boolean =
  typeof window !== 'undefined' && window.ethereum?.isMiniPay === true
