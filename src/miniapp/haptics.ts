import { IS_MINIPAY } from '../utils/miniPay'

const vibrate = (pattern: number | number[]) => {
  if (IS_MINIPAY && typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern)
  }
}

export function hapticSelection(): void {
  vibrate(10)
}

export function hapticImpact(): void {
  vibrate(20)
}

export function hapticNotification(): void {
  vibrate([20, 10, 20])
}

export function hapticError(): void {
  vibrate([30, 15, 30, 15, 30])
}
