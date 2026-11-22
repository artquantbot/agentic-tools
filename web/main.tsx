import { createRoot } from "react-dom/client";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Activity, ArrowUpRight, AudioLines, BookOpen, Bookmark, Box, Braces, ChevronRight, CircleHelp, Code2, Command, Cpu, Database, Filter, GitBranch, GitFork, Globe, Layers3, Moon, Network, Package, Plus, ScanLine, Search, Shield, Sun, Terminal, Waypoints, X } from "lucide-react";
import type { SearchResult, StackResult } from "../src/catalog.ts";
import type { Filters, Tool } from "../src/schema.ts";
import { categoryTitle } from "../src/ranking.ts";
import { useCases, type UseCase } from "./use-cases.ts";
import "./style.css";

const repo = "https://github.com/artquantbot/agentic-tools";
const examples = ["Build a secure coding agent.", "Run an LLM locally on a Mac.", "Find an MCP server for PostgreSQL.", "Compare agent memory frameworks.", "Build a browser automation stack."];
const icons = { frameworks: Network, browser: Globe, inference: Cpu, mcp: Waypoints, memory: Database, security: Shield, sandbox: Box, models: Braces, orchestration: GitBranch, workflow: Layers3, extraction: ScanLine, voice: AudioLines, hosting: Terminal, emerging: Activity };
const categoryOrder = ["frameworks", "mcp", "browser", "inference", "memory", "sandbox"];
type Directory = { categories: { id: string; name: string; count: number }[]; count: number; generatedAt: string; facets: { os: string[]; language: string[]; license: string[] } };
type Card = SearchResult["results"][number];
type Detailed = Tool & { freshness: string };
const date = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
const label = (value: string | null) => value ?? "Unknown";
const format = (value: string[] | null) => value?.join(", ") || "Unknown";
const linkTo = (query: string) => "/discover?" + new URLSearchParams({ query });
const savedLimit = 25;
const searchStorageKey = "agentic-pending-search";
type ShelfState = { saved: string[]; toggleSaved: (id: string) => void };
type CardActions = ShelfState & { selection: string[]; toggle: (id: string) => void };

function openSearch(query: string) {
  try {
    sessionStorage.setItem(searchStorageKey, query);
    location.assign("/discover");
  } catch {
    const url = new URL("/discover", location.origin);
    url.hash = new URLSearchParams({ query }).toString();
    location.assign(url.href);
  }
}
function readInitialQuery() {
  const linkedQuery = new URLSearchParams(location.search).get("query");
  if (linkedQuery !== null) return linkedQuery.slice(0, 500);
  try {
    const pending = sessionStorage.getItem(searchStorageKey);
    if (pending !== null) return pending.slice(0, 500);
  } catch { /* The hash can carry the query when storage is unavailable. */ }
  return (new URLSearchParams(location.hash.slice(1)).get("query") ?? "").slice(0, 500);
}
function readIds(key: string, limit: number) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (Array.isArray(value)) {
      return [...new Set(value.filter((id): id is string => typeof id === "string" && /^[a-z0-9][a-z0-9-]{1,119}$/.test(id)))].slice(0, limit);
    }
  } catch { /* Storage can be unavailable in restricted browser contexts. */ }
  return [];
}
function Icon({ category, size = 20 }: { category: string; size?: number }) {
  const Component = icons[category as keyof typeof icons] ?? Package;
  return <Component size={size} aria-hidden="true" />;
}

async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/v1" + path, {
    ...(body !== undefined ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    signal
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message ?? "The catalog could not be reached.");
  }
  return response.json();
}
function useRequest<T>(path: string, body?: string) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    const controller = new AbortController();
    setState({});
    if (path) api<T>(path, body ? JSON.parse(body) : undefined, controller.signal)
      .then(data => setState({ data }))
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }); });
    return () => controller.abort();
  }, [path, body]);
  return state;
}

const links = [["/discover", "Discover"], ["/categories", "Categories"], ["/use-cases", "Use cases"], ["/compare", "Compare"], ["/stack", "Stack Builder"], ["/developers", "Developers"]];
function Layout({ children, path, savedCount }: { children: ReactNode; path: string; savedCount: number }) {
  const searchDialog = useRef<HTMLDialogElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const savedLabel = savedCount ? `Saved tools (${savedCount})` : "Saved tools";
  function showSearch() {
    const dialog = searchDialog.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    dialog.querySelector("input")?.focus();
  }
  useLayoutEffect(() => {
    const openShortcut = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      showSearch();
    };
    window.addEventListener("keydown", openShortcut);
    return () => window.removeEventListener("keydown", openShortcut);
  }, []);
  const [theme, setTheme] = useState(() => localStorage.getItem("agentic-theme") === "light" ? "light" : "dark");
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("agentic-theme", theme); }, [theme]);
  return <>
    <a className="skip" href="#main">Skip to content</a>
    <header className="site-header"><div className="wrap header">
      <a href="/" className="brand"><span className="brand-mark"><Command size={21}/></span><span>agentic<span className="brand-dot">.</span>tools</span></a>
      <nav aria-label="Main navigation">{links.map(([url, title]) => <a key={url} href={url} aria-current={path === url || path.startsWith(url + "/") ? "page" : undefined}>{title}</a>)}</nav>
      <div className="header-actions">
      <button ref={searchTrigger} type="button" className="github-link quick-search" aria-label="Search" title="Quick search (⌘K or Ctrl+K)" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" onClick={showSearch}><Search size={16}/> <span>Search</span></button>
      <a href="/saved" className="github-link saved-link" aria-current={path === "/saved" ? "page" : undefined} aria-label={savedLabel}><Bookmark size={16}/><span>{savedLabel}</span></a>
      <button type="button" className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button><a href={repo} className="github-link" aria-label="GitHub repository"><GitFork size={16}/> <span>GitHub</span></a></div>
    </div></header>
    <main id="main" className="wrap">{children}</main>
    <dialog ref={searchDialog} className="search-dialog" aria-labelledby="quick-search-title" onClose={() => searchTrigger.current?.focus()}>
      <div className="dialog-heading"><h2 id="quick-search-title">Quick search</h2><button className="icon-button" type="button" aria-label="Close quick search" onClick={() => searchDialog.current?.close()}><X size={18}/></button></div>
      <SearchBox onSearch={openSearch}/>
      <div className="examples">{examples.slice(0, 3).map(query => <a href={linkTo(query)} key={query}>{query.replace(/\.$/, "")}</a>)}</div>
    </dialog>
    <footer className="site-footer"><div className="wrap footer"><div><a href="/" className="brand"><span className="brand-mark"><Command size={19}/></span><span>agentic.tools</span></a><p>Tell us what your agent needs. We find the tools that fit.</p></div>
    <div className="footer-links"><a href="/about">About</a><a href="/developers">Developers</a><a href={repo}>GitHub</a></div></div></footer>
  </>;
}
function SearchBox({ initial = "", onSearch, stack = false }: { initial?: string; onSearch: (value: string) => void; stack?: boolean }) {
  const [value, setValue] = useState(initial);
  function submit(event: FormEvent) { event.preventDefault(); onSearch(value.trim()); }
  return <form className="search-box" onSubmit={submit}>
    <Search size={20} aria-hidden="true"/>
    <input aria-label="Describe what your agent needs" maxLength={500} placeholder="Describe what your agent needs…" value={value} onChange={event => setValue(event.target.value)} required={stack}/>
    <button className="button primary" type="submit">{stack ? "Find components" : "Search tools"}</button>
  </form>;
}
function SectionHeading({ title, description, next, nextLabel }: { title: string; description?: string; next?: string; nextLabel?: string }) {
  return <div className="section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{next && <a className="text-link" href={next}>{nextLabel}</a>}</div>;
}
function CategoryGrid({ directory, featured = false }: { directory?: Directory; featured?: boolean }) {
  if (!directory) return <p role="status">Loading categories…</p>;
  const populated = directory.categories.filter(category => category.count > 0);
  const categories = featured ? categoryOrder.flatMap(id => populated.filter(category => category.id === id)) : populated;
  return <div className="category-grid">{categories.map(category => <a key={category.id} className="category-card" href={"/discover?category=" + category.id}>
    <span className="category-icon"><Icon category={category.id}/></span><span><strong>{category.name}</strong><small>{category.count} {category.count === 1 ? "tool" : "tools"}</small></span><ChevronRight size={16} className="chevron" aria-hidden="true"/>
  </a>)}</div>;
}
function SaveButton({ id, name, saved, toggleSaved }: ShelfState & { id: string; name: string }) {
  const isSaved = saved.includes(id);
  return <button className="icon-button save-toggle" type="button" aria-label={isSaved ? `Remove ${name} from saved tools` : `Save ${name}`}
    aria-pressed={isSaved} disabled={!isSaved && saved.length >= savedLimit} onClick={() => toggleSaved(id)}>
    <Bookmark size={16} fill={isSaved ? "currentColor" : "none"}/>
  </button>;
}
function ToolCard({ item, selection, toggle, saved, toggleSaved, explained = false }: CardActions & { item: Card; explained?: boolean }) {
  const { tool, evidence, scores, why, requirements, eligible, alternatives } = item;
  const selected = selection.includes(tool.id);
  return <article className="tool-card">
    <div className="card-top"><div className="category-icon"><Icon category={tool.categories[0]}/></div><div className="card-actions"><SaveButton id={tool.id} name={tool.name} saved={saved} toggleSaved={toggleSaved}/><button className="icon-button compare-toggle" type="button" aria-pressed={selected} disabled={!selected && selection.length >= 5} aria-label={(selected ? "Remove " : "Add ") + tool.name + (selected ? " from comparison" : " to comparison")} onClick={() => toggle(tool.id)}>{selected ? <X size={16}/> : <Plus size={16}/>}</button></div></div>
    <p className="eyebrow category-label">{categoryTitle(tool.categories[0])}</p>
    <h3><a href={"/tools/" + tool.id}>{tool.name}</a></h3>
    <p className="tool-desc">{tool.description ?? "Repository metadata available. Capability details are pending."}</p>
    <div className="tags">{tool.license && <span>{tool.license}</span>}{tool.hosting && <span>{tool.hosting}</span>}{!eligible && <span>Review required</span>}</div>
    {explained && <details><summary>{scores.taskFit ? why : "Evidence and requirements"}</summary>
      <ul>{requirements.map(req => <li key={req.field + String(req.value)}>{req.field}: {String(req.value)} · {req.required ? "required" : "preferred"} · {req.status}</li>)}</ul>
      {tool.tradeoff && <p>{tool.tradeoff}</p>}
      <p>Advisory status: {scores.trust.advisoryStatus}. Maintenance: {scores.maintenance}. Cost: {scores.cost}.</p>
      <ul>{evidence.map((source, index) => <li key={index}><a href={source.url}>{source.kind}</a> · {date(source.verifiedAt)}</li>)}</ul>
      {tool.setup && <a href={tool.setup}>Setup documentation</a>}
      {!!alternatives.length && <p>Alternatives {alternatives.map(alternative => <a key={alternative.id} href={"/tools/" + alternative.id}>{alternative.name} </a>)}</p>}
    </details>}
    <div className="card-foot"><span>{tool.confidence === "curated" ? "Documentation reviewed" : "Source metadata"} · {tool.freshness}</span><a href={"/tools/" + tool.id} aria-label={"View details for " + tool.name}><ArrowUpRight size={16}/></a></div>
  </article>;
}
function Cards({ items, ...props }: CardActions & { items: Card[]; explained?: boolean }) {
  return <div className="tool-grid">{items.map(item => <ToolCard key={item.tool.id} item={item} {...props}/>)}</div>;
}
function Notice({ error, loading }: { error?: string; loading?: boolean }) {
  return error ? <p className="notice error" role="alert">{error}</p> : loading ? <p className="notice" role="status">Loading catalog…</p> : null;
}
function Home({ directory, ...actions }: CardActions & { directory: ReturnType<typeof useRequest<Directory>> }) {
  const featured = useRequest<SearchResult>("/search", JSON.stringify({ query: "LangGraph Playwright Ollama Mem0", limit: 3 }));
  const activity = useRequest<SearchResult>("/tools?sort=recent&limit=3");
  return <>
    <section className="hero discovery-hero">
      <div className="hero-main">
        {directory.data && <p className="catalog-count">{directory.data.count} tools <span aria-hidden="true">/</span> {directory.data.categories.filter(category => category.count > 0).length} categories</p>}
        <h1>Find the right tools<br className="desktop-break"/> for your <em>AI agents.</em></h1>
        <p className="hero-description">Discover frameworks, MCP servers and infrastructure. Compare the evidence, then save tools for your next build.</p>
        <div className="hero-controls"><SearchBox onSearch={openSearch}/></div>
        <div className="hero-links">
          <a className="text-link" href="/discover">Browse all tools</a>
          <a className="text-link" href="/discover?noPaidApi=true">No paid API required</a>
        </div>
      </div>
      <aside className="hero-workflows" aria-labelledby="hero-workflows-title">
        <h2 id="hero-workflows-title">Start with a use case</h2>
        <ul>{useCases.map(item => <li key={item.slug}><a href={"/use-cases/" + item.slug}>
          <span className="category-icon"><Icon category={item.category}/></span>
          <span><strong>{item.title}</strong><small>{item.description}</small></span>
          <ChevronRight size={16} className="chevron" aria-hidden="true"/>
        </a></li>)}</ul>
        <a className="text-link" href="/use-cases">All use cases</a>
      </aside>
    </section>
    <div className="catalog-bar"><span><Activity size={16}/>{directory.data ? "Snapshot " + date(directory.data.generatedAt) : "Catalog snapshot"}</span><a href="/developers"><Code2 size={16}/> REST API &amp; MCP</a></div>
    <section className="home-section"><SectionHeading title="Explore the agent stack" description="Browse by the role a tool plays in your system." next="/categories" nextLabel="All categories"/>
      {directory.error ? <Notice error={directory.error}/> : <CategoryGrid directory={directory.data} featured/>}
    </section>
    <section className="home-section"><SectionHeading title="Featured tools" description="Projects with source-backed capability notes and setup links." next="/discover" nextLabel="Discover tools"/>
      {featured.data ? <Cards items={featured.data.results} {...actions}/> : <Notice error={featured.error} loading/>}
    </section>
    <section className="home-section"><SectionHeading title="Recent activity" description="Latest observed repository pushes or publisher updates." next="/discover?sort=recent" nextLabel="Browse recent activity"/>
      {activity.data ? <Cards items={activity.data.results} {...actions}/> : <Notice error={activity.error} loading/>}
    </section>
    <section className="home-section editorial-grid">
      {[["Emerging tools", "Explore new catalog leads with source links and explicit metadata gaps.", "/discover?category=emerging", "Explore emerging tools", Activity],
      ["Security & maintenance", "Review advisory coverage, repository status and freshness before adoption.", "/about#methodology", "Read the methodology", Shield],
      ["Open-source alternatives", "Compare projects with a recognized open-source license.", "/discover?openSource=true", "Find open-source tools", GitFork],
      ["Build with the catalog", "Search through the versioned REST API or connect a read-only MCP client.", "/developers", "Developer documentation", Terminal]].map(([title, desc, href, cta, Visual]) => {
        const Symbol = Visual as typeof Activity;
        return <article className="editorial-card" key={String(title)}><Symbol size={21}/><h2>{String(title)}</h2><p>{String(desc)}</p><a className="text-link" href={String(href)}>{String(cta)}</a></article>;
      })}
    </section>
  </>;
}
function PageHeading({ title, children }: { title: string; children: ReactNode }) {
  return <header className="page-heading"><h1>{title}</h1><p>{children}</p></header>;
}
function FilterSelect({ title, values, value, onChange }: { title: string; values: [string, string][]; value?: string; onChange: (value: string) => void }) {
  return <label className="field">{title}<select value={value ?? ""} onChange={event => onChange(event.target.value)}><option value="">Any</option>{values.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>;
}
function Discover({ directory, ...actions }: CardActions & { directory?: Directory }) {
  const params = new URLSearchParams(location.search);
  const [query, setQuery] = useState(readInitialQuery);
  useEffect(() => {
    try { sessionStorage.removeItem(searchStorageKey); } catch { /* Storage is optional. */ }
    if (new URLSearchParams(location.hash.slice(1)).has("query")) history.replaceState(null, "", location.pathname + location.search);
  }, []);
  const [filters, setFilters] = useState<Filters>(() => ({
    category: params.get("category") ?? undefined, openSource: params.get("openSource") === "true" || undefined,
    noPaidApi: params.get("noPaidApi") === "true" || undefined
  }));
  const [sort, setSort] = useState(params.get("sort") === "recent" ? "recent" : "relevance");
  const [page, setPage] = useState(1);
  const request = useRequest<SearchResult>("/search", JSON.stringify({ query, filters, sort, page, limit: 9 }));
  const setFilter = (key: keyof Filters, val: string | boolean | undefined) => { setFilters(previous => ({ ...previous, [key]: val || undefined })); setPage(1); };
  const options = (values?: string[]): [string, string][] => (values ?? []).map(value => [value, value]);
  const data = request.data;
  return <><PageHeading title="Discover tools">Describe the task, then narrow the results by platform, language or license.</PageHeading>
    <SearchBox initial={query} onSearch={value => { setQuery(value); setPage(1); }}/>
    <div className="discover-layout">
      <aside className="filter-panel" aria-label="Search filters"><h2><Filter size={18}/> Filters</h2>
        <FilterSelect title="Category" values={(directory?.categories ?? []).filter(category => category.count > 0).map(category => [category.id, category.name])} value={filters.category} onChange={val => setFilter("category", val)}/>
        <FilterSelect title="Deployment" values={[["local", "Local"], ["cloud", "Cloud"], ["hybrid", "Hybrid"]]} value={filters.hosting} onChange={val => setFilter("hosting", val)}/>
        <FilterSelect title="Operating system" values={options(directory?.facets.os)} value={filters.os} onChange={val => setFilter("os", val)}/>
        <FilterSelect title="Language" values={options(directory?.facets.language)} value={filters.language} onChange={val => setFilter("language", val)}/>
        <FilterSelect title="License" values={options(directory?.facets.license)} value={filters.license} onChange={val => setFilter("license", val)}/>
        <label className="check"><input type="checkbox" checked={!!filters.openSource} onChange={event => setFilter("openSource", event.target.checked)}/> Open source only</label>
        <label className="check"><input type="checkbox" checked={!!filters.noPaidApi} onChange={event => setFilter("noPaidApi", event.target.checked)}/> No paid API required</label>
        <button className="button" type="button" onClick={() => { setFilters({}); setPage(1); }}>Clear filters</button>
      </aside>
      <section aria-label="Search results"><div className="results-head"><h2>{data ? data.total + (data.total === 1 ? " match" : " matches") : "Results"}</h2>
        <label className="sort">Sort <select aria-label="Sort results" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="relevance">Relevance</option><option value="recent">Recent activity</option><option value="popular">GitHub stars</option></select></label></div>
        <Notice error={request.error} loading={!data && !request.error}/>
        {data && <>
          {!!data.constraints.length && <div className="tags requirements">{data.constraints.map((item, index) => <span key={index}>{item.required ? "Required" : "Preferred"} · {String(item.value)}</span>)}</div>}
          {!data.total && <p className="notice">No tools satisfy all recognized requirements. Try changing the query or filters.</p>}
          <Cards items={data.results} {...actions} explained/>
          {!!data.unverified.length && <section className="secondary-results"><SectionHeading title="Needs review" description="These candidates have limited evidence, missing requirements or a retired catalog status."/><Cards items={data.unverified} {...actions} explained/></section>}
          {Math.max(data.total, data.unverifiedTotal) > data.limit && <div className="pagination"><button className="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="button" disabled={page * data.limit >= Math.max(data.total, data.unverifiedTotal)} onClick={() => setPage(page + 1)}>Next</button></div>}
        </>}
      </section>
    </div>
  </>;
}
const valueFor = (record: Detailed, field: string): string => {
  switch (field) {
    case "License": return label(record.license);
    case "Open source": return record.openSource == null ? "Unknown" : record.openSource ? "Yes" : "No";
    case "Deployment": return label(record.hosting);
    case "Operating systems": return format(record.os);
    case "Languages": return format(record.languages);
    case "Capabilities": return format(record.capabilities);
    case "Installation": return format(record.installation);
    case "Integrations": return format(record.integrations);
    case "Permissions": return format(record.permissions);
    case "Dependencies": return format(record.dependencies);
    case "Maintenance": return label(record.maintenance);
    case "Latest listed version": return label(record.latestRelease);
    case "Last activity": return record.lastActivity ? date(record.lastActivity) : "Unknown";
    case "Paid API": return record.noPaidApi == null ? "Unknown" : record.noPaidApi ? "Path without a paid API documented" : "Required";
    case "Pricing": return label(record.pricing);
    case "MCP": return record.mcp ? "Documented" : "Unknown";
    case "Security advisories": return record.securityAdvisories == null ? "Coverage unknown" : String(record.securityAdvisories.length);
    case "Freshness": return record.freshness + " · " + date(record.verifiedAt);
    default: return "Unknown";
  }
};
const fields = ["License", "Open source", "Deployment", "Operating systems", "Languages", "Capabilities", "Installation", "Integrations", "Permissions", "Dependencies", "Maintenance", "Latest listed version", "Last activity", "Paid API", "Pricing", "MCP", "Security advisories", "Freshness"];

function ToolDetails({ id, selection, toggle, saved, toggleSaved }: CardActions & { id: string }) {
  const { data, error } = useRequest<Detailed>("/tools/" + encodeURIComponent(id));
  if (!data) return <Notice error={error} loading/>;
  return <><a href="/discover" className="text-link back">Discover tools</a>
    <PageHeading title={data.name}>{data.description ?? "The source provides project identity and metadata."}</PageHeading>
    <div className="tags">{data.categories.map(category => <a key={category} href={"/discover?category=" + category}>{categoryTitle(category)}</a>)}</div>
    <div className="action-row">{data.setup && <a className="button primary" href={data.setup}><BookOpen size={16}/> Setup documentation</a>}
      {data.github && <a className="button" href={data.github}><GitFork size={16}/> Repository</a>}
      {data.website && <a className="button" href={data.website}><Globe size={16}/> Website</a>}
      <SaveButton id={id} name={data.name} saved={saved} toggleSaved={toggleSaved}/>
      <button className="button" aria-pressed={selection.includes(id)} disabled={!selection.includes(id) && selection.length >= 5} onClick={() => toggle(id)}>{selection.includes(id) ? "Remove from comparison" : "Add to comparison"}</button>
    </div>
    <div className="detail-grid"><section className="panel"><h2>Technical profile</h2><dl className="profile">{fields.map(field => <div key={field}><dt>{field}</dt><dd>{valueFor(data, field)}</dd></div>)}</dl></section>
      <section className="panel"><h2>Evidence & trade-offs</h2><p>{data.tradeoff ?? "Trade-offs require further review."}</p>
        <ul className="source-list">{data.sources.map((source, index) => <li key={index}><a href={source.url}>{source.kind}</a><small>{date(source.verifiedAt)} · {source.fields.join(", ")}</small></li>)}</ul>
        {data.publisherIds.length > 0 && <p>Publisher IDs <code>{data.publisherIds.join(", ")}</code></p>}
      </section></div></>;
}
function Compare({ selection, toggle }: { selection: string[]; toggle: (id: string) => void }) {
  const request = useRequest<{ tools: Detailed[]; missing: string[] }>(selection.length >= 2 ? "/compare" : "", JSON.stringify({ ids: selection }));
  return <><PageHeading title="Compare tools">Inspect the same attributes and evidence across up to five projects.</PageHeading>
    {selection.length < 2 ? <p className="notice">Choose at least two tools from <a href="/discover">Discover</a> to start a comparison.</p> : <>
      <Notice error={request.error} loading={!request.data}/>
      {!!request.data?.missing.length && <p className="notice">Some saved projects are unavailable. {request.data.missing.map(id => <button key={id} className="button" onClick={() => toggle(id)}>Remove {id}</button>)}</p>}
      {request.data && <div className="table-scroll" tabIndex={0} role="region" aria-label="Tool comparison table"><table><caption>Selected tool attributes</caption><thead><tr><th scope="col">Attribute</th>{request.data.tools.map(tool => <th scope="col" key={tool.id}><a href={"/tools/" + tool.id}>{tool.name}</a><button className="icon-button" aria-label={"Remove " + tool.name} onClick={() => toggle(tool.id)}><X size={16}/></button></th>)}</tr></thead>
        <tbody>{fields.map(field => <tr key={field}><th scope="row">{field}</th>{request.data!.tools.map(tool => <td key={tool.id}>{valueFor(tool, field)}</td>)}</tr>)}</tbody></table></div>}
    </>}
  </>;
}
function Stack(actions: CardActions) {
  const [query, setQuery] = useState("");
  const request = useRequest<StackResult>(query ? "/recommend-stack" : "", JSON.stringify({ query }));
  return <><PageHeading title="Stack Builder">Shortlist components by role, then review interfaces, versions and deployment requirements.</PageHeading>
    <SearchBox stack onSearch={setQuery}/>{query && <Notice error={request.error} loading={!request.data}/>}
    {request.data && <>
      {!request.data.groups.length && <p className="notice">No components satisfy every recognized hard requirement.</p>}
      {request.data.groups.map(group => <section className="home-section" key={group.category}><SectionHeading title={categoryTitle(group.category)}/><Cards items={group.candidates} {...actions} explained/></section>)}
      {!!request.data.unverified.length && <section className="home-section"><SectionHeading title="Needs review" description="Check missing requirement evidence before selecting these components."/><Cards items={request.data.unverified} {...actions} explained/></section>}
      <p className="notice">{request.data.compatibility}</p>
    </>}
  </>;
}
function Developers() {
  return <><PageHeading title="Developers">Use the same catalog through a versioned REST API or a read-only MCP server.</PageHeading>
    <div className="detail-grid"><section className="panel"><Terminal size={23}/><h2>REST API</h2><p>Read catalog records, compare tool IDs or search by task.</p>
      <pre><code>{'curl ' + location.origin + '/api/v1/search \\\n  -H "Content-Type: application/json" \\\n  -d \'{"query":"Run an LLM locally on a Mac"}\''}</code></pre>
      <div className="action-row"><a className="button primary" href="/api/v1/openapi.json">OpenAPI document</a><a className="button" href="/api/v1/health">Health endpoint</a></div></section>
    <section className="panel"><Waypoints size={23}/><h2>Model Context Protocol</h2><p>Add the Streamable HTTP endpoint to your MCP client.</p><pre><code>{location.origin + "/mcp"}</code></pre>
      <ul className="mono-list">{["search_tools", "compare_tools", "get_tool_details", "recommend_stack", "get_setup_guide"].map(name => <li key={name}><code>{name}</code></li>)}</ul>
      <a href={repo + "/blob/main/docs/API.md"} className="text-link">Client configuration and examples</a></section></div>
    </>;
}
function About() {
  return <><PageHeading title="About Agentic Tools">Tell us what your agent needs. We find the tools that fit.</PageHeading>
    <div className="detail-grid"><section className="panel" id="methodology"><CircleHelp size={23}/><h2>Methodology</h2>
      <p>Search recognizes common requirements for platform, language, hosting, license and paid API access. A documented conflict disqualifies a candidate. Missing hard-requirement evidence appears under Needs review.</p>
      <p>Freshness reflects when the metadata was last observed. Advisory coverage is unknown where package and version evidence is missing.</p></section>
    <section className="panel"><BookOpen size={23}/><h2>Data sources</h2><ul className="source-list"><li><a href="https://github.com/slavakurilyak/awesome-ai-agents">Awesome AI Agents</a></li><li><a href="https://modelcontextprotocol.io/registry/registry-aggregators">Official MCP Registry (discovery leads)</a></li><li><a href="https://docs.github.com/en/rest/repos/repos">GitHub repository metadata</a></li><li>Upstream setup documents linked in each curated entry</li></ul><a href={repo + "/blob/main/docs/SOURCES.md"} className="text-link">Attribution and source policy</a></section></div></>;
}
function SavedTool({ id, selection, toggle, ...shelf }: CardActions & { id: string }) {
  const { data, error } = useRequest<Detailed>("/tools/" + encodeURIComponent(id));
  if (!data) return <li className="saved-item"><Notice error={error} loading/>{error && <button className="button" type="button" onClick={() => shelf.toggleSaved(id)}>Remove unavailable tool</button>}</li>;
  return <li className="saved-item">
    <span className="category-icon"><Icon category={data.categories[0]}/></span>
    <div><h2><a href={"/tools/" + id}>{data.name}</a></h2><p>{data.description ?? categoryTitle(data.categories[0])}</p></div>
    <div className="card-actions">
      <button className="icon-button" type="button" aria-label={selection.includes(id) ? `Remove ${data.name} from comparison` : `Add ${data.name} to comparison`}
        aria-pressed={selection.includes(id)} disabled={!selection.includes(id) && selection.length >= 5} onClick={() => toggle(id)}>{selection.includes(id) ? <X size={16}/> : <Plus size={16}/>}</button>
      <SaveButton id={id} name={data.name} {...shelf}/>
    </div>
  </li>;
}
function SavedTools(actions: CardActions) {
  return <><PageHeading title="Saved tools">Keep up to {savedLimit} tools in this browser and add them to a comparison when you’re ready.</PageHeading>
    {actions.saved.length ? <ul className="saved-list">{actions.saved.map(id => <SavedTool key={id} id={id} {...actions}/>)}</ul>
      : <p className="notice">Your shelf is empty. Use the bookmark button on any tool to save it here.</p>}
    <div className="action-row"><a className="button primary" href="/discover">Browse tools</a></div>
  </>;
}
function UseCases({ item }: { item?: UseCase }) {
  if (!item) return <><PageHeading title="Use cases">Start with a task and see what role each tool can play.</PageHeading>
    <div className="tool-grid">{useCases.map(useCase => <article className="tool-card use-case-card" key={useCase.slug}>
      <div className="category-icon"><Icon category={useCase.category}/></div>
      <h2><a href={"/use-cases/" + useCase.slug}>{useCase.title}</a></h2>
      <p className="tool-desc">{useCase.description}</p>
      <a className="text-link" href={"/use-cases/" + useCase.slug}>View use case<span className="sr-only"> for {useCase.title}</span></a>
    </article>)}</div>
  </>;
  return <><a href="/use-cases" className="text-link back">All use cases</a><PageHeading title={item.title}>{item.description}</PageHeading>
    <div className="detail-grid use-case-detail">
      <section className="panel"><h2>Tool shortlist</h2><ul className="stack-roles">{item.tools.map(tool => <li key={tool.id}><span>{tool.role}</span><a href={"/tools/" + tool.id}>{tool.name}</a></li>)}</ul>
        <p>Check versions and interfaces before integrating these components.</p>
        <a href={linkTo(item.query)} className="text-link">Explore alternatives</a>
      </section>
      <section className="panel"><h2>Getting started</h2><ol className="use-case-steps">{item.steps.map(step => <li key={step}>{step}</li>)}</ol><h3>Before you connect</h3><p>{item.caution}</p></section>
    </div>
  </>;
}
function App() {
  const path = location.pathname.replace(/\/$/, "") || "/";
  const directory = useRequest<Directory>("/categories");
  const [selection, setSelection] = useState(() => readIds("agentic-compare", 5));
  useEffect(() => {
    try { localStorage.setItem("agentic-compare", JSON.stringify(selection)); } catch { /* Browser storage is optional. */ }
  }, [selection]);
  function toggle(id: string) { setSelection(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 5 ? [...current, id] : current); }
  const [saved, setSaved] = useState(() => readIds("agentic-saved", savedLimit));
  useEffect(() => {
    try { localStorage.setItem("agentic-saved", JSON.stringify(saved)); } catch { /* Session-only saving remains available. */ }
  }, [saved]);
  function toggleSaved(id: string) {
    setSaved(current => current.includes(id) ? current.filter(value => value !== id) : current.length < savedLimit ? [...current, id] : current);
  }
  const props = { selection, toggle, saved, toggleSaved };
  let page: ReactNode;
  if (path === "/") page = <Home directory={directory} {...props}/>;
  else if (path === "/discover") page = <Discover directory={directory.data} {...props}/>;
  else if (path === "/categories") page = <><PageHeading title="Categories">Explore tools by role across the agent technology stack.</PageHeading>{directory.error ? <Notice error={directory.error}/> : <CategoryGrid directory={directory.data}/>}</>;
  else if (path === "/saved") page = <SavedTools {...props}/>;
  else if (path === "/use-cases") page = <UseCases/>;
  else if (path.startsWith("/use-cases/")) {
    const item = useCases.find(item => item.slug === path.slice(11));
    page = item ? <UseCases item={item}/> : <PageHeading title="Use case unavailable"><a href="/use-cases">Browse use cases</a></PageHeading>;
  }
  else if (path === "/compare") page = <Compare {...props}/>;
  else if (path === "/stack") page = <Stack {...props}/>;
  else if (path === "/developers") page = <Developers/>;
  else if (path === "/about") page = <About/>;
  else if (path.startsWith("/tools/")) page = <ToolDetails id={path.slice(7)} {...props}/>;
  else page = <PageHeading title="Page unavailable"><a href="/">Return to Agentic Tools</a></PageHeading>;
  return <Layout path={path} savedCount={saved.length}>{page}{!!selection.length && path !== "/compare" && <aside className="compare-tray" aria-label="Comparison selection"><span aria-live="polite">{selection.length} selected</span><a href="/compare" className="button primary">Compare tools</a><button onClick={() => setSelection([])} type="button" className="icon-button" aria-label="Clear comparison"><X size={17}/></button></aside>}</Layout>;
}

createRoot(document.getElementById("root")!).render(<App/>);
