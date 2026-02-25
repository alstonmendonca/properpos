declare module 'json2csv' {
  interface FieldInfo {
    label?: string;
    value: string | ((row: any, field?: FieldInfo) => any);
    default?: string;
  }

  interface ParserOptions {
    fields?: (string | FieldInfo)[];
    ndjson?: boolean;
    flatten?: boolean;
    flattenSeparator?: string;
    defaultValue?: string;
    quote?: string;
    escapedQuote?: string;
    delimiter?: string;
    eol?: string;
    excelStrings?: boolean;
    header?: boolean;
    includeEmptyRows?: boolean;
    withBOM?: boolean;
    transforms?: any[];
  }

  export class Parser {
    constructor(options?: ParserOptions);
    parse(data: any): string;
  }
}
