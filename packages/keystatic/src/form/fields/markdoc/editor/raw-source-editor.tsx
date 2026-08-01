import { EditorState } from 'prosemirror-state';
import { HTMLAttributes, ReactNode, useMemo, useState } from 'react';

import { ActionButton } from '@keystar/ui/button';
import { Box, Flex } from '@keystar/ui/layout';
import { Notice } from '@keystar/ui/notice';
import { breakpointQueries, css, tokenSchema } from '@keystar/ui/style';
import { Text } from '@keystar/ui/typography';

import { useEntryLayoutSplitPaneContext } from '../../../../app/entry-form';
import Prism from '../../document/DocumentEditor/prism';
import { classNameForPrismToken } from './code-block-highlighting';
import {
  RawSourceFiles,
  parseRawSourceToEditorState,
} from './raw-source';
import { EditorSchema } from './schema';

// the highlighted <pre> and the transparent <textarea> are stacked in the
// same grid cell, so their text must lay out identically: the cell grows to
// fit the <pre> and the <textarea> just fills it
const sharedTextStyles = css({
  boxSizing: 'border-box',
  fontFamily: tokenSchema.typography.fontFamily.code,
  fontSize: tokenSchema.typography.text.regular.size,
  gridArea: '1 / 1',
  lineHeight: 1.6,
  margin: 0,
  overflowWrap: 'break-word',
  padding: tokenSchema.size.space.medium,
  whiteSpace: 'pre-wrap',
  width: '100%',

  '[data-layout="main"] > div > &': {
    [breakpointQueries.above.mobile]: {
      padding: tokenSchema.size.space.xlarge,
    },
    [breakpointQueries.above.tablet]: {
      padding: tokenSchema.size.space.xxlarge,
    },
  },
});

const gridStyles = css({
  display: 'grid',
  minHeight: tokenSchema.size.scale[3000],

  '[data-layout="main"] > &': {
    flex: 1,
    marginInline: 'auto',
    maxWidth: 800,
    minHeight: 0,
    overflowY: 'auto',
    width: '100%',
  },
});

const highlightStyles = css({
  color: tokenSchema.color.foreground.neutral,
  pointerEvents: 'none',
});

const textareaStyles = css({
  backgroundColor: 'transparent',
  border: 0,
  caretColor: tokenSchema.color.foreground.neutral,
  color: 'transparent',
  height: '100%',
  outline: 0,
  overflow: 'hidden',
  resize: 'none',
});

// the shared map in code-block-highlighting only covers programming-language
// token types, the markdown grammar mostly emits its own (title, bold,
// code-snippet, …) so those are styled here
const markdownTokenStyles = new Map<string, string>([
  [
    'title',
    css({
      color: tokenSchema.color.scale.indigo11,
      fontWeight: tokenSchema.typography.fontWeight.semibold,
    }),
  ],
  [
    'bold',
    css({
      color: tokenSchema.color.foreground.neutralEmphasis,
      fontWeight: tokenSchema.typography.fontWeight.bold,
    }),
  ],
  ['italic', css({ fontStyle: 'italic' })],
  ['strike', css({ textDecoration: 'line-through' })],
  ['code-snippet', css({ color: tokenSchema.color.scale.pink11 })],
  ['code-language', css({ color: tokenSchema.color.scale.green11 })],
]);

function classNameForToken(token: Prism.Token): string | undefined {
  const aliases =
    typeof token.alias === 'string' ? [token.alias] : token.alias ?? [];
  for (const key of [token.type, ...aliases]) {
    const className =
      markdownTokenStyles.get(key) ?? classNameForPrismToken(key);
    if (className) return className;
  }
}

// mirrors the language name normalization prism's own markdown component does
function grammarForCodeFence(language: string) {
  const lang = (/[a-z][\w-]*/i
    .exec(language.replace(/\b#/g, 'sharp').replace(/\b\+\+/g, 'pp'))?.[0]
    ?.toLowerCase() ?? '') as keyof typeof Prism.languages;
  const grammar = Prism.languages[lang];
  return typeof grammar === 'object' ? grammar : undefined;
}

function renderToken(token: Prism.Token, key: number): ReactNode {
  // prism's markdown grammar doesn't tokenize the contents of fenced code
  // blocks itself (it does that at html rendering time, which doesn't apply
  // here), so tokenize them with the fence's language
  if (token.type === 'code' && Array.isArray(token.content)) {
    const language = token.content.find(
      (t): t is Prism.Token =>
        typeof t !== 'string' && t.type === 'code-language'
    );
    const grammar = language
      ? grammarForCodeFence(String(language.content))
      : undefined;
    if (grammar) {
      return (
        <span key={key}>
          {token.content.map((child, i) => {
            if (typeof child === 'string') return child;
            if (child.type === 'code-block' && typeof child.content === 'string') {
              return (
                <span key={i}>
                  {highlight(Prism.tokenize(child.content, grammar))}
                </span>
              );
            }
            return renderToken(child, i);
          })}
        </span>
      );
    }
  }
  const content = highlight(
    Array.isArray(token.content) ? token.content : [token.content],
    token.type
  );
  const className = classNameForToken(token);
  return className ? (
    <span key={key} className={className}>
      {content}
    </span>
  ) : (
    <span key={key}>{content}</span>
  );
}

function highlight(
  tokens: (string | Prism.Token)[],
  parentType?: string
): ReactNode[] {
  return tokens.map((token, i) => {
    if (typeof token === 'string') {
      return token;
    }
    if (parentType === 'title' && token.type === 'punctuation') {
      // let the #s inherit the heading style from the wrapping span
      return (
        <span key={i}>
          {highlight(
            Array.isArray(token.content) ? token.content : [token.content]
          )}
        </span>
      );
    }
    return renderToken(token, i);
  });
}

function Highlighted({ text }: { text: string }) {
  const nodes = useMemo(
    () => highlight(Prism.tokenize(text, Prism.languages.markdown)),
    [text]
  );
  return (
    <pre aria-hidden className={`${sharedTextStyles} ${highlightStyles}`}>
      {nodes}
      {/* trailing newlines don't add height on their own, this makes the
          highlight layer (and so the grid cell) account for them */}
      {'\n'}
    </pre>
  );
}

export function RawSourceEditor({
  schema,
  initialText,
  files,
  otherFiles,
  onDone,
  onCancel,
  ...props
}: {
  schema: EditorSchema;
  initialText: string;
  onDone: (state: EditorState) => void;
  onCancel: () => void;
} & RawSourceFiles &
  HTMLAttributes<HTMLTextAreaElement>) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const entryLayoutPane = useEntryLayoutSplitPaneContext();

  return (
    <Box
      data-keystatic-editor="raw-source"
      data-layout={entryLayoutPane}
      backgroundColor="canvas"
      minWidth={0}
      UNSAFE_className={css({
        '&[data-layout="main"]': {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        },
        '&:not([data-layout="main"])': {
          border: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.neutral}`,
          borderRadius: tokenSchema.size.radius.medium,
        },
      })}
    >
      <div
        data-layout={entryLayoutPane}
        className={css({
          backdropFilter: 'blur(8px)',
          backgroundClip: 'padding-box',
          backgroundColor: `color-mix(in srgb, transparent, ${tokenSchema.color.background.canvas} 90%)`,
          borderBottom: `${tokenSchema.size.border.regular} solid color-mix(in srgb, transparent, ${tokenSchema.color.foreground.neutral} 10%)`,
          borderStartEndRadius: tokenSchema.size.radius.medium,
          borderStartStartRadius: tokenSchema.size.radius.medium,
          minWidth: 0,
          position: 'sticky',
          top: 0,
          zIndex: 2,

          '&[data-layout="main"]': { borderRadius: 0 },
        })}
      >
        <Flex
          alignItems="center"
          gap="regular"
          paddingX="medium"
          UNSAFE_className={css({
            boxSizing: 'border-box',
            height: tokenSchema.size.element.medium,
            [breakpointQueries.above.mobile]: {
              height: tokenSchema.size.element.large,
            },
            '[data-layout="main"] > &': {
              marginInline: 'auto',
              maxWidth: 800,
              [breakpointQueries.above.mobile]: {
                paddingInline: tokenSchema.size.space.xlarge,
              },
              [breakpointQueries.above.tablet]: {
                paddingInline: tokenSchema.size.space.xxlarge,
              },
            },
          })}
        >
          <Text color="neutralSecondary" size="small" weight="medium">
            {schema.format === 'mdx' ? 'MDX source' : 'Markdoc source'}
          </Text>
          <Flex flex={1} />
          <ActionButton prominence="low" onPress={onCancel}>
            Cancel
          </ActionButton>
          <ActionButton
            onPress={() => {
              let newState;
              try {
                newState = parseRawSourceToEditorState(
                  text,
                  schema,
                  files,
                  otherFiles
                );
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                return;
              }
              onDone(newState);
            }}
          >
            Done
          </ActionButton>
        </Flex>
      </div>
      {error !== null && (
        <Box padding="medium">
          <Notice tone="critical">
            <Text UNSAFE_className={css({ whiteSpace: 'pre-wrap' })}>
              {error}
            </Text>
          </Notice>
        </Box>
      )}
      <div className={gridStyles}>
        <Highlighted text={text} />
        <textarea
          {...props}
          value={text}
          onChange={event => {
            setText(event.target.value);
            setError(null);
          }}
          autoFocus
          spellCheck="false"
          className={`${sharedTextStyles} ${textareaStyles}`}
        />
      </div>
    </Box>
  );
}
