# Roblox Creator Docs Changelog

## [1.0.1] - {PR_MERGE_DATE}

### Added
- Cache invalidation when extension version changes - ensures fresh data after updates
- Option to hide icons in search results via extension preferences
- Automatic cache refresh based on GitHub commit SHA comparison

### Fixed
- Fixed page anchor navigation for direct links to API methods/properties/events
- Improved memory management with optimized batch processing

### Changed
- Removed fallback data mechanism (now uses empty array for cleaner error handling)
- Enhanced icon display with better visual consistency

## [1.0.0] - {PR_MERGE_DATE}

### Added
- Initial release of Roblox Creator Docs extension
- Fast search and lookup for Roblox Creator Documentation
- Support for Classes, Enums, Globals, Methods, Properties, Events, and Callbacks
- Intelligent caching system with 24-hour expiration
- Automatic documentation updates from GitHub repository
- Detailed view with code examples and parameter information
- Category-based organization (Classes, Enums, Tutorials, etc.)
- Memory-optimized ZIP processing for large documentation archives