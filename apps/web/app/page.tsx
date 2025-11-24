const milestones = [
  {
    label: "Hook Prototype",
    detail: "Prediction quiz UX that lets readers verify knowledge in seconds.",
    status: "Building now",
  },
  {
    label: "IDE Split View",
    detail: "VS Code-inspired deep dive where remediation and article stay in sync.",
    status: "Next up",
  },
  {
    label: "Skip Logic",
    detail: "Mark redundant articles as skippable once a concept is verified.",
    status: "Exploring",
  },
];

const checklist = [
  "Quiz-guided reading loop that rewards confidence, not completionism.",
  "AI remediation that explains the logic gap instead of dumping answers.",
  "Map of each article so gaps and verified sections are obvious at a glance.",
];

export default function Home() {
  return (
    <main className="page">
      <div className="stage">
        <span className="pill">alpha.diffread.app</span>
        <h1>
          Quiz-guided reading,
          <br />
          shipping soon.
        </h1>
        <p className="lede">
          We are finishing the Knowledge IDE prototype. This placeholder keeps
          the Vercel pipeline warm while we wire up ingestion, prediction
          quizzes, and the IDE view described in the PRD.
        </p>
        <section className="panel">
          <header>
            <p className="eyebrow">Build Status</p>
            <h2>What is cooking</h2>
          </header>
          <div className="milestones">
            {milestones.map((item) => (
              <article key={item.label} className="milestone">
                <div className="milestone-heading">
                  <h3>{item.label}</h3>
                  <span>{item.status}</span>
                </div>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel focus">
          <header>
            <p className="eyebrow">Why this matters</p>
            <h2>The Confidence to Skip</h2>
          </header>
          <ul>
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="panel cta">
          <div>
            <p className="eyebrow">Need early access?</p>
            <h2>Say hi at alpha@diffread.app</h2>
            <p>
              Drop a note with the backlog you are trying to clear and we will
              prioritize onboarding.
            </p>
          </div>
          <a className="button" href="mailto:alpha@diffread.app">
            Request invite
          </a>
        </section>

        <footer>
          <p>© {new Date().getFullYear()} Diffread. Built for prosumers.</p>
        </footer>
      </div>
    </main>
  );
}
