/** @jest-environment jsdom */
/** @jsxRuntime classic */
/** @jsx jsx */
import { expect, test } from '@jest/globals';
import { EditorState } from 'prosemirror-state';

import { block } from '../../../../../content-components';
import { fields } from '../../../../..';
import { editorOptionsToConfig } from '../../config';
import {
  parseRawSourceToEditorState,
  serializeEditorStateToRawSource,
} from '../raw-source';
import {
  EditorSchema,
  createEditorSchema,
  getEditorSchema,
} from '../schema';
import { jsx, toEditorState } from './utils';

const componentsForTest = {
  Something: block({
    label: 'Something',
    schema: {
      bool: fields.checkbox({ label: 'Bool' }),
    },
  }),
};

const mdxSchema = createEditorSchema(
  editorOptionsToConfig({}),
  componentsForTest,
  true
);

function roundTrip(state: EditorState, schema: EditorSchema) {
  const { text, files, otherFiles } = serializeEditorStateToRawSource(state);
  const parsed = parseRawSourceToEditorState(text, schema, files, otherFiles);
  expect(parsed.doc.toJSON()).toEqual(state.doc.toJSON());
  return text;
}

test('markdoc round-trips through raw source', () => {
  const state = (
    <doc>
      <paragraph>
        <text>Some content</text>
      </paragraph>
      <heading level={2}>
        <text>A heading</text>
      </heading>
      <paragraph>
        <text>After the heading</text>
      </paragraph>
    </doc>
  ).get();
  const text = roundTrip(state, getEditorSchema(state.schema));
  expect(text).toMatchInlineSnapshot(`
    "Some content

    ## A heading

    After the heading
    "
  `);
});

test('mdx with a component round-trips through raw source', () => {
  const { nodes, schema } = mdxSchema;
  const state = toEditorState(
    nodes.doc.createChecked(undefined, [
      nodes.paragraph.createChecked(undefined, schema.text('Some content')),
      schema.nodes.Something.createChecked({
        props: { extraFiles: [], value: { bool: true } },
      }),
      nodes.paragraph.createChecked(
        undefined,
        schema.text('After the component')
      ),
    ])
  ).get();
  const text = roundTrip(state, mdxSchema);
  expect(text).toMatchInlineSnapshot(`
    "Some content

    <Something bool />

    After the component
    "
  `);
});

test('images round-trip through raw source', () => {
  const imageBytes = new Uint8Array([1, 2, 3]);
  const { nodes } = mdxSchema;
  const state = toEditorState(
    nodes.doc.createChecked(undefined, [
      nodes.paragraph.createChecked(
        undefined,
        nodes.image!.createChecked({
          src: imageBytes,
          alt: 'an image',
          title: null,
          filename: 'cat.png',
        })
      ),
    ])
  ).get();
  const editorSchema = mdxSchema;
  const { text, files, otherFiles } = serializeEditorStateToRawSource(state);
  expect(files.get('cat.png')).toEqual(imageBytes);
  const parsed = parseRawSourceToEditorState(
    text,
    editorSchema,
    files,
    otherFiles
  );
  expect(parsed.doc.toJSON()).toEqual(state.doc.toJSON());
});

test('invalid mdx throws instead of losing content', () => {
  expect(() =>
    parseRawSourceToEditorState('<Unclosed>', mdxSchema, new Map(), new Map())
  ).toThrow();
  expect(() =>
    parseRawSourceToEditorState(
      '<NotARealComponent />',
      mdxSchema,
      new Map(),
      new Map()
    )
  ).toThrow('Missing component definition for NotARealComponent');
});
