---
name: frontend-design
description: Distinctive frontend design for B2B dashboards and data applications. Use when building React/Next.js interfaces, especially analytics dashboards, admin panels, or professional tools. Prevents generic "purple gradient + Inter font" outputs by providing industrial/premium aesthetics, non-standard status color systems, and purposeful motion. Triggers on: dashboard UI, data visualization styling, component theming, color system design, typography selection.
---

# Frontend Design (Industrial/Premium)

Break distributional convergence. Default AI outputs converge on safe, generic patterns: Inter font, purple/blue gradients, red-green-amber status colors. This skill provides distinctive alternatives.

## Core Philosophy

1. **Restraint over decoration** - Every element earns its place
2. **Data density over whitespace** - Professional users want information
3. **Distinctive but defensible** - Unique choices with clear rationale
4. **Industrial materiality** - Surfaces that feel substantial, not flat

## Four Design Axes

### Typography
Avoid: Inter, Roboto, system defaults.

**For headings**: Consider weight extremes (300 vs 700) and unexpected pairings.
- IBM Plex Sans - industrial precision, excellent at large sizes
- DM Sans - geometric but warm, good for data-heavy interfaces
- Outfit - modern geometric with personality
- Space Grotesk - technical character without being cold

**For data/numbers**: Tabular figures are essential.
- JetBrains Mono - excellent for dashboards showing metrics
- IBM Plex Mono - pairs well with IBM Plex Sans
- Fira Code - readable at small sizes

**Size ratios**: Use 3x+ jumps for hierarchy. 14px body → 42px headings. Avoid timid 1.2x scales.

See [typography.md](references/typography.md) for detailed pairings and implementation.

### Color & Theme
Avoid: Generic red/green/blue status indicators, purple gradients.

**Industrial palettes** work better for B2B:
- Deep charcoal bases (not pure black)
- Copper, bronze, brass as warm accents
- Slate and graphite for hierarchy
- Single bold accent, used sparingly

**Status colors (non-semantic alternatives)**:

Instead of red/green/amber, consider:
```
Excellent: Copper (#C87941) or Sage (#7D9D74)
Good: Teal (#4A7B7D) or Steel Blue (#5B7B93)
Warning: Ochre (#C4A35A) or Terracotta (#C4784A)
Critical: Slate Rose (#8B5A5A) or Deep Burgundy (#6B3A3A)
```

**Key principle**: Status should be distinguishable by saturation and brightness, not just hue. Works better for accessibility and avoids the "Christmas tree" effect.

See [palettes.md](references/palettes.md) for complete color systems and CSS variables.

### Motion
Avoid: Scattered micro-interactions, unnecessary hover effects.

**Philosophy**: Motion should orient, not entertain.
- Page transitions: Staggered reveals (items appear sequentially)
- Data updates: Subtle pulse, not jarring flash
- Loading states: Skeleton screens, not spinners
- Charts: Draw-in animation on first load only

**Timing**: 200-300ms for micro-interactions, 400-600ms for page transitions. Use ease-out for entrances, ease-in-out for movements.

See [motion.md](references/motion.md) for implementation patterns.

### Backgrounds & Surfaces
Avoid: Flat solid colors, obvious gradients.

**Industrial textures**:
- Subtle noise overlays (0.5-2% opacity)
- Very subtle gradients (same hue, 2-3% lightness difference)
- Card shadows that suggest depth without floating
- Border treatments: 1px with low-opacity borders feel more substantial than borderless

```css
/* Textured surface example */
.surface {
  background:
    linear-gradient(180deg,
      oklch(0.20 0.01 250) 0%,
      oklch(0.18 0.01 250) 100%
    );
  /* Optional: subtle noise via SVG or pseudo-element */
}
```

## Application to Dashboards

**KPI Cards**:
- Avoid colorful icons for each metric
- Use a single accent color for the primary KPI
- Others in monochrome/muted tones

**Tables**:
- Zebra striping with very low contrast (2-3%)
- Hover states: subtle background shift, not border
- Status badges: filled backgrounds, not outlined

**Charts (Recharts)**:
- Use 3-4 colors maximum per chart
- Derive from the industrial palette
- Grid lines at 8-10% opacity

## For This Project (Helix Gases)

Cylinder analytics for an industrial gas company. The design should feel:
- **Substantial** - Like cast metal, not plastic
- **Professional** - Trusted for business decisions
- **Warm industrial** - Copper and bronze tones connect to the physical product

Suggested direction:
- Base: Slate 900-950 with slight warm undertone
- Primary accent: Copper (#C87941) for key metrics
- Secondary: Teal-gray for supporting information
- Status: See non-semantic alternatives above

## Quick Reference

| Element | Avoid | Prefer |
|---------|-------|--------|
| Status colors | Red/Green/Amber | Copper/Teal/Ochre/Slate |
| Headings | Inter 500 | IBM Plex Sans 300/700 |
| Numbers | Variable-width | Tabular figures (JetBrains Mono) |
| Backgrounds | Pure black/white | Charcoal with warmth |
| Icons | Colorful per-card | Monochrome, one accent |
| Motion | Bouncy/playful | Purposeful/swift |
