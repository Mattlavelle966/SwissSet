export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login' || to.path.startsWith('/r/')) {
    return
  }

  const { user, fetchUser } = useAuth()
  await fetchUser()

  if (!user.value) {
    return navigateTo('/login')
  }
})
