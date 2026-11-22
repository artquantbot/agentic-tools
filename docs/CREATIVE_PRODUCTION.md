# Video & Creative Production

Reviewed 22 November 2026. The candidate URLs were resolved through the GitHub repository API. All 13 resolved to the requested repositories, were publicly readable, and were not marked archived or disabled on review. None were already in the catalog snapshot. The importer pins each reviewed entry to the GitHub numeric repository ID and canonical owner/name. No candidate code or installation scripts were executed.

Catalog notes summarize upstream documentation. They do not establish runtime compatibility, safety or redistribution rights. Keep referenced clips, example prompts and other third-party media under their own terms.

| Repository | Catalog classification | Verified evidence or qualification |
|---|---|---|
| [JuneYaooo/rea-video](https://github.com/JuneYaooo/rea-video) | Agent Skill, CLI Tool | Python 3.10+ and FFmpeg. Codex plugin and offline analysis are documented. Optional model-assisted workflows have separate requirements. |
| [yihui-dev/awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) | Reference Collection | Browse references and original creator links. The repository’s MIT declaration does not settle rights to third-party works. |
| [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) | Agent Skill, Reference Collection | Claude Code and manual skill installation. Review the [file-level terms](https://github.com/lemomo-ai/lemo-opuscar/blob/main/LICENSE) for code, style documents, demos and third-party exceptions. |
| [storytold/effectcraft](https://github.com/storytold/effectcraft) | Desktop Application, CLI Tool, MCP Server | Desktop binaries and documented [stdio MCP, CLI and JSON control](https://github.com/storytold/effectcraft/blob/main/docs/agents.md). MIT or Apache-2.0. |
| [patch-gg/pixelfx](https://github.com/patch-gg/pixelfx) | Software Library, CLI Tool, Agent Skill | JavaScript API, an offline renderer and a Claude Code skill. Optional Patch publishing has separate Windows requirements. |
| [Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI) | Desktop Application | Local node UI and [HTTP/WebSocket interfaces](https://docs.comfy.org/development/comfyui-server/comms_routes). [Comfy MCP](https://www.comfy.org/mcp) is a separately documented integration. Local models and custom nodes have separate terms. |
| [remotion-dev/remotion](https://github.com/remotion-dev/remotion) | Software Library, CLI Tool | React rendering and Node.js API. The [hosted documentation MCP shut down](https://www.remotion.dev/docs/ai/mcp). Browser WebMCP has separate scope. Check [license eligibility](https://www.remotion.dev/license). |
| [remotion-dev/skills](https://github.com/remotion-dev/skills) | Agent Skill | [Codex and compatible agents](https://www.remotion.dev/docs/ai/skills) are documented. The repository tree contained no standalone license file. License stays unknown and no skill text was redistributed. |
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | CLI Tool, Software Library, Agent Skill, Desktop Application | Codex skill and local CLI rendering. The [hosted HeyGen connector](https://github.com/heygen-com/hyperframes/blob/main/docs/guides/mcp.mdx) is separate from the local CLI. |
| [mrdoob/three.js](https://github.com/mrdoob/three.js) | Software Library | JavaScript 3D rendering via WebGL or WebGPU. Capture and encoding are separate stages. |
| [greensock/GSAP](https://github.com/greensock/GSAP) | Software Library | JavaScript animation under the [GSAP Standard License](https://gsap.com/standard-license/). No-charge use and open-source eligibility are distinct. |
| [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) | MCP Server | Community Blender add-on with documented Codex configuration. Tool permissions include scene mutation and Python execution. |
| [FFmpeg/FFmpeg](https://github.com/FFmpeg/FFmpeg) | CLI Tool, Software Library | Official GitHub mirror. LGPL baseline with configuration-dependent [GPL or nonfree build terms](https://ffmpeg.org/legal.html). |

## Discovery

- Browse all 13 entries with `GET /api/v1/tools?category=creative-production&limit=20`.
- Find servers supplied by the reviewed repositories with `GET /api/v1/tools?category=creative-production&kind=mcp-server`. Separate MCP integrations remain visible on eligible records.
- Use `POST /api/v1/search` or MCP `search_tools` with “Build an AI video production pipeline”, “Find open-source tools for cinematic animation”, “Recommend tools for automated video editing”, “Which video tools can Codex operate?” or “Build a free local video rendering stack”.
- Use `POST /api/v1/recommend-stack` or MCP `recommend_stack` with `{"query":"AI Film Studio"}` to get the ordered guide with dependencies, alternatives and licensing constraints. The website route is `/stack?guide=ai-film-studio`. The guide is a starting point. Verify component interfaces and versions before combining them.

Maintain reviewed entries in `data/reviewed-tools.json` and regenerate the snapshot with `npm run import -- --reviewed-only`. This preserves unrelated entries and fails if an intended reviewed record is unavailable. The normal import also includes reviewed records. Review source changes, terms, and tool capabilities before updating the review timestamp.
