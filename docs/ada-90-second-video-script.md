# Ada 90-second walkthrough video script

The video that lives in touch 2 of the bath/kitchen cold-email sequence.
Lead clicks `<link>` in touch 2 and lands here.

## Research baseline (what to do and not do)

What converts on a 90-second outreach video for SMB owner-operators:

| Element | What works | What kills it |
| --- | --- | --- |
| **Length** | 60-100 seconds. Under 60 feels rushed, over 120 loses 40% of viewers | 2-min+ wall of features |
| **Format** | Founder face + screen-share of real product. Loom-style. | Polished agency video, stock music, animated logos |
| **Audio** | Real voice, casual. Mic doesn't need to be perfect, sincerity does | Robotic narration, AI voiceover, scripts read at SDR pace |
| **Opening hook** | Name the viewer's specific pain in the first 5 seconds | "Hi, I'm Josh and welcome to..." (autoplay-skip moment) |
| **Body** | 1-2 specific things the tool does, shown LIVE on screen | List of 5+ features |
| **Closing CTA** | One clear next step. Match touch 2's "founding rate" framing | "Visit our website" / "Click here for more info" |
| **Personalization** | Speak to the specific buyer ("if you run a bath/kitchen shop"), not generic SMB | Generic "small business owners" framing |

## The script (read aloud, time yourself: ~90 seconds at conversational pace)

---

**[0:00 to 0:08 — face on camera, no logo splash]**

Hey, Josh from CommandSite. Real quick because I know you're between jobs.

**[0:08 to 0:25 — face on camera, identity validation]**

If you're like the bath and kitchen owners I've been talking to, you're walking every project in person before you quote it. That's the part of this work that earns the job, and I'm not trying to touch that.

What I built handles the stuff between the handshakes.

**[0:25 to 0:55 — switch to screen-share, show the actual product]**

Here's what I mean. This is Ada, the AI employee I built for shops like yours.

When a lead comes in, Ada follows up the same day. If they go quiet, she follows up again at day 3 and day 7, in your voice, not a generic template. You see every draft before it sends.

When a job wraps, she asks for the Google review. When a homeowner calls and you can't pick up because you're under a sink, she answers the phone, sounds like your shop, and books the callback to your calendar.

**[0:55 to 1:20 — back to face on camera, the offer]**

I'm looking to bring on 3 bath/kitchen shops at founding rates over the next few weeks. About 3,000 dollars saved over the first year compared to what I'll charge once those 3 are signed. After that the rate changes for new customers.

If your team is mostly you plus 1 to 5 people, this is probably right-sized for what you're running.

**[1:20 to 1:30 — face on camera, close]**

If it's worth a 15-minute conversation, just hit reply to my email and I'll send you a couple times to grab coffee or jump on a call.

Either way, good luck out there.

---

## Beat-by-beat breakdown

| Time | Beat | What's happening on screen | What you're saying |
| --- | --- | --- | --- |
| 0:00-0:08 | **Hook** | Your face, no intro music, no logo | Acknowledge their time. "Real quick because I know you're between jobs." |
| 0:08-0:25 | **Identity validation** | Your face | Mirror back what they're doing right (walking jobs in person). Promise NOT to replace it. |
| 0:25-0:55 | **Product demo** | Screen-share Ada's actual UI: a lead coming in, a follow-up draft, a review request, the inbound call flow | Show 3 specific things she does. Real screen, real flows. |
| 0:55-1:20 | **Offer** | Back to your face | The 3-shop founding offer, $3K savings, soft qualifier ("mostly you plus 1-5 people") |
| 1:20-1:30 | **CTA** | Your face | Hit reply for a 15-min conversation. Founder-direct, low-pressure. |

## What makes this version land

Three things distinguish this from a generic SaaS demo video:

1. **Opens by NOT pitching.** First 25 seconds are identity validation. You acknowledge what they're already doing right. They're hooked before you say the word "Ada."
2. **Demo shows real flows on a real screen.** Not slides. Not a deck. The actual approval queue, the actual draft, the actual call flow. They see the work happening.
3. **Closes with a small ask.** "15-minute conversation" not "schedule a 60-minute discovery call." Tiny next step.

## Production notes

- **Record on Loom.** Free plan handles 90-second videos. Auto-generates a shareable link.
- **One take is fine.** Don't try to make it perfect. Slight roughness reads as authentic, per PRODUCT.md ("Lived-in, not polished").
- **Background.** Your home office or any neutral space. NOT a stock backdrop. NOT a virtual blur (reads as zoom-call).
- **Wardrobe.** What you'd wear to a coffee meeting with a contractor. Not a suit, not a hoodie. A button-down or quality tee.
- **Equipment.** Built-in webcam is fine. AirPods or any wired mic beats laptop mic for audio quality.
- **Re-record once.** Watch the first take, fix anything that made you cringe, re-record. Don't go beyond 2 takes — perfectionism kills authenticity.

## What to put on the screen during the 0:25-0:55 demo

Three real product moments, in this exact order (each ~10 seconds):

1. **Lead Detail showing a Coastal Bath & Kitchen lead** with a "Drafted by Ada" cold email queued in the approval queue. Hover the draft so the body shows. Say: "Here's a draft Ada wrote for a real lead. You approve, edit, or skip. Nothing sends without your green light."

2. **Outreach Approval Queue showing 1-2 follow-up drafts.** Say: "Three days later, if they haven't replied, she drafts the next touch. Same review process."

3. **Conversations page showing a reply that landed + a 'Drafted by Sage' response queued.** Say: "When someone replies, Sage drafts your response. You decide what goes out."

If you don't have polished UI by recording time, use real screenshots of CommandSite as-is. Honesty over polish.

## Final tone check

If a friend who runs a contracting business watched this, would they:
- Roll their eyes at any moment? (kills it)
- Feel pitched at? (kills it)
- Lean in at the "between the handshakes" line? (good signal)
- Say "I'd take a 15-minute coffee on that" at the end? (the win)

The whole video is engineered to make that last reaction the natural conclusion. Nothing else matters.

## Posting + linking

1. Record on Loom (free.loom.com)
2. Set the video to "Anyone with the link can view" (no password)
3. Copy the share URL
4. Use as the `<link>` in touch 2 of the cold-email sequence
5. Optionally embed on a `/ada/walkthrough` page later, but the Loom link works fine for now

## Related docs

- `PRODUCT.md` — Ada brand voice + buyer profile
- `supabase/functions/draft-followup-emails/index.ts` — touch 2 + 3 prompt where this video link gets inserted
- `docs/grace-welcome-email-template.md` — pattern for Grace customer onboarding (parallel structure)
