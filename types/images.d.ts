declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}
// WebP joined the list when the cover art arrived: 2.5MB of PNG becomes 236KB
// here, which on a tablet is the difference between the hero appearing and the
// hero arriving. Every use pairs it with a jpg in a <picture> so a browser
// without WebP still gets the image.
declare module '*.webp' {
  const content: string;
  export default content;
}
