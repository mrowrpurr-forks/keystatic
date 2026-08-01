import { EditorState } from 'prosemirror-state';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import {
  gfmAutolinkLiteralFromMarkdown,
  gfmAutolinkLiteralToMarkdown,
} from 'mdast-util-gfm-autolink-literal';
import {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown,
} from 'mdast-util-gfm-strikethrough';
import { gfmTableFromMarkdown, gfmTableToMarkdown } from 'mdast-util-gfm-table';
import { mdxFromMarkdown, mdxToMarkdown } from 'mdast-util-mdx';
import { gfmAutolinkLiteral } from 'micromark-extension-gfm-autolink-literal';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';
import { gfmTable } from 'micromark-extension-gfm-table';
import { mdxjs } from 'micromark-extension-mdxjs';

import { format, parse } from '#markdoc';

import { createEditorState } from './editor-state';
import { markdocToProseMirror } from './markdoc/parse';
import { proseMirrorToMarkdoc } from './markdoc/serialize';
import { mdxToProseMirror } from './mdx/parse';
import { proseMirrorToMDXRoot } from './mdx/serialize';
import { EditorSchema, getEditorSchema } from './schema';

export type RawSourceFiles = {
  files: Map<string, Uint8Array>;
  otherFiles: Map<string, Map<string, Uint8Array>>;
};

// the slug is deliberately undefined on both sides of the round-trip: the
// entry's slug isn't available to field inputs, and any value is
// self-consistent as long as serialize and parse agree (it only affects the
// src prefix written into image urls)
export function serializeEditorStateToRawSource(
  state: EditorState
): RawSourceFiles & { text: string } {
  const schema = getEditorSchema(state.schema);
  const files = new Map<string, Uint8Array>();
  const otherFiles = new Map<string, Map<string, Uint8Array>>();
  const serializationState = {
    extraFiles: files,
    otherFiles,
    schema,
    slug: undefined,
  };
  let text;
  if (schema.format === 'mdx') {
    const mdxNode = proseMirrorToMDXRoot(state.doc, serializationState);
    text = toMarkdown(mdxNode, {
      extensions: [
        gfmAutolinkLiteralToMarkdown(),
        gfmStrikethroughToMarkdown(),
        gfmTableToMarkdown(),
        mdxToMarkdown(),
      ],
      rule: '-',
    });
  } else {
    const markdocNode = proseMirrorToMarkdoc(state.doc, serializationState);
    text = format(parse(format(markdocNode)));
  }
  return { text, files, otherFiles };
}

export function parseRawSourceToEditorState(
  text: string,
  schema: EditorSchema,
  files: ReadonlyMap<string, Uint8Array>,
  otherFiles: ReadonlyMap<string, ReadonlyMap<string, Uint8Array>>
): EditorState {
  const doc =
    schema.format === 'mdx'
      ? mdxToProseMirror(
          fromMarkdown(text, {
            extensions: [
              mdxjs(),
              gfmAutolinkLiteral(),
              gfmStrikethrough(),
              gfmTable(),
            ],
            mdastExtensions: [
              mdxFromMarkdown(),
              gfmAutolinkLiteralFromMarkdown(),
              gfmStrikethroughFromMarkdown(),
              gfmTableFromMarkdown(),
            ],
          }),
          schema,
          files,
          otherFiles,
          undefined
        )
      : markdocToProseMirror(parse(text), schema, files, otherFiles, undefined);
  return createEditorState(doc);
}
