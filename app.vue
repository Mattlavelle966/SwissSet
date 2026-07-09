<script setup lang="ts">
import {
  Activity,
  BadgeCheck,
  FileImage,
  Home,
  Link2,
  LogOut,
  Paintbrush,
  QrCode,
  ShieldCheck,
  Wand2
} from 'lucide-vue-next'

const route = useRoute()
const { user, fetchUser, logout } = useAuth()

await fetchUser()

const isLogin = computed(() => route.path === '/login')
const navItems = [
  { to: '/', label: 'Command Center', icon: Home },
  { to: '/status', label: 'Site Status', icon: Activity },
  { to: '/qr', label: 'QR Generator', icon: QrCode },
  { to: '/converter', label: 'SVG Converter', icon: Wand2 },
  { to: '/favicon', label: 'Favicons', icon: BadgeCheck },
  { to: '/studio', label: 'Image Studio', icon: Paintbrush },
  { to: '/links', label: 'Redirect Links', icon: Link2 }
]

async function handleLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <NuxtLoadingIndicator color="#0f766e" />

  <main v-if="isLogin" class="auth-screen">
    <NuxtPage />
  </main>

  <div v-else class="app-shell">
    <aside class="sidebar">
      <NuxtLink class="brand" to="/">
        <span class="brand-mark" aria-hidden="true">
          <ShieldCheck :size="23" />
        </span>
        <span>
          <p class="brand-title">SwissSet</p>
          <p class="brand-subtitle">Internal SDLC tools</p>
        </span>
      </NuxtLink>

      <nav class="nav-list" aria-label="Primary navigation">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          class="nav-link"
          :to="item.to"
        >
          <component :is="item.icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <div class="sidebar-footer">
        <div class="user-pill">
          <strong>{{ user?.name || 'Signed in' }}</strong>
          <span>{{ user?.email }}</span>
        </div>
        <button class="button ghost" type="button" @click="handleLogout">
          <LogOut aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>

    <main class="main">
      <NuxtPage />
    </main>
  </div>
</template>
