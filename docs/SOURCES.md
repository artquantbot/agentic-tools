# Data attribution

- Awesome AI Agents by Slava Kurilyak is MIT-licensed. The importer reads repository links in its Markdown and records the directory as discovery evidence. Catalog descriptions are original. [Repository and license](https://github.com/slavakurilyak/awesome-ai-agents/blob/main/LICENSE)
- GitHub REST provides repository identity, SPDX metadata, primary language, observed pushed time, archived state and stars. Each target repository has separate license terms. SPDX observations can be absent or inconclusive, especially for multi-license repositories. [Repository metadata API](https://docs.github.com/en/rest/repos/repos#get-a-repository)
- The Official MCP Registry is an optional discovery feed. `npm run import -- --registry-leads` saves a bounded batch of leads to the ignored `.cache/import/registry-leads.json` file for review. Leads are excluded from the public catalog and cannot attach publisher identifiers, packages or categories to projects. Review upstream documentation and identity before adding a new catalog entry through the curated source list. [Registry aggregator documentation](https://modelcontextprotocol.io/registry/registry-aggregators)
- Curated capability notes paraphrase upstream documentation. Each record carries the source URL and date. Imports use cached metadata on recoverable upstream errors and keep the committed snapshot if curated coverage drops below the minimum.

GitHub popular sorting uses observed stars. Metadata freshness uses a 30-day threshold. Repository activity refers to GitHub pushes or publisher updates and can include routine changes. The catalog has no live package/version advisory feed. See the [research](RESEARCH.md) and [competitor review](COMPETITORS.md).

Optional leads from the [Hacker News API](https://github.com/HackerNews/API) are available with `npm run discover:hn`. The command emits repository and discussion links from a bounded sample. It leaves the catalog snapshot and ranking untouched.

Run the importer with `--cached` to rebuild from existing source observations without network access. Cached source timestamps are preserved. GitHub publisher homepages are omitted from the catalog.

Repository metadata records remain browsable. Task search places them under Needs review until capability evidence is reviewed.
