# Changelog

All notable changes to this project will be documented in this file.

## [0.3.6] - 2025-12-24

### Added

- NotificationBanner component replacing toaster (GitHub-style yellow notification bar)

## [0.3.5] - 2024-12-24

- Add collapsible article summary in quiz feedback
- bugfix: clean dead cookie on launch.

## [0.3.4] - 2025-12-21

- refacoring & bug fix
- remove dead code

## [0.3.2] - 2025-12-08

- hot fix
- Failed jobs are displayed in Quiz Queue
- fix RPC bug
- fix backgroun job unexpected exit bug

## [0.3.2] - 2025-12-08

### Added

- Retry button for failed or stuck quiz generation
- Archive button to move sessions out of queue

### Changed

- Toast notifications now use consistent "Start" CTA and "Dismiss" button
- Toast notifications support overlap (max 3)

### Fixed

- Ready quiz status propagation to sessions
- Handle stuck quiz generation sessions

## [0.3.1] - 2025-12-07

### Added

- Delete button for bookmarks with inline confirmation
- "Clean Cache" button in settings panel to clear service worker cache

### Changed

- Service worker disabled in development
- URL display shows domain only

### Fixed

- Hydration error in settings menu

## [0.3.0] - 2025-12-07

### Added

- Service worker for offline support and faster loads
- Share confirmation page with background processing

### Changed

- Simplified bookmarks UI with responsive layout
- Integrated status into action buttons

### Fixed

- Session initialization failures
- Hydration errors

## [0.2.1] - 2025-12-05

- Bookmark feature

## [0.1.1] - 2025-12-05

- Add PWA support
- Add toolbar
- Add CSP

## [0.1.0] - 2025-12-05

### Added

- Quiz-first reading approach with intuition check system
- Multi-language support (English & Japanese)
- Progressive quiz generation feedback with step-by-step status
- URL-based session management
- Guest profile system
- Settings drawer with language switcher
- Automatic version management from package.json

### Features

- Curiosity quiz generation (3 predictive questions)
- Scaffold quiz for deep learning
- Real-time progress tracking
- Toast notifications with bottom-center placement
- Teal-themed UI components

---

[0.3.0]: https://github.com/yourusername/diffread/compare/v0.2.2...v0.3.0
