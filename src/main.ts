import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useAuthStore } from './stores/auth'
import { supabase } from './lib/supabase'
import { reveal } from './directives/reveal'
import './assets/main.css'

// A password-recovery / invite link may land the user on any page (e.g. the
// Supabase Site URL, which is the home page) with the recovery token in the URL.
// Subscribe BEFORE mounting so we catch the PASSWORD_RECOVERY event and route
// them to set their password regardless of where the link dropped them.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY' && router.currentRoute.value.name !== 'set-password') {
    router.push('/set-password').catch(() => { /* already navigating */ })
  }
})

const app = createApp(App)
app.use(createPinia())
app.directive('reveal', reveal)

// Kick off session hydration before mounting the router.
// The router's beforeEach also awaits init(), but doing it here
// means first paint sees the correct auth state.
const auth = useAuthStore()
auth.init().finally(() => {
  app.use(router)
  app.mount('#app')
})
