import { BookMarked } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSettingsStore } from '@/lib/stores/settings-store';

export function WikiSourcesToggle() {
  const wikiEnabled = useSettingsStore((s) => s.wikiResearchEnabled);
  const setWikiEnabled = useSettingsStore((s) => s.setWikiResearchEnabled);

  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <BookMarked className="h-4 w-4 text-muted-foreground" />
        <div className="space-y-0.5">
          <Label htmlFor="wiki-sources" className="text-sm font-medium">Debate Wiki Sources</Label>
          <p className="text-xs text-muted-foreground">
            Search ProCon, NDCA Caselist, and debate wikis for evidence
          </p>
        </div>
      </div>
      <Switch
        id="wiki-sources"
        checked={wikiEnabled}
        onCheckedChange={setWikiEnabled}
      />
    </div>
  );
}
