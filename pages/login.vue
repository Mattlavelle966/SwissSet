<script setup lang="ts">
import { LogIn, ShieldCheck, UserPlus } from 'lucide-vue-next'

const { login, signup, user, fetchUser } = useAuth()

await fetchUser()

if (user.value) {
  await navigateTo('/')
}

const mode = ref<'login' | 'signup'>('login')
const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

watch(mode, () => {
  error.value = ''
})

async function submit() {
  error.value = ''
  loading.value = true

  try {
    if (mode.value === 'signup') {
      await signup(name.value, email.value, password.value)
    } else {
      await login(email.value, password.value)
    }
    await navigateTo('/')
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Unable to authenticate'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="auth-card">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">
        <ShieldCheck :size="23" />
      </span>
      <span>
        <p class="brand-title">SwissSet</p>
        <p class="brand-subtitle">Internal SDLC tools</p>
      </span>
    </div>

    <div class="segmented" style="width: 100%; margin-bottom: 18px">
      <button
        type="button"
        :class="{ active: mode === 'login' }"
        style="flex: 1"
        @click="mode = 'login'"
      >
        Sign in
      </button>
      <button
        type="button"
        :class="{ active: mode === 'signup' }"
        style="flex: 1"
        @click="mode = 'signup'"
      >
        Create account
      </button>
    </div>

    <form @submit.prevent="submit">
      <div v-if="mode === 'signup'" class="field">
        <label for="name">Name</label>
        <input id="name" v-model="name" autocomplete="name" required />
      </div>

      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" autocomplete="email" required />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          minlength="8"
          required
        />
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <button class="button primary" type="submit" :disabled="loading" style="width: 100%">
        <UserPlus v-if="mode === 'signup'" aria-hidden="true" />
        <LogIn v-else aria-hidden="true" />
        {{ loading ? 'Working...' : mode === 'signup' ? 'Create account' : 'Sign in' }}
      </button>
    </form>
  </section>
</template>
