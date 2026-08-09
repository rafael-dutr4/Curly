/**
 * The worked examples, listed here rather than discovered at runtime because a
 * static site cannot list a directory, and because the one line description is
 * the reason to open each one.
 *
 * A test checks that every path here exists on disk, so this list cannot drift
 * away from `examples/`.
 */

export interface Example {
  readonly path: string;
  readonly name: string;
  readonly description: string;
}

export const EXAMPLES: readonly Example[] = [
  {
    path: "examples/blog.curly",
    name: "Blog",
    description: "Comments embedded in the post, because a post is read with them.",
  },
  {
    path: "examples/ecommerce.curly",
    name: "Shop",
    description: "An order references its customer but copies what was bought.",
  },
  {
    path: "examples/sensors.curly",
    name: "Sensors",
    description: "Time series in buckets, with the totals stored rather than recounted.",
  },
  {
    path: "examples/library.curly",
    name: "Library",
    description: "One collection holding several shapes, and a subset of recent loans.",
  },
];
