"""Copy one generated sample from verify evidence into the repo, unedited.

python3 scripts/case-examples/export.py <evidence test dir> <sample id> <format label> <out dir>
"""
import json
import sys
from pathlib import Path

src, sample, format_label, out = Path(sys.argv[1]), sys.argv[2], sys.argv[3], Path(sys.argv[4])


def load(name):
    return json.loads((src / f"{name}.json").read_text())


def call_summary(call):
    # The full prompts hold the scraped research pages; keep the request lines the
    # Edge Function wrote (motion, side, format, role, ...) and the model proof.
    user = call.get("user") or ""
    head = user.split("\n\n", 1)[0] if call.get("feature") == "generate" else None
    summary = {key: call.get(key) for key in ("feature", "requestedModel", "upstreamModel", "upstreamProvider", "status", "ms", "stream")}
    if head:
        summary["userPromptHead"] = head
        summary["debateContextIncluded"] = "CURRENT DEBATE CONTEXT" in (call.get("system") or "") + user
    return summary


run = {key: value for key, value in json.loads((src / "run.json").read_text()).items() if key != "file"}
record = {
    "sample": sample,
    "debateFormatSetting": format_label,
    "howGenerated": "DebateOwl's Generate tool driven in a browser on a local DebateOwl stack (React client, Supabase Auth and Postgres, the ai Edge Function) with live OpenRouter and Exa: start a debate with the motion and format, generate R1, then R2 in the same debate. Every chat call was pinned to anthropic/claude-sonnet-5.5 on the Anthropic provider.",
    "run": run,
}
for speech in ("r1", "r2"):
    record[speech] = {
        "request": load(f"{speech}-request"),
        "response": load(f"{speech}-response"),
        "providerCalls": [call_summary(call) for call in load(f"{speech}-provider-calls")],
    }
record["aiRequests"] = load("ai-requests")
record["caseRows"] = load("case-rows")
out.mkdir(parents=True, exist_ok=True)
(out / f"{sample}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
print(out / f"{sample}.json")
