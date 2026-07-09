type AuthUser = {
  id: string
  name: string
  email: string
  createdAt: string
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth:user', () => null)
  const ready = useState('auth:ready', () => false)

  async function fetchUser() {
    if (ready.value) {
      return user.value
    }

    try {
      const headers = process.server ? useRequestHeaders(['cookie']) : undefined
      const response = await $fetch<{ user: AuthUser | null }>('/api/auth/me', {
        headers
      })
      user.value = response.user
    } catch {
      user.value = null
    } finally {
      ready.value = true
    }

    return user.value
  }

  async function login(email: string, password: string) {
    const response = await $fetch<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    })
    user.value = response.user
    ready.value = true
    return response.user
  }

  async function signup(name: string, email: string, password: string) {
    const response = await $fetch<{ user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      body: { name, email, password }
    })
    user.value = response.user
    ready.value = true
    return response.user
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    user.value = null
    ready.value = true
  }

  return {
    user,
    ready,
    fetchUser,
    login,
    signup,
    logout
  }
}
