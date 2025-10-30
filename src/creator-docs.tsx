import { Action, ActionPanel, List, open, showToast, Toast, getPreferenceValues } from "@raycast/api";
import { useState, useEffect, useMemo } from "react";
import RobloxDocsDataFetcher, { DocItem } from "./data-fetcher";

interface Preferences {
  hideIcons: boolean;
}

// Performance optimization: limit displayed results
const MAX_DISPLAYED_RESULTS = 50;

// Icon mapping for categories and types
const ICON_MAP: Record<string, string> = {
  // Type-specific icons (take priority)
  method: "../assets/icons/method.svg",
  event: "../assets/icons/event.svg",
  property: "../assets/icons/property.svg",
  function: "../assets/icons/function.svg",
  callback: "../assets/icons/callback.svg",
  enum: "../assets/icons/enum.svg",
  global: "../assets/icons/global.svg",
  // Category-based icons
  Classes: "../assets/icons/class.svg",
  Enums: "../assets/icons/enum.svg",
  Globals: "../assets/icons/global.svg",
  Tutorials: "../assets/icons/tutorial.svg",
  Scripting: "../assets/icons/script.svg",
  UI: "../assets/icons/ui.svg",
  Sound: "../assets/icons/audio.svg",
  Animation: "../assets/icons/animation.svg",
  Lighting: "../assets/icons/light.svg",
  Physics: "../assets/icons/physics.svg",
  Art: "../assets/icons/camera.svg",
};

const ACTION_ICONS = {
  browser: "../assets/icons/browser.svg",
  clipboard: "../assets/icons/clipboard.svg",
  text: "../assets/icons/text.svg",
  refresh: "../assets/icons/refresh.svg",
  trash: "../assets/icons/trash.svg",
} as const;

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [searchText, setSearchText] = useState("");
  const [allDocs, setAllDocs] = useState<DocItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize data fetcher
  const dataFetcher = new RobloxDocsDataFetcher();

  useEffect(() => {
    loadDocsData();
  }, []);

  const isSearchEmpty = searchText.trim() === "";

  // Optimized search with useMemo and early exit
  const filteredDocs = useMemo(() => {
    if (searchText.trim() === "") {
      return [];
    }

    const searchLower = searchText.toLowerCase();
    const results: { doc: DocItem; score: number }[] = [];

    for (const doc of allDocs) {
      const titleLower = doc.title.toLowerCase();

      // Fast path: check title first (most common match)
      const titleMatch = titleLower.includes(searchLower);

      if (!titleMatch) {
        // Only check other fields if title doesn't match
        const descriptionMatch = doc.description.toLowerCase().includes(searchLower);
        const keywordMatch = doc.keywords.some((keyword) => keyword.toLowerCase().includes(searchLower));
        const categoryMatch = doc.category.toLowerCase().includes(searchLower);
        const typeMatch = doc.type.toLowerCase().includes(searchLower);

        // Skip if no match at all
        if (!descriptionMatch && !keywordMatch && !categoryMatch && !typeMatch) {
          continue;
        }

        // Non-title matches get lower scores
        const matchScore = descriptionMatch ? 100 : keywordMatch ? 75 : 50;
        const categoryMultiplier = doc.category === "Classes" ? 8 : 1;

        results.push({ doc, score: matchScore * categoryMultiplier });
        continue;
      }

      // Calculate title match score
      let matchScore: number;

      // Check for exact match (including colon-separated like "Animator:LoadAnimation")
      const titlePart =
        titleLower.includes(":") || titleLower.includes(".") ? titleLower.split(/[:.]/)[1] || titleLower : titleLower;

      if (titleLower === searchLower || titlePart === searchLower) {
        matchScore = 1000; // Exact match
      } else if (titleLower.startsWith(searchLower)) {
        matchScore = 500; // Starts with
      } else {
        matchScore = 250; // Contains
      }

      // Apply category priority multipliers
      const isClassEntry = doc.category === "Classes";
      const isMainClass = isClassEntry && (doc.type === "class" || doc.type === "service");

      const categoryMultiplier = isMainClass ? 10 : isClassEntry ? 8 : 1;

      // Apply length bonus for shorter titles (favor shorter matches)
      const score = matchScore * categoryMultiplier - doc.title.length;

      results.push({ doc, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DISPLAYED_RESULTS)
      .map((item) => item.doc);
  }, [searchText, allDocs]);

  const loadDocsData = async () => {
    try {
      setIsLoading(true);
      showToast({
        style: Toast.Style.Animated,
        title: "Loading Roblox Creator Docs...",
        message: "Checking for updates...",
      });

      const docs = await dataFetcher.fetchDocsData();
      setAllDocs(docs);

      showToast({
        style: Toast.Style.Success,
        title: "Docs Loaded Successfully",
        message: `Found ${docs.length} documentation pages`,
      });
    } catch (error) {
      console.error("Error loading docs data:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to Load Docs",
        message: "Using fallback data. Check your internet connection.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearCacheAndRefresh = async () => {
    try {
      showToast({
        style: Toast.Style.Animated,
        title: "Clearing Cache...",
        message: "Forcing fresh data fetch",
      });

      // Clear the cache
      dataFetcher.clearCache();

      // Reload data
      await loadDocsData();
    } catch (error) {
      console.error("Error clearing cache:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to Clear Cache",
        message: "Please try again",
      });
    }
  };

  const getIconForCategory = (category: string, type: DocItem["type"]) => {
    // Type-specific icons take priority, then category-based, then default
    return ICON_MAP[type] || ICON_MAP[category] || "../assets/icons/default.svg";
  };

  const getIcon = (name: string) => (preferences.hideIcons ? undefined : name);

  return (
    <List
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search Roblox Creator Docs..."
      isLoading={isLoading}
    >
      <List.Section title="Results">
        {filteredDocs.map((doc) => (
          <List.Item
            key={doc.id}
            icon={getIcon(getIconForCategory(doc.category, doc.type))}
            title={doc.title}
            subtitle={doc.category}
            accessories={[
              { text: doc.type },
              { text: doc.description.length > 50 ? doc.description.substring(0, 47) + "..." : doc.description },
            ]}
            actions={
              <ActionPanel>
                <Action title="Open in Browser" onAction={() => open(doc.url)} icon={getIcon(ACTION_ICONS.browser)} />
                <Action.CopyToClipboard
                  title="Copy URL"
                  content={doc.url}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                  icon={getIcon(ACTION_ICONS.clipboard)}
                />
                <Action.CopyToClipboard
                  title="Copy Title"
                  content={doc.title}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  icon={getIcon(ACTION_ICONS.text)}
                />
                <Action
                  title="Refresh Data"
                  onAction={loadDocsData}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  icon={getIcon(ACTION_ICONS.refresh)}
                />
                <Action
                  title="Clear Cache & Refresh"
                  onAction={clearCacheAndRefresh}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                  icon={getIcon(ACTION_ICONS.trash)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      {filteredDocs.length === 0 && !isLoading && (
        <List.EmptyView
          title={isSearchEmpty ? "Search" : "No Results Found"}
          description={
            isSearchEmpty ? undefined : `No documentation found for "${searchText}". Try a different search term.`
          }
        />
      )}
    </List>
  );
}
