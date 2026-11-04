import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

const KEY = 'aroma-brew-member-token'
interface MemberState { token: string; setToken: (t: string) => void; clear: () => void }
const Ctx = createContext<MemberState | null>(null)

/** Keeps the member session token (from phone + OTP sign-in) for the tab, so ordering and "My orders" can use it */
export function MemberProvider({ children }: { children: ReactNode }) {
  const [token, setT] = useState(() => { try { return sessionStorage.getItem(KEY) ?? '' } catch { return '' } })
  const setToken = useCallback((t: string) => { setT(t); try { sessionStorage.setItem(KEY, t) } catch { /* ignore */ } }, [])
  const clear = useCallback(() => { setT(''); try { sessionStorage.removeItem(KEY) } catch { /* ignore */ } }, [])
  return <Ctx.Provider value={{ token, setToken, clear }}>{children}</Ctx.Provider>
}

export function useMember(): MemberState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMember must be used within MemberProvider')
  return v
}
