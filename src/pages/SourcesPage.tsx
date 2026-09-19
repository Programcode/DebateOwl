export default function SourcesPage() {
  const sources = [
    {
      authors: "AITHAL, V.; SILVER, J.",
      title: "Enhancing critical thinking skills with AI-assisted technology.",
      year: "2023",
      url: "https://www.cambridge.org/elt/blog/2023/03/30/enhancing-learners-critical-thinking-skills-with-ai-assisted-technology/",
    },
    {
      authors: "AITHOR.",
      title: "La variable dependiente e independiente en la investigaci\u00f3n.",
      year: "2025",
      url: "https://aithor.com/blog/es-419/independent-and-dependent-variables",
    },
    {
      authors: "BAL, D.",
      title: "Debate \u2014 Questions, Structure, and Topics.",
      year: "2023",
      url: "https://tutors.com/lesson/debates",
    },
    {
      authors: "CASTILLERO MIMENZA, O.",
      title: "Variable dependiente e independiente: qu\u00e9 son, con ejemplos.",
      year: "2019",
      url: "https://psicologiaymente.com/miscelanea/variable-dependiente-independiente",
    },
    {
      authors: "DEBATE PROJECT.",
      title: "Artificial Intelligence on Classroom Debates.",
      year: "2024",
      url: "https://debateproject.eu/chapter-7-artificial-intelligence-on-classroom-debates/",
    },
    {
      authors: "ENCYCLOPAEDIA BRITANNICA.",
      title: "Debate.",
      year: "s.f.",
      url: "https://www.britannica.com/art/debate",
    },
    {
      authors: "HOLBECK, R.",
      title: "Helping Students Develop AI Prompting Skills for Critical Thinking.",
      year: "2025",
      url: "https://www.facultyfocus.com/articles/teaching-with-technology-articles/helping-students-develop-ai-prompting-skills-for-critical-thinking/",
    },
    {
      authors: "INTERNATIONAL BACCALAUREATE ORGANIZATION.",
      title: "Academic Integrity.",
      year: "2022",
      url: "https://www.ibo.org/about-the-ib/what-it-means-to-be-an-ib-student/responsibilities-of-students-and-ib-world-schools/academic-integrity/",
    },
    {
      authors: "LAM SCIENCE.",
      title: "\u00bfQu\u00e9 son las variables dependientes, independientes y controladas?",
      year: "2026",
      url: "https://esp.lamscience.com/what-are-dependent-independent-controlled-variables",
    },
    {
      authors: "MDPI.",
      title: "Systematic Review of Artificial Intelligence in Education: Trends, Benefits, and Challenges.",
      year: "2025",
      url: "https://www.mdpi.com/2414-4088/9/8/84",
    },
    {
      authors: "MURIEL, Tom\u00e1s.",
      title: "Qu\u00e9 es un debate.",
      year: "2024",
      url: "https://www.significados.com/debate/",
    },
    {
      authors: "PAULSON, E.",
      title: "Critical Thinking with AI: 3 Approaches.",
      year: "2024",
      url: "https://tlconestoga.ca/critical-thinking-with-ai-3-approaches/",
    },
    {
      authors: "QATARDEBATE CENTER.",
      title: "What is Debate?",
      year: "s.f.",
      url: "https://qatardebate.org/what-is-debate/",
    },
    {
      authors: "REVISIONDOJO.",
      title: "Integrity in IB Theory of Knowledge (TOK): Building Ethical Thinkers.",
      year: "2025",
      url: "https://www.revisiondojo.com/blog/integrity-in-ib-theory-of-knowledge-tok-building-ethical-thinkers",
    },
    {
      authors: "REVISIONDOJO.",
      title: "Ethics in IB Digital Society: How Students Should Approach It.",
      year: "2026",
      url: "https://www.revisiondojo.com/blog/ethics-in-ib-digital-society-how-students-should-approach-it",
    },
    {
      authors: "SLATER, T.",
      title: "Embracing the AI Era: Why Upskilling in Critical Thinking is Essential.",
      year: "2025",
      url: "https://www.nigp.org/blog/embracing-ai-era",
    },
    {
      authors: "STRYKER, Cole.",
      title: "What are large language models (LLMs)?",
      year: "2023",
      url: "https://www.ibm.com/think/topics/large-language-models",
    },
    {
      authors: "STUDY.COM.",
      title: "Understanding Different Debate Formats.",
      year: "2021",
      url: "https://study.com/academy/lesson/understanding-different-debate-formats.html",
    },
    {
      authors: "WESTERN MICHIGAN UNIVERSITY.",
      title: "AI and Critical Thinking in Education.",
      year: "2024",
      url: "https://wmich.edu/x/teaching-learning/teaching-resources/ai-critical-thinking",
    },
    {
      authors: "SOCIEDAD DOMINICANA DE DEBATE.",
      title: "El Debate.",
      year: "2025",
      url: "https://debate.funglode.org/el-debate/",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Sources</h1>

        <div className="mt-8 space-y-6 text-sm leading-6 text-foreground">
          <section>
            <p className="text-muted-foreground">
              The following sources were consulted during the research and development of DebateLab.
              They are listed alphabetically by author surname or institutional name, following APA
              citation conventions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-4">References</h2>
            <ol className="list-decimal list-inside space-y-4">
              {sources.map((source, index) => (
                <li key={index} className="pl-2 leading-relaxed">
                  <span className="font-medium">{source.authors}</span>{" "}
                  <em>{source.title}</em>{" "}
                  {source.year}.{" "}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 break-words [overflow-wrap:anywhere] hover:text-primary/80 transition-colors"
                  >
                    {source.url}
                  </a>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}
