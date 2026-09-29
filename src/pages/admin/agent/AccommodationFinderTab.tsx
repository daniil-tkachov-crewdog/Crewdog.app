import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AgentConfig } from "@/services/settings";
import { ACCOMMODATION_FINDER_DEFAULTS as D } from "../../../../agentPrompts.js";

type Props = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  cfg: AgentConfig;
  set: (k: keyof AgentConfig, v: string | number | boolean | string[]) => void;
};

// Workflow 4: the first two find people, the third finds vacancies, this one
// finds somewhere to live. Two answers are required before the search runs —
// the area and the kind of place — and the chatbot asks for whichever is
// missing rather than guessing a city or assuming a flat.
const AccommodationFinderTab = ({ enabled, setEnabled, cfg, set }: Props) => {
  const listingType = cfg.accom_listing_type ?? D.accom_listing_type;
  const buying = listingType === "buy";
  // Only one of the two search prompts runs, but both stay editable — the one
  // that is off today still needs tuning for tomorrow.
  const liveNote = (isLive: boolean) =>
    isLive ? (
      <span className="text-xs font-normal text-emerald-600 dark:text-emerald-500">· live</span>
    ) : (
      <span className="text-xs font-normal text-muted-foreground">· inactive</span>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between max-w-xs">
        <span className="text-sm font-medium">Workflow enabled</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <p className="text-xs text-muted-foreground">
        When on, asking the chatbot to find you somewhere to live triggers the pipeline: the area
        and the kind of place (+ budget, dates and any conditions the user mentions) → one web
        search over live property listings → duplicates and dead links dropped → a list showing
        each place's type, area, price, availability and a link to the listing.
      </p>
      <p className="text-xs text-muted-foreground -mt-4">
        The area and the kind of place — a room, a houseshare, a studio, a flat, a house — are
        both required: the chatbot asks for whichever one is missing before it runs a search, and
        never guesses a city or assumes a property type. Everything else is optional and never
        holds up the search, but anything the user does volunteer (a budget, a move-in date, bills
        included, furnished, parking, pets, bedrooms, a commute) is passed through and honoured.
      </p>

      <section className="space-y-2">
        <div className="flex items-center justify-between max-w-xs">
          <span className="text-sm font-medium">Search for places to buy?</span>
          <Switch
            checked={buying}
            onCheckedChange={(v) => set("accom_listing_type", v ? "buy" : "rent")}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {buying
            ? "On — the search runs the “buying” prompt below: properties for sale, priced as an asking price, with sold and under-offer listings rejected."
            : "Off — the search runs the “renting” prompt below: rooms, shares and whole properties to let, priced per week or per month, with let-agreed listings rejected."}
        </p>
      </section>

      <div className="flex gap-4">
        <section className="space-y-2 max-w-[10rem]">
          <label className="text-sm font-medium">Max places</label>
          <Input
            type="number"
            min={1}
            max={50}
            value={cfg.accom_max_results ?? D.accom_max_results}
            onChange={(e) => set("accom_max_results", Number(e.target.value))}
          />
        </section>

        <section className="space-y-2 max-w-[10rem]">
          <label className="text-sm font-medium">Max listing age (days)</label>
          <Input
            type="number"
            min={1}
            max={365}
            value={cfg.accom_max_age_days ?? D.accom_max_age_days}
            onChange={(e) => set("accom_max_age_days", Number(e.target.value))}
          />
        </section>
      </div>
      <p className="text-xs text-muted-foreground -mt-4">
        Max places caps the list the user sees; the search looks wider than that so duplicates and
        dead links can be dropped without shortening the list. A listing added longer ago than the
        max age is skipped, as is one the page shows as let, sold, reserved or withdrawn.
      </p>

      <section className="space-y-2">
        <label className="text-sm font-medium">
          Search prompt — renting {liveNote(!buying)}
        </label>
        <Textarea
          value={cfg.accom_search_instructions_rent ?? D.accom_search_instructions_rent}
          onChange={(e) => set("accom_search_instructions_rent", e.target.value)}
          rows={18}
          className="font-mono text-sm"
        />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">Search prompt — buying {liveNote(buying)}</label>
        <Textarea
          value={cfg.accom_search_instructions_buy ?? D.accom_search_instructions_buy}
          onChange={(e) => set("accom_search_instructions_buy", e.target.value)}
          rows={18}
          className="font-mono text-sm"
        />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">Presentation prompt</label>
        <Textarea
          value={cfg.accom_compress_instructions ?? D.accom_compress_instructions}
          onChange={(e) => set("accom_compress_instructions", e.target.value)}
          rows={12}
          className="font-mono text-sm"
        />
      </section>
    </div>
  );
};

export default AccommodationFinderTab;
