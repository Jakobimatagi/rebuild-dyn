import { styles } from "../styles";

export default function PrivacyPolicy({ onBack }) {
  return (
    <>
      <div style={styles.header}>
        <div style={styles.logo}>Dynasty OS</div>
        <h1 style={styles.title}>Privacy Policy</h1>
        <p style={styles.subtitle}>Last updated: April 2025</p>
      </div>
      <div style={{ maxWidth: 680, lineHeight: 1.7, color: "#d1d7ea" }}>
        <section style={sectionStyle}>
          <h2 style={headingStyle}>1. Overview</h2>
          <p>
            Dynasty Advisor ("we", "us", or "our") operates the Dynasty Advisor
            web application. This page informs you of our policies regarding the
            collection, use, and disclosure of personal information when you use
            our service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>2. Information We Collect</h2>
          <p>
            We do not collect or store any personal information on our servers.
            The only data used by this app is your Sleeper username, which is
            stored locally in your browser (localStorage) to remember your
            session. This information never leaves your device to our servers.
          </p>
          <p style={{ marginTop: 12 }}>
            All fantasy football data (rosters, leagues, player stats) is
            fetched directly from the public Sleeper API and is not stored by
            us.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>3. Google AdSense & Cookies</h2>
          <p>
            This site uses Google AdSense to display advertisements. Google
            AdSense uses cookies to serve ads based on your prior visits to this
            website or other websites. Google's use of advertising cookies
            enables it and its partners to serve ads to you based on your visit
            to this site and/or other sites on the Internet.
          </p>
          <p style={{ marginTop: 12 }}>
            You may opt out of personalized advertising by visiting{" "}
            <a
              href="https://www.google.com/settings/ads"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#00f5a0" }}
            >
              Google Ads Settings
            </a>
            .
          </p>
          <p style={{ marginTop: 12 }}>
            For more information on how Google uses data when you use our
            site, visit{" "}
            <a
              href="https://policies.google.com/technologies/partner-sites"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#00f5a0" }}
            >
              How Google uses data from sites that use our services
            </a>
            .
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>4. Third-Party Services</h2>
          <p>
            This app interacts with the following third-party services:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li style={{ marginBottom: 6 }}>
              <strong>Sleeper API</strong> — used to fetch your league,
              roster, and player data. Subject to Sleeper's own privacy policy.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>FantasyCalc API</strong> — used to fetch dynasty player
              trade values.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>Google AdSense</strong> — used to display advertisements.
              Subject to Google's privacy policy.
            </li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>5. Cookies</h2>
          <p>
            We do not set any first-party cookies. Third-party cookies may be
            set by Google AdSense for advertising purposes as described above.
            You can control cookie settings through your browser preferences.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>6. Children's Privacy</h2>
          <p>
            This service is not directed to anyone under the age of 13. We do
            not knowingly collect personal information from children under 13.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>7. Changes to This Policy</h2>
          <p>
            We may update this privacy policy from time to time. Changes will
            be posted on this page with an updated date.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>8. Contact</h2>
          <p>
            If you have any questions about this privacy policy, please open an
            issue or contact us via the app's GitHub repository.
          </p>
        </section>

        <div style={{ marginTop: 40 }}>
          <button
            className="dyn-btn"
            style={styles.btn}
            onClick={onBack}
          >
            ← Back
          </button>
        </div>
      </div>
    </>
  );
}

const sectionStyle = {
  marginBottom: 28,
  fontSize: 13,
};

const headingStyle = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#00f5a0",
  marginBottom: 10,
};
