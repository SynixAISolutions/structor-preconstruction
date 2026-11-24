// The part of word-extractor (reads .doc and .docx text) that app/api/checklist-text uses; the package ships no types.
declare module "word-extractor" {
  class Document { getBody(options?: { filterUnicode?: boolean }): string }
  export default class WordExtractor { extract(source: Buffer | string): Promise<Document> }
}
