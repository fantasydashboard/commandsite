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
    path: '/churches',
    name: 'churches',
    component: () => import('@/pages/ChurchesPage.vue'),
    meta: { public: true },
  },
  {
    // Staci Daniel Music, separate-brand landing page. Lives in this
    // repo to share the build pipeline + Tailwind setup; will move to
    // its own domain (stacidanielmusic.com) when Phase 2 (student
    // portal, payments) is ready and the surface needs full separation.
    path: '/stacidanielmusic',
    name: 'stacidanielmusic',
    component: () => import('@/pages/StaciDanielMusicLandingPage.vue'),
    meta: { public: true },
  },
  {
    // Old short URL kept as redirect so any links already shared still work.
    path: '/staci',
    redirect: '/stacidanielmusic',
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
      {
        path: 'health',
        name: 'admin.health',
        component: () => import('@/pages/admin/AdminHealthPage.vue'),
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
        // Bare /dashboard/:slug — DashboardHomePage redirects to the first
        // tab that has enabled modules.
        path: '',
        name: 'dashboard.home',
        component: () => import('@/pages/dashboard/DashboardHomePage.vue'),
      },
      {
        // CRM keeps its dedicated page (full-table contact/pipeline view).
        // Defined before the :tab catch-all so it wins the match for /crm.
        path: 'crm',
        name: 'dashboard.crm',
        component: () => import('@/pages/dashboard/CrmPage.vue'),
        meta: { requiresModule: 'crm' },
      },
      {
        // Generic per-tab module renderer for everything else (metrics,
        // marketing, projects, ...). The optional :subtab segment lets
        // tabs declare second-level navigation (e.g. marketing/email,
        // marketing/social, marketing/listening).
        path: ':tab/:subtab?',
        name: 'dashboard.tab',
        component: () => import('@/pages/dashboard/DashboardHomePage.vue'),
        props: true,
      },
    ],
  },
  {
    // Pitch deck — public, optional ?lead query (or :slug param).
    // Used live on discovery calls + sharable post-call.
    path: '/pitch/:slug?',
    name: 'pitch',
    component: () => import('@/pages/PitchDeckPage.vue'),
    meta: { public: true },
    props: true,
  },
  {
    // Customer-facing Discovery Brief form. Token in URL is the auth —
    // generated when the operator clicks "Send discovery brief" from
    // the onboarding drawer and lands in cs_customers.discovery_brief_token.
    path: '/onboarding/discovery/:token',
    name: 'discovery-brief',
    component: () => import('@/pages/DiscoveryBriefPage.vue'),
    meta: { public: true },
    props: true,
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
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 80 }
    return { top: 0 }
  },
})

// Demo dashboards anyone can browse without logging in. Anchors the
// "see Ada/Grace in action" links from the landing pages. Real customer
// dashboards (commandsite, ufd-redesign, etc.) still require auth.
const PUBLIC_DEMO_SLUGS = new Set([
  'apex-heating-and-air',
  'cornerstone-church',
  'commandsite-demo',
  'heritage-bath',
])

router.beforeEach(async (to: RouteLocationNormalized) => {
  const auth = useAuthStore()

  // Wait for the initial session check so we don't bounce users on refresh.
  if (auth.loading) {
    await auth.init()
  }

  const isPublic = to.matched.some((r) => r.meta.public === true)
  if (isPublic) return true

  // Public-demo dashboards: anyone can browse. Lets prospects self-tour
  // Ada/Grace from the landing-page CTAs without creating an account.
  const slug = to.params.slug as string | undefined
  if (slug && PUBLIC_DEMO_SLUGS.has(slug)) return true

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Admins can access any authenticated route — including client dashboards,
  // which is how we preview a client's view from the admin UI.
  const requiredRole = to.meta.requiresRole as 'admin' | 'client' | undefined
  if (
    requiredRole &&
    auth.profile?.role !== requiredRole &&
    auth.profile?.role !== 'admin'
  ) {
    return auth.redirectPath
  }

  // A client can only view their own dashboard slug.
  if (slug && auth.profile?.role === 'client' && slug !== auth.clientSlug) {
    return auth.redirectPath
  }

  return true
})
