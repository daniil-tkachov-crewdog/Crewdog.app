// client/features/admin/tabs/agent/ChatRoutingTab.tsx
//
// Edits how the chat model chooses between the workflows: the tool
// descriptions, the argument descriptions, and the contracts that govern how
// results and next-step suggestions come back.
//
// The defaults are imported from the server modules themselves, so the
// placeholder text in this panel is always the text the server would
// actually use. That import reaches across into server/ — one of the few
// places the frontend does.

import type { AgentConfig } from "@/features/admin/api/settings";
import PromptField, { type SetCfg } from "@/features/admin/tabs/agent/PromptField";
import {
  ROUTING_DEFAULTS as R,
  TOOL_PARAM_DEFAULTS as P,
} from "../../../../../server/agentPrompts.js";
import {
  WORKFLOW_CONTRACT,
  SUGGESTIONS_CONTRACT,
  CARDS_PRESENTATION,
  SUGGESTIONS_TAIL,
} from "../../../../../server/chatResults.js";

type Props = { cfg: AgentConfig; set: SetCfg };

// Everything the chat model is told that is not one of the four workflows'
// own prompts: how it decides which workflow a message belongs to, and the
// rules it follows when writing the reply around the results.
const ChatRoutingTab = ({ cfg, set }: Props) => (
  <div className="space-y-8">
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">Choosing a workflow</h3>
      <p className="text-xs text-muted-foreground">
        The chat model reads these four descriptions and picks one. They are the whole of how a
        message gets routed — if the wrong workflow runs, or none does, this is where to say so.
      </p>
    </section>

    <PromptField
      label="Job description → find connections"
      value={cfg.tool_find_linkedin_connections}
      fallback={R.tool_find_linkedin_connections}
      onChange={(v) => set("tool_find_linkedin_connections", v)}
      rows={5}
    />
    <PromptField
      label="Find people (LinkedIn finder)"
      value={cfg.tool_find_linkedin_professionals}
      fallback={R.tool_find_linkedin_professionals}
      onChange={(v) => set("tool_find_linkedin_professionals", v)}
      rows={7}
    />
    <PromptField
      label="Find jobs"
      value={cfg.tool_find_jobs}
      fallback={R.tool_find_jobs}
      onChange={(v) => set("tool_find_jobs", v)}
      rows={9}
    />
    <PromptField
      label="Find accommodation"
      value={cfg.tool_find_accommodation}
      fallback={R.tool_find_accommodation}
      onChange={(v) => set("tool_find_accommodation", v)}
      rows={7}
    />

    <section className="space-y-1 pt-2">
      <h3 className="text-sm font-semibold">Writing the reply</h3>
      <p className="text-xs text-muted-foreground">
        These are added to the system prompt you set in the Prompts tab, and to every workflow
        result. They are what keeps results in the cards and the next steps in the buttons, so
        changing them changes how the page itself behaves.
      </p>
    </section>

    <PromptField
      label="Searching rule (added to the system prompt)"
      hint="Keeps results out of the prose and makes a follow-up re-run the search instead of answering from memory."
      value={cfg.chat_workflow_contract}
      fallback={WORKFLOW_CONTRACT}
      onChange={(v) => set("chat_workflow_contract", v)}
      rows={10}
    />
    <PromptField
      label="Next steps rule (added to the system prompt)"
      hint="The suggested prompts the app renders as buttons under every reply."
      value={cfg.chat_suggestions_contract}
      fallback={SUGGESTIONS_CONTRACT}
      onChange={(v) => set("chat_suggestions_contract", v)}
      rows={10}
    />
    <PromptField
      label="How to introduce the result cards"
      hint="Sent with a workflow's results whenever they are shown as cards, in place of that workflow's own presentation prompt."
      value={cfg.chat_cards_presentation}
      fallback={CARDS_PRESENTATION}
      onChange={(v) => set("chat_cards_presentation", v)}
      rows={8}
    />
    <PromptField
      label="Next steps reminder (sent with every result)"
      hint="Repeated after a workflow result because the presentation prompts all end by telling the model to stop writing."
      value={cfg.chat_suggestions_tail}
      fallback={SUGGESTIONS_TAIL}
      onChange={(v) => set("chat_suggestions_tail", v)}
      rows={8}
    />

    <section className="space-y-1 pt-2">
      <h3 className="text-sm font-semibold">What each workflow is told to pass on</h3>
      <p className="text-xs text-muted-foreground">
        The model reads these to decide what goes in each argument — it is how a request stops
        being chat and becomes a search&rsquo;s criteria. One JSON object per workflow, keyed by
        argument name. An edit that will not parse is ignored and the default is used, so a bad
        paste cannot take a workflow down.
      </p>
    </section>

    <PromptField
      label="Job description → find connections, arguments"
      value={cfg.tool_params_find_linkedin_connections}
      fallback={P.tool_params_find_linkedin_connections}
      onChange={(v) => set("tool_params_find_linkedin_connections", v)}
      rows={5}
    />
    <PromptField
      label="Find people, arguments"
      value={cfg.tool_params_find_linkedin_professionals}
      fallback={P.tool_params_find_linkedin_professionals}
      onChange={(v) => set("tool_params_find_linkedin_professionals", v)}
      rows={5}
    />
    <PromptField
      label="Find jobs, arguments"
      value={cfg.tool_params_find_jobs}
      fallback={P.tool_params_find_jobs}
      onChange={(v) => set("tool_params_find_jobs", v)}
      rows={5}
    />
    <PromptField
      label="Find accommodation, arguments"
      value={cfg.tool_params_find_accommodation}
      fallback={P.tool_params_find_accommodation}
      onChange={(v) => set("tool_params_find_accommodation", v)}
      rows={12}
    />
  </div>
);

export default ChatRoutingTab;
