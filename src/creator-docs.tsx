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
  const [showingDetail, setShowingDetail] = useState(true);

  // Initialize data fetcher
  const dataFetcher = new RobloxDocsDataFetcher();

  useEffect(() => {
    loadDocsData();
  }, []);

  const isSearchEmpty = searchText.trim() === "";

  // Optimized search with useMemo and early exit
  // Re-runs whenever searchText OR allDocs changes (including when data loads)
  const filteredDocs = useMemo(() => {
    // Show empty if still loading or no data loaded yet
    if (allDocs.length === 0) {
      return [];
    }

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

  const processClassReferences = (text: string): string => {
    // Convert API references (Class.*, DataType.*, Enum.*, Global.*) to markdown links
    // Supports formats:
    // - Class.ClassName / DataType.TypeName -> links to class/datatype page
    // - Class.ClassName.Property -> links to class page with anchor
    // - Class.ClassName.Property|DisplayText -> links to class page with anchor, custom display
    // - Class.ClassName:Method()|DisplayText -> links to method with anchor, custom display
    // Display only the name or custom display text (without prefix or backticks)

    // Configuration: Add new reference types here
    const REFERENCE_TYPES: Record<string, string> = {
      Class: "classes",
      Datatype: "datatypes",
      Enum: "enums",
      Global: "globals",
    };

    // Generate regex pattern from reference types (e.g., "Class|DataType|Enum|Global")
    const typePattern = Object.keys(REFERENCE_TYPES).join("|");

    // Helper function to get URL path for a reference type
    const getUrlPath = (refType: string) => REFERENCE_TYPES[refType] || "classes";

    // IMPORTANT: Handle inline code-wrapped references FIRST before standalone ones
    // This prevents double-processing and ensures code-formatted refs are properly converted

    // Handle simple enum/type references with display text in code: `Enum.Name|DisplayValue`
    text = text.replace(
      new RegExp(`\`(${typePattern})\\.(\\w+)\\|([^\`]+)\``, "g"),
      (_match, refType, name, displayText) => {
        const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}`;
        return `[\`${displayText}\`](${url})`;
      },
    );

    // Handle standalone enum/type references with display text: Enum.Name|DisplayValue
    text = text.replace(
      new RegExp(`(?<!\`|\\[)(${typePattern})\\.(\\w+)\\|([^\\s\`]+)(?!\`)`, "g"),
      (_match, refType, name, displayText) => {
        const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}`;
        return `[\`${displayText}\`](${url})`;
      },
    );

    // Handle method references with colons and custom display text: `Class.ClassName:Method()|DisplayText`
    text = text.replace(
      new RegExp(`\`(${typePattern})\\.(\\w+):(\\w+)\\([^)]*\\)\\|([^\`]+)\``, "g"),
      (_match, refType, name, methodName, displayText) => {
        const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}#${methodName}`;
        return `[${displayText}](${url})`;
      },
    );

    // Handle standalone method references with colons and custom display text
    text = text.replace(
      new RegExp(`(?<!\`|\\[\`)(${typePattern})\\.(\\w+):(\\w+)\\([^)]*\\)\\|(\\S+)(?!\`)`, "g"),
      (_match, refType, name, methodName, displayText) => {
        const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}#${methodName}`;
        return `[${displayText}](${url})`;
      },
    );

    // Handle method references with colons (no custom display): `Class.ClassName:Method()`
    text = text.replace(
      new RegExp(`\`(${typePattern})\\.(\\w+):(\\w+)\\([^)]*\\)\``, "g"),
      (_match, refType, name, methodName) => {
        const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}#${methodName}`;
        return `[${methodName}()](${url})`;
      },
    );

    // Handle standalone method references with colons
    text = text.replace(
      new RegExp(`(?<!\`|\\[\`)(${typePattern})\\.(\\w+):(\\w+)\\([^)]*\\)(?!\`|\\|)`, "g"),
      (_match, refType, name, methodName) => {
        const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}#${methodName}`;
        return `[${methodName}()](${url})`;
      },
    );

    // Handle backtick-wrapped references with property and custom display text: `Class.ClassName.Property|DisplayText`
    text = text.replace(
      new RegExp(`\`(${typePattern})\\.(\\w+)\\.(\\w+)\\|([^\`]+)\``, "g"),
      (_match, refType, name, anchor, displayText) => {
        const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}#${anchor}`;
        return `[${displayText}](${url})`;
      },
    );

    // Handle standalone references with property and custom display text (more permissive)
    text = text.replace(
      new RegExp(`(?<!\`|\\[\`)(${typePattern})\\.(\\w+)\\.(\\w+)\\|([^\\s\`]+)(?!\`)`, "g"),
      (_match, refType, name, anchor, displayText) => {
        const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}#${anchor}`;
        return `[${displayText}](${url})`;
      },
    );

    // Handle backtick-wrapped references with property (no custom display): `Class.ClassName.Property`
    text = text.replace(
      new RegExp(`\`(${typePattern})\\.(\\w+)\\.(\\w+)\``, "g"),
      (_match, refType, name, propertyName) => {
        const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}#${propertyName}`;
        return `[${propertyName}](${url})`;
      },
    );

    // Handle standalone references with property
    text = text.replace(
      new RegExp(`(?<!\`|\\[\`)(${typePattern})\\.(\\w+)\\.(\\w+)(?!\`|\\|)`, "g"),
      (_match, refType, name, propertyName) => {
        const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}#${propertyName}`;
        return `[${propertyName}](${url})`;
      },
    );

    // Handle backtick-wrapped simple references: `Class.ClassName` or `DataType.TypeName`
    text = text.replace(new RegExp(`\`(${typePattern})\\.(\\w+)\``, "g"), (_match, refType, name) => {
      const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}`;
      return `[${name}](${url})`;
    });

    // Handle standalone simple references
    text = text.replace(
      new RegExp(`(?<!\`|\\[\`)(${typePattern})\\.(\\w+)(?!\`|\\.|:)`, "g"),
      (_match, refType, name) => {
        const url = `https://create.roblox.com/docs/reference/engine/${getUrlPath(refType)}/${name}`;
        return `[${name}](${url})`;
      },
    );

    return text;
  };

  const processCodeBlocks = (text: string): string => {
    // Convert code blocks to use 'lua' syntax highlighting for proper Luau highlighting
    // Matches ```lua or ```luau code blocks and ensures they're properly formatted
    return text.replace(/```(lua|luau)\n([\s\S]*?)```/g, (_match, _lang, code) => {
      // Return with lua syntax highlighting (Raycast supports this)
      return `\`\`\`lua\n${code}\`\`\``;
    });
  };

  const renderDetailMarkdown = (doc: DocItem): string => {
    if (!doc || !doc.title) {
      return "Loading...";
    }

    // Use smaller heading (##) or code formatting to prevent wrapping
    let markdown = `## ${doc.title}\n\n`;

    // Add type and category with better styling
    markdown += `\`${doc.type}\` · ${doc.category}\n\n`;

    // Add metadata section for API items - BEFORE description
    if (doc.metadata) {
      const hasMetadata =
        doc.metadata.parameters?.length ||
        doc.metadata.returnType ||
        doc.metadata.security ||
        doc.metadata.tags?.length;

      if (hasMetadata) {
        // Parameters with improved formatting
        if (doc.metadata.parameters && doc.metadata.parameters.length > 0) {
          markdown += `### Parameters\n\n`;
          const params = doc.metadata.parameters;
          params.forEach((param, index) => {
            const paramType = processClassReferences(param.type);
            markdown += `**${param.name}** · \`${paramType}\``;
            if (param.description) {
              markdown += `\n\n${processClassReferences(param.description)}`;
            }
            // Add spacing between parameters
            if (index < params.length - 1) {
              markdown += `\n\n`;
            }
          });
          markdown += `\n\n`;
        }

        // Return type with icon
        if (doc.metadata.returnType) {
          markdown += `### Returns\n\n\`${processClassReferences(doc.metadata.returnType)}\`\n\n`;
        }

        // Tags with visual badges
        if (doc.metadata.tags && doc.metadata.tags.length > 0) {
          markdown += `### Tags\n\n`;
          markdown += doc.metadata.tags.map((tag) => `\`${tag}\``).join("  ");
          markdown += `\n\n`;
        }

        // Security info (keep compact)
        if (doc.metadata.security) {
          markdown += `**Security:** ${doc.metadata.security}\n\n`;
        }

        markdown += `---\n\n`;
      }
    }

    // Determine what content to show
    const hasContent = doc.content && doc.content.trim() !== "";
    const contentMatchesDescription = doc.content?.trim() === doc.description?.trim();

    // Show description only if we don't have content, or if content doesn't match description
    if (doc.description && (!hasContent || contentMatchesDescription)) {
      const processedDescription = processCodeBlocks(processClassReferences(doc.description));
      markdown += `### Description\n\n${processedDescription}\n\n`;
    }

    // Add main content only if it exists and differs from description
    if (hasContent && !contentMatchesDescription) {
      const maxContentLength = 1500;
      const isTruncated = doc.content!.length > maxContentLength;

      let truncatedContent: string;
      if (isTruncated) {
        // Truncate to nearest sentence or paragraph boundary
        const roughCut = doc.content!.substring(0, maxContentLength);

        // Look for paragraph break (double newline) first
        const lastParagraphIndex = roughCut.lastIndexOf("\n\n");

        // Then look for sentence endings (period, exclamation, question mark followed by space or newline)
        const sentenceEndRegex = /[.!?][\s\n]/g;
        let lastSentenceIndex = -1;
        let match;
        while ((match = sentenceEndRegex.exec(roughCut)) !== null) {
          lastSentenceIndex = match.index + 1; // Include the punctuation
        }

        // Also check for single newline as a fallback
        const lastNewlineIndex = roughCut.lastIndexOf("\n");

        // Prioritize: paragraph > sentence > newline
        let cutPoint = -1;
        if (lastParagraphIndex > maxContentLength * 0.7) {
          cutPoint = lastParagraphIndex;
        } else if (lastSentenceIndex > maxContentLength * 0.7) {
          cutPoint = lastSentenceIndex + 1; // Include the space after punctuation
        } else if (lastNewlineIndex > maxContentLength * 0.7) {
          cutPoint = lastNewlineIndex;
        }

        // If we found a good boundary, use it; otherwise fall back to rough cut
        truncatedContent = cutPoint > 0 ? doc.content!.substring(0, cutPoint) : roughCut;
      } else {
        truncatedContent = doc.content!;
      }

      const processedContent = processCodeBlocks(processClassReferences(truncatedContent));

      markdown += `### Details\n\n${processedContent}\n\n`;
    }

    // Show message if no useful content
    const hasAnyContent = doc.description || hasContent || doc.metadata;
    if (!hasAnyContent) {
      markdown += `### Description\n\n*No preview available*\n\n`;
      markdown += `*This item has limited documentation. View the full page for more details.*\n\n`;
    }

    // Footer with documentation link
    markdown += `---\n\n`;
    markdown += `**[📖 View Full Documentation →](${doc.url})**`;

    return markdown;
  };

  return (
    <List
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search Roblox Creator Docs..."
      isLoading={isLoading}
      isShowingDetail={showingDetail}
    >
      <List.Section title="Results">
        {filteredDocs.map((doc) => {
          // Truncate title to prevent wrapping in list
          const maxTitleLength = 50;
          const displayTitle =
            doc.title.length > maxTitleLength ? doc.title.substring(0, maxTitleLength - 3) + "..." : doc.title;

          // Process class references in description for compact view
          // Remove markdown syntax and clean up API references
          const cleanDescription = doc.description
            .replace(/`([^`]+)`/g, "$1") // Remove backticks
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove markdown links, keep text
            .replace(/(Class|Datatype|Enum|Global)\.(\w+)\.(\w+)\|(\S+)/g, "$4") // Class.Name.Prop|Display -> Display
            .replace(/(Class|Datatype|Enum|Global)\.(\w+):(\w+)\([^)]*\)\|(\S+)/g, "$4") // Class.Name:Method()|Display -> Display
            .replace(/(Class|Datatype|Enum|Global)\.(\w+)\.(\w+)/g, "$3") // Class.Name.Prop -> Prop
            .replace(/(Class|Datatype|Enum|Global)\.(\w+):(\w+)\([^)]*\)/g, "$3()") // Class.Name:Method() -> Method()
            .replace(/(Class|Datatype|Enum|Global)\.(\w+)/g, "$2"); // Class.Name -> Name
          const truncatedDescription =
            cleanDescription.length > 50 ? cleanDescription.substring(0, 47) + "..." : cleanDescription;

          return (
            <List.Item
              key={doc.id}
              icon={getIcon(getIconForCategory(doc.category, doc.type))}
              title={displayTitle}
              subtitle={!showingDetail ? doc.category : undefined}
              accessories={!showingDetail ? [{ text: doc.type }, { text: truncatedDescription }] : undefined}
              detail={showingDetail ? <List.Item.Detail markdown={renderDetailMarkdown(doc)} /> : undefined}
              actions={
                <ActionPanel>
                  <Action title="Open in Browser" onAction={() => open(doc.url)} icon={getIcon(ACTION_ICONS.browser)} />
                  <Action
                    title={showingDetail ? "Hide Detail" : "Show Detail"}
                    onAction={() => setShowingDetail(!showingDetail)}
                    shortcut={{ modifiers: ["cmd"], key: "d" }}
                    icon={getIcon(ACTION_ICONS.text)}
                  />
                  <Action.CopyToClipboard title="Copy URL" content={doc.url} icon={getIcon(ACTION_ICONS.clipboard)} />
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
          );
        })}
      </List.Section>

      {filteredDocs.length === 0 && !isLoading && (
        <List.EmptyView
          title={isSearchEmpty ? "Start Searching" : allDocs.length === 0 ? "No Data Loaded" : "No Results Found"}
          description={
            isSearchEmpty
              ? "Type to search Roblox Creator Docs"
              : allDocs.length === 0
                ? "Try refreshing with Cmd+R to load documentation data"
                : `No documentation found for "${searchText}". Try a different search term.`
          }
        />
      )}
    </List>
  );
}
