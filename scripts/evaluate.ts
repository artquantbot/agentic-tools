import cases from "./evaluation-cases.json" with { type: "json" };
import { search } from "../src/catalog.ts";
import { searchInput } from "../src/schema.ts";

let relevant = 0;
let relevanceCases = 0;
let empty = 0;
let emptyCases = 0;
let violations = 0;
let retired = 0;
let recommendations = 0;
for (const item of cases) {
  const output = search(searchInput.parse({ query: item.query, limit: 10 }));
  const first = output.results.slice(0, 3).map(row => row.tool.name);
  for (const row of output.results) {
    recommendations++;
    violations += row.requirements.filter(requirement => requirement.required && requirement.status !== "satisfied").length;
    if (["archived", "publisher-deprecated"].includes(row.scores.maintenance)) retired++;
  }
  if (item.unverified && !item.unverified.every(name => output.unverified.some(row => row.tool.name === name))) {
    console.log("Expected review candidate is missing:", item.query);
    process.exitCode = 1;
  }
  if (item.expected?.length) {
    relevanceCases++;
    if (item.expected.some(name => first.includes(name))) relevant++;
    else console.log("Top-three miss:", item.query, first);
  } else if (item.expected) {
    emptyCases++;
    if (!output.total) empty++;
    else console.log("Expected empty:", item.query, first);
  }
}
console.log(JSON.stringify({ queries: cases.length, relevantTopThree: relevant, relevanceCases, empty, emptyCases, recommendations, violations, retired }, null, 2));
if (violations || retired || relevant / relevanceCases < 0.75 || empty !== emptyCases) process.exitCode = 1;
