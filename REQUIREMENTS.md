# Documentation Site Requirements

## Overview

A modern, performant static documentation site that combines traditional documentation with API reference materials, featuring lazy loading, advanced navigation, and search capabilities.

## Core Architecture

### 1. Static Site Generation
- **Framework**: Eleventy (11ty) for static site generation
- **Hosting**: GitHub Pages with automated deployment
- **Build Process**: Automated CI/CD pipeline via GitHub Actions
- **Output**: Optimized static HTML/CSS/JS bundle

### 2. API Documentation Integration
- **Tool**: Stoplight Elements for OpenAPI specification rendering
- **Integration**: Top-level menu item for API Reference
- **Requirement**: No interference with Stoplight Elements styling
- **Scope**: Dedicated section separate from main documentation

## Content Management

### 3. Markdown-Based CMS
- **Source**: Markdown documents in `/docs` folder hierarchy
- **Structure**: Hierarchical folder organization reflecting navigation
- **Frontmatter**: YAML metadata for ordering, titles, and configuration
- **Format**: Standard markdown with support for:
  - Code blocks with syntax highlighting
  - Tables and lists
  - Images and media
  - Mermaid diagrams
  - Info panels and callouts

### 4. Folder Hierarchy Mapping
```
/docs
├── getting-started/
│   ├── index.md (section landing)
│   ├── introduction.md
│   └── quickstart.md
├── guides/
│   ├── index.md
│   ├── provision-environment.md
│   └── authentication-authorization.md
├── concepts/
└── architecture/
```

## Navigation System

### 5. Left Sidebar Navigation
- **Display**: Full hierarchical folder and document structure
- **Behavior**: Collapsible/expandable sections
- **State Management**: 
  - Multiple sections can be open simultaneously
  - Section states persist across page navigations
  - Independent section toggling without affecting other sections
- **Visual Indicators**: 
  - Chevron arrows for expandable sections
  - Active page highlighting
  - Section icons for visual hierarchy
- **Interaction**:
  - Section headers toggle visibility only (no navigation)
  - Individual document links handle page navigation
  - Smooth transitions and animations

### 6. Section Behavior Requirements
- **Independence**: Expanding/collapsing one section must not affect other sections
- **Persistence**: Section states maintained via localStorage
- **No Flicker**: Section operations must not cause visual flicker or page reloads
- **Multiple Open**: Users can have multiple sections open simultaneously
- **Navigation**: Section headers toggle only; document links navigate

## Content Rendering

### 7. Lazy Loading and Caching
- **Implementation**: On-demand content loading for performance
- **Strategy**: 
  - Initial page load shows navigation and current document
  - Additional documents loaded when accessed
  - Intelligent prefetching for likely next pages
- **Caching**: 
  - Browser cache for static assets
  - Memory cache for loaded documents
  - Service worker for offline capability (optional)
- **Performance**: 
  - Virtual scrolling for large documents
  - Progressive enhancement
  - Minimal initial bundle size

### 8. Central Content Panel
- **Layout**: Main content area with responsive design
- **Rendering**: 
  - Markdown to HTML conversion
  - Syntax highlighting for code blocks
  - Mermaid diagram rendering
  - Image optimization and lazy loading
- **Navigation**: 
  - Smooth page transitions
  - URL routing with history API
  - Deep linking support
- **Accessibility**: 
  - Semantic HTML structure
  - ARIA labels and roles
  - Keyboard navigation support

## Secondary Navigation

### 9. Right Sidebar - "On This Page"
- **Content**: Table of contents for current document
- **Source**: Extracted from document headers (H2, H3, H4)
- **Behavior**: 
  - Smooth scroll to sections
  - Active section highlighting during scroll
  - Collapsible for smaller screens
- **Styling**: Consistent with overall design system
- **Responsive**: Hidden on mobile, overlay on tablet

## Search Functionality

### 10. PageFind Integration
- **Tool**: PageFind for client-side search
- **Scope**: Full-text search across all documentation
- **Features**:
  - Instant search results
  - Highlighting of search terms
  - Keyboard navigation in results
  - Search result previews
- **Performance**: 
  - Indexed at build time
  - Fast client-side search
  - No server-side dependencies

### 11. Search Interface
- **Location**: Center of top navigation bar
- **Form**: Search input with autocomplete
- **Keyboard Shortcut**: 
  - Global shortcut (e.g., Ctrl/Cmd + K)
  - Focus search input
  - Escape to close
- **Results Display**:
  - Dropdown overlay with results
  - Proper rendering of markdown content in previews
  - Support for Mermaid diagrams and code blocks in results
- **Accessibility**: Screen reader compatible

## Design System

### 12. Visual Design
- **Framework**: Primer Brand design system (https://primer.style/brand/)
- **Consistency**: Maintain existing color scheme and visual design
- **Responsive**: Mobile-first responsive design
- **Typography**: Clear hierarchy with proper contrast
- **Components**: Reusable UI components for consistency

### 13. Layout Structure
```
┌─────────────────────────────────────────────────────────┐
│ Header: Logo | Docs | API Reference | [Search] | GitHub │
├─────────────┬─────────────────────────┬─────────────────┤
│ Left Nav    │ Main Content            │ On This Page    │
│ - Sections  │ - Document Content      │ - H2 Headers    │
│ - Documents │ - Lazy Loaded           │ - H3 Headers    │
│ - Expand/   │ - Responsive            │ - Active Track  │
│   Collapse  │                         │                 │
├─────────────┴─────────────────────────┴─────────────────┤
│ Footer: Links | Privacy | Terms | Copyright             │
└─────────────────────────────────────────────────────────┘
```

## Technical Requirements

### 14. Performance Targets
- **First Contentful Paint**: < 1.5s
- **Largest Contentful Paint**: < 2.5s
- **Cumulative Layout Shift**: < 0.1
- **Time to Interactive**: < 3s
- **Bundle Size**: Initial JS < 100KB gzipped

### 15. Browser Support
- **Modern Browsers**: Chrome, Firefox, Safari, Edge (last 2 versions)
- **Progressive Enhancement**: Core functionality without JavaScript
- **Accessibility**: WCAG 2.1 AA compliance
- **Mobile**: Responsive design for all screen sizes

### 16. Development Workflow
- **Source Control**: Git with GitHub
- **Deployment**: Automated via GitHub Actions
- **Preview**: Branch previews for pull requests
- **Content Updates**: Direct markdown editing in repository
- **Asset Management**: Optimized images and resources

## Integration Requirements

### 17. Existing Asset Migration
- **Source**: Developer documentation assets from https://github.com/Cyoda/cyoda-docs/tree/main/dist/resources
- **Target**: Eleventy site structure
- **Preservation**: Maintain all existing content and functionality
- **Compatibility**: Ensure no conflicts with Stoplight Elements

### 18. Footer Specifications
- **Design**: Compact two-block layout
- **Block 1**: GitHub Pages info and contributing links
- **Block 2**: Visit Cyoda, Privacy Notice, Cookie Policy, Site Terms, Copyright
- **Analytics**: Google Analytics integration with Cookie Policy link
- **Styling**: Consistent with Primer Brand design system

## Success Criteria

### 19. User Experience Goals
- **Navigation**: Intuitive folder-based navigation with persistent state
- **Performance**: Fast loading and smooth interactions
- **Search**: Quick and accurate content discovery
- **Accessibility**: Usable by all users regardless of ability
- **Mobile**: Excellent mobile experience

### 20. Technical Goals
- **Maintainability**: Easy content updates via markdown
- **Scalability**: Handles growing documentation without performance degradation
- **Reliability**: Stable hosting with high availability
- **SEO**: Good search engine optimization
- **Analytics**: Proper tracking and user behavior insights

## Future Considerations

### 21. Extensibility
- **Plugin System**: Support for additional Eleventy plugins
- **Theme Customization**: Easy styling updates
- **Content Types**: Support for additional content formats
- **Integrations**: Potential for additional tool integrations

### 22. Maintenance
- **Content Workflow**: Clear process for content updates
- **Version Control**: Proper versioning for documentation
- **Monitoring**: Performance and error monitoring
- **Updates**: Regular dependency and security updates
