# Card Format Options for Recent Posts

## Option 1: Horizontal Cards (Currently Applied)
- Image on the left (1/3 width)
- Content on the right (2/3 width)
- Full-width cards stacked vertically
- Good for longer summaries

## Option 2: Vertical Grid Cards (Original)
```html
<div class="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
  <!-- Image on top, content below -->
  <!-- 3 cards side by side on large screens -->
</div>
```

## Option 3: Magazine Style Cards
```html
<div class="grid gap-6 lg:grid-cols-2">
  <!-- First card: Large featured card (spans 2 columns) -->
  <!-- Other cards: Smaller cards in grid -->
</div>
```

## Option 4: Minimal Cards
```html
<div class="space-y-4">
  <!-- No images, just title, date, and summary -->
  <!-- Clean, text-focused design -->
</div>
```

## Option 5: Overlay Cards
```html
<div class="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
  <!-- Image as background -->
  <!-- Text overlaid on image with gradient -->
</div>
```

Which option would you like me to implement?