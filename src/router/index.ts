import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/',
    name: 'landing',
    component: () => import('@/pages/LandingPage.vue'),
    meta: { public: true },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/admin',
    component: () => import('@/pages/admin/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' as const },
    children: [
      {
        path: '',
        name: 'admin.clients',
        component: () => import('@/pages/admin/ClientsPage.vue'),
      },
      {
        path: 'clients/:id',
        name: 'admin.client-detail',
        component: () => import('@/pages/admin/ClientDetailPage.vue'),
        props: true,
      },
    ],
  },
  {
    path: '/dashboard/:slug',
    component: () => import('@/pages/dashboard/DashboardLayout.vue'),
    props: true,
    meta: { requiresAuth: true, requiresRole: 'client' as const },
    children: [
      {
        path: '',
        name: 'dashboard.home',
        component: () => import('@/pages/dashboard/DashboardHomePage.vue'),
      },
      {
        path: 'crm',
        name: 'dashboard.crm',
        component: () => import('@/pages/dashboard/CrmPage.vue'),
        meta: { requiresModule: 'crm' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: { public: true },
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to: RouteLocationNormalized) => {
  const auth = useAuthStore()

  // Wait for the initial session check so we don't bounce users on refresh.
  if (auth.loading) {
    await auth.init()
  }

  const isPublic = to.matched.some((r) => r.meta.public === true)
  if (isPublic) return true

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  const requiredRole = to.meta.requiresRole as 'admin' | 'client' | undefined
  if (requiredRole && auth.profile?.role !== requiredRole) {
    return auth.redirectPath
  }

  // A client can only view their own dashboard slug.
  const slug = to.params.slug as string | undefined
  if (slug && auth.profile?.role === 'client' && slug !== auth.clientSlug) {
    return auth.redirectPath
  }

  return true
})
