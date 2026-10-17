// Specs read templates, stylesheets and the host page as text, through the bundler's text loader:
// import template from './x.html' with { loader: 'text' };
declare module '*.html' {
  const text: string;
  export default text;
}

declare module '*.css' {
  const text: string;
  export default text;
}
