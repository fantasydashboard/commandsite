<script setup lang="ts">
/**
 * Staci Daniel Music — landing page.
 *
 * Editorial brand surface for a classical piano studio in Kissimmee, FL.
 * Lives inside the CommandSite repo for shared build/Tailwind pipeline
 * but is visually + voice-wise its own thing — ivory base, deep forest
 * green accent, serif headline + clean sans body. The "magazine profile
 * of a working musician" aesthetic, NOT the standard piano-teacher
 * SquareSpace template.
 *
 * Phase 1 (this page): public marketing surface, no auth, no dashboard.
 * Phase 2 (later): student portal sign-in + resources + payments.
 *
 */
import { onMounted, ref } from 'vue'
import staciPhoto from '@/assets/staci/staci-with-family.jpg'

// Soft reveal-on-scroll for sections — calm motion, no bounce
const revealedSections = ref<Set<string>>(new Set())
let observer: IntersectionObserver | null = null

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          revealedSections.value = new Set([...revealedSections.value, e.target.id])
        }
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -80px 0px' },
  )
  document.querySelectorAll('[data-reveal]').forEach((el) => observer?.observe(el))
})

// Sticky-nav active section tracking
const activeSection = ref<string>('top')
function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const y = el.getBoundingClientRect().top + window.scrollY - 72  // offset for sticky nav
  window.scrollTo({ top: y, behavior: 'smooth' })
}

// Nav items with anchor IDs
const navItems = [
  { id: 'approach',   label: 'Approach' },
  { id: 'about',      label: 'About' },
  { id: 'students',   label: 'Students' },
  { id: 'lessons',    label: 'Lessons' },
  { id: 'faq',        label: 'FAQ' },
  { id: 'book',       label: 'Book' },
]

// Track scroll for active-section highlight
onMounted(() => {
  const onScroll = () => {
    const scrollY = window.scrollY + 100
    let current = 'top'
    for (const item of navItems) {
      const el = document.getElementById(item.id)
      if (el && el.offsetTop <= scrollY) current = item.id
    }
    activeSection.value = current
  }
  window.addEventListener('scroll', onScroll, { passive: true })
})

const faqs = [
  {
    q: 'How old does my child need to be to start?',
    a: 'Most students start between 5 and 7. Earlier is possible if a child can sit through a 30-minute lesson and is interested in the keyboard. Later is great too. I have started students at 8, 10, 14, and 40.',
  },
  {
    q: 'We do not own a piano. Can my child still start?',
    a: 'Yes, with a caveat. For the first 2 to 3 months a full-size 88-key digital keyboard with weighted keys is fine. Beyond that, a real piano (acoustic or a quality digital) is needed for the kind of practice that builds technique. I will help you figure out what to buy.',
  },
  {
    q: 'What method do you teach from?',
    a: 'Piano Adventures by Faber. It is the standard for a reason. Students learn theory, technique, and repertoire in parallel, with music that is actually fun to play. We supplement with classical pieces and student-choice pieces as students grow.',
  },
  {
    q: 'Do you teach online?',
    a: 'In-person lessons in Kissimmee are the default. Online lessons are possible for established students, but I rarely take new students online — too much is lost without being in the room together, especially in the first year.',
  },
  {
    q: 'What about vacations? Do I still pay if we miss a lesson?',
    a: 'Lessons are billed monthly. Planned absences with advance notice (vacations, school events) are not billed. Same-day cancellations are billed. I keep the schedule consistent because consistency is most of what makes piano lessons work.',
  },
  {
    q: 'Do you accept Step Up For Students scholarships?',
    a: 'Yes. The studio is an approved Step Up For Students provider, so families with a Florida scholarship can use those funds to pay for lessons. The rate is the same either way: $125 per lesson for every student, scholarship or not. Mention it when you book and I will walk you through how to set it up on your end.',
  },
  {
    q: 'I am an adult. Will I be the only adult in your studio?',
    a: 'No. Adult students are a meaningful part of my studio. Returning players, total beginners, parents who started after watching their kids learn. You will not be the only one.',
  },
  {
    q: 'My child is shy. Do they have to do recitals?',
    a: 'Yes, in some form. Performance is part of how piano works. But "performance" can mean playing for one other student, not a packed auditorium. We build up to it gradually. Every student I have has performed at recital eventually.',
  },
]
</script>

<template>
  <main class="min-h-screen bg-[#fbf8f3] text-[#1a2421] antialiased" id="top">

    <!-- ════════════════════════════════════════════════════════════════
         Top bar — minimal, brand-aware
         ════════════════════════════════════════════════════════════════ -->
    <header class="sticky top-0 z-40 bg-[#fbf8f3]/95 backdrop-blur border-b border-[#1a2421]/10">
      <div class="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <a href="#top" class="font-serif text-base tracking-tight text-[#1a2421] hover:text-[#2d4a3e] transition-colors">
          <span class="font-semibold">Staci Daniel</span>
          <span class="text-[#1a2421]/60"> · Music</span>
        </a>
        <nav class="hidden md:flex items-center gap-6">
          <button
            v-for="item in navItems"
            :key="item.id"
            type="button"
            class="text-[12px] uppercase tracking-[0.14em] transition-colors"
            :class="activeSection === item.id ? 'text-[#2d4a3e] font-semibold' : 'text-[#1a2421]/60 hover:text-[#1a2421]'"
            @click="scrollTo(item.id)"
          >{{ item.label }}</button>
        </nav>
        <button
          type="button"
          class="rounded-full bg-[#2d4a3e] text-[#fbf8f3] text-xs font-medium tracking-wide px-4 py-2 hover:bg-[#1f3329] transition-colors"
          @click="scrollTo('book')"
        >Book a trial lesson</button>
      </div>
    </header>

    <!-- ════════════════════════════════════════════════════════════════
         HERO
         ════════════════════════════════════════════════════════════════ -->
    <section class="mx-auto max-w-6xl px-6 pt-16 md:pt-24 pb-16 md:pb-28">
      <div class="grid md:grid-cols-12 gap-8 md:gap-12 items-center">
        <div class="md:col-span-7 order-2 md:order-1">
          <div class="text-[11px] uppercase tracking-[0.22em] text-[#2d4a3e] font-semibold mb-6">
            Classical piano · Kissimmee, FL
          </div>
          <h1 class="font-serif text-4xl md:text-6xl leading-[1.05] tracking-tight text-[#1a2421]">
            Eighteen years of students who fell in love with music.
            <span class="text-[#2d4a3e] italic">Many who never stopped playing.</span>
          </h1>
          <p class="mt-8 text-lg text-[#1a2421]/75 leading-relaxed max-w-2xl">
            Private piano lessons rooted in classical tradition, taught
            with the rigor that actually builds musicians. Most of my
            students stay with it, for years, sometimes for life. That
            is the harder thing, and it is what I am proudest of.
          </p>
          <div class="mt-10 flex items-center gap-4 flex-wrap">
            <button
              type="button"
              class="rounded-full bg-[#2d4a3e] text-[#fbf8f3] text-sm font-medium tracking-wide px-6 py-3 hover:bg-[#1f3329] transition-colors"
              @click="scrollTo('book')"
            >Book a trial lesson</button>
            <button
              type="button"
              class="text-sm text-[#1a2421] font-medium tracking-wide underline underline-offset-4 decoration-[#2d4a3e]/40 hover:decoration-[#2d4a3e] transition-colors"
              @click="scrollTo('approach')"
            >How I teach →</button>
          </div>
        </div>
        <div class="md:col-span-5 order-1 md:order-2">
          <div class="aspect-[4/5] overflow-hidden rounded-sm shadow-xl">
            <img
              :src="staciPhoto"
              alt="Staci Daniel with her three children, outdoors in Florida"
              class="w-full h-full object-cover"
            />
          </div>
          <p class="mt-4 text-[11px] tracking-wider text-[#1a2421]/50 italic text-center md:text-left">
            Staci with her three children, who are also her hardest critics.
          </p>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════
         APPROACH — the teaching philosophy
         ════════════════════════════════════════════════════════════════ -->
    <section
      id="approach"
      class="bg-[#1a2421] text-[#fbf8f3]"
      data-reveal
    >
      <div
        class="mx-auto max-w-6xl px-6 py-20 md:py-28 transition-opacity duration-700"
        :class="revealedSections.has('approach') ? 'opacity-100' : 'opacity-0'"
      >
        <div class="text-[11px] uppercase tracking-[0.22em] text-[#a8c4b3] font-semibold mb-8">
          The approach
        </div>
        <h2 class="font-serif text-3xl md:text-5xl leading-[1.1] tracking-tight max-w-4xl">
          Most kids who quit piano quit because they were taught to push
          through method books without ever being asked what they wanted
          to play. <span class="italic text-[#a8c4b3]">I do not teach that way.</span>
        </h2>
        <p class="mt-10 text-lg text-[#fbf8f3]/80 leading-relaxed max-w-3xl">
          Every student gets the fundamentals — theory, technique, sight-reading.
          Non-negotiable. But they are learning them so they can play music
          that matters to them. The Bach, yes. Also the movie themes. Also
          the songs they hum in the car.
        </p>
        <p class="mt-6 text-lg text-[#fbf8f3]/80 leading-relaxed max-w-3xl">
          Some of my students fall in love with piano and play for their
          whole lives. Some go on to win regional competitions. Both are
          wins. The thing they have in common is that they stayed with it,
          which in piano teaching is the actual hard part.
        </p>

        <div class="mt-16 grid md:grid-cols-2 gap-8 md:gap-12 max-w-4xl">
          <div>
            <div class="text-[10px] uppercase tracking-[0.22em] text-[#a8c4b3] font-semibold mb-3">
              Fundamentals first
            </div>
            <p class="text-[#fbf8f3]/75 leading-relaxed">
              Theory, technique, and sight-reading are not optional. Every
              student does them every week. They are what makes the music
              possible later.
            </p>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-[0.22em] text-[#a8c4b3] font-semibold mb-3">
              Classical plus their choice
            </div>
            <p class="text-[#fbf8f3]/75 leading-relaxed">
              At any time, students are working on one classical piece and
              one piece they chose. Both get the same attention. Both
              build the same skills.
            </p>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-[0.22em] text-[#a8c4b3] font-semibold mb-3">
              Recitals twice a year
            </div>
            <p class="text-[#fbf8f3]/75 leading-relaxed">
              December and May. Every student performs. Performance is
              part of the work, not an optional add-on, and it is where
              the year's effort becomes real.
            </p>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-[0.22em] text-[#a8c4b3] font-semibold mb-3">
              Goals tracked over years
            </div>
            <p class="text-[#fbf8f3]/75 leading-relaxed">
              Piano is a long game. I track each student's progress across
              years, not lessons. We are building toward something.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════
         ABOUT — credentials in story form
         ════════════════════════════════════════════════════════════════ -->
    <section
      id="about"
      class="bg-[#f0ebe1]"
      data-reveal
    >
      <div
        class="mx-auto max-w-6xl px-6 py-20 md:py-28 transition-opacity duration-700"
        :class="revealedSections.has('about') ? 'opacity-100' : 'opacity-0'"
      >
        <div class="grid md:grid-cols-12 gap-12 items-start">
          <div class="md:col-span-4">
            <div class="text-[11px] uppercase tracking-[0.22em] text-[#2d4a3e] font-semibold mb-6">
              About Staci
            </div>
            <div class="aspect-[4/5] overflow-hidden rounded-sm shadow-lg">
              <img
                :src="staciPhoto"
                alt="Staci Daniel"
                class="w-full h-full object-cover"
              />
            </div>
          </div>
          <div class="md:col-span-8 md:pt-12">
            <h2 class="font-serif text-3xl md:text-5xl leading-[1.1] tracking-tight">
              The teacher
            </h2>
            <div class="mt-8 space-y-6 text-lg text-[#1a2421]/80 leading-relaxed max-w-2xl">
              <p>
                I graduated from Southeastern University in 2012 with a
                degree in Music Education, focus on piano. I have been
                teaching privately since 2008, which means I am now in
                my eighteenth year of running a studio.
              </p>
              <p>
                In that time the studio has welcomed every kind of student.
                Five-year-olds who had never touched a keyboard. Forty-year-olds
                returning to piano after thirty years away. Teenagers
                preparing for college auditions. Adults learning to play
                the one piece they always wanted to.
              </p>
              <p>
                What I am proudest of is something quieter. Students who
                stay with it, for years, sometimes for decades. That is
                the harder thing.
              </p>
              <p>
                I live in Kissimmee with my husband and three children,
                who are loud and wonderful and my hardest critics. The
                studio is here too.
              </p>
            </div>

            <div class="mt-10 grid sm:grid-cols-3 gap-6 max-w-2xl border-t border-[#1a2421]/15 pt-8">
              <div>
                <div class="font-serif text-3xl text-[#2d4a3e]">18</div>
                <div class="text-[11px] uppercase tracking-[0.18em] text-[#1a2421]/60 mt-1">Years teaching</div>
              </div>
              <div>
                <div class="font-serif text-3xl text-[#2d4a3e]">Dec + May</div>
                <div class="text-[11px] uppercase tracking-[0.18em] text-[#1a2421]/60 mt-1">Recitals each year</div>
              </div>
              <div>
                <div class="font-serif text-3xl text-[#2d4a3e]">B.M.E.</div>
                <div class="text-[11px] uppercase tracking-[0.18em] text-[#1a2421]/60 mt-1">Music Ed · SEU 2012</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════
         STUDENTS — outcomes + testimonials
         ════════════════════════════════════════════════════════════════ -->
    <section
      id="students"
      class="mx-auto max-w-6xl px-6 py-20 md:py-28"
      data-reveal
    >
      <div
        class="transition-opacity duration-700"
        :class="revealedSections.has('students') ? 'opacity-100' : 'opacity-0'"
      >
        <div class="text-[11px] uppercase tracking-[0.22em] text-[#2d4a3e] font-semibold mb-8">
          What students have done
        </div>
        <h2 class="font-serif text-3xl md:text-5xl leading-[1.1] tracking-tight max-w-4xl mb-16">
          Four kinds of wins. They all count.
        </h2>

        <div class="grid md:grid-cols-2 gap-10 md:gap-16 max-w-5xl mb-20">
          <div class="border-l-2 border-[#2d4a3e] pl-6">
            <div class="font-serif text-xl mb-2">Played a piece they thought they couldn't.</div>
            <p class="text-[#1a2421]/70 leading-relaxed">
              Students who worked through music that intimidated them on
              first read, then sat down and performed it. That breakthrough
              is what private lessons are really for.
            </p>
          </div>
          <div class="border-l-2 border-[#2d4a3e] pl-6">
            <div class="font-serif text-xl mb-2">Continued into college music programs.</div>
            <p class="text-[#1a2421]/70 leading-relaxed">
              Students who chose to study music in college, including
              music education and performance. The foundation built in
              private lessons matters at that level.
            </p>
          </div>
          <div class="border-l-2 border-[#2d4a3e] pl-6">
            <div class="font-serif text-xl mb-2">Performed every December and May.</div>
            <p class="text-[#1a2421]/70 leading-relaxed">
              Year after year, students take the stage at the studio's
              recitals. The shy ones eventually too. Every student plays.
            </p>
          </div>
          <div class="border-l-2 border-[#2d4a3e] pl-6">
            <div class="font-serif text-xl mb-2">Adults who finally played the piece.</div>
            <p class="text-[#1a2421]/70 leading-relaxed">
              The Chopin nocturne. The hymn from their grandmother's
              funeral. The Elton John song they always wanted to learn.
              Adult returners get to that moment. It is worth the wait.
            </p>
          </div>
        </div>

      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════
         LESSONS — what + cost
         ════════════════════════════════════════════════════════════════ -->
    <section
      id="lessons"
      class="bg-[#1a2421] text-[#fbf8f3]"
      data-reveal
    >
      <div
        class="mx-auto max-w-6xl px-6 py-20 md:py-28 transition-opacity duration-700"
        :class="revealedSections.has('lessons') ? 'opacity-100' : 'opacity-0'"
      >
        <div class="text-[11px] uppercase tracking-[0.22em] text-[#a8c4b3] font-semibold mb-8">
          Lessons
        </div>
        <h2 class="font-serif text-3xl md:text-5xl leading-[1.1] tracking-tight max-w-4xl mb-16">
          Weekly. In person. $125 per lesson.
        </h2>

        <div class="grid md:grid-cols-12 gap-12 max-w-5xl">
          <div class="md:col-span-7 space-y-6 text-lg text-[#fbf8f3]/80 leading-relaxed">
            <p>
              Lessons run weekly during the school year (September through
              May) with an adjusted summer schedule that works around
              vacations. Billed monthly. Planned absences with notice are
              not billed; same-day cancellations are.
            </p>
            <p>
              The studio is in Kissimmee, Florida. In-person lessons are
              the default; online lessons are available for established
              students when needed.
            </p>
            <p>
              Curriculum is Piano Adventures by Faber, supplemented with
              classical repertoire and student-choice pieces as students grow.
            </p>
            <p>
              Every student pays the same $125 per lesson. The studio is an
              approved Step Up For Students provider, which means families
              with a Florida scholarship can use those funds to pay for
              lessons at that same rate. Mention it when you book and I will
              walk you through the setup.
            </p>
          </div>
          <div class="md:col-span-5">
            <div class="border border-[#a8c4b3]/30 rounded-sm p-8 bg-[#1f3329]">
              <div class="text-[10px] uppercase tracking-[0.22em] text-[#a8c4b3] font-semibold mb-2">
                Per lesson
              </div>
              <div class="font-serif text-5xl text-[#fbf8f3] mb-1">$125</div>
              <div class="text-sm text-[#fbf8f3]/60 mb-6">Weekly · billed monthly</div>
              <div class="border-t border-[#a8c4b3]/20 pt-6 space-y-2 text-sm text-[#fbf8f3]/70">
                <div class="flex justify-between"><span>Lesson length</span><span class="text-[#fbf8f3]">30 min</span></div>
                <div class="flex justify-between"><span>Format</span><span class="text-[#fbf8f3]">In-person</span></div>
                <div class="flex justify-between"><span>Location</span><span class="text-[#fbf8f3]">Kissimmee, FL</span></div>
                <div class="flex justify-between"><span>Recitals</span><span class="text-[#fbf8f3]">Included</span></div>
              </div>
              <button
                type="button"
                class="mt-8 w-full rounded-full bg-[#fbf8f3] text-[#1a2421] text-sm font-medium tracking-wide px-6 py-3 hover:bg-[#a8c4b3] transition-colors"
                @click="scrollTo('book')"
              >Book a trial lesson</button>
            </div>
          </div>
        </div>

        <!-- Step Up sits OUTSIDE the price card on purpose. Inside it, the
             callout read as though $125 were a scholarship-only rate. It is a
             way to pay, not a different price. -->
        <div class="max-w-5xl mt-12 border border-[#a8c4b3]/30 rounded-sm bg-[#1f3329] px-6 py-5 md:px-8 md:py-6">
          <div class="flex flex-col md:flex-row md:items-center gap-3 md:gap-8">
            <div class="text-[10px] uppercase tracking-[0.22em] text-[#a8c4b3] font-semibold md:flex-shrink-0">
              Step Up For Students
            </div>
            <p class="text-base text-[#fbf8f3]/80 leading-relaxed m-0">
              <span class="text-[#fbf8f3]">Approved provider.</span>
              Florida scholarship funds can be used to pay for lessons at the
              same $125 per lesson everyone pays.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════
         FAQ
         ════════════════════════════════════════════════════════════════ -->
    <section
      id="faq"
      class="mx-auto max-w-6xl px-6 py-20 md:py-28"
      data-reveal
    >
      <div
        class="transition-opacity duration-700"
        :class="revealedSections.has('faq') ? 'opacity-100' : 'opacity-0'"
      >
        <div class="text-[11px] uppercase tracking-[0.22em] text-[#2d4a3e] font-semibold mb-8">
          Questions
        </div>
        <h2 class="font-serif text-3xl md:text-5xl leading-[1.1] tracking-tight max-w-3xl mb-16">
          What people ask before signing up.
        </h2>
        <div class="max-w-4xl divide-y divide-[#1a2421]/15">
          <details
            v-for="(faq, i) in faqs"
            :key="i"
            class="group py-6"
          >
            <summary class="cursor-pointer list-none flex items-baseline justify-between gap-4">
              <span class="font-serif text-xl md:text-2xl text-[#1a2421]">{{ faq.q }}</span>
              <span class="text-[#2d4a3e] text-2xl font-light group-open:rotate-45 transition-transform shrink-0">+</span>
            </summary>
            <p class="mt-4 text-[#1a2421]/75 leading-relaxed text-lg max-w-3xl">
              {{ faq.a }}
            </p>
          </details>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════
         BOOK — final CTA
         ════════════════════════════════════════════════════════════════ -->
    <section
      id="book"
      class="bg-[#2d4a3e] text-[#fbf8f3]"
      data-reveal
    >
      <div
        class="mx-auto max-w-4xl px-6 py-24 md:py-32 text-center transition-opacity duration-700"
        :class="revealedSections.has('book') ? 'opacity-100' : 'opacity-0'"
      >
        <div class="text-[11px] uppercase tracking-[0.22em] text-[#a8c4b3] font-semibold mb-8">
          Book a trial lesson
        </div>
        <h2 class="font-serif text-3xl md:text-6xl leading-[1.05] tracking-tight">
          First lesson is 30 minutes.<br />
          <span class="italic text-[#a8c4b3]">No commitment.</span>
        </h2>
        <p class="mt-8 text-lg text-[#fbf8f3]/80 leading-relaxed max-w-2xl mx-auto">
          We meet, the student plays a little, we talk about what they
          want to learn. If it is a fit, we schedule regular lessons.
          If not, no hard feelings.
        </p>

        <div class="mt-12 grid sm:grid-cols-2 gap-4 max-w-xl mx-auto">
          <a
            href="sms:+14074931556"
            class="rounded-full bg-[#fbf8f3] text-[#1a2421] text-sm font-medium tracking-wide px-6 py-4 hover:bg-[#a8c4b3] transition-colors block"
          >Text Staci</a>
          <a
            href="mailto:staciraedaniel@gmail.com"
            class="rounded-full border border-[#fbf8f3]/40 text-[#fbf8f3] text-sm font-medium tracking-wide px-6 py-4 hover:bg-[#fbf8f3]/10 transition-colors block"
          >Email Staci</a>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════
         Footer
         ════════════════════════════════════════════════════════════════ -->
    <footer class="bg-[#1a2421] text-[#fbf8f3]/60 border-t border-[#fbf8f3]/10">
      <div class="mx-auto max-w-6xl px-6 py-12">
        <div class="grid md:grid-cols-3 gap-8">
          <div>
            <div class="font-serif text-lg text-[#fbf8f3] mb-2">Staci Daniel Music</div>
            <p class="text-sm leading-relaxed">
              Private classical piano lessons in Kissimmee, Florida. Teaching since 2008.
            </p>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-[0.22em] text-[#a8c4b3] font-semibold mb-3">Contact</div>
            <p class="text-sm leading-relaxed">
              Kissimmee, FL<br />
              Text or email to book
            </p>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-[0.22em] text-[#a8c4b3] font-semibold mb-3">Students</div>
            <p class="text-sm leading-relaxed">
              Current student portal coming soon. Sign-in will appear here when ready.
            </p>
          </div>
        </div>
        <div class="mt-12 pt-8 border-t border-[#fbf8f3]/10 text-[11px] uppercase tracking-[0.18em] text-[#fbf8f3]/40 text-center">
          © {{ new Date().getFullYear() }} Staci Daniel Music
        </div>
      </div>
    </footer>

  </main>
</template>

<style scoped>
/* Serif font for headlines. Falls back gracefully if web font fails to load. */
.font-serif {
  font-family: 'GT Sectra', 'Tiempos', 'Source Serif Pro', Georgia, 'Times New Roman', serif;
}
</style>
