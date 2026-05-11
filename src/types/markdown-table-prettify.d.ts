declare module "markdown-table-prettify" {
  export const CliPrettify: {
    prettify(markdown: string, options?: { columnPadding?: number }): string;
  };
}
