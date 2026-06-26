import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Public, no-auth pages for the App Store-required Terms of Service and Privacy
// Policy. Deployed with verify_jwt=false so a browser (or an Apple reviewer)
// can open them directly. Source of truth: /legal/*.md in the repo — keep in
// sync. Routes: /legal (index), /legal/terms, /legal/privacy.

const UPDATED = 'June 25, 2026';

const css = `
  :root { color-scheme: light; }
  body { font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1E232C; max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 26px; } h2 { font-size: 19px; margin-top: 32px; }
  a { color: #DC143C; } .muted { color: #6A707C; font-size: 14px; }
  .note { background: #FFF1F1; border: 1px solid #F3C2CA; border-radius: 10px;
    padding: 12px 16px; font-size: 14px; }
  nav a { margin-right: 16px; font-weight: 600; }
  footer { margin-top: 48px; border-top: 1px solid #E8ECF4; padding-top: 16px; }
`;

function page(title: string, bodyHtml: string): Response {
  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BasisRide — ${title}</title><style>${css}</style></head>
<body><nav><a href="/functions/v1/legal/terms">Terms</a><a href="/functions/v1/legal/privacy">Privacy</a></nav>
<h1>${title}</h1><p class="muted">Last updated: ${UPDATED}</p>${bodyHtml}
<footer class="muted">BasisRide — carpool coordination for verified BISV families. Contact: support@basisride.app</footer>
</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

const privacy = `
<p>BasisRide ("we", "us") helps verified families at Basis Independent Silicon Valley (BISV) coordinate carpools. By creating an account you agree to this policy.</p>
<h2>Who uses BasisRide</h2>
<p>Accounts are created and used by <strong>parents and guardians</strong> (adults). It is not for use by children directly. Parents provide limited information about their child for carpool coordination.</p>
<h2>Information we collect</h2>
<ul>
<li><strong>Account &amp; contact:</strong> parent/guardian name, email, password (stored hashed).</li>
<li><strong>Child information (provided by the parent):</strong> child's name and grade — used only to identify riders in your carpool.</li>
<li><strong>Home location:</strong> your home address and approximate coordinates, to set pickup/drop-off and match nearby families.</li>
<li><strong>Vehicle (drivers only):</strong> car color, type, and license plate, so riders can identify the vehicle.</li>
<li><strong>Trip location (active trips only):</strong> while a driver has a trip in progress, their device location is shared in real time with that trip's riders' parents. <strong>This live location is not stored.</strong></li>
<li><strong>Messages</strong> you send to other carpool members.</li>
<li><strong>Device &amp; diagnostics:</strong> a push token, and crash/error diagnostics (via Sentry).</li>
</ul>
<h2>How we use it</h2>
<p>To create and verify your account (invited BISV families only), match carpools, coordinate schedules and pickups, deliver notifications, investigate abuse reports, and improve reliability. We <strong>do not sell</strong> your information and <strong>do not use it for advertising</strong>.</p>
<h2>Who can see your information</h2>
<p>Other parents in your carpool can see your name, your child's name and grade, your pickup area, your vehicle details (if you drive), and messages you send them. Service providers (Supabase for backend/auth, Sentry for error monitoring) process data on our behalf. We may disclose information if required by law or to protect someone's safety.</p>
<h2>Retention &amp; deletion</h2>
<p>We keep your information while your account is active. You can <strong>delete your account at any time</strong> in the app (Profile → Delete account), which permanently removes your profile and associated data, or email us to request deletion.</p>
<h2>Children's privacy</h2>
<p>BasisRide is for parents/guardians, who provide limited child information solely for carpool coordination. We do not knowingly allow children to create accounts.</p>
<h2>Security</h2>
<p>Data is encrypted in transit and access is restricted to authenticated, invited BISV families via database access controls.</p>
<h2>Contact</h2>
<p><a href="mailto:support@basisride.app">support@basisride.app</a></p>`;

const terms = `
<h2>1. What BasisRide is</h2>
<p>BasisRide is a <strong>coordination tool</strong> for verified BISV families to arrange carpools among themselves. BasisRide is <strong>not</strong> a transportation provider, rideshare company, or carrier. We do not provide transportation, employ or contract drivers, vet or background-check drivers or riders, or supervise any trip. All carpools are arranged and carried out <strong>by parents/guardians at their own discretion and risk.</strong></p>
<h2>2. Eligibility</h2>
<p>You must be a parent or legal guardian of a BISV student and have a valid invite code from BISV or another BISV family. Accounts are for adults.</p>
<h2>3. Your responsibilities</h2>
<ul>
<li>Provide accurate information about yourself and your child.</li>
<li>If you drive: hold a <strong>valid license and current auto insurance</strong>, keep your vehicle legal and roadworthy, and comply with all traffic and child-passenger-safety laws (including car-seat/booster requirements).</li>
<li>Decide for yourself whether to offer or accept any ride; you are responsible for the safety of any trip you join.</li>
<li>Treat other members respectfully and post no abusive or objectionable content.</li>
</ul>
<h2>4. Safety &amp; no vetting</h2>
<p><strong>We do not perform background checks</strong> and do not verify driving records, insurance, or vehicle condition. You are responsible for satisfying yourself about any driver before entrusting your child to a carpool. Invite-only access limits the community to BISV families but is not a guarantee of any individual's trustworthiness.</p>
<h2>5. Content &amp; conduct</h2>
<p>You are responsible for the content you share. Abusive, harassing, or objectionable content is prohibited. You can <strong>report</strong> content and <strong>block</strong> users in the app. We may review reports and remove content or suspend accounts, typically within 24 hours of a report.</p>
<h2>6. Assumption of risk; limitation of liability</h2>
<p>To the fullest extent permitted by law, you participate in carpools <strong>at your own risk</strong>. BasisRide and its creators are <strong>not liable</strong> for any injury, loss, damage, or dispute arising from any carpool, ride, driver, rider, or interaction arranged through the app. BasisRide is provided <strong>"as is"</strong> without warranties. Our total liability is limited to the amount you paid us (which is $0 for a free app).</p>
<h2>7. Indemnification</h2>
<p>You agree to indemnify and hold harmless BasisRide and its creators from claims arising out of your use of the app, your carpools, or your violation of these terms.</p>
<h2>8. Termination</h2>
<p>You may delete your account at any time (Profile → Delete account). We may suspend or terminate accounts that violate these terms.</p>
<h2>9. Changes</h2>
<p>We may update these terms; continued use after an update means you accept the revised terms.</p>
<h2>10. Contact</h2>
<p><a href="mailto:support@basisride.app">support@basisride.app</a></p>`;

const index = `
<p class="note">These are launch drafts pending attorney review. They describe how BasisRide handles your data and the terms of use.</p>
<p><a href="/functions/v1/legal/terms">Terms of Service</a> · <a href="/functions/v1/legal/privacy">Privacy Policy</a></p>`;

Deno.serve((req: Request) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  if (path.endsWith('/privacy')) return page('Privacy Policy', privacy);
  if (path.endsWith('/terms')) return page('Terms of Service', terms);
  return page('Legal', index);
});
