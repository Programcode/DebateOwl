import * as Y from "yjs";

export function insertParagraph(document: Y.Doc, text: string) {
  const paragraph = new Y.XmlElement("paragraph");
  const content = new Y.XmlText();
  content.insert(0, text);
  paragraph.insert(0, [content]);
  document.getXmlFragment("content").insert(0, [paragraph]);
}

export function appendText(document: Y.Doc, text: string) {
  const paragraph = document.getXmlFragment("content").get(0);
  if (!(paragraph instanceof Y.XmlElement)) {
    throw new Error("Expected a paragraph");
  }
  const content = paragraph.get(0);
  if (!(content instanceof Y.XmlText)) {
    throw new Error("Expected paragraph text");
  }
  content.insert(content.length, text);
}

export function documentText(document: Y.Doc) {
  return document.getXmlFragment("content").toString();
}
