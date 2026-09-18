import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata = {
  title: "Privacy Policy — LimitPact",
  description: "LimitPact Privacy Policy, effective August 15, 2026.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPolicy() {
  return (
    <>
      <Header />
      <main className="legalPage">
        <header className="legalHero sectionPad">
          <div className="legalContainer">
            <Link className="legalBack" href="/">← Back to LimitPact</Link>
            <span className="kicker">Legal</span>
            <h1>Privacy Policy</h1>
            <div className="legalDates">
              <span><strong>Effective Date:</strong> August 15, 2026</span>
              <span><strong>Last Updated:</strong> September 18, 2026</span>
            </div>
            <p>LimitPact is a software product operated by <strong>Oz Avrahami</strong>, an individual based in Israel (&quot;LimitPact&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).</p>
            <p>This Privacy Policy explains how we collect, use, store, and disclose personal information when you use the LimitPact website, desktop application, private beta, account integrations, and related services (collectively, the <strong>&quot;Services&quot;</strong>).</p>
            <p>By using the Services or providing information to us, you acknowledge the practices described in this Privacy Policy.</p>
          </div>
        </header>

        <div className="legalBody sectionPad">
          <article className="legalContainer legalArticle">
            <LegalSection number="1" title="Who We Are">
              <p>LimitPact is a trading discipline and risk-protection software product for futures traders.</p>
              <p>For privacy-related questions or requests, contact:</p>
              <ContactBlock />
            </LegalSection>

            <LegalSection number="2" title="Scope of This Policy">
              <p>This Privacy Policy applies to:</p>
              <ul>
                <li>the LimitPact website;</li>
                <li>the LimitPact desktop application;</li>
                <li>the LimitPact private beta;</li>
                <li>contact and beta-registration forms;</li>
                <li>supported trading-account integrations;</li>
                <li>communications between you and LimitPact; and</li>
                <li>related LimitPact services.</li>
              </ul>
              <p>It does not apply to third-party websites, brokers, trading platforms, or services that maintain their own privacy policies.</p>
            </LegalSection>

            <LegalSection number="3" title="Information We Collect">
              <h3>3.1 Information You Provide Directly</h3>
              <p>When you join the private beta, contact us, or otherwise communicate with LimitPact, we may collect:</p>
              <ul>
                <li>your name;</li>
                <li>your email address;</li>
                <li>your trading platform;</li>
                <li>the content of messages you send to us; and</li>
                <li>other information you voluntarily provide.</li>
              </ul>
              <p>You are not required to provide information through our forms, but we may be unable to respond to your request or provide beta access without the information requested.</p>

              <h3>3.2 Trading Account Information</h3>
              <p>If and when supported account integrations become available and you choose to connect an account, LimitPact may process limited account information required to provide its monitoring and protection features.</p>
              <p>Depending on the integration, this may include:</p>
              <ul>
                <li>trading-account identifiers;</li>
                <li>account status;</li>
                <li>account activity;</li>
                <li>positions;</li>
                <li>trade activity;</li>
                <li>profit and loss information;</li>
                <li>session-related account information; and</li>
                <li>other read-only information required to evaluate the protection rules you configure.</li>
              </ul>
              <p>LimitPact is designed to request only the account information reasonably necessary for its monitoring and protection features.</p>

              <h3>3.3 OAuth Authorization Information</h3>
              <p>Where an integration uses OAuth, LimitPact may process authorization tokens or similar credentials required to maintain the authorized connection.</p>
              <p>LimitPact does <strong>not</strong> collect or store your Tradovate username or password when authentication is performed through the official OAuth authorization flow.</p>
              <p>OAuth tokens are not your trading-platform password but should still be treated as sensitive authorization credentials.</p>

              <h3>3.4 Technical and Security Information</h3>
              <p>When you access the website or Services, certain technical information may be processed automatically by LimitPact or its infrastructure providers, such as:</p>
              <ul>
                <li>IP address;</li>
                <li>browser type;</li>
                <li>operating system;</li>
                <li>device information;</li>
                <li>timestamps;</li>
                <li>requested pages or endpoints;</li>
                <li>application errors;</li>
                <li>security events; and</li>
                <li>server or diagnostic logs.</li>
              </ul>
              <p>We use this information only where reasonably necessary to operate, secure, troubleshoot, and improve the Services.</p>
            </LegalSection>

            <LegalSection number="4" title="How We Use Information">
              <p>We may use personal information to:</p>
              <ul>
                <li>operate and provide the Services;</li>
                <li>maintain your private-beta registration;</li>
                <li>respond to questions and contact requests;</li>
                <li>communicate with you about beta availability or LimitPact;</li>
                <li>connect and maintain authorized trading-account integrations;</li>
                <li>monitor account information against protection rules you configure;</li>
                <li>provide application functionality;</li>
                <li>troubleshoot technical problems;</li>
                <li>detect abuse, fraud, or security threats;</li>
                <li>maintain the security and reliability of the Services;</li>
                <li>comply with applicable legal obligations; and</li>
                <li>establish, exercise, or defend legal claims where necessary.</li>
              </ul>
              <p>We do not use trading-account information to provide personalized investment recommendations or trading signals.</p>
            </LegalSection>

            <LegalSection number="5" title="Legal Bases for Processing">
              <p>Where laws such as the GDPR or UK GDPR apply, our legal bases may include:</p>
              <h3>Consent</h3>
              <p>We may rely on your consent when you voluntarily:</p>
              <ul>
                <li>join the private-beta list;</li>
                <li>submit information for a specific optional purpose; or</li>
                <li>authorize certain optional communications.</li>
              </ul>
              <p>Where processing is based on consent, you may withdraw that consent at any time.</p>
              <h3>Performance of Our Agreement With You</h3>
              <p>We may process information where necessary to provide Services you request, including supported account integrations and LimitPact application functionality.</p>
              <h3>Legitimate Interests</h3>
              <p>We may process information where reasonably necessary for legitimate interests such as:</p>
              <ul>
                <li>operating LimitPact;</li>
                <li>responding to inquiries;</li>
                <li>maintaining and improving reliability;</li>
                <li>protecting users and LimitPact from abuse;</li>
                <li>securing our systems; and</li>
                <li>troubleshooting technical problems,</li>
              </ul>
              <p>provided those interests are not overridden by applicable privacy rights.</p>
              <h3>Legal Obligations</h3>
              <p>We may process or disclose information where necessary to comply with applicable law, regulation, court order, or other legally binding requirement.</p>
            </LegalSection>

            <LegalSection number="6" title="Tradovate and Other Third-Party Integrations">
              <p>LimitPact may integrate with third-party trading platforms and services.</p>
              <p>The planned Tradovate integration is designed to use an official OAuth authorization flow and read-only account access.</p>
              <p>LimitPact does not require Tradovate API permission to:</p>
              <ul><li>place orders;</li><li>modify orders; or</li><li>cancel orders.</li></ul>
              <p>Authentication performed by Tradovate is governed by Tradovate&apos;s own terms and privacy practices.</p>
              <p>LimitPact is an independent software product and is not affiliated with or endorsed by Tradovate or NinjaTrader unless explicitly stated otherwise.</p>
            </LegalSection>

            <LegalSection number="7" title="How We Share Information">
              <p>We do <strong>not sell personal information</strong>.</p>
              <p>We do not share personal information for cross-context behavioral advertising or similar advertising purposes.</p>
              <p>We may disclose information only where reasonably necessary to:</p>
              <h3>Service Providers</h3>
              <p>We may use hosting, infrastructure, email, security, database, or technical service providers that process information on our behalf.</p>
              <p>Such providers receive information only as reasonably necessary to perform the relevant service.</p>
              <h3>Third-Party Integrations</h3>
              <p>Information may be exchanged with a trading platform or other service when necessary to establish and maintain an integration that you authorize.</p>
              <h3>Legal and Safety Requirements</h3>
              <p>We may disclose information where we reasonably believe disclosure is required to:</p>
              <ul>
                <li>comply with applicable law or legal process;</li>
                <li>protect the rights, safety, or security of LimitPact or others;</li>
                <li>investigate abuse or security incidents; or</li>
                <li>establish, exercise, or defend legal claims.</li>
              </ul>
              <h3>Business Changes</h3>
              <p>If LimitPact or substantially all of its operations are transferred, reorganized, or acquired in the future, relevant information may be transferred as part of that transaction, subject to applicable law.</p>
            </LegalSection>

            <LegalSection number="8" title="Cookies and Similar Technologies">
              <p>At this stage, LimitPact does not use advertising cookies, behavioral advertising trackers, or advertising pixels.</p>
              <p>We use Cloudflare Web Analytics to understand website visits, page views, referring websites, country and browser/device categories, and page performance. Cloudflare describes this service as using no analytics cookies or local storage and no fingerprinting of individuals. We do not send the names, email addresses, messages, or trading-platform selections entered in our forms to Web Analytics.</p>
              <p>We also calculate separate aggregate daily counts of accepted Contact submissions and Private Beta registrations from our saved submission records. These internal reports contain counts rather than individual records or submitted personal information. They do not identify unique people, attribute submissions to campaigns, or link individual website visits to submissions.</p>
              <p>The website may use strictly necessary storage or similar technologies where required for:</p>
              <ul><li>core functionality;</li><li>security;</li><li>session operation; or</li><li>user-interface preferences.</li></ul>
              <p>If our use of cookies or analytics changes materially, we will update this Privacy Policy and provide any consent mechanism required by applicable law.</p>
            </LegalSection>

            <LegalSection number="9" title="Data Retention">
              <p>We retain personal information only for as long as reasonably necessary for the purposes described in this Policy or as required by applicable law.</p>
              <p>In general:</p>
              <ul>
                <li>private-beta and contact information may be retained for up to <strong>24 months after the last meaningful interaction</strong>, unless an ongoing relationship requires longer retention;</li>
                <li>OAuth authorization information is retained only while reasonably necessary to maintain the authorized integration and is removed or invalidated when no longer required where technically possible;</li>
                <li>account information is retained only to the extent required for LimitPact functionality, security, troubleshooting, or legally required records;</li>
                <li>technical and security logs are retained for periods reasonably necessary for security, reliability, and troubleshooting.</li>
              </ul>
              <p>We may retain limited information for longer where necessary to comply with legal obligations, resolve disputes, prevent abuse, or enforce agreements.</p>
            </LegalSection>

            <LegalSection number="10" title="International Data Transfers">
              <p>LimitPact is operated from Israel and may use service providers located in Israel or other countries.</p>
              <p>This means personal information may be processed in a country other than the country where you live.</p>
              <p>Where applicable law requires safeguards for an international transfer of personal information, we will use legally recognized safeguards or another lawful transfer mechanism as required.</p>
            </LegalSection>

            <LegalSection number="11" title="Security">
              <p>We take reasonable technical and organizational measures designed to protect personal information against unauthorized access, loss, misuse, alteration, or disclosure.</p>
              <p>Our security approach includes limiting access to information to what is reasonably necessary for the operation of the Services.</p>
              <p>However, no internet service, computer system, or storage system can be guaranteed to be completely secure.</p>
              <p>You are responsible for maintaining the security of your own devices, trading-platform accounts, email accounts, and credentials.</p>
            </LegalSection>

            <LegalSection number="12" title="Your Privacy Rights">
              <p>Depending on where you live and which laws apply, you may have rights regarding your personal information, including the right to:</p>
              <ul>
                <li>request access to personal information we hold about you;</li>
                <li>request correction of inaccurate information;</li>
                <li>request deletion of information;</li>
                <li>request restriction of certain processing;</li>
                <li>object to certain processing;</li>
                <li>request portability of certain information;</li>
                <li>withdraw consent where processing is based on consent; and</li>
                <li>lodge a complaint with an applicable data-protection authority.</li>
              </ul>
              <p>These rights are subject to applicable legal exceptions and limitations.</p>
              <p>To exercise a privacy right, contact:</p>
              <p><strong><a href="mailto:hello@limitpact.com">hello@limitpact.com</a></strong></p>
              <p>We may request information reasonably necessary to verify your identity before completing certain requests.</p>
            </LegalSection>

            <LegalSection number="13" title="Automated Decision-Making">
              <p>LimitPact&apos;s protection rules may automatically evaluate trading-account information against thresholds that <strong>you configure</strong>.</p>
              <p>These rules are intended to control local LimitPact functionality and do not make investment decisions on your behalf.</p>
              <p>LimitPact does not use automated profiling to determine your creditworthiness, employment, insurance eligibility, or similar legally significant characteristics.</p>
            </LegalSection>

            <LegalSection number="14" title="No Sale of Personal Information">
              <p>LimitPact does not sell personal information.</p>
              <p>LimitPact does not currently monetize personal information through targeted advertising or data-broker relationships.</p>
              <p>If this practice ever changes, this Privacy Policy will be updated before such use begins, and applicable rights and consent requirements will be respected.</p>
            </LegalSection>

            <LegalSection number="15" title="Age Requirement">
              <p>LimitPact is intended only for individuals who are <strong>18 years of age or older</strong>.</p>
              <p>The Services are not directed to children or minors.</p>
              <p>If we learn that personal information was collected from a person who is not eligible to use LimitPact, we may delete the information and terminate access where appropriate.</p>
              <p>If you believe a minor has provided personal information to LimitPact, contact us at:</p>
              <p><strong><a href="mailto:hello@limitpact.com">hello@limitpact.com</a></strong></p>
            </LegalSection>

            <LegalSection number="16" title="Third-Party Websites and Services">
              <p>The Services may contain links to or integrations with third-party websites or services.</p>
              <p>We are not responsible for the privacy, security, availability, or practices of third-party services.</p>
              <p>You should review the privacy policies of any third party you choose to use.</p>
            </LegalSection>

            <LegalSection number="17" title="Changes to This Privacy Policy">
              <p>We may update this Privacy Policy as LimitPact develops, new features are introduced, legal requirements change, or our data practices change.</p>
              <p>When we make material changes, we will update the <strong>Last Updated</strong> date and provide additional notice where required by applicable law.</p>
              <p>Your continued use of the Services after an updated Policy becomes effective is subject to applicable law.</p>
            </LegalSection>

            <LegalSection number="18" title="Contact Us">
              <p>Questions, privacy requests, or concerns may be sent to:</p>
              <ContactBlock compact />
            </LegalSection>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}

function LegalSection({ number, title, children }) {
  return (
    <section className="legalSection" aria-labelledby={`privacy-${number}`}>
      <h2 id={`privacy-${number}`}>{number}. {title}</h2>
      {children}
    </section>
  );
}

function ContactBlock({ compact = false }) {
  return (
    <address className={compact ? "legalContact compact" : "legalContact"}>
      <strong>LimitPact</strong>
      <span>Operated by{compact ? " " : ": "}<strong>Oz Avrahami</strong></span>
      <span>{compact ? "Israel" : <>Country: <strong>Israel</strong></>}</span>
      <a href="mailto:hello@limitpact.com">hello@limitpact.com</a>
    </address>
  );
}
